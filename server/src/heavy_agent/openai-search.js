/**
 * Primary cold-start discovery via OpenAI gpt-5-search-api (Chat Completions).
 */
import { logger } from "../lib/logger.js";
import { parseLlmJson, extractJsonObject } from "../lib/parse-llm-json.js";
import { callGeminiSearch } from "../lib/llm.js";
import { normalizeCompanyDomain } from "./domain-blocklist.js";
import { FUNDING_STAGES } from "../light_agent/schema.js";
import {
  buildFinancialMandateLines,
  hasFinancialMandate,
  hasPeMandate,
} from "./pe-mandate.js";
import { detectInvestorThesis } from "./investor-thesis.js";
import {
  hasFundingStageMandate,
  formatStageMandateLabel,
  buildStageSourceHint,
} from "./stage-mandate.js";
import { isLiteMode } from "./constraint-mode.js";

export const OPENAI_WEB_SEARCH_SOURCE = "openai_web_search";

const DEFAULT_LIMIT = 8;
const VALID_STAGES = new Set(FUNDING_STAGES);
const RETRY_DELAY_MS = 1200;

export function getHeavySearchModel() {
  return process.env.HEAVY_LLM_MODEL ?? "gemini-flash-latest";
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function buildDiscoveryPrompt(structured, limit, { broader = false, excludeDomains = [], fillPass = false, constraintMode = "heavy" } = {}) {
  const lite = isLiteMode(constraintMode);
  const investorThesis = detectInvestorThesis(structured);
  const stageMandate = hasFundingStageMandate(structured);
  const stageLabel = formatStageMandateLabel(structured.funding_stage);
  const sectors =
    (structured.sector_tags ?? []).join(", ") ||
    (investorThesis || stageMandate ? "any sector" : "technology");
  const stages = (structured.funding_stage ?? []).filter((s) => s !== "unknown").join(", ");
  const geos = (structured.geography ?? []).join(", ");
  const country = structured.country_code ? String(structured.country_code).toUpperCase() : null;
  const keywords = (structured.keywords ?? []).join(", ");
  const names = (structured.company_names ?? []).join(", ");
  const peMandate = hasPeMandate(structured);
  const financialMandate = hasFinancialMandate(structured);
  const financialLines = buildFinancialMandateLines(structured).map((line) =>
    lite ? `Target size (soft — near-misses OK): ${line}` : line
  );

  const excludeRules = [
    "trade associations",
    "conferences",
    "government agencies",
    "companies without their own operating website",
  ];
  if (investorThesis || stageMandate) {
    excludeRules.push(
      "directory or accelerator organizations as companies (list pages are valid sources, not results)"
    );
    if (!investorThesis) {
      excludeRules.push("accelerator programs as companies");
    }
  } else {
    excludeRules.push("accelerators", "directories");
  }
  if (!financialMandate && !lite) {
    excludeRules.push("century-old incumbents (founded before 2000)");
  }

  const includeRule = financialMandate
    ? lite
      ? "PREFER: independently operating companies headquartered in the mandate country matching the sector (SMEs, growth software vendors, regional POS/ERP/retail platforms — not only VC startups). Size bands are targets — include near-misses slightly above/below revenue or headcount, and companies whose financials are private/estimated. Favor recall over exact band matches; aim to fill the list."
      : "INCLUDE ONLY: independently operating companies headquartered in the mandate country — profitable SMEs, growth companies, and buyout-relevant businesses within the financial band when known. Prefer entity_type growth_company for scaled businesses."
    : investorThesis
      ? `INCLUDE ONLY: independently operating portfolio companies that match the investor thesis (${investorThesis.label}), headquartered in the mandate geography when specified.`
      : stageMandate
        ? `INCLUDE ONLY: independently operating companies headquartered in the mandate geography whose latest disclosed institutional round matches the mandate funding stage (${stageLabel}).`
        : lite
          ? "PREFER: independently operating companies in or near the mandate geography and sector. Favor recall — include plausible matches even when stage or financials are incomplete."
          : "INCLUDE ONLY: independently operating companies headquartered in the mandate country, preferably venture-backed or growth-stage operating_startup entities.";

  const entityHint = financialMandate
    ? "Optional: entity_type (operating_startup|growth_company)."
    : null;

  const peSizeFields = peMandate
    ? " When known or reasonably estimated: annual_revenue_usd (number USD), employees_count (integer), annual_ebitda_usd (number USD or null)."
    : "";

  const baseRequiredFields =
    "name (string), domain (official company website hostname only — no scheme/path), geography (city/region/country), funding_stage (pre-seed|seed|series_a|series_b|series_c_plus|unknown), founded_year (4-digit integer or null when unknown — never use the bare token unknown), description (one short sentence)";

  const requiredFields = investorThesis
    ? `Each company object MUST have: ${baseRequiredFields}, investors (string array — must include the backing investor when known).`
    : stageMandate
      ? `Each company object MUST have: ${baseRequiredFields}, total_raised_usd (number USD or null), last_funding_date (YYYY-MM-DD or null), investors (string array).`
      : `Each company object MUST have: ${baseRequiredFields}.${peSizeFields}`;
  const thesisSourceHint =
    investorThesis?.id === "yc"
      ? "Search ycombinator.com/companies filtered by mandate location. Prefer companies with Y Combinator in investors or a cited YC batch (S2024, W25, Spring 2025, etc.). Portfolio companies from the YC directory are valid even though they are listed in a directory."
      : investorThesis?.id === "techstars"
        ? "Search techstars.com portfolio pages filtered by mandate location. Prefer companies with Techstars in investors."
        : null;

  const stageSourceHint = stageMandate ? buildStageSourceHint(structured) : null;

  const useBroader = broader || lite;
  const peFillHint = peMandate
    ? fillPass
      ? `Fill pass: find additional ${sectors} companies in ${geos || "mandate geography"} not already shortlisted. Include near-misses on size, privately held vendors with estimated revenue/headcount, POS/ERP/eCommerce enablers, and regional software firms — aim for ${limit} new names.`
      : lite
        ? `Broaden within mandate geography and sector synonyms (${sectors}): include companies slightly outside the revenue/employee band, privately held firms with estimated size, and adjacent categories (e.g. POS, ERP, eCommerce, analytics) while staying in-country.`
        : null
    : null;
  const broaderHint = useBroader
    ? investorThesis
      ? fillPass
        ? "Broaden within the investor portfolio to find additional companies not already shortlisted: adjacent YC batches, nearby metro cities, and related portfolio companies while staying in mandate geography."
        : "Broaden within the investor portfolio: adjacent batches, nearby cities in the same metro, and related portfolio companies while staying in mandate geography."
      : stageMandate
        ? fillPass
          ? `Broaden within the mandate geography to find additional companies whose latest disclosed round is still ${stageLabel}, not already shortlisted — try adjacent cities, sectors, and ecosystem lists.`
          : `Broaden within the mandate geography and sector synonyms while keeping latest disclosed round at ${stageLabel}.`
        : peFillHint ||
          "Broaden search synonyms and adjacent sector terms while staying in mandate geography."
    : peFillHint;

  const peSourceHint =
    peMandate && lite
      ? "Source broadly: industry vendor lists, local software directories, competitor pages, LinkedIn company results, and press — not only Crunchbase/venture databases. Prefer companies with their own .mx/.de/etc. operating sites when geography implies it."
      : null;

  const constraints = [
    `Return exactly a JSON object: {"companies":[...]} with as many as ${limit} real operating companies as the market provides — aim for ${limit} distinct matches when available.`,
    lite && peMandate
      ? `Do not stop early: if fewer than ${limit} exact band matches exist, keep adding plausible near-misses until you reach ${limit} or exhaust credible names.`
      : null,
    requiredFields,
    entityHint,
    peMandate
      ? "For PE size mandates, funding_stage may be unknown when the company is not venture-backed."
      : null,
    investorThesis || stageMandate
      ? "Required: investors (string array), sources (string array of URLs you used)."
      : "Optional: investors (string array), sources (string array of URLs you used).",
    stageMandate
      ? "Required when known: total_raised_usd, last_funding_date."
      : null,
    lite
      ? `Prefer to avoid: ${excludeRules.join(", ")}. Soft guidance — do not over-filter when unsure.`
      : `EXCLUDE: ${excludeRules.join(", ")}.`,
    includeRule,
    thesisSourceHint,
    stageSourceHint,
    peSourceHint,
    "Verify each domain is the company's own website — not Crunchbase, LinkedIn, or a news article.",
    broaderHint,
    excludeDomains.length > 0
      ? `Already on shortlist — do NOT return these domains: ${excludeDomains.join(", ")}.`
      : null,
    "Output JSON only — no markdown fences, no commentary.",
  ].filter(Boolean);
  const mandate = [
    investorThesis ? `Investor thesis (required): ${investorThesis.label}` : null,
    stageMandate
      ? `Funding stage (required): ${stageLabel} — latest disclosed institutional round must still be ${stageLabel}`
      : null,
    names ? `Company names to research: ${names}` : null,
    `Sectors: ${sectors}`,
    stages && !stageMandate
      ? lite
        ? `Funding stages (preferred): ${stages}`
        : `Funding stages: ${stages} (return ONLY companies at these stages)`
      : null,
    geos ? `Geography: ${geos}` : null,
    country
      ? lite
        ? `ISO country_code (preferred geography): ${country}`
        : `ISO country_code (hard requirement): ${country}`
      : null,
    ...financialLines,
    peMandate
      ? lite
        ? "Mandate type: PE / buyout-style (Lite) — prefer size-band matches but keep near-misses; do not return empty when exact private-company figures are scarce."
        : "Mandate type: PE / buyout-style — prioritize companies with revenue or EBITDA in band when discoverable."
      : null,
    keywords ? `Keywords: ${keywords}` : null,
    structured.raw_query ? `Original query: ${structured.raw_query}` : null,
  ]
    .filter(Boolean)
    .join("\n");

  return `${constraints.join("\n")}\n\nMandate:\n${mandate}`;
}

function normalizeStage(value) {
  if (value == null || value === "") return "unknown";
  let raw = String(value)
    .toLowerCase()
    .trim()
    .replace(/\+/g, "_plus")
    .replace(/[-\s]+/g, "_")
    .replace(/_+/g, "_");
  const aliases = {
    pre_seed: "pre-seed",
    preseed: "pre-seed",
    seriesa: "series_a",
    series_a: "series_a",
    seriesb: "series_b",
    series_b: "series_b",
    seriesc: "series_c_plus",
    series_c: "series_c_plus",
    series_c_plus: "series_c_plus",
    series_cplus: "series_c_plus",
    seriesc_plus: "series_c_plus",
    c_plus: "series_c_plus",
    seed: "seed",
    unknown: "unknown",
  };
  if (aliases[raw]) return aliases[raw];
  if (VALID_STAGES.has(raw)) return raw;
  if (raw === "pre-seed" || raw === "preseed") return "pre-seed";
  return "unknown";
}

function parseFundingUsd(value) {
  if (value == null || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

function parseFundingDate(value) {
  if (value == null || value === "") return null;
  const s = String(value).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const year = s.match(/\b(19|20)\d{2}\b/);
  return year ? `${year[0]}-01-01` : null;
}

function parseEmployees(value) {
  if (value == null || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : null;
}

function toResult(raw) {
  const name = String(raw?.name ?? "").trim();
  const domain = normalizeCompanyDomain(raw?.domain);
  if (!name || !domain) return null;

  return {
    name,
    domain,
    description: raw.description ? String(raw.description).trim() : null,
    geography: raw.geography ? String(raw.geography).trim() : null,
    funding_stage: normalizeStage(raw.funding_stage),
    founded_date: raw.founded_year ? `${Number(raw.founded_year)}-01-01` : null,
    entity_type: raw.entity_type ? String(raw.entity_type).trim().toLowerCase() : null,
    investors: Array.isArray(raw.investors)
      ? raw.investors.map(String).filter(Boolean)
      : null,
    total_raised: parseFundingUsd(raw.total_raised_usd ?? raw.total_raised),
    last_funding_date: parseFundingDate(raw.last_funding_date),
    annual_revenue_usd: parseFundingUsd(raw.annual_revenue_usd),
    annual_ebitda_usd: parseFundingUsd(raw.annual_ebitda_usd),
    employees_count: parseEmployees(raw.employees_count),
    sector_tags: Array.isArray(raw.sector_tags)
      ? raw.sector_tags.map(String).filter(Boolean)
      : null,
    source: OPENAI_WEB_SEARCH_SOURCE,
    method: "gpt5_search_api",
    domain_resolution_tier: "openai_search",
    verification_urls: {},
    raw: {
      sources: Array.isArray(raw.sources) ? raw.sources : [],
    },
  };
}

async function runDiscoveryAttempt(structured, { limit, onProgress, broader = false, excludeDomains = [], fillPass = false, constraintMode = "heavy" } = {}) {
  const model = getHeavySearchModel();
  const start = Date.now();
  const lite = isLiteMode(constraintMode);
  const prompt = buildDiscoveryPrompt(structured, limit, {
    broader: broader || lite,
    excludeDomains,
    fillPass,
    constraintMode,
  });

  const systemContent = lite
    ? "You are a PE deal-sourcing research agent. Use web search to find real companies matching the mandate. Prefer recall over strict filtering — return more plausible matches when criteria are soft. Return strict JSON only."
    : "You are a PE deal-sourcing research agent. Use web search to find real companies matching the mandate. Return strict JSON only.";

  try {
    const { content } = await callGeminiSearch({
      model,
      purpose: "heavy_gemini_web_search",
      messages: [
        {
          role: "system",
          content: systemContent,
        },
        { role: "user", content: prompt },
      ],
    });

    const { parsed, repaired } = parseLlmJson(content);
    const list = Array.isArray(parsed.companies) ? parsed.companies : [];
    const results = list.map(toResult).filter(Boolean).slice(0, limit);
    const latencyMs = Date.now() - start;

    return { results, latencyMs, model, rawCount: list.length, error: null, jsonRepaired: repaired };
  } catch (error) {
    const latencyMs = Date.now() - start;
    return {
      results: [],
      latencyMs,
      model,
      rawCount: 0,
      error: error.message,
      jsonRepaired: false,
    };
  }
}

/**
 * Discover companies via gpt-5-search-api web search.
 */
export async function searchViaOpenAI(
  structured,
  { limit = DEFAULT_LIMIT, onProgress = null, excludeDomains = [], broader = false, fillPass = false, constraintMode = "heavy" } = {}
) {
  const model = getHeavySearchModel();
  const start = Date.now();
  const lite = isLiteMode(constraintMode);
  const effectiveBroader = broader || lite;
  onProgress?.({ step: "Live market research…", detail: lite ? "Lite mode" : null, at: Date.now() });

  let attempt = await runDiscoveryAttempt(structured, {
    limit,
    onProgress,
    excludeDomains,
    broader: effectiveBroader,
    fillPass,
    constraintMode,
  });
  let retried = effectiveBroader;
  let jsonRepaired = attempt.jsonRepaired;

  if (attempt.results.length === 0) {
    retried = true;
    onProgress?.({
      step: "Broadening market search…",
      detail: attempt.error ? "retrying after parse error" : "expanding keywords",
      at: Date.now(),
    });
    await sleep(RETRY_DELAY_MS);
    const retryAttempt = await runDiscoveryAttempt(structured, {
      limit,
      onProgress,
      broader: true,
      excludeDomains,
      fillPass,
      constraintMode,
    });
    jsonRepaired = jsonRepaired || retryAttempt.jsonRepaired;
    attempt = retryAttempt;
  }

  const latencyMs = Date.now() - start;

  if (attempt.results.length === 0) {
    const failed = Boolean(attempt.error);
    logger.externalCall({
      source: "openai",
      query: retried ? "heavy_openai_web_search_retry" : "heavy_openai_web_search",
      status: failed ? 500 : 200,
      latencyMs,
      success: false,
      error: attempt.error ? new Error(attempt.error) : undefined,
    });
    if (failed) {
      onProgress?.({
        step: "Market research unavailable",
        detail: "will continue with available data",
        at: Date.now(),
      });
    }
    logger.info("openai_web_search_complete", {
      model: attempt.model,
      resultCount: 0,
      latencyMs,
      retried,
      jsonRepaired,
      error: attempt.error,
      domains: [],
    });
    return {
      source: OPENAI_WEB_SEARCH_SOURCE,
      success: false,
      status: failed ? 500 : 200,
      query: structured.raw_query ?? "",
      results: [],
      method: failed ? "error" : "gpt5_search_api",
      latencyMs,
      model: attempt.model,
      error: attempt.error ?? null,
      perSourceDistinctCount: 0,
      resultsRawCount: attempt.rawCount,
      retried,
      jsonRepaired,
    };
  }

  onProgress?.({
    step: "Candidates identified",
    detail: `${attempt.results.length} companies${retried ? " (expanded search)" : ""}`,
    at: Date.now(),
  });

  logger.externalCall({
    source: "openai",
    query: retried ? "heavy_openai_web_search_retry" : "heavy_openai_web_search",
    status: 200,
    latencyMs,
    success: true,
  });

  logger.info("openai_web_search_complete", {
    model: attempt.model,
    resultCount: attempt.results.length,
    latencyMs,
    retried,
    jsonRepaired,
    domains: attempt.results.map((r) => r.domain),
  });

  return {
    source: OPENAI_WEB_SEARCH_SOURCE,
    success: true,
    status: 200,
    query: structured.raw_query ?? "",
    results: attempt.results,
    method: retried ? "gpt5_search_api_retry" : "gpt5_search_api",
    latencyMs,
    model: attempt.model,
    perSourceDistinctCount: attempt.results.length,
    resultsRawCount: attempt.rawCount,
    retried,
    jsonRepaired,
  };
}

export {
  buildDiscoveryPrompt,
  extractJsonObject,
  normalizeStage,
  toResult as parseOpenAIDiscoveryRecord,
};
export { detectInvestorThesis, hasInvestorThesis } from "./investor-thesis.js";
