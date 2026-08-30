/**
 * PE diligence quality gate — drop incumbents, wrong domains, and non-operating entities.
 */
import { logger } from "../lib/logger.js";
import { scoreEntityPlausibility } from "./entity-plausibility.js";
import { significantNameTokens } from "./domain-relevance.js";
import { hasFinancialMandate, hasEmployeeMandate } from "./pe-mandate.js";
import { mandateAllowsFundingStage } from "../light_agent/funding-stage.js";
import {
  detectInvestorThesis,
  companyHasYcBacking,
  companyMatchesInvestorThesis,
} from "./investor-thesis.js";
import { hasFundingStageMandate } from "./stage-mandate.js";
import { isLiteMode } from "./constraint-mode.js";

/** Default: treat companies founded before 2000 as incumbents for VC-style mandates. */
export const DEFAULT_MAX_INCUMBENT_YEAR = 1999;

const REJECT_ENTITY_TYPES = new Set([
  "incumbent",
  "association",
  "directory",
  "government",
  "conference",
  "accelerator",
]);

const INCUMBENT_NAME_PATTERNS = [
  /\bgroup\b/i,
  /\bgrupo\b/i,
  /\bholding\b/i,
  /\bcorporation\b/i,
  /\bagrochemical\b/i,
  /\bfertilizer\b/i,
  /\bsince\s+18\d{2}\b/i,
  /\bsince\s+19[0-4]\d\b/i,
];

function foundingYear(company) {
  const raw = company.founded_date;
  if (!raw) return null;
  const m = String(raw).match(/\b(19|20)\d{2}\b/);
  return m ? Number(m[0]) : null;
}

function normalizeHost(domain) {
  return String(domain ?? "")
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .split("/")[0]
    .split(".")[0]
    .replace(/[^a-z0-9]/g, "");
}

function domainMatchesName(name, domain) {
  const host = normalizeHost(domain);
  if (!host || host.length < 3) return false;
  const tokens = significantNameTokens(name).map((t) => t.replace(/[^a-z0-9]/g, ""));
  if (tokens.length === 0) return true;

  for (const token of tokens) {
    if (token.length < 3) continue;
    if (host.includes(token) || token.includes(host)) return true;
    if (host.startsWith(token.slice(0, 4)) || token.startsWith(host.slice(0, 4))) return true;
  }
  return false;
}

function hasInvestmentSignal(company, structured = {}) {
  const thesis = detectInvestorThesis(structured);
  if (thesis && companyMatchesInvestorThesis(company, thesis)) {
    return true;
  }

  if (hasFundingStageMandate(structured)) {
    const stage = company.funding_stage;
    if (
      stage &&
      stage !== "unknown" &&
      mandateAllowsFundingStage(structured.funding_stage, stage) &&
      (company.total_raised != null || company.last_funding_date != null)
    ) {
      return true;
    }
  }

  return (
    company.total_raised != null ||
    company.last_funding_date != null ||
    company.annual_revenue_usd != null ||
    company.annual_ebitda_usd != null ||
    (company.investors?.length ?? 0) > 0
  );
}

function companyMatchesStageMandate(company, structured) {
  if (!hasFundingStageMandate(structured)) return false;
  const stage = company.funding_stage;
  return (
    Boolean(stage) &&
    stage !== "unknown" &&
    mandateAllowsFundingStage(structured.funding_stage, stage)
  );
}

