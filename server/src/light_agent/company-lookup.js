import { runHeavySearch, enrichCompaniesBatch } from "../heavy_agent/index.js";
import { applyCountryHardGate } from "../heavy_agent/geo.js";
import { applyPeQualityGate } from "../heavy_agent/pe-quality-gate.js";
import { normalizeHeavySearchResults } from "../normalize/index.js";
import { buildCompanyLookupResults } from "../chatbot/results.js";

const DATA_SOURCE_LIVE = "LIVE";

export function isCompanyLookupIntent(structured) {
  return (
    structured?.intent === "company_lookup" &&
    Array.isArray(structured.company_names) &&
    structured.company_names.length > 0
  );
}

/**
 * Strip mandate noise so heavy search targets the company name only.
 */
export function buildFocusedLookupStructured(structured) {
  return {
    ...structured,
    sector_tags: [],
    funding_stage: [],
    geography: [],
    country_code: null,
    region: null,
    employees_min: null,
    employees_max: null,
    founded_after: null,
    founded_before: null,
    revenue_min: null,
    revenue_max: null,
    ebitda_min: null,
    ebitda_max: null,
    keywords: [...structured.company_names],
  };
}

export { COMPANY_LOOKUP_NO_RESULTS_MESSAGE } from "../chatbot/results.js";

export function runCompanyLookupFromCompanies(structured, companies) {
  const ranked = buildCompanyLookupResults(structured.company_names, companies);
  return {
    structured,
    ranked,
    dataSource: DATA_SOURCE_LIVE,
    heavySearchRan: false,
  };
}

function emitProgress(onProgress, step, detail = null) {
  if (typeof onProgress !== "function") return;
  try {
    onProgress({ step, detail, at: Date.now() });
  } catch {
    // best-effort
  }
}

export async function runCompanyLookupPipeline(light, options = {}) {
  const {
    skipHeavySearch = false,
    heavySearchRunner = runHeavySearch,
    enrichRunner = enrichCompaniesBatch,
    onNormalized = null,
    onProgress = null,
  } = options;

  const pipelineStart = Date.now();
  const stages = [...(options.priorStages ?? [])];
  const { structured } = light;
  const focused = buildFocusedLookupStructured(structured);
  let companies = [];
  let heavySearchRan = false;

  if (!skipHeavySearch) {
    emitProgress(onProgress, "Researching named companies…");
    const heavyStart = Date.now();
    const heavy = await heavySearchRunner(focused, { onProgress });
    heavySearchRan = true;
    stages.push({
      name: "heavy_search",
      latencyMs: Date.now() - heavyStart,
      openaiResultCount: heavy.openaiResultCount ?? 0,
    });

    let normalized = normalizeHeavySearchResults(heavy);
    if (onNormalized) {
      normalized = onNormalized(normalized) ?? normalized;
    }
    stages.push({
      name: "normalize",
      latencyMs: 0,
      companyCount: normalized.companies.length,
    });

    if (normalized.companies.length > 0) {
      const batch = await enrichRunner(normalized.companies, structured, {
        onProgress,
        skipIfFresh: true,
      });
      companies = batch.companies;
      stages.push({
        name: "enrichment",
        latencyMs: 0,
        enrichedCount: batch.enrichedCount ?? 0,
      });
    }
  } else {
    stages.push({ name: "heavy_search", latencyMs: 0, skipped: true });
  }

  emitProgress(onProgress, "Vetting against your mandate…");
  const geo = applyCountryHardGate(companies, structured);
  let gatedCompanies = geo.kept;
  const quality = applyPeQualityGate(gatedCompanies, structured);
  gatedCompanies = quality.kept;
  stages.push({
    name: "pe_quality_gate",
    latencyMs: 0,
    kept: quality.kept.length,
    dropped: quality.dropped.length,
  });

  emitProgress(onProgress, "Preparing lookup results…");
  const ranked = buildCompanyLookupResults(structured.company_names, gatedCompanies);
  if (quality.dropped.length > 0) {
    ranked.other_results = quality.dropped.map((d, i) => ({
      rank: ranked.results.length + i + 1,
      company: d.company,
      investment_summary: d.company.investment_summary ?? null,
      enrichment_sources: d.company.enrichment_sources ?? [],
      gate_reason: d.reason,
      gate_reasons: d.reason?.split("; ").filter(Boolean) ?? [],
    }));
    ranked.summary = { ...ranked.summary, gated_other: quality.dropped.length };
  }
  stages.push({ name: "results", latencyMs: 0, resultCount: ranked.results.length });

  return {
    structured,
    ranked,
    dataSource: DATA_SOURCE_LIVE,
    stages,
    latencyMs: Date.now() - pipelineStart,
    heavySearchRan,
    costInputs: options.costInputs ?? {},
  };
}
