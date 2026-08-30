import { RANKING_WEIGHTS } from "./weights.js";
import { scoreAllDimensions } from "./dimensions.js";
import { buildExplanation, NO_RESULTS_MESSAGE, buildNoResultsMessage } from "./explanation.js";
import {
  getEntityPlausibility,
  applyPlausibilityPenalty,
  PRIMARY_PLAUSIBILITY_THRESHOLD,
} from "./plausibility.js";

function computeCompositeScore(dimensionScores, weights = RANKING_WEIGHTS) {
  let total = 0;
  let activeWeight = 0;

  for (const [dimension, weight] of Object.entries(weights)) {
    const score = dimensionScores[dimension];
    if (score === null || score === undefined) continue;
    total += score * weight;
    activeWeight += weight;
  }

  if (activeWeight === 0) return 0;
  return Math.round((total / activeWeight) * 1000) / 1000;
}

export function scoreCompany(structured, company, options = {}) {
  const dimension_scores = scoreAllDimensions(structured, company, options);
  const baseScore = computeCompositeScore(dimension_scores);
  const plausibility = getEntityPlausibility(company);
  const domainRelevance =
    typeof company?.confidence_scores?.domain_relevance === "number"
      ? company.confidence_scores.domain_relevance
      : 1;
  const composite_score = applyPlausibilityPenalty(baseScore, plausibility);

  return {
    company,
    composite_score,
    base_composite_score: baseScore,
    entity_plausibility: plausibility,
    dimension_scores,
    explanation: buildExplanation(structured, company, dimension_scores, {
      plausibility,
      domainRelevance,
    }),
  };
}

/**
 * Rank companies against a structured Light Agent query.
 */
export function rankCompanies(structured, companies, options = {}) {
  if (!Array.isArray(companies)) {
    throw new Error("rankCompanies expects an array of company records");
  }

  if (companies.length === 0) {
    const message =
      options.noResultsContext != null
        ? buildNoResultsMessage({
            structured,
            heavyOutcomes: options.noResultsContext.heavyOutcomes,
            normalizeSummary: options.noResultsContext.normalizeSummary,
          })
        : NO_RESULTS_MESSAGE;
    return {
      results: [],
      other_results: [],
      gated_count: 0,
      message,
      summary: {
        count: 0,
        weights: RANKING_WEIGHTS,
      },
    };
  }

  const scored = companies.map((company) => scoreCompany(structured, company, options));
  scored.sort((a, b) => {
    if (b.composite_score !== a.composite_score) {
      return b.composite_score - a.composite_score;
    }
    return String(a.company.name).localeCompare(String(b.company.name));
  });

  const primary = scored.filter(
    (row) => getEntityPlausibility(row.company) >= PRIMARY_PLAUSIBILITY_THRESHOLD
  );
  const other = scored.filter(
    (row) => getEntityPlausibility(row.company) < PRIMARY_PLAUSIBILITY_THRESHOLD
  );

  const results = primary.map((row, index) => ({
    ...row,
    rank: index + 1,
  }));

  const other_results = other.map((row, index) => ({
    ...row,
    rank: index + 1,
    gated: true,
  }));

  return {
    results,
    other_results,
    gated_count: other_results.length,
    message: null,
    summary: {
      count: results.length,
      gated_count: other_results.length,
      topScore: results[0]?.composite_score ?? 0,
      weights: RANKING_WEIGHTS,
    },
  };
}

export { RANKING_WEIGHTS, RANKING_DIMENSIONS } from "./weights.js";
export { scoreAllDimensions } from "./dimensions.js";
export { buildExplanation, NO_RESULTS_MESSAGE, buildNoResultsMessage } from "./explanation.js";
export {
  PRIMARY_PLAUSIBILITY_THRESHOLD,
  getEntityPlausibility,
  applyPlausibilityPenalty,
} from "./plausibility.js";
