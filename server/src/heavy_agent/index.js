import { logger } from "../lib/logger.js";
import { searchViaOpenAI, OPENAI_WEB_SEARCH_SOURCE } from "./openai-search.js";
import { applyPlausibilityToOutcomes } from "./entity-plausibility.js";
import { normalizeCompanyDomain } from "./domain-blocklist.js";
import { verifyOpenAIDiscoveryResults } from "./openai-domain-verify.js";
import { getPeDiscoveryLimit, getSearchFetchLimit } from "./pe-mandate.js";

function getOpenAILimit(structured) {
  return getSearchFetchLimit(getPeDiscoveryLimit(structured));
}

/**
 * Run heavy search: OpenAI web search only.
 */
export async function runHeavySearch(
  structured,
  {
    skipOpenAISearch = false,
    onProgress = null,
    openAILimit = getOpenAILimit(structured),
    excludeDomains = [],
    broader = false,
    fillPass = false,
    constraintMode = "heavy",
  } = {}
) {
  const start = Date.now();
  const outcomes = [];
  let openaiOutcome = null;

  if (!skipOpenAISearch && process.env.OPENAI_API_KEY) {
    openaiOutcome = await searchViaOpenAI(structured, {
      limit: openAILimit,
      onProgress,
      excludeDomains,
      broader,
      fillPass,
      constraintMode,
    });
    if (openaiOutcome.success && openaiOutcome.results?.length) {
      openaiOutcome = {
        ...openaiOutcome,
        results: verifyOpenAIDiscoveryResults(openaiOutcome.results),
      };
    }
    outcomes.push(openaiOutcome);
  } else {
    openaiOutcome = {
      source: OPENAI_WEB_SEARCH_SOURCE,
      success: false,
      status: 0,
      query: structured.raw_query ?? "",
      results: [],
      method: skipOpenAISearch ? "skipped" : "skipped_no_api_key",
      latencyMs: 0,
      error: skipOpenAISearch ? null : "OPENAI_API_KEY not set",
      perSourceDistinctCount: 0,
      resultsRawCount: 0,
    };
    outcomes.push(openaiOutcome);
  }

  const plausibilitySummary = applyPlausibilityToOutcomes(outcomes);
  const openaiCount = openaiOutcome?.results?.length ?? 0;
  const totalLatencyMs = Date.now() - start;

  const perSourceLatencyMs = Object.fromEntries(
    outcomes.map((o) => [o.source, o.latencyMs])
  );
  const perSourceResultCounts = Object.fromEntries(
    outcomes.map((o) => [o.source, o.perSourceDistinctCount ?? 0])
  );
  const perSourceRawCounts = Object.fromEntries(
    outcomes.map((o) => [o.source, o.resultsRawCount ?? o.results?.length ?? 0])
  );
  const perSourceDistinctCounts = Object.fromEntries(
    outcomes.map((o) => [o.source, o.perSourceDistinctCount ?? o.results?.length ?? 0])
  );

  const successCount = outcomes.filter((o) => o.success).length;
  const totalResults = outcomes.reduce((sum, o) => sum + o.results.length, 0);
  const resolvedDomains = (openaiOutcome?.results ?? [])
    .filter((r) => normalizeCompanyDomain(r.domain))
    .map((r) => ({
      name: r.name,
      domain: normalizeCompanyDomain(r.domain),
      tier: "openai_search",
      source: OPENAI_WEB_SEARCH_SOURCE,
    }));

  logger.info("heavy_search_complete", {
    rawQuery: structured.raw_query?.slice(0, 120),
    sourceCount: outcomes.length,
    openaiCount,
    successCount,
    totalResults,
    totalLatencyMs,
    perSourceLatencyMs,
    perSourceResultCounts,
    perSourceRawCounts,
    perSourceDistinctCounts,
    plausibilitySummary,
  });

  return {
    outcomes,
    totalLatencyMs,
    prefetchLatencyMs: 0,
    parallelLatencyMs: totalLatencyMs,
    maxSourceLatencyMs: Math.max(...outcomes.map((o) => o.latencyMs), 0),
    sumSourceLatencyMs: outcomes.reduce((sum, o) => sum + o.latencyMs, 0),
    perSourceLatencyMs,
    perSourceResultCounts,
    perSourceRawCounts,
    perSourceDistinctCounts,
    plausibilitySummary,
    openaiSearchUsed: Boolean(openaiOutcome),
    openaiResultCount: openaiCount,
    resolvedDomains,
    successCount,
    totalResults,
  };
}

export { searchViaOpenAI, OPENAI_WEB_SEARCH_SOURCE } from "./openai-search.js";
export {
  enrichCompanyViaOpenAI,
  enrichCompaniesBatch,
  mergeEnrichmentIntoCompany,
  needsEnrichment,
  OPENAI_WEB_ENRICH_SOURCE,
} from "./openai-enrich.js";
export { buildSearchQuery, buildPlatformSearchQuery, buildGitHubSearchQuery } from "./query.js";
