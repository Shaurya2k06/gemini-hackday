/**
 * Detect investor/accelerator thesis mandates (YC, Techstars, etc.).
 */

function normalizeThesisText(structured) {
  const parts = [...(structured?.keywords ?? [])];
  if (structured?.raw_query) parts.push(structured.raw_query);
  return parts.join(" ").toLowerCase();
}

const YC_PATTERN =
  /\b(yc[\s-]?backed|y[\s-]?combinator|ycombinator)\b/i;
const TECHSTARS_PATTERN = /\btechstars[\s-]?backed\b/i;

/**
 * @returns {{ id: string, label: string } | null}
 */
export function detectInvestorThesis(structured) {
  const text = normalizeThesisText(structured);
  if (!text) return null;

  if (YC_PATTERN.test(text) || (/\byc\b/i.test(text) && /\bbacked\b/i.test(text))) {
    return { id: "yc", label: "Y Combinator-backed" };
  }

  if (TECHSTARS_PATTERN.test(text) || /\btechstars\b/i.test(text)) {
    return { id: "techstars", label: "Techstars-backed" };
  }

  return null;
}

export function hasInvestorThesis(structured) {
  return detectInvestorThesis(structured) != null;
}

const YC_BATCH_PATTERN =
  /^(?:[sw]\d{2}|(?:spring|winter|summer|fall)\s+20\d{2})$/i;

function investorLooksLikeYc(inv) {
  const normalized = String(inv ?? "")
    .toLowerCase()
    .trim();
  if (!normalized) return false;
  const compact = normalized.replace(/[\s-_]+/g, "");
  return (
    compact.includes("ycombinator") ||
    normalized === "yc" ||
    normalized.startsWith("yc ") ||
    YC_BATCH_PATTERN.test(normalized)
  );
}

function sourcesMentionYcombinator(company) {
  const urls = [
    ...(company?.enrichment_sources ?? []),
    ...(company?.sources_found ?? []),
    ...(Array.isArray(company?.raw?.sources) ? company.raw.sources : []),
  ];
  return urls.some((u) => /ycombinator\.com/i.test(String(u ?? "")));
}

export function companyHasYcBacking(company) {
  const investors = company?.investors ?? [];
  if (investors.some(investorLooksLikeYc)) return true;
  return sourcesMentionYcombinator(company);
}

export function companyMatchesInvestorThesis(company, thesis) {
  if (!thesis) return false;
  if (thesis.id === "yc") return companyHasYcBacking(company);
  if (thesis.id === "techstars") {
    return (company?.investors ?? []).some((inv) =>
      String(inv).toLowerCase().includes("techstars")
    );
  }
  return false;
}
