import { runHeavySearch, enrichCompaniesBatch } from "../heavy_agent/index.js";
import { normalizeCompanyDomain } from "../heavy_agent/domain-blocklist.js";
import { applyCountryHardGate } from "../heavy_agent/geo.js";
import { applyPeQualityGate } from "../heavy_agent/pe-quality-gate.js";
import {
  hasFinancialMandate,
  hasPeMandate,
  getPeResultCap,
  isMandateTooVague,
  clampExpandCount,
  SHORTLIST_MAX,
} from "../heavy_agent/pe-mandate.js";
import { rankCompanies } from "../ranking/index.js";
import { normalizeHeavySearchResults } from "../normalize/index.js";
import {
  buildDiscoveryResults,
  VAGUE_MANDATE_MESSAGE,
  NO_MORE_COMPANIES_MESSAGE,
} from "./results.js";
import {
  isCompanyLookupIntent,
  runCompanyLookupPipeline,
} from "../light_agent/company-lookup.js";
import { hasInvestorThesis } from "../heavy_agent/investor-thesis.js";
import { hasFundingStageMandate } from "../heavy_agent/stage-mandate.js";
import { getSearchFetchLimit } from "../heavy_agent/pe-mandate.js";
import { normalizeConstraintMode, isLiteMode } from "../heavy_agent/constraint-mode.js";

export const DATA_SOURCES = {
  LIVE: "LIVE",
};

function emitProgress(onProgress, step, detail = null) {
  if (typeof onProgress !== "function") return;
  try {
    onProgress({ step, detail, at: Date.now() });
  } catch {
    // Progress is best-effort; never fail the pipeline.
  }
}

async function enrichCompanies(companies, structured, { onProgress, enrichRunner = enrichCompaniesBatch } = {}) {
  if (companies.length === 0) return { companies, enrichedCount: 0, enrichCalls: 0 };

  const batch = await enrichRunner(companies, structured, {
    onProgress,
    // Skip companies that already have usable investment fields (e.g. fill/expand reuse).
    skipIfFresh: true,
  });
  if (batch.enrichedCount > 0) {
    emitProgress(onProgress, "Company profiles updated", `${batch.enrichedCount} companies`);
  }
  return batch;
}

/**
 * How many companies to enrich for a target shortlist size.
 * Slight buffer covers post-enrich gate attrition without paying for a full 2× fan-out.
 */
function enrichBudgetForTarget(target) {
  const cap = Math.max(1, Math.floor(Number(target)) || getPeResultCap());
  return Math.min(cap + 2, Math.max(getSearchFetchLimit(cap), cap + 2));
}

async function processHeavyBatch(
  heavy,
  structured,
  {
    onProgress = null,
    enrichRunner = enrichCompaniesBatch,
    onNormalized = null,
    excludeDomains = [],
    constraintMode = "heavy",
    enrichLimit = null,
  } = {}
) {
  const excludeSet = new Set(
    excludeDomains.map((d) => normalizeCompanyDomain(d)).filter(Boolean)
  );

  let normalized = normalizeHeavySearchResults(heavy);
  if (onNormalized) {
    normalized = onNormalized(normalized) ?? normalized;
  }

  const gated = applyCountryHardGate(normalized.companies, structured);
  let companies = gated.kept.filter(
    (c) => !excludeSet.has(normalizeCompanyDomain(c.domain))
  );

  // Gate on discovery data first — do not pay to enrich companies we will drop.
  const preQuality = applyPeQualityGate(companies, structured, { constraintMode });
  companies = preQuality.kept.filter(
    (c) => !excludeSet.has(normalizeCompanyDomain(c.domain))
  );

  const budget =
    enrichLimit != null
      ? Math.max(0, Math.floor(Number(enrichLimit)) || 0)
      : enrichBudgetForTarget(getPeResultCap(constraintMode));
  const overflow = companies.slice(budget);
  companies = companies.slice(0, budget);

  const preDropped = [
    ...preQuality.dropped,
    ...overflow.map((company) => ({
      company,
      reason: "below_enrich_budget_cutoff",
      hardFail: false,
    })),
  ];

  let enrichCalls = 0;
  if (companies.length > 0) {
    emitProgress(onProgress, "Building company profiles…", `${companies.length} shortlisted`);
    const batch = await enrichCompanies(companies, structured, { onProgress, enrichRunner });
    companies = batch.companies.filter(
      (c) => !excludeSet.has(normalizeCompanyDomain(c.domain))
    );
    enrichCalls = batch.enrichCalls ?? companies.length;

    // Re-gate after enrichment so financial / entity_type hard-fails still drop.
    const postQuality = applyPeQualityGate(companies, structured, { constraintMode });
    companies = postQuality.kept.filter(
      (c) => !excludeSet.has(normalizeCompanyDomain(c.domain))
    );
    preDropped.push(...postQuality.dropped);
  }

  return {
    kept: companies,
    dropped: preDropped,
    geoDropped: gated.dropped.length,
    heavyOutcomes: heavy.outcomes ?? [],
    normalizeSummary: normalized.summary ?? {},
    enrichCalls,
  };
}

