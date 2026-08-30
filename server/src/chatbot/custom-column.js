/**
 * Extract a custom table column via per-company web research.
 */
import OpenAI from "openai";
import { logger } from "../lib/logger.js";
import { parseLlmJson } from "../lib/parse-llm-json.js";
import { getHeavySearchModel } from "../heavy_agent/openai-search.js";

export const MAX_CUSTOM_COLUMN_QUERY_LENGTH = 200;
export const MAX_SUMMARY_CHARS = 500;
const DEFAULT_CONCURRENCY = 4;

let client;

function getClient() {
  if (!client) {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) throw new Error("OPENAI_API_KEY is not set");
    client = new OpenAI({ apiKey });
  }
  return client;
}

function truncate(text, max) {
  const s = String(text ?? "").trim();
  if (!s) return null;
  if (s.length <= max) return s;
  return `${s.slice(0, max)}…`;
}

function normalizeDomain(value) {
  return String(value ?? "")
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .split("/")[0]
    .trim();
}

/**
 * Compact profile JSON for one company card (from formatCompanyCard shape).
 */
export function buildCompanyProfileContext(card) {
  const fields = card?.fields ?? {};
  const domain = normalizeDomain(fields.domain ?? card?.domain);
  if (!domain) return null;

  const summary = truncate(
    card?.investment_summary ?? fields.investment_summary,
    MAX_SUMMARY_CHARS
  );

  return {
    domain,
    name: fields.name ?? null,
    description: truncate(fields.description, 240),
    funding_stage: fields.funding_stage ?? null,
    total_raised: fields.total_raised ?? null,
    last_funding_date: fields.last_funding_date ?? null,
    investors: Array.isArray(fields.investors) ? fields.investors.slice(0, 12) : [],
    employees_count: fields.employees_count ?? null,
    founded_date: fields.founded_date ?? null,
    geography: fields.geography ?? null,
    annual_revenue_usd: fields.annual_revenue_usd ?? null,
    annual_ebitda_usd: fields.annual_ebitda_usd ?? null,
    contact_email: fields.contact_email ?? null,
    contact_phone: fields.contact_phone ?? null,
    sector_tags: Array.isArray(fields.sector_tags) ? fields.sector_tags.slice(0, 8) : [],
    investment_summary: summary,
    enrichment_sources: Array.isArray(card?.enrichment_sources)
      ? card.enrichment_sources.slice(0, 8)
      : [],
    sources: Array.isArray(card?.sources) ? card.sources.slice(0, 8) : [],
    verification_urls: card?.verification_urls ?? {},
  };
}

export function validateCustomColumnQuery(query) {
  const q = String(query ?? "").trim();
  if (!q) {
    return { ok: false, error: "Query is required" };
  }
  if (q.length > MAX_CUSTOM_COLUMN_QUERY_LENGTH) {
    return {
      ok: false,
      error: `Query must be at most ${MAX_CUSTOM_COLUMN_QUERY_LENGTH} characters`,
    };
  }
  return { ok: true, query: q };
}

export function formatCustomColumnLabel(query) {
  const q = String(query ?? "").trim();
  if (q.length <= 40) return q;
  return `${q.slice(0, 40)}…`;
}

function coerceCellValue(value) {
  if (value == null) return null;
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed || /^null$/i.test(trimmed) || trimmed === "—") return null;
    return trimmed;
  }
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  if (typeof value === "boolean") return value ? "true" : "false";
  if (Array.isArray(value)) {
    const joined = value.map(String).filter(Boolean).join(", ").trim();
    return joined || null;
  }
  return null;
}

/**
 * Build empty null map for all domains.
 */
export function emptyResultsMap(domains) {
  const results = {};
  for (const domain of domains) {
    results[domain] = null;
  }
  return results;
}

/**
 * Normalize LLM results map onto known domains.
 */
export function normalizeResultsMap(parsedResults, domains) {
  const out = emptyResultsMap(domains);
  if (!parsedResults || typeof parsedResults !== "object") return out;

  const byNormalized = new Map();
  for (const [key, value] of Object.entries(parsedResults)) {
    const domain = normalizeDomain(key);
    if (domain) byNormalized.set(domain, coerceCellValue(value));
  }

  for (const domain of domains) {
    if (byNormalized.has(domain)) {
      out[domain] = byNormalized.get(domain);
    }
  }
  return out;
}

