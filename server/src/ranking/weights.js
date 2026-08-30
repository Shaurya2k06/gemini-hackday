/**
 * Default ranking weights per docs/context.md Section 10.
 * If changed, update Section 10 with date and reason.
 *
 * Updated 2026-07-08: added revenue_ebitda_fit (15%) for PE-mandate thresholds.
 */
export const RANKING_WEIGHTS = {
  sector_alignment: 0.34,
  funding_stage_match: 0.21,
  geography_match: 0.13,
  founded_recency: 0.09,
  employee_count_fit: 0.04,
  signal_recency: 0.04,
  revenue_ebitda_fit: 0.15,
};

export const RANKING_DIMENSIONS = Object.keys(RANKING_WEIGHTS);

export function assertWeightsSumToOne(weights = RANKING_WEIGHTS) {
  const sum = Object.values(weights).reduce((a, b) => a + b, 0);
  if (Math.abs(sum - 1) > 0.001) {
    throw new Error(`Ranking weights must sum to 1, got ${sum}`);
  }
}

assertWeightsSumToOne();