const MAX_FILL_ATTEMPTS = 3;
const MAX_FILL_ATTEMPTS_LITE = 4;

async function fillShortlistToTarget(
  companies,
  droppedQuality,
  structured,
  {
    target,
    heavySearchRunner,
    enrichRunner,
    onProgress,
    onNormalized,
    stages,
    droppedGeoTotal,
    heavyOutcomes,
    constraintMode = "heavy",
  }
) {
  let fillAttempts = 0;
  const maxFill = isLiteMode(constraintMode) ? MAX_FILL_ATTEMPTS_LITE : MAX_FILL_ATTEMPTS;

  while (companies.length < target && fillAttempts < maxFill) {
    const excludeDomains = companies
      .map((c) => normalizeCompanyDomain(c.domain))
      .filter(Boolean);
    const deficit = target - companies.length;

    emitProgress(onProgress, "Filling shortlist…", `finding ${deficit} more`);
    const fillStart = Date.now();
    const heavy = await heavySearchRunner(structured, {
      onProgress,
      openAILimit: getSearchFetchLimit(deficit),
      excludeDomains,
      broader: true,
      fillPass:
        hasInvestorThesis(structured) ||
        hasFundingStageMandate(structured) ||
        hasPeMandate(structured),
      constraintMode,
    });
    stages.push({
      name: "heavy_search_fill",
      latencyMs: Date.now() - fillStart,
      openaiResultCount: heavy.openaiResultCount ?? 0,
      attempt: fillAttempts + 1,
    });
    heavyOutcomes.push(...(heavy.outcomes ?? []));

    const batch = await processHeavyBatch(heavy, structured, {
      onProgress,
      enrichRunner,
      onNormalized,
      excludeDomains,
      constraintMode,
      enrichLimit: enrichBudgetForTarget(deficit),
    });
    droppedGeoTotal += batch.geoDropped;
    droppedQuality.push(...batch.dropped);

    if (batch.kept.length === 0) break;

    const seen = new Set(excludeDomains);
    const newCompanies = batch.kept.filter((c) => {
      const domain = normalizeCompanyDomain(c.domain);
      if (!domain || seen.has(domain)) return false;
      seen.add(domain);
      return true;
    });

    if (newCompanies.length === 0) break;

    companies = [...companies, ...newCompanies].slice(0, target);
    fillAttempts += 1;
  }

  return { companies, droppedQuality, droppedGeoTotal };
}

function buildVagueResult(structured, stages, costInputs, pipelineStart) {
  const ranked = {
    results: [],
    other_results: [],
    message: VAGUE_MANDATE_MESSAGE,
    summary: { count: 0 },
  };
  return {
    structured,
    ranked,
    dataSource: DATA_SOURCES.LIVE,
    stages,
    latencyMs: Date.now() - pipelineStart,
    heavySearchRan: false,
    costInputs,
  };
}