export function buildCustomColumnSearchPrompt(query, profile) {
  const priorUrls = [
    ...(profile.enrichment_sources ?? []),
    ...Object.values(profile.verification_urls ?? {}).filter(Boolean),
  ];

  return [
    `Research "${profile.name}" (website: ${profile.domain}) to answer: ${query}`,
    "Search the web broadly — official site, Crunchbase, PitchBook, Dealroom, press releases, LinkedIn, filings, and recent news.",
    "Do not limit yourself to the profile below; verify and find fresh sources.",
    "CRITICAL: Answer only for the company that owns this exact domain.",
    profile.investment_summary
      ? `Profile hint (verify via search): ${profile.investment_summary}`
      : null,
    priorUrls.length
      ? `Known URLs (search beyond these if needed): ${priorUrls.slice(0, 6).join(", ")}`
      : null,
    `Profile snapshot: ${JSON.stringify(profile)}`,
    'Return JSON only: {"value":"short answer or null"}',
    "value must be a short phrase, name, number, or date. Use null if not found after searching.",
  ]
    .filter(Boolean)
    .join("\n");
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

async function defaultSearchCaller({ prompt, domain }) {
  const model = getHeavySearchModel();
  const start = Date.now();
  const openai = getClient();
  const response = await openai.chat.completions.create({
    model,
    messages: [
      {
        role: "system",
        content:
          "You are a PE research analyst. Search the web for verified company facts. Return strict JSON only.",
      },
      { role: "user", content: prompt },
    ],
    web_search_options: {},
  });
  const content = response.choices?.[0]?.message?.content ?? "";
  logger.externalCall({
    source: "openai",
    query: `custom_column:${domain}`,
    status: 200,
    latencyMs: Date.now() - start,
    success: true,
  });
  return { content, model };
}

async function extractCustomColumnForCompany(profile, query, { searchCaller }) {
  const prompt = buildCustomColumnSearchPrompt(query, profile);
  const { content } = await searchCaller({ prompt, domain: profile.domain });
  const { parsed } = parseLlmJson(content);
  return coerceCellValue(parsed?.value ?? parsed?.answer);
}

/**
 * Extract custom column values for a list of company cards via web search.
 * @returns {{ query: string, label: string, results: Record<string, string|null> }}
 */
export async function extractCustomColumn(
  cards,
  query,
  { concurrency = DEFAULT_CONCURRENCY, searchCaller = defaultSearchCaller, onProgress = null } = {}
) {
  const validated = validateCustomColumnQuery(query);
  if (!validated.ok) {
    const err = new Error(validated.error);
    err.status = 400;
    throw err;
  }

  if (!Array.isArray(cards) || cards.length === 0) {
    const err = new Error("cards array is required");
    err.status = 400;
    throw err;
  }

  const profiles = cards.map(buildCompanyProfileContext).filter(Boolean);
  const domains = profiles.map((p) => p.domain);

  if (domains.length === 0) {
    const err = new Error("No company domains found in cards");
    err.status = 400;
    throw err;
  }

  onProgress?.({
    step: "Researching custom column…",
    detail: `${profiles.length} companies`,
    at: Date.now(),
  });

  const results = emptyResultsMap(domains);

  await runPool(profiles, concurrency, async (profile) => {
    onProgress?.({
      step: `Searching ${profile.name}…`,
      detail: profile.domain,
      at: Date.now(),
    });
    try {
      const value = await extractCustomColumnForCompany(profile, validated.query, {
        searchCaller,
      });
      results[profile.domain] = value;
    } catch (error) {
      logger.externalCall({
        source: "openai",
        query: `custom_column:${profile.domain}`,
        status: error.status ?? 500,
        latencyMs: 0,
        success: false,
        error,
      });
      results[profile.domain] = null;
    }
  });

  return {
    query: validated.query,
    label: formatCustomColumnLabel(validated.query),
    results,
  };
}
