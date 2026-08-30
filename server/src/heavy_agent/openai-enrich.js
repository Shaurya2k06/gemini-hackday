/**
 * Per-company investment enrichment via gpt-5-search-api.
 * The API searches news, Crunchbase, press, filings, etc. — we only parse JSON.
 */
import OpenAI from "openai";
import { logger } from "../lib/logger.js";
import { parseLlmJson } from "../lib/parse-llm-json.js";
import { FUNDING_STAGES } from "../light_agent/schema.js";
import { mandateAllowsFundingStage } from "../light_agent/funding-stage.js";
import { inferCountryCodeFromGeoString } from "../light_agent/geo/countries.js";
import { getHeavySearchModel } from "./openai-search.js";
import { buildFinancialMandateLines, hasFinancialMandate } from "./pe-mandate.js";

export const OPENAI_WEB_ENRICH_SOURCE = "openai_web_enrich";

const VALID_STAGES = new Set(FUNDING_STAGES);
const DEFAULT_CONCURRENCY = getEnrichConcurrency();

function getEnrichConcurrency() {
  const raw = process.env.ENRICH_CONCURRENCY;
  if (raw != null && raw !== "") {
    const n = Number(raw);
    if (Number.isFinite(n) && n > 0) return Math.min(Math.floor(n), 8);
  }
  return 4;
}

const VALID_ENTITY_TYPES = new Set([
  "operating_startup",
  "growth_company",
  "incumbent",
  "association",
  "directory",
  "government",
  "conference",
  "unknown",
]);

let client;

function getClient() {
  if (!client) {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) throw new Error("OPENAI_API_KEY is not set");
    client = new OpenAI({ apiKey });
  }
  return client;
}

function normalizeStage(value) {
  if (value == null || value === "") return null;
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
  const mapped = aliases[raw] ?? raw;
  return VALID_STAGES.has(mapped) ? mapped : null;
}

/** Infer enum stage from free-text recent_rounds lines when funding_stage is missing. */
function inferStageFromRecentRounds(rounds) {
  if (!Array.isArray(rounds) || rounds.length === 0) return null;
  const text = rounds.join(" ").toLowerCase();
  if (/\bseries\s*c\+?\b|\bseries\s*c\s*plus\b|\bseries\s*[d-z]\b/.test(text)) {
    return "series_c_plus";
  }
  if (/\bseries\s*b\+?\b|\bseries\s*b\s*plus\b/.test(text)) return "series_b";
  if (/\bseries\s*a\b/.test(text)) return "series_a";
  if (/\bpre[-\s]?seed\b/.test(text)) return "pre-seed";
  if (/\bseed\b/.test(text)) return "seed";
  return null;
}