async function runStatelessDiscovery(structured, rawQuery, options = {}) {
  const {
    skipHeavySearch = false,
    heavySearchRunner = runHeavySearch,
    enrichRunner = enrichCompaniesBatch,
    onNormalized = null,
    onProgress = null,
    priorStages = [],
    costInputs = {},
    constraintMode: rawConstraintMode = "heavy",
  } = options;
  const constraintMode = normalizeConstraintMode(rawConstraintMode);

  const pipelineStart = Date.now();
  const stages = [...priorStages];
  let droppedGeoTotal = 0;
  let droppedQuality = [];
  let noResultsContext = null;
  let companies = [];
  const heavyOutcomes = [];

  if (skipHeavySearch) {
    stages.push({ name: "heavy_search", latencyMs: 0, skipped: true });
  } else {
    emitProgress(onProgress, "Researching the market…");
    const heavyStart = Date.now();
    const heavy = await heavySearchRunner(structured, {
      onProgress,
      constraintMode,
      openAILimit: getSearchFetchLimit(getPeResultCap(constraintMode)),
    });
    heavyOutcomes.push(...(heavy.outcomes ?? []));
    stages.push({
      name: "heavy_search",
      latencyMs: Date.now() - heavyStart,
      skipped: false,
      openaiResultCount: heavy.openaiResultCount ?? 0,
      constraintMode,
    });
    costInputs.openai_search = {
      used: Boolean(heavy.openaiSearchUsed),
      resultCount: heavy.openaiResultCount ?? 0,
    };
    emitProgress(
      onProgress,
      "Market scan complete",
      `${heavy.openaiResultCount ?? 0} candidates found`
    );

    emitProgress(onProgress, "Screening candidates…");
    const batch = await processHeavyBatch(heavy, structured, {
      onProgress,
      enrichRunner,
      onNormalized,
      constraintMode,
      enrichLimit: enrichBudgetForTarget(getPeResultCap(constraintMode)),
    });
    droppedGeoTotal += batch.geoDropped;
    droppedQuality = batch.dropped;
    noResultsContext = {
      heavyOutcomes,
      normalizeSummary: batch.normalizeSummary,
    };
    stages.push({
      name: "normalize",
      latencyMs: 0,
      companyCount: batch.kept.length + batch.dropped.length,
    });
    if (batch.enrichCalls > 0) {
      stages.push({
        name: "enrichment",
        latencyMs: 0,
        enrichedCount: batch.enrichCalls,
      });
      costInputs.openai_enrich = { calls: batch.enrichCalls };
    }

    companies = batch.kept;
  }

  emitProgress(onProgress, "Vetting against criteria…");
  stages.push({
    name: "pe_quality_gate",
    latencyMs: 0,
    kept: companies.length,
    dropped: droppedQuality.length,
    constraintMode,
  });
  if (droppedQuality.length > 0) {
    emitProgress(
      onProgress,
      "Screening vetting complete",
      `${companies.length} on thesis, ${droppedQuality.length} excluded`
    );
  }

  const target = getPeResultCap(constraintMode);
  if (!skipHeavySearch && companies.length < target) {
    const filled = await fillShortlistToTarget(companies, droppedQuality, structured, {
      target,
      heavySearchRunner,
      enrichRunner,
      onProgress,
      onNormalized,
      stages,
      droppedGeoTotal,
      heavyOutcomes,
      constraintMode,
    });
    companies = filled.companies;
    droppedQuality = filled.droppedQuality;
    droppedGeoTotal = filled.droppedGeoTotal;
    noResultsContext = {
      heavyOutcomes,
      normalizeSummary: noResultsContext?.normalizeSummary ?? {},
    };
  }

  let rankMetaByDomain = null;
  if (hasFinancialMandate(structured) && companies.length > 0) {
    emitProgress(onProgress, "Ranking by criteria fit…");
    const rankedBatch = rankCompanies(structured, companies);
    rankMetaByDomain = new Map(rankedBatch.results.map((row) => [row.company.domain, row]));
    companies = rankedBatch.results.map((row) => row.company);

    const cap = getPeResultCap(constraintMode);
    if (companies.length > cap) {
      const overflow = companies.slice(cap);
      companies = companies.slice(0, cap);
      for (const company of overflow) {
        droppedQuality.push({ company, reason: "below_pe_fit_rank_cutoff", hardFail: false });
      }
      emitProgress(onProgress, "Shortlist capped", `top ${cap} companies`);
    }
    stages.push({ name: "pe_fit_ranking", latencyMs: 0, rankedCount: companies.length });
  } else {
    const cap = getPeResultCap(constraintMode);
    if (companies.length > cap) {
      companies = companies.slice(0, cap);
      emitProgress(onProgress, "Shortlist capped", `top ${cap} companies`);
    }
  }

  emitProgress(onProgress, "Preparing your shortlist…");
  const ranked = buildDiscoveryResults(companies, {
    structured,
    noResultsContext,
    droppedGeo: droppedGeoTotal,
    rankMetaByDomain,
    otherCompanies: droppedQuality.map((d) => ({
      company: d.company,
      gateReason: d.reason,
      gateReasons: d.reason?.split("; ").filter(Boolean) ?? [],
    })),
  });
  stages.push({ name: "results", latencyMs: 0, resultCount: ranked.results.length });
  emitProgress(onProgress, "Shortlist ready", `${ranked.results.length} companies`);

  return {
    structured,
    ranked,
    dataSource: DATA_SOURCES.LIVE,
    stages,
    latencyMs: Date.now() - pipelineStart,
    heavySearchRan: !skipHeavySearch,
    costInputs,
  };
}