function assessFinancialMandate(company, structured, { lite = false } = {}) {
  const reasons = [];
  let hardFail = false;
  let softFail = false;

  const rev = company.annual_revenue_usd;
  const ebitda = company.annual_ebitda_usd;
  const employees = company.employees_count;

  const hasRevenueBand =
    structured.revenue_min != null || structured.revenue_max != null;
  const hasEbitdaBand =
    structured.ebitda_min != null || structured.ebitda_max != null;

  const markBandMiss = (reason) => {
    reasons.push(reason);
    // Lite: near-miss size is soft — keep in shortlist. Heavy: hard drop.
    if (lite) softFail = true;
    else hardFail = true;
  };

  if (hasRevenueBand && rev != null) {
    if (structured.revenue_min != null && rev < structured.revenue_min) {
      markBandMiss(`revenue_below_mandate:${rev}`);
    }
    if (structured.revenue_max != null && rev > structured.revenue_max) {
      markBandMiss(`revenue_above_mandate:${rev}`);
    }
  }

  if (hasEbitdaBand && ebitda != null) {
    if (structured.ebitda_min != null && ebitda < structured.ebitda_min) {
      markBandMiss(`ebitda_below_mandate:${ebitda}`);
    }
    if (structured.ebitda_max != null && ebitda > structured.ebitda_max) {
      markBandMiss(`ebitda_above_mandate:${ebitda}`);
    }
  }

  if (hasEmployeeMandate(structured) && employees != null) {
    if (structured.employees_min != null && employees < structured.employees_min) {
      markBandMiss(`employees_below_mandate:${employees}`);
    }
    if (structured.employees_max != null && employees > structured.employees_max) {
      markBandMiss(`employees_above_mandate:${employees}`);
    }
  }

  if (
    hasFinancialMandate(structured) &&
    !hardFail &&
    ((hasRevenueBand && rev == null) || (hasEbitdaBand && ebitda == null))
  ) {
    reasons.push("financials_unknown_for_pe_mandate");
    // Keep when another size signal corroborates (e.g. employees in-band).
    // Most private SMEs never disclose revenue — don't auto-drop solely for that.
    const employeesInBand =
      hasEmployeeMandate(structured) &&
      employees != null &&
      (structured.employees_min == null || employees >= structured.employees_min) &&
      (structured.employees_max == null || employees <= structured.employees_max);
    if (!employeesInBand) {
      softFail = true;
    }
  }

  return { reasons, hardFail, softFail };
}

/**
 * Assess whether a company belongs in the primary PE shortlist.
 * @param {object} company
 * @param {object} structured
 * @param {{ constraintMode?: 'heavy' | 'lite' }} [options]
 */
