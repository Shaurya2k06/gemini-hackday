/**
 * Funding-stage mandate helpers for discovery prompt branching.
 */

const STAGE_LABELS = {
  "pre-seed": "Pre-seed",
  seed: "Seed",
  series_a: "Series A",
  series_b: "Series B",
  series_c_plus: "Series C+",
};

export function hasFundingStageMandate(structured = {}) {
  return (structured.funding_stage ?? []).filter((s) => s && s !== "unknown").length > 0;
}

export function isStrictSingleStageMandate(structured = {}) {
  const stages = (structured.funding_stage ?? []).filter((s) => s && s !== "unknown");
  return stages.length === 1;
}

export function formatStageMandateLabel(stages) {
  const list = (stages ?? []).filter((s) => s && s !== "unknown");
  if (list.length === 0) return null;
  return list.map((s) => STAGE_LABELS[s] ?? s).join(" / ");
}

/**
 * Source hints for stage-filtered discovery by mandate region/country.
 */
export function buildStageSourceHint(structured = {}) {
  const code = String(structured.country_code ?? "").toUpperCase();
  const region = structured.region ?? null;

  if (code === "CO" || region === "latam") {
    return (
      "Search Dealroom Colombia startup profiles, Bloomberg Línea Colombian startup funding roundups, " +
      "Colombia Tech Report, and local press (e.g. Cinco Días) for companies whose latest disclosed institutional round matches the mandate stage."
    );
  }

  if (region === "latam") {
    return (
      "Search regional startup funding databases, LatAm tech ecosystem reports, and local press for companies whose latest disclosed round matches the mandate stage."
    );
  }

  return (
    "Search startup funding databases, ecosystem reports, and press for companies whose latest disclosed institutional round matches the mandate stage."
  );
}
