/** Funding-stage tokens — used for ranking only, never as raw search keywords. */
export const FUNDING_STAGE_TERMS = new Set([
  "seed",
  "pre-seed",
  "pre_seed",
  "preseed",
  "series_a",
  "series_b",
  "series_c",
  "series_c_plus",
  "series c",
  "series a",
  "series b",
  "angel",
  "growth",
  "late_stage",
  "late stage",
]);

function isFundingStageTerm(value) {
  const normalized = String(value ?? "")
    .toLowerCase()
    .trim()
    .replace(/\s+/g, "_");
  if (FUNDING_STAGE_TERMS.has(normalized)) return true;
  return FUNDING_STAGE_TERMS.has(normalized.replace(/_/g, " "));
}

export function stripFundingStageTerms(values) {
  return (values ?? []).filter((v) => !isFundingStageTerm(v));
}

/**
 * Build a search string from Light Agent structured query output.
 * Sector synonyms belong in Light Agent keywords — not a heavy-agent map.
 */
export function buildSearchQuery(structured) {
  if (structured.intent === "company_lookup" && structured.company_names?.length) {
    return structured.company_names.join(" ").trim();
  }

  const parts = [
    ...(structured.sector_tags ?? []),
    ...stripFundingStageTerms(structured.keywords ?? []),
    ...(structured.geography ?? []),
    ...(structured.funding_stage ?? []),
  ].filter(Boolean);

  const unique = [...new Set(parts.map((p) => String(p).trim()).filter(Boolean))];
  return unique.join(" ").trim() || structured.raw_query || "startup";
}

/** Platform Serper site: queries — no funding_stage terms. */
export function buildPlatformSearchQuery(structured) {
  if (structured.intent === "company_lookup" && structured.company_names?.length) {
    return structured.company_names.join(" ").trim();
  }

  const parts = [
    ...(structured.sector_tags ?? []),
    ...stripFundingStageTerms(structured.keywords ?? []),
    ...(structured.geography ?? []),
  ].filter(Boolean);

  const unique = [...new Set(parts.map((p) => String(p).trim()).filter(Boolean))];
  return unique.join(" ").trim() || structured.raw_query || "startup";
}

/** GitHub org search — geography omitted from query string (filtered post-fetch). */
export function buildGitHubSearchQuery(structured) {
  if (structured.intent === "company_lookup" && structured.company_names?.length) {
    return structured.company_names.join(" ").trim();
  }

  const parts = [
    ...(structured.sector_tags ?? []),
    ...stripFundingStageTerms(structured.keywords ?? []),
  ].filter(Boolean);

  const unique = [...new Set(parts.map((p) => String(p).trim()).filter(Boolean))];
  return unique.join(" ").trim() || structured.raw_query || "startup";
}

/** Search terms to try on Wikidata (most specific first). */
export function buildWikidataSearchTerms(structured) {
  if (structured.intent === "company_lookup" && structured.company_names?.length) {
    return [...new Set(structured.company_names.map((n) => n.trim()).filter(Boolean))];
  }

  const terms = [];
  const keywords = [...stripFundingStageTerms(structured.keywords ?? [])].sort((a, b) => {
    const aTrim = String(a).trim();
    const bTrim = String(b).trim();
    const aProper = /^[A-Z]/.test(aTrim);
    const bProper = /^[A-Z]/.test(bTrim);
    if (aProper !== bProper) return aProper ? -1 : 1;
    return bTrim.length - aTrim.length;
  });
  for (const keyword of keywords) {
    if (keyword?.trim()) terms.push(keyword.trim());
  }
  for (const tag of structured.sector_tags ?? []) {
    if (tag?.trim()) terms.push(tag.trim());
  }
  const combined = buildPlatformSearchQuery(structured);
  if (combined) terms.push(combined);
  return [...new Set(terms)];
}