/**
 * Discovery from pre-parsed structured query (stateless — no cache/DB).
 */
export async function runDiscoveryFromParsed(structured, rawQuery, options = {}) {
  const { onProgress = null } = options;
  const pipelineStart = Date.now();
  const stages = [];
  const costInputs = {};

  if (isMandateTooVague(structured)) {
    emitProgress(onProgress, "Need more criteria detail", "Add sector, geography, or size");
    emitProgress(onProgress, "Shortlist ready", "0 companies");
    return buildVagueResult(structured, stages, costInputs, pipelineStart);
  }

  if (isCompanyLookupIntent(structured)) {
    return runCompanyLookupPipeline(
      { structured, model: null, attempts: 0 },
      { ...options, priorStages: stages, costInputs }
    );
  }

  return runStatelessDiscovery(structured, rawQuery, {
    ...options,
    priorStages: stages,
    costInputs,
  });
}

function buildExpandMessage(requested, found) {
  if (found === 0) return NO_MORE_COMPANIES_MESSAGE;
  if (found < requested) {
    const gap = requested - found;
    return `Found ${found} additional ${found === 1 ? "company" : "companies"} (${gap} more requested but not available).`;
  }
  return null;
}

/**
 * Find additional companies for an existing shortlist (excludes known domains).
 */
