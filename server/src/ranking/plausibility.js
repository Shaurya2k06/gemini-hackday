/** Primary ranked-list gate — documented in docs/context.md Section 10. */
export const PRIMARY_PLAUSIBILITY_THRESHOLD = 0.3;

export function getEntityPlausibility(company) {
  const score = company?.confidence_scores?.entity_plausibility;
  if (typeof score === "number" && score >= 0 && score <= 1) return score;
  return 1;
}

export function applyPlausibilityPenalty(compositeScore, plausibility) {
  return Math.round(compositeScore * plausibility * 1000) / 1000;
}