function parseUsd(value) {
  if (value == null || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

function parseIntField(value) {
  if (value == null || value === "") return null;
  const n = Number(value);
  return Number.isInteger(n) && n >= 0 ? n : null;
}

function parseDate(value) {
  if (value == null || value === "") return null;
  const s = String(value).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const year = s.match(/\b(19|20)\d{2}\b/);
  return year ? `${year[0]}-01-01` : null;
}

function buildProfileSnapshot(company) {
  return {
    name: company.name ?? null,
    domain: company.domain ?? null,
    description: company.description ?? null,
    geography: company.geography ?? null,
    funding_stage: company.funding_stage ?? null,
    total_raised: company.total_raised ?? null,
    last_funding_date: company.last_funding_date ?? null,
    annual_revenue_usd: company.annual_revenue_usd ?? null,
    annual_ebitda_usd: company.annual_ebitda_usd ?? null,
    employees_count: company.employees_count ?? null,
    founded_date: company.founded_date ?? null,
    investors: company.investors ?? [],
    sector_tags: company.sector_tags ?? [],
    investment_summary: company.investment_summary ?? null,
  };
}

export function buildDeepDiveResearchPrompt(company, structured, { userQuestion = null } = {}) {
  const priorUrls = [
    ...(company.enrichment_sources ?? []),
    ...(company.sources_found ?? []).map((s) => String(s)),
  ].filter(Boolean);
  const financialLines = buildFinancialMandateLines(structured);
  const mandate = [
    structured?.sector_tags?.length ? `Sectors: ${structured.sector_tags.join(", ")}` : null,
    structured?.geography?.length ? `Geography: ${structured.geography.join(", ")}` : null,
    structured?.country_code ? `Country: ${structured.country_code}` : null,
    ...financialLines,
    structured?.raw_query ? `Mandate context: ${structured.raw_query}` : null,
    userQuestion ? `User question to address in investment_summary: ${userQuestion}` : null,
  ]
    .filter(Boolean)
    .join("\n");

  return [
    `Build a comprehensive investor dossier for "${company.name}" (official website: ${company.domain}).`,
    "Conduct fresh, broad web research for THIS company only. Do not limit yourself to sources already indexed.",
    "Search across: official website and team/about pages, Crunchbase, PitchBook, Dealroom, LinkedIn company page, press releases, TechCrunch/VentureBeat, SEC/regulatory filings if public, trade press, and news from the last 18 months.",
    "CRITICAL: Research ONLY the entity that owns this exact domain. Do not confuse with similarly named companies elsewhere.",
    structured?.country_code
      ? `HQ must be in ${(structured.geography ?? []).join(", ") || structured.country_code}. If HQ is elsewhere, set domain_verified false.`
      : null,
    company.investment_summary
      ? `Prior brief (may be incomplete — verify and expand): ${company.investment_summary}`
      : null,
    priorUrls.length
      ? `Already seen sources (find additional URLs beyond these): ${priorUrls.slice(0, 10).join(", ")}`
      : null,
    `Existing profile snapshot (use as hints, not limits): ${JSON.stringify(buildProfileSnapshot(company))}`,
    "Return a JSON object with all standard enrichment fields plus:",
    "- leadership (string array of key executives with titles)",
    "- ownership_signals (string — VC/PE backing, bootstrapped, public, subsidiary, etc.)",
    "- recent_rounds (string array — round, amount, date, lead investors)",
    "- competitive_positioning (1-2 sentences on market position and differentiation)",
    "- contact_email, contact_phone (official company contact or null)",
    "- investment_summary (2-4 sentence thesis with cited sources, amounts, and dates)",
    "- sources (URL array — minimum 5 distinct URLs when available; include new sources beyond any listed above)",
    "Standard enrichment fields: entity_type, domain_verified, funding_stage, total_raised_usd, last_funding_date, annual_revenue_usd, annual_ebitda_usd, employees_count, founded_date, geography, investors, sector_tags.",
    "If the domain does not match the company, set domain_verified false and entity_type accordingly.",
    "Output JSON only — no markdown.",
    mandate ? `\nMandate context:\n${mandate}` : "",
  ]
    .filter(Boolean)
    .join("\n");
}

function buildEnrichmentPrompt(company, structured, { userQuestion = null, deepDive = false } = {}) {
  const financialLines = buildFinancialMandateLines(structured);
  const mandate = [
    structured?.sector_tags?.length ? `Sectors: ${structured.sector_tags.join(", ")}` : null,
    structured?.geography?.length ? `Geography: ${structured.geography.join(", ")}` : null,
    structured?.country_code ? `Country: ${structured.country_code}` : null,
    ...financialLines,
    hasFinancialMandate(structured)
      ? "PE mandate: report accurate revenue/EBITDA even if outside band — do not invent in-band numbers."
      : null,
    structured?.raw_query ? `User query: ${structured.raw_query}` : null,
    userQuestion ? `Answer this specific question in investment_summary: ${userQuestion}` : null,
  ]
    .filter(Boolean)
    .join("\n");

  return [
    `Research the company "${company.name}" (website: ${company.domain}) for PE/VC deal sourcing.`,
    "Search news, Crunchbase, press releases, LinkedIn company pages, and official filings.",
    "CRITICAL: Research ONLY the entity that owns this exact domain. Do not confuse with similarly named companies in other countries.",
    structured.country_code
      ? `HQ must be in ${(structured.geography ?? []).join(", ") || structured.country_code}. If HQ is elsewhere, set domain_verified false.`
      : null,
    "Return a JSON object with:",
    "- entity_type (operating_startup|growth_company|incumbent|association|directory|government|conference|unknown)",
    "- domain_verified (boolean — true if ${company.domain} is this company's official site)",
    "- funding_stage (pre-seed|seed|series_a|series_b|series_c_plus|unknown)",
    "- total_raised_usd (number USD total raised, or null)",
    "- last_funding_date (YYYY-MM-DD or null)",
    "- annual_revenue_usd, annual_ebitda_usd (numbers or null)",
    "- employees_count (integer or null)",
    "- founded_date (YYYY-MM-DD — use Jan 1 if only year known)",
    "- geography (HQ city/region/country)",
    "- investors (string array), sector_tags (string array)",
    "- contact_email (official company email from website or public sources, or null)",
    "- contact_phone (official company phone from website or public sources, or null)",
    "- investment_summary (1-2 sentences citing specific sources with amounts/dates)",
    "- sources (string array of URLs used — minimum 2 if available)",
    "If the company is a century-old incumbent, trade association, or the domain does not match the company, set entity_type accordingly and domain_verified false.",
    "Output JSON only — no markdown.",
    mandate ? `\nMandate context:\n${mandate}` : "",
  ]
    .filter(Boolean)
    .join("\n");
}

function formatGeography(value) {
  if (value == null || value === "") return null;
  if (typeof value === "string") return value.trim();
  if (typeof value === "object" && !Array.isArray(value)) {
    const parts = [value.city, value.region, value.state, value.country]
      .filter(Boolean)
      .map(String);
    if (parts.length > 0) return parts.join(", ");
  }
  return String(value).trim();
}

/**
 * Strip enrichment fields that contradict mandate geography or domain identity.
 */
export function sanitizeEnrichmentAgainstMandate(enrichment, company, structured = {}) {
  if (!enrichment) return enrichment;
  const sanitized = { ...enrichment };
  const countryCode = structured.country_code?.toUpperCase();
  const geo = formatGeography(enrichment.geography) ?? company.geography ?? "";

  if (countryCode) {
    const inferred = inferCountryCodeFromGeoString(geo);
    if (inferred && inferred !== countryCode) {
      sanitized.domain_verified = false;
      sanitized.entity_type = "unknown";
      sanitized.total_raised = null;
      sanitized.last_funding_date = null;
      sanitized.funding_stage = "unknown";
      sanitized.investment_summary = null;
    }
  }

  sanitized.geography = formatGeography(sanitized.geography);

  const mandateStages = structured.funding_stage ?? [];
  if (mandateStages.length > 0 && sanitized.funding_stage) {
    const enrichedStage = normalizeStage(sanitized.funding_stage);
    if (enrichedStage && !mandateAllowsFundingStage(mandateStages, enrichedStage)) {
      sanitized.funding_stage = company.funding_stage ?? "unknown";
    }
  }

  return sanitized;
}

function normalizeEntityType(value) {
  const raw = String(value ?? "unknown").toLowerCase().trim();
  return VALID_ENTITY_TYPES.has(raw) ? raw : "unknown";
}

function toEnrichmentRecord(raw) {
  return {
    entity_type: normalizeEntityType(raw.entity_type),
    domain_verified: raw.domain_verified === true,
    funding_stage: normalizeStage(raw.funding_stage),
    total_raised: parseUsd(raw.total_raised_usd ?? raw.total_raised),
    last_funding_date: parseDate(raw.last_funding_date),
    annual_revenue_usd: parseUsd(raw.annual_revenue_usd),
    annual_ebitda_usd: parseUsd(raw.annual_ebitda_usd),
    employees_count: parseIntField(raw.employees_count),
    founded_date: parseDate(raw.founded_date),
    geography: formatGeography(raw.geography),
    investors: Array.isArray(raw.investors)
      ? raw.investors.map(String).filter(Boolean)
      : [],
    sector_tags: Array.isArray(raw.sector_tags)
      ? raw.sector_tags.map(String).filter(Boolean)
      : [],
    investment_summary: raw.investment_summary
      ? String(raw.investment_summary).trim()
      : null,
    contact_email: raw.contact_email ? String(raw.contact_email).trim() : null,
    contact_phone: raw.contact_phone ? String(raw.contact_phone).trim() : null,
    enrichment_sources: Array.isArray(raw.sources)
      ? raw.sources.map(String).filter(Boolean)
      : [],
    source: OPENAI_WEB_ENRICH_SOURCE,
  };
}

function toDeepDiveRecord(raw) {
  const base = toEnrichmentRecord(raw);
  return {
    ...base,
    leadership: Array.isArray(raw.leadership)
      ? raw.leadership.map(String).filter(Boolean)
      : [],
    ownership_signals: raw.ownership_signals
      ? String(raw.ownership_signals).trim()
      : null,
    recent_rounds: Array.isArray(raw.recent_rounds)
      ? raw.recent_rounds.map(String).filter(Boolean)
      : [],
    competitive_positioning: raw.competitive_positioning
      ? String(raw.competitive_positioning).trim()
      : null,
  };
}

/**
 * Skip enrichment when cache row is fresh and has investment signals.
 */
export function needsEnrichment(company) {
  if (!company) return false;
  const hasSummary = Boolean(company.investment_summary);
  const entityOk =
    company.entity_type &&
    company.entity_type !== "unknown" &&
    !["incumbent", "association", "directory", "government"].includes(company.entity_type);
  const domainOk = company.domain_verified !== false;
  const hasTotalRaised = company.total_raised != null;
  const hasInvestors = (company.investors?.length ?? 0) > 0;
  const fundingGap = company.last_funding_date != null && !hasTotalRaised;
  const investorGap = !hasInvestors && company.funding_stage && company.funding_stage !== "unknown";
  const hasCoreFinancials =
    hasTotalRaised || company.annual_revenue_usd != null || company.annual_ebitda_usd != null;
  const hasContact =
    company.contact_email != null || company.contact_phone != null;

  if (fundingGap || investorGap) return true;
  if (!hasSummary || !entityOk || !domainOk) return true;
  if (!hasCoreFinancials) return true;
  if (!hasContact) return true;
  return false;
}

/**
 * Merge enrichment record into a company object (in-place safe copy).
 */
export function mergeEnrichmentIntoCompany(company, enrichment) {
  if (!enrichment) return company;

  const merged = { ...company };
  const fields = [
    "funding_stage",
    "total_raised",
    "last_funding_date",
    "annual_revenue_usd",
    "annual_ebitda_usd",
    "employees_count",
    "founded_date",
    "geography",
    "contact_email",
    "contact_phone",
  ];

  for (const field of fields) {
    if (enrichment[field] != null && enrichment[field] !== "") {
      if (field === "funding_stage") {
        const stage = normalizeStage(enrichment[field]);
        // Don't let enrichment "unknown" clobber a known discovery-time stage.
        if (stage && stage !== "unknown") {
          merged.funding_stage = stage;
        } else if (
          stage === "unknown" &&
          (!merged.funding_stage || merged.funding_stage === "unknown")
        ) {
          merged.funding_stage = "unknown";
        }
      } else if (field === "geography") {
        const geo = String(enrichment[field]).trim();
        if (geo && !/^unknown$/i.test(geo)) {
          merged[field] = enrichment[field];
        }
      } else {
        merged[field] = enrichment[field];
      }
    }
  }

  if (enrichment.investors?.length) {
    merged.investors = [
      ...new Set(
        [...(merged.investors ?? []), ...enrichment.investors]
          .map(String)
          .map((s) => s.trim())
          .filter(Boolean)
      ),
    ];
  }
  if (enrichment.sector_tags?.length) {
    merged.sector_tags = [
      ...new Set([...(merged.sector_tags ?? []), ...enrichment.sector_tags]),
    ];
  }

  const summary = enrichment.investment_summary;
  merged.investment_summary =
    summary != null && String(summary).trim() !== ""
      ? summary
      : merged.investment_summary ?? null;
  if (enrichment.contact_email) merged.contact_email = enrichment.contact_email;
  if (enrichment.contact_phone) merged.contact_phone = enrichment.contact_phone;
  merged.enrichment_sources = enrichment.enrichment_sources ?? merged.enrichment_sources ?? [];
  const enrichType = enrichment.entity_type
    ? String(enrichment.entity_type).trim().toLowerCase()
    : null;
  if (enrichType && enrichType !== "unknown") {
    merged.entity_type = enrichType;
  } else if (!merged.entity_type) {
    merged.entity_type = enrichType ?? "unknown";
  }  const discoveryVerified =
    merged.domain_verified === true ||
    merged.confidence_scores?.discovery_domain_match > 0;
  if (discoveryVerified || enrichment.domain_verified === true) {
    merged.domain_verified = true;
  } else if (enrichment.domain_verified === false) {
    merged.domain_verified = false;
  }

  merged.sources_found = [
    ...new Set([...(merged.sources_found ?? []), OPENAI_WEB_ENRICH_SOURCE]),
  ];

  merged.confidence_scores = {
    ...(merged.confidence_scores ?? {}),
    openai_web_enrich: enrichment.enrichment_sources?.length >= 2 ? 0.85 : 0.7,
  };

  return merged;
}

/**
 * Merge deep-dive enrichment (standard fields + dossier extras) into a company.
 */
export function mergeDeepDiveIntoCompany(company, enrichment) {
  const merged = mergeEnrichmentIntoCompany(company, enrichment);
  if (!enrichment) return merged;

  if (enrichment.leadership?.length) {
    merged.leadership = enrichment.leadership;
  }
  if (enrichment.ownership_signals) {
    merged.ownership_signals = enrichment.ownership_signals;
  }
  if (enrichment.recent_rounds?.length) {
    merged.recent_rounds = enrichment.recent_rounds;
  }
  if (enrichment.competitive_positioning) {
    merged.competitive_positioning = enrichment.competitive_positioning;
  }

  // If Stage is still unknown but recent rounds name a series, sync the card.
  if (!merged.funding_stage || merged.funding_stage === "unknown") {
    const fromEnrich = normalizeStage(enrichment.funding_stage);
    const inferred =
      (fromEnrich && fromEnrich !== "unknown" ? fromEnrich : null) ??
      inferStageFromRecentRounds(merged.recent_rounds);
    if (inferred && inferred !== "unknown") {
      merged.funding_stage = inferred;
    }
  }

  return merged;
}

/**
 * One gpt-5-search-api call for investment details on a single company.
 */
export async function enrichCompanyViaOpenAI(
  company,
  structured,
  {
    onProgress = null,
    userQuestion = null,
    force = false,
    promptBuilder = null,
    deepDive = false,
  } = {}
) {
  const model = getHeavySearchModel();
  const start = Date.now();
  onProgress?.({
    step: deepDive
      ? `Indexing ${company.name} across sources…`
      : `Researching ${company.name}…`,
    detail: company.domain,
    at: Date.now(),
  });

  try {
    const openai = getClient();
    const prompt = promptBuilder
      ? promptBuilder(company, structured, { userQuestion })
      : deepDive
        ? buildDeepDiveResearchPrompt(company, structured, { userQuestion })
        : buildEnrichmentPrompt(company, structured, { userQuestion });
    const response = await openai.chat.completions.create({
      model,
      messages: [
        {
          role: "system",
          content: deepDive
            ? "You are a PE deal-sourcing analyst building a full investor dossier. Search broadly across news, databases, filings, and the official website. Return strict JSON only."
            : "You are a PE deal-sourcing analyst. Search the web for verified investment and company data. Return strict JSON only.",
        },
        { role: "user", content: prompt },
      ],
      web_search_options: {},
    });

    const content = response.choices?.[0]?.message?.content ?? "";
    const { parsed } = parseLlmJson(content);
    const enrichment = deepDive ? toDeepDiveRecord(parsed) : toEnrichmentRecord(parsed);
    const latencyMs = Date.now() - start;

    logger.externalCall({
      source: "openai",
      query: `enrich:${company.domain}`,
      status: 200,
      latencyMs,
      success: true,
    });

    return { success: true, enrichment, latencyMs, model };
  } catch (error) {
    const latencyMs = Date.now() - start;
    logger.externalCall({
      source: "openai",
      query: `enrich:${company.domain}`,
      status: error.status ?? 500,
      latencyMs,
      success: false,
      error,
    });
    onProgress?.({
      step: `Could not research ${company.name}`,
      detail: "using available profile",
      at: Date.now(),
    });
    return { success: false, enrichment: null, latencyMs, error: error.message };
  }
}

async function runPool(items, concurrency, worker) {
  const results = new Array(items.length);
  let index = 0;

  async function runNext() {
    while (index < items.length) {
      const i = index++;
      results[i] = await worker(items[i], i);
    }
  }

  const runners = Array.from({ length: Math.min(concurrency, items.length) }, () => runNext());
  await Promise.all(runners);
  return results;
}

/**
 * Enrich multiple companies in parallel (capped concurrency).
 */
export async function enrichCompaniesBatch(
  companies,
  structured,
  { concurrency = DEFAULT_CONCURRENCY, onProgress = null, skipIfFresh = true } = {}
) {
  const toEnrich = skipIfFresh
    ? companies.filter((c) => needsEnrichment(c))
    : [...companies];

  if (toEnrich.length === 0) {
    return {
      companies,
      enrichedCount: 0,
      skippedCount: companies.length,
      latencyMs: 0,
      enrichCalls: 0,
    };
  }

  onProgress?.({
    step: "Building company profiles…",
    detail: `${toEnrich.length} companies`,
    at: Date.now(),
  });

  const start = Date.now();
  const enrichByDomain = new Map();

  await runPool(toEnrich, concurrency, async (company) => {
    const result = await enrichCompanyViaOpenAI(company, structured, { onProgress });
    if (result.success && result.enrichment) {
      const sanitized = sanitizeEnrichmentAgainstMandate(result.enrichment, company, structured);
      enrichByDomain.set(company.domain, sanitized);
    }
  });

  const merged = companies.map((company) => {
    const enrichment = enrichByDomain.get(company.domain);
    return enrichment ? mergeEnrichmentIntoCompany(company, enrichment) : company;
  });

  return {
    companies: merged,
    enrichedCount: enrichByDomain.size,
    skippedCount: companies.length - toEnrich.length,
    latencyMs: Date.now() - start,
    enrichCalls: toEnrich.length,
  };
}