export function assessPeQuality(company, structured = {}, options = {}) {
  const lite = isLiteMode(options.constraintMode);
  const reasons = [];
  const investorThesis = detectInvestorThesis(structured);
  const ycThesisBacked =
    investorThesis?.id === "yc" && companyHasYcBacking(company);
  const stageMandateMatch = companyMatchesStageMandate(company, structured);
  const stageFundingVerified =
    stageMandateMatch &&
    (company.total_raised != null || company.last_funding_date != null);
  const peFinancialMandate = hasFinancialMandate(structured);
  const maxIncumbentYear = peFinancialMandate
    ? null
    : structured.founded_after != null
      ? new Date(structured.founded_after).getFullYear() - 1
      : DEFAULT_MAX_INCUMBENT_YEAR;

  const plausibility = scoreEntityPlausibility(company);
  if (plausibility.score < 0.3) {
    reasons.push(`low_plausibility:${plausibility.reasons.join(",")}`);
  }

  const entityType = String(company.entity_type ?? "unknown").toLowerCase();
  if (REJECT_ENTITY_TYPES.has(entityType)) {
    reasons.push(`entity_type:${entityType}`);
  }

  const year = foundingYear(company);
  if (maxIncumbentYear != null && year != null && year <= maxIncumbentYear) {
    reasons.push(`founded_${year}_incumbent`);
  }

  const name = company.name ?? "";
  for (const pattern of INCUMBENT_NAME_PATTERNS) {
    if (pattern.test(name) || pattern.test(company.description ?? "")) {
      reasons.push("incumbent_name_pattern");
      break;
    }
  }

  if (company.domain && !domainMatchesName(name, company.domain)) {
    reasons.push("domain_name_mismatch");
  }

  if (company.domain_verified === false && !ycThesisBacked && !stageFundingVerified) {
    reasons.push("domain_not_verified");
  }

  if (
    structured.country_code === "ES" &&
    company.investment_summary &&
    /\bcolombia\b/i.test(company.investment_summary)
  ) {
    reasons.push("foreign_entity_confusion");
  }

  const mandateHasStage = (structured.funding_stage ?? []).length > 0;
  const stage = company.funding_stage;
  if (mandateHasStage && stage && stage !== "unknown" && !mandateAllowsFundingStage(structured.funding_stage, stage)) {
    reasons.push(`stage_mismatch:${stage}`);
  }

  if (investorThesis && !companyMatchesInvestorThesis(company, investorThesis)) {
    reasons.push(`thesis_mismatch:${investorThesis.id}`);
  }

  const financial = assessFinancialMandate(company, structured, { lite });
  reasons.push(...financial.reasons);

  // Lite: skip diligence quality — only drop obvious non-companies.
  // Soft reasons are still recorded for UI labels; they never block the shortlist.
  if (lite) {
    const junk =
      REJECT_ENTITY_TYPES.has(entityType) || plausibility.score < 0.15;
    if (junk && !reasons.some((r) => r.startsWith("entity_type:") || r.startsWith("low_plausibility:"))) {
      if (REJECT_ENTITY_TYPES.has(entityType)) {
        reasons.push(`entity_type:${entityType}`);
      }
      if (plausibility.score < 0.15) {
        reasons.push(`low_plausibility:${plausibility.reasons.join(",")}`);
      }
    }
    const softFail =
      !junk &&
      (financial.softFail ||
        financial.hardFail ||
        reasons.some((r) => r.startsWith("stage_mismatch:")) ||
        reasons.some((r) => r.startsWith("thesis_mismatch:")) ||
        reasons.includes("domain_name_mismatch") ||
        reasons.includes("domain_not_verified") ||
        (maxIncumbentYear != null && year != null && year <= maxIncumbentYear) ||
        (!hasInvestmentSignal(company, structured) && plausibility.score < 0.6));
    return {
      pass: !junk,
      hardFail: junk,
      softFail,
      reasons,
      plausibility: plausibility.score,
    };
  }

  const hardFail =
    REJECT_ENTITY_TYPES.has(entityType) ||
    (maxIncumbentYear != null && year != null && year <= maxIncumbentYear) ||
    plausibility.score < 0.25 ||
    financial.hardFail;

  const softFail =
    !hardFail &&
    (financial.softFail ||
      reasons.some((r) => r.startsWith("stage_mismatch:")) ||
      reasons.some((r) => r.startsWith("thesis_mismatch:")) ||
      reasons.includes("domain_name_mismatch") ||
      (reasons.includes("domain_not_verified") && !ycThesisBacked && !stageFundingVerified) ||
      (!hasInvestmentSignal(company, structured) && plausibility.score < 0.6));

  return {
    // Heavy requires both hard and soft to pass.
    pass: !hardFail && !softFail,
    hardFail,
    softFail,
    reasons,
    plausibility: plausibility.score,
  };
}

/**
 * Split companies into primary shortlist vs gated/other.
 * @param {object[]} companies
 * @param {object} structured
 * @param {{ constraintMode?: 'heavy' | 'lite' }} [options]
 */
export function applyPeQualityGate(companies, structured = {}, options = {}) {
  const kept = [];
  const dropped = [];

  for (const company of companies) {
    const assessment = assessPeQuality(company, structured, options);
    if (assessment.pass) {
      kept.push(company);
    } else {
      dropped.push({
        company,
        reason: assessment.reasons.join("; "),
        hardFail: assessment.hardFail,
      });
      logger.info("pe_quality_gate_dropped", {
        name: company.name,
        domain: company.domain,
        reasons: assessment.reasons,
        hardFail: assessment.hardFail,
        constraintMode: options.constraintMode ?? "heavy",
      });
    }
  }

  kept.sort((a, b) => {
    const aInv = hasInvestmentSignal(a, structured) ? 1 : 0;
    const bInv = hasInvestmentSignal(b, structured) ? 1 : 0;
    if (bInv !== aInv) return bInv - aInv;
    return 0;
  });

  return { kept, dropped, summary: { kept: kept.length, dropped: dropped.length } };
}
