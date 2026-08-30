import { FUNDING_STAGES } from "./schema.js";

/** Ordered stages excluding `unknown`. */
export const FUNDING_STAGE_ORDER = FUNDING_STAGES.filter((s) => s !== "unknown");

export function fundingStagesAtOrAbove(minStage) {
  const idx = FUNDING_STAGE_ORDER.indexOf(minStage);
  if (idx === -1) return [minStage];
  return FUNDING_STAGE_ORDER.slice(idx);
}

/** True when mandate has no stage filter, stage unknown, or stage is in allowed list. */
export function mandateAllowsFundingStage(allowedStages, companyStage) {
  if (!allowedStages?.length) return true;
  if (!companyStage || companyStage === "unknown") return true;
  return allowedStages.includes(companyStage);
}
