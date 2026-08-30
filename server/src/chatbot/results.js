/**
 * Discovery result assembly — optional PE fit scores when financial mandate set.
 */
import { nameSimilarity, FUZZY_NAME_THRESHOLD } from "../normalize/entity-resolution.js";
import { buildFinancialFitSummary } from "../heavy_agent/pe-mandate.js";

export const NO_RESULTS_MESSAGE =
  "No companies matched your query. Try broadening sector tags, geography, or funding stage filters, or removing employee count constraints.";

export const VAGUE_MANDATE_MESSAGE =
  "Your screening criteria need more detail for useful sourcing. Include at least two of: sector (e.g. B2B SaaS, Fintech), geography (e.g. Germany, US), and size (revenue band, EBITDA, employee count, or funding stage). Example: \"B2B software in Germany, $15M–$40M revenue and 50–200 employees.\"";

export const COMPANY_LOOKUP_NO_RESULTS_MESSAGE =
  "Could not find that company in our database or public sources. Try checking the spelling, or search by sector and stage instead.";

export const NO_MORE_COMPANIES_MESSAGE =
  "No more companies found matching your screening criteria. Try broadening sector tags, geography, or funding stage filters.";

const SOURCE_LABELS = {
  openai_web_search: "OpenAI web search",
  openai_web_enrich: "OpenAI enrichment",
  crunchbase: "Crunchbase",
  linkedin: "LinkedIn",
  github: "GitHub",
  startup_india: "Startup India",
};

function formatStageList(stages) {
  return stages.map((s) => s.replace(/_/g, " ")).join(", ");
}

function describeQueryConstraints(structured) {
  const parts = [];
  if ((structured.funding_stage ?? []).length > 0) {
    parts.push(formatStageList(structured.funding_stage));
  }
  if ((structured.sector_tags ?? []).length > 0) {
    parts.push(structured.sector_tags.join(", "));
  }
  if ((structured.geography ?? []).length > 0) {
    parts.push(`in ${structured.geography.join(", ")}`);
  }
  if (structured.employees_min != null || structured.employees_max != null) {
    parts.push("with employee count constraints");
  }
  if (structured.revenue_min != null || structured.revenue_max != null) {
    parts.push("with revenue criteria");
  }
  return parts.length ? parts.join(" ") : structured.raw_query ?? "your criteria";
}

/**
 * Build a query-specific zero-results message from actual per-source counts.
 */
export function buildNoResultsMessage({
  structured,
  heavyOutcomes = [],
  normalizeSummary = {},
}) {
  const criteria = describeQueryConstraints(structured);
  const sourceParts = [];

  for (const outcome of heavyOutcomes) {
    const label = SOURCE_LABELS[outcome.source] ?? outcome.source;
    const count = outcome.results?.length ?? 0;
    if (outcome.method === "skipped_non_india") continue;
    sourceParts.push(`${label} (${count})`);
  }

  const searched =
    sourceParts.length > 0 ? sourceParts.join(", ") : "no external sources";

  const rawCount = normalizeSummary.rawRecordCount ?? 0;
  const persisted = normalizeSummary.companyCount ?? 0;
  const skipped = normalizeSummary.skippedCount ?? 0;

  const failedOutcomes = heavyOutcomes.filter(
    (outcome) => !outcome.success || outcome.method === "error"
  );

  let detail = "";
  if (failedOutcomes.length > 0 && rawCount === 0) {
    const errorText = failedOutcomes.map((o) => o.error).find(Boolean);
    detail = errorText
      ? ` — search failed (${String(errorText).slice(0, 80)})`
      : " — search failed";
  } else if (rawCount > 0 && persisted === 0) {
    detail = ` — ${rawCount} raw result(s) found but ${skipped} lacked resolvable domains`;
  } else if (rawCount === 0) {
    detail = " — 0 results with resolvable domains";
  }

  const geo = (structured.geography ?? []).join(", ");
  const geoSuffix = geo ? ` for ${geo}` : "";

  return `No companies found matching ${criteria}. Searched ${searched}${detail}${geoSuffix}.`;
}

/**
 * Assemble discovery results in discovery order (no composite scoring).
 */
export function buildDiscoveryResults(
  companies,
  {
    structured,
    noResultsContext = null,
    droppedGeo = 0,
    otherCompanies = [],
    rankMetaByDomain = null,
  } = {}
) {
  const results = companies.map((company, i) => {
    const rankRow = rankMetaByDomain?.get(company.domain);
    const fitSummary = structured
      ? buildFinancialFitSummary(structured, company)
      : null;
    return {
      rank: i + 1,
      company,
      investment_summary: company.investment_summary ?? null,
      enrichment_sources: company.enrichment_sources ?? [],
      pe_fit_score: rankRow?.composite_score ?? null,
      revenue_ebitda_fit: rankRow?.dimension_scores?.revenue_ebitda_fit ?? null,
      fit_summary: fitSummary?.label ?? null,
      fit_status: fitSummary?.status ?? null,
    };
  });

  const other_results = otherCompanies.map((entry, i) => {
    const company = entry?.company ?? entry;
    const gateReason = entry?.gateReason ?? entry?.gate_reason ?? null;
    const gateReasons = entry?.gateReasons ?? entry?.gate_reasons ?? [];
    return {
      rank: results.length + i + 1,
      company,
      investment_summary: company.investment_summary ?? null,
      enrichment_sources: company.enrichment_sources ?? [],
      gate_reason: gateReason,
      gate_reasons: gateReasons,
    };
  });

  const message =
    results.length === 0
      ? noResultsContext
        ? buildNoResultsMessage({
            structured: structured ?? {},
            heavyOutcomes: noResultsContext.heavyOutcomes ?? [],
            normalizeSummary: noResultsContext.normalizeSummary ?? {},
          })
        : NO_RESULTS_MESSAGE
      : null;

  return {
    results,
    other_results,
    message,
    summary: {
      count: results.length,
      dropped_geo: droppedGeo,
      gated_other: other_results.length,
    },
  };
}

function matchesCompanyName(companyNames, company) {
  return companyNames.some((name) => {
    const sim = nameSimilarity(name, company.name);
    const needle = String(name).toLowerCase();
    const haystack = String(company.name).toLowerCase();
    return sim >= FUZZY_NAME_THRESHOLD || haystack.includes(needle);
  });
}

/**
 * Company lookup: order by name similarity, no composite score.
 */
export function buildCompanyLookupResults(companyNames, companies) {
  const matched = companies
    .filter((company) => matchesCompanyName(companyNames, company))
    .map((company) => {
      const bestSim = Math.max(
        ...companyNames.map((name) => nameSimilarity(name, company.name))
      );
      return { company, nameMatch: bestSim };
    })
    .sort((a, b) => {
      if (b.nameMatch !== a.nameMatch) return b.nameMatch - a.nameMatch;
      return String(a.company.name).localeCompare(String(b.company.name));
    });

  const results = matched.map((row, i) => ({
    rank: i + 1,
    company: row.company,
    investment_summary: row.company.investment_summary ?? null,
    enrichment_sources: row.company.enrichment_sources ?? [],
  }));

  return {
    results,
    other_results: [],
    message: results.length === 0 ? COMPANY_LOOKUP_NO_RESULTS_MESSAGE : null,
    summary: { count: results.length, intent: "company_lookup" },
  };
}
