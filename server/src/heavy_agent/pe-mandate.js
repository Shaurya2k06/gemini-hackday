/**
 * PE mandate helpers — financial bands, discovery limits, fit labels.
 */

export function hasFinancialMandate(structured = {}) {
  return (
    structured.revenue_min != null ||
    structured.revenue_max != null ||
    structured.ebitda_min != null ||
    structured.ebitda_max != null
  );
}

export function hasEmployeeMandate(structured = {}) {
  return structured.employees_min != null || structured.employees_max != null;
}

export function hasPeMandate(structured = {}) {
  return hasFinancialMandate(structured) || hasEmployeeMandate(structured);
}

const GENERIC_SECTOR_TAGS = new Set([
  "startup",
  "startups",
  "company",
  "companies",
  "business",
  "businesses",
  "firm",
  "firms",
]);

/**
 * True when the parsed mandate lacks enough criteria for focused PE sourcing.
 */
export function isMandateTooVague(structured = {}) {
  if (
    !structured ||
    structured.intent === "company_lookup" ||
    structured.intent === "general_info"
  ) {
    return false;
  }

  const sectors = (structured.sector_tags ?? []).filter(
    (tag) => tag && !GENERIC_SECTOR_TAGS.has(String(tag).toLowerCase())
  );
  const hasSector = sectors.length > 0 || (structured.keywords ?? []).length > 0;
  const hasGeo = Boolean(
    structured.country_code ||
      structured.region ||
      (structured.geography ?? []).length > 0
  );
  const hasSize =
    hasFinancialMandate(structured) ||
    hasEmployeeMandate(structured) ||
    (structured.funding_stage ?? []).length > 0;

  const criteriaCount = [hasSector, hasGeo, hasSize].filter(Boolean).length;
  return criteriaCount < 2;
}

export function formatUsdAmount(usd) {
  if (usd == null || !Number.isFinite(usd)) return null;
  if (Math.abs(usd) >= 1_000_000) {
    const m = usd / 1_000_000;
    return `$${m >= 10 ? Math.round(m) : m.toFixed(1)}M`;
  }
  if (Math.abs(usd) >= 1_000) return `$${Math.round(usd / 100) / 10}K`;
  return `$${Math.round(usd)}`;
}

export function formatUsdBand(min, max, label = "Revenue") {
  if (min != null && max != null) {
    return `${label}: ${formatUsdAmount(min)}–${formatUsdAmount(max)} USD`;
  }
  if (min != null) return `${label}: >= ${formatUsdAmount(min)} USD`;
  if (max != null) return `${label}: <= ${formatUsdAmount(max)} USD`;
  return null;
}

export function formatEmployeeBand(min, max) {
  if (min != null && max != null) return `Employees: ${min}–${max}`;
  if (min != null) return `Employees: >= ${min}`;
  if (max != null) return `Employees: <= ${max}`;
  return null;
}

export function buildFinancialMandateLines(structured = {}) {
  const lines = [];
  const revenue = formatUsdBand(
    structured.revenue_min,
    structured.revenue_max,
    "Annual revenue"
  );
  const ebitda = formatUsdBand(
    structured.ebitda_min,
    structured.ebitda_max,
    "Annual EBITDA"
  );
  const employees = formatEmployeeBand(
    structured.employees_min,
    structured.employees_max
  );
  if (revenue) lines.push(revenue);
  if (ebitda) lines.push(ebitda);
  if (employees) lines.push(employees);
  return lines;
}

export const SHORTLIST_MAX = 25;

/** Ceiling for raw OpenAI search fetch — independent of display shortlist cap. */
const FETCH_CEILING = 50;

export function getPeDiscoveryLimit(structured = {}) {
  const raw = process.env.OPENAI_DISCOVERY_LIMIT;
  if (raw != null && raw !== "") {
    const n = Number(raw);
    if (Number.isFinite(n) && n > 0) return Math.min(Math.floor(n), SHORTLIST_MAX);
  }
  return 10;
}

/** How many candidates to request from search before PE gate attrition. */
export function getSearchFetchLimit(target) {
  const n = Math.floor(Number(target)) || getPeDiscoveryLimit();
  return Math.min(FETCH_CEILING, Math.max(n, Math.ceil(n * 2)));
}

export function getPeResultCap(constraintMode = "heavy") {
  const raw = process.env.PE_RESULT_CAP;
  if (raw != null && raw !== "") {
    const n = Number(raw);
    if (Number.isFinite(n) && n > 0) return Math.min(Math.floor(n), SHORTLIST_MAX);
  }
  // Lite aims for a fuller shortlist; Heavy stays at the default diligence cap.
  return constraintMode === "lite" ? SHORTLIST_MAX : 10;
}

/** How many additional companies to request (1–25), capped by room left on shortlist. */
export function clampExpandCount(currentCount, requested) {
  const current = Math.max(0, Math.floor(Number(currentCount)) || 0);
  const room = Math.max(0, SHORTLIST_MAX - current);
  const want = Math.floor(Number(requested)) || 1;
  return Math.min(Math.max(1, want), room, 25);
}

function revenueInBand(structured, revenue) {
  if (revenue == null) return null;
  if (structured.revenue_min != null && revenue < structured.revenue_min) return false;
  if (structured.revenue_max != null && revenue > structured.revenue_max) return false;
  return true;
}

function ebitdaInBand(structured, ebitda) {
  if (ebitda == null) return null;
  if (structured.ebitda_min != null && ebitda < structured.ebitda_min) return false;
  if (structured.ebitda_max != null && ebitda > structured.ebitda_max) return false;
  return true;
}

/**
 * Human-readable PE financial fit for UI.
 */
export function buildFinancialFitSummary(structured = {}, company = {}) {
  if (!hasPeMandate(structured)) return null;

  const rev = company.annual_revenue_usd;
  const ebitda = company.annual_ebitda_usd;
  const hasRevenueBand =
    structured.revenue_min != null || structured.revenue_max != null;
  const hasEbitdaBand =
    structured.ebitda_min != null || structured.ebitda_max != null;

  if (hasRevenueBand) {
    const inBand = revenueInBand(structured, rev);
    if (inBand === true) return { status: "in_band", label: "Within revenue band" };
    if (inBand === false) return { status: "out_of_band", label: "Outside revenue band" };
  }

  if (hasEbitdaBand) {
    const inBand = ebitdaInBand(structured, ebitda);
    if (inBand === true) return { status: "in_band", label: "Within EBITDA band" };
    if (inBand === false) return { status: "out_of_band", label: "Outside EBITDA band" };
  }

  if (hasFinancialMandate(structured)) {
    return { status: "unknown", label: "Financials unknown for criteria" };
  }

  return null;
}