export async function runDiscoveryExpand(structured, rawQuery, options = {}) {
  const {
    existingDomains = [],
    additionalCount = 5,
    onProgress = null,
    heavySearchRunner = runHeavySearch,
    enrichRunner = enrichCompaniesBatch,
    constraintMode: rawConstraintMode = "heavy",
  } = options;
  const constraintMode = normalizeConstraintMode(rawConstraintMode);

  const excludeSet = new Set(
    existingDomains.map((d) => normalizeCompanyDomain(d)).filter(Boolean)
  );
  const currentCount = excludeSet.size;
  const count = clampExpandCount(currentCount, additionalCount);

  if (count <= 0) {
    return {
      structured,
      ranked: {
        results: [],
        other_results: [],
        message: `Shortlist already at maximum (${SHORTLIST_MAX} companies).`,
        summary: { count: 0, added: 0 },
      },
      dataSource: DATA_SOURCES.LIVE,
      stages: [],
      latencyMs: 0,
      heavySearchRan: false,
    };
  }

  const pipelineStart = Date.now();
  const stages = [];
  const heavyOutcomes = [];
  const allDropped = [];
  let companies = [];
  let droppedGeoTotal = 0;
  let attempts = 0;
  const maxAttempts = MAX_FILL_ATTEMPTS;
  const fillPass =
    hasInvestorThesis(structured) || hasFundingStageMandate(structured) || hasPeMandate(structured);

  while (companies.length < count && attempts < maxAttempts) {
    const foundDomains = companies.map((c) => normalizeCompanyDomain(c.domain)).filter(Boolean);
    const attemptExclude = new Set([...excludeSet, ...foundDomains]);
    const excludeDomains = [...attemptExclude];
    const deficit = count - companies.length;

    emitProgress(onProgress, "Finding more companies…", `up to ${deficit} additional`);
    const heavyStart = Date.now();
    const heavy = await heavySearchRunner(structured, {
      onProgress,
      openAILimit: getSearchFetchLimit(deficit),
      excludeDomains,
      broader: true,
      fillPass,
      constraintMode,
    });
    heavyOutcomes.push(...(heavy.outcomes ?? []));
    stages.push({
      name: "heavy_search",
      latencyMs: Date.now() - heavyStart,
      skipped: false,
      openaiResultCount: heavy.openaiResultCount ?? 0,
      expand: true,
      attempt: attempts + 1,
      constraintMode,
    });

    emitProgress(
      onProgress,
      "Market scan complete",
      `${heavy.openaiResultCount ?? 0} new candidates`
    );

    emitProgress(onProgress, "Screening candidates…");
    const normalizeStart = Date.now();
    const normalized = normalizeHeavySearchResults(heavy);
    const gated = applyCountryHardGate(normalized.companies, structured);
    let batchCompanies = gated.kept.filter(
      (c) => !attemptExclude.has(normalizeCompanyDomain(c.domain))
    );
    droppedGeoTotal += gated.dropped.length;
    stages.push({
      name: "normalize",
      latencyMs: Date.now() - normalizeStart,
      companyCount: batchCompanies.length,
    });

    // Gate before enrich so we don't research companies that will be dropped.
    const preQuality = applyPeQualityGate(batchCompanies, structured, { constraintMode });
    batchCompanies = preQuality.kept.filter(
      (c) => !attemptExclude.has(normalizeCompanyDomain(c.domain))
    );
    batchCompanies = batchCompanies.slice(0, enrichBudgetForTarget(deficit));

    if (batchCompanies.length > 0) {
      const enrichStart = Date.now();
      emitProgress(onProgress, "Building company profiles…", `${batchCompanies.length} shortlisted`);
      const batch = await enrichCompanies(batchCompanies, structured, { onProgress, enrichRunner });
      batchCompanies = batch.companies.filter(
        (c) => !attemptExclude.has(normalizeCompanyDomain(c.domain))
      );
      stages.push({
        name: "enrichment",
        latencyMs: Date.now() - enrichStart,
        enrichedCount: batch.enrichedCount ?? 0,
      });
    }

    emitProgress(onProgress, "Vetting against criteria…");
    const quality = applyPeQualityGate(batchCompanies, structured, { constraintMode });
    batchCompanies = quality.kept.filter(
      (c) => !attemptExclude.has(normalizeCompanyDomain(c.domain))
    );
    allDropped.push(...preQuality.dropped, ...quality.dropped);
    stages.push({
      name: "pe_quality_gate",
      latencyMs: 0,
      kept: quality.kept.length,
      dropped: preQuality.dropped.length + quality.dropped.length,
      constraintMode,
    });

    const newCompanies = batchCompanies.filter((c) => {
      const domain = normalizeCompanyDomain(c.domain);
      if (!domain || attemptExclude.has(domain)) return false;
      attemptExclude.add(domain);
      return true;
    });

    attempts += 1;
    if (newCompanies.length === 0) break;
    companies = [...companies, ...newCompanies].slice(0, count);
  }

  const noResultsContext = {
    heavyOutcomes,
    normalizeSummary: {},
  };

  let rankMetaByDomain = null;
  if (hasFinancialMandate(structured) && companies.length > 0) {
    emitProgress(onProgress, "Ranking by criteria fit…");
    const rankedBatch = rankCompanies(structured, companies);
    rankMetaByDomain = new Map(rankedBatch.results.map((row) => [row.company.domain, row]));
    companies = rankedBatch.results.map((row) => row.company);
    stages.push({ name: "pe_fit_ranking", latencyMs: 0, rankedCount: companies.length });
  }

  companies = companies.slice(0, count);
  const expandMessage = buildExpandMessage(count, companies.length);

  emitProgress(onProgress, "Preparing your shortlist…");
  const ranked = buildDiscoveryResults(companies, {
    structured,
    noResultsContext,
    droppedGeo: droppedGeoTotal,
    rankMetaByDomain,
    otherCompanies: allDropped.map((d) => ({
      company: d.company,
      gateReason: d.reason,
      gateReasons: d.reason?.split("; ").filter(Boolean) ?? [],
    })),
  });
  ranked.message = expandMessage;
  ranked.summary = { ...ranked.summary, added: companies.length };

  stages.push({ name: "results", latencyMs: 0, resultCount: ranked.results.length });
  emitProgress(
    onProgress,
    "Expansion complete",
    companies.length > 0 ? `${companies.length} companies added` : "no new companies"
  );

  return {
    structured,
    ranked,
    dataSource: DATA_SOURCES.LIVE,
    stages,
    latencyMs: Date.now() - pipelineStart,
    heavySearchRan: true,
    addedCount: companies.length,
  };
}
