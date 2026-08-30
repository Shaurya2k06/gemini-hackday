const VALID_FUNDING_STAGES = new Set([
  "pre-seed",
  "seed",
  "series_a",
  "series_b",
  "series_c_plus",
  "unknown",
]);

const NUMERIC_FIELDS = ["total_raised", "annual_revenue_usd", "annual_ebitda_usd"];

function parseNumericField(value) {
  if (value == null || value === "") return null;
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }
  const cleaned = String(value).replace(/[,$\s]/g, "");
  const n = Number(cleaned);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

function parseIntegerField(value) {
  if (value == null || value === "") return null;
  if (typeof value === "number") {
    return Number.isInteger(value) && value >= 0 ? value : null;
  }
  const n = Number(String(value).replace(/[,\s]/g, ""));
  return Number.isInteger(n) && n >= 0 ? n : null;
}

/**
 * Coerce scraped / LLM values into schema-safe types before validation.
 */
export function coerceUnifiedCompany(company) {
  if (!company || typeof company !== "object") return company;
  const c = { ...company };

  for (const field of NUMERIC_FIELDS) {
    if (field in c) {
      c[field] = parseNumericField(c[field]);
    }
  }

  if ("employees_count" in c) {
    c.employees_count = parseIntegerField(c.employees_count);
  }

  if (typeof c.funding_stage === "string") {
    const stage = c.funding_stage.toLowerCase().replace(/[-\s]+/g, "_");
    const aliases = {
      pre_seed: "pre-seed",
      seriesa: "series_a",
      seriesb: "series_b",
      seriesc: "series_c_plus",
    };
    const mapped = aliases[stage] ?? stage;
    c.funding_stage = VALID_FUNDING_STAGES.has(mapped) ? mapped : "unknown";
  }

  return c;
}

const REQUIRED_STRING_FIELDS = ["name", "description", "geography"];

/**
 * Validate a unified company object against Section 6 schema requirements
 * (excluding DB-managed fields: id, embedding, timestamps).
 */
export function validateUnifiedCompany(company) {
  const errors = [];
  const c = coerceUnifiedCompany(company);

  if (!c || typeof c !== "object") {
    return { valid: false, errors: ["company must be an object"] };
  }

  if (!c.domain || typeof c.domain !== "string") {
    errors.push("domain is required and must be a non-empty string");
  }

  for (const field of REQUIRED_STRING_FIELDS) {
    if (typeof c[field] !== "string") {
      errors.push(`${field} must be a string`);
    }
  }

  if (!Array.isArray(c.sector_tags)) {
    errors.push("sector_tags must be an array");
  }

  if (!VALID_FUNDING_STAGES.has(c.funding_stage)) {
    errors.push(`funding_stage must be one of: ${[...VALID_FUNDING_STAGES].join(", ")}`);
  }

  if (c.total_raised != null && typeof c.total_raised !== "number") {
    errors.push("total_raised must be a number or null");
  }

  if (!Array.isArray(c.investors)) {
    errors.push("investors must be an array");
  }

  if (c.employees_count != null && !Number.isInteger(c.employees_count)) {
    errors.push("employees_count must be an integer or null");
  }

  if (
    c.confidence_scores == null ||
    typeof c.confidence_scores !== "object" ||
    Array.isArray(c.confidence_scores)
  ) {
    errors.push("confidence_scores must be a json object keyed by field name");
  } else {
    for (const [field, score] of Object.entries(c.confidence_scores)) {
      if (typeof score !== "number" || score < 0 || score > 1) {
        errors.push(`confidence_scores.${field} must be a number between 0 and 1`);
      }
    }
  }

  if (!Array.isArray(c.sources_found)) {
    errors.push("sources_found must be an array");
  }

  if (
    c.verification_urls != null &&
    (typeof c.verification_urls !== "object" || Array.isArray(c.verification_urls))
  ) {
    errors.push("verification_urls must be an object");
  }

  return { valid: errors.length === 0, errors, company: c };
}

export function assertValidUnifiedCompany(company) {
  const { valid, errors, company: coerced } = validateUnifiedCompany(company);
  if (!valid) {
    throw new Error(`Invalid unified company: ${errors.join("; ")}`);
  }
  return coerced;
}

export { VALID_FUNDING_STAGES };
