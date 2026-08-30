/** Light Agent output contract — docs/context.md Section 7 */

export const QUERY_INTENTS = ["mandate_search", "company_lookup", "general_info"];

export const FUNDING_STAGES = [
  "pre-seed",
  "seed",
  "series_a",
  "series_b",
  "series_c_plus",
  "unknown",
];

export const QUERY_REGIONS = [
  "india",
  "apac",
  "latam",
  "africa",
  "europe",
  "us",
  "other",
];

export const STRUCTURED_QUERY_FIELDS = [
  "intent",
  "company_names",
  "sector_tags",
  "funding_stage",
  "geography",
  "country_code",
  "region",
  "employees_min",
  "employees_max",
  "founded_after",
  "founded_before",
  "revenue_min",
  "revenue_max",
  "ebitda_min",
  "ebitda_max",
  "keywords",
  "raw_query",
];

/** OpenAI strict JSON schema for response_format */
export const OPENAI_RESPONSE_SCHEMA = {
  type: "object",
  properties: {
    intent: {
      type: "string",
      enum: QUERY_INTENTS,
    },
    company_names: {
      type: "array",
      items: { type: "string" },
    },
    sector_tags: {
      type: "array",
      items: { type: "string" },
    },
    funding_stage: {
      type: "array",
      items: {
        type: "string",
        enum: FUNDING_STAGES,
      },
    },
    geography: {
      type: "array",
      items: { type: "string" },
    },
    country_code: { type: ["string", "null"] },
    region: { type: ["string", "null"] },
    employees_min: { type: ["integer", "null"] },
    employees_max: { type: ["integer", "null"] },
    founded_after: { type: ["string", "null"] },
    founded_before: { type: ["string", "null"] },
    revenue_min: { type: ["number", "null"] },
    revenue_max: { type: ["number", "null"] },
    ebitda_min: { type: ["number", "null"] },
    ebitda_max: { type: ["number", "null"] },
    keywords: {
      type: "array",
      items: { type: "string" },
    },
  },
  required: [
    "intent",
    "company_names",
    "sector_tags",
    "funding_stage",
    "geography",
    "country_code",
    "region",
    "employees_min",
    "employees_max",
    "founded_after",
    "founded_before",
    "revenue_min",
    "revenue_max",
    "ebitda_min",
    "ebitda_max",
    "keywords",
  ],
  additionalProperties: false,
};

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const ISO_COUNTRY = /^[A-Z]{2}$/;

export class StructuredQueryValidationError extends Error {
  constructor(message, details = []) {
    super(message);
    this.name = "StructuredQueryValidationError";
    this.details = details;
  }
}

function isStringArray(value) {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

function isNullableInteger(value) {
  return value === null || (Number.isInteger(value) && value >= 0);
}

function isNullableNumber(value) {
  return value === null || (typeof value === "number" && Number.isFinite(value));
}

function isNullableIsoDate(value) {
  return value === null || (typeof value === "string" && ISO_DATE.test(value));
}

function normalizeCountryCode(value) {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value !== "string") return undefined;
  const code = value.trim().toUpperCase();
  return ISO_COUNTRY.test(code) ? code : undefined;
}

function normalizeRegion(value) {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value !== "string") return undefined;
  const region = value.trim().toLowerCase();
  return QUERY_REGIONS.includes(region) ? region : undefined;
}

/**
 * Validate and normalize LLM output. Sets raw_query from the original user input.
 */
export function validateStructuredQuery(candidate, rawQuery) {
  const errors = [];

  if (candidate === null || typeof candidate !== "object" || Array.isArray(candidate)) {
    throw new StructuredQueryValidationError("Output must be a JSON object");
  }

  for (const field of STRUCTURED_QUERY_FIELDS) {
    if (field === "raw_query") {
      continue;
    }
    if (!(field in candidate)) {
      if (
        field === "country_code" ||
        field === "region" ||
        field === "ebitda_min" ||
        field === "ebitda_max"
      ) {
        candidate[field] = null;
        continue;
      }
      errors.push(`Missing required field: ${field}`);
    }
  }

  if (!QUERY_INTENTS.includes(candidate.intent)) {
    errors.push(`intent must be one of: ${QUERY_INTENTS.join(", ")}`);
  }

  if (!isStringArray(candidate.company_names)) {
    errors.push("company_names must be an array of strings");
  }

  if (
    candidate.intent === "company_lookup" &&
    candidate.company_names.length === 0
  ) {
    errors.push("company_lookup intent requires at least one company_names entry");
  }

  if (
    candidate.intent === "mandate_search" &&
    candidate.company_names.length > 0
  ) {
    errors.push("company_names must be empty when intent is mandate_search");
  }

  if (
    candidate.intent === "general_info" &&
    candidate.company_names.length > 0
  ) {
    errors.push("company_names must be empty when intent is general_info");
  }

  if (!isStringArray(candidate.sector_tags)) {
    errors.push("sector_tags must be an array of strings");
  }

  if (!isStringArray(candidate.funding_stage)) {
    errors.push("funding_stage must be an array of strings");
  } else {
    for (const stage of candidate.funding_stage) {
      if (!FUNDING_STAGES.includes(stage)) {
        errors.push(`Invalid funding_stage value: ${stage}`);
      }
    }
  }

  if (!isStringArray(candidate.geography)) {
    errors.push("geography must be an array of strings");
  }

  const countryCode = normalizeCountryCode(candidate.country_code);
  if (countryCode === undefined) {
    errors.push("country_code must be null or an ISO 3166-1 alpha-2 code");
  }

  const region = normalizeRegion(candidate.region);
  if (region === undefined) {
    errors.push(`region must be null or one of: ${QUERY_REGIONS.join(", ")}`);
  }

  if (!isNullableInteger(candidate.employees_min)) {
    errors.push("employees_min must be null or a non-negative integer");
  }

  if (!isNullableInteger(candidate.employees_max)) {
    errors.push("employees_max must be null or a non-negative integer");
  }

  if (
    candidate.employees_min !== null &&
    candidate.employees_max !== null &&
    candidate.employees_min > candidate.employees_max
  ) {
    errors.push("employees_min cannot exceed employees_max");
  }

  if (!isNullableIsoDate(candidate.founded_after)) {
    errors.push("founded_after must be null or ISO date YYYY-MM-DD");
  }

  if (!isNullableIsoDate(candidate.founded_before)) {
    errors.push("founded_before must be null or ISO date YYYY-MM-DD");
  }

  if (
    candidate.founded_after &&
    candidate.founded_before &&
    candidate.founded_after > candidate.founded_before
  ) {
    errors.push("founded_after cannot be after founded_before");
  }

  if (!isNullableNumber(candidate.revenue_min)) {
    errors.push("revenue_min must be null or a number");
  }

  if (!isNullableNumber(candidate.revenue_max)) {
    errors.push("revenue_max must be null or a number");
  }

  if (
    candidate.revenue_min !== null &&
    candidate.revenue_max !== null &&
    candidate.revenue_min > candidate.revenue_max
  ) {
    errors.push("revenue_min cannot exceed revenue_max");
  }

  if (!isNullableNumber(candidate.ebitda_min)) {
    errors.push("ebitda_min must be null or a number");
  }

  if (!isNullableNumber(candidate.ebitda_max)) {
    errors.push("ebitda_max must be null or a number");
  }

  if (
    candidate.ebitda_min !== null &&
    candidate.ebitda_max !== null &&
    candidate.ebitda_min > candidate.ebitda_max
  ) {
    errors.push("ebitda_min cannot exceed ebitda_max");
  }

  if (!isStringArray(candidate.keywords)) {
    errors.push("keywords must be an array of strings");
  }

  if (errors.length > 0) {
    throw new StructuredQueryValidationError(
      "Structured query validation failed",
      errors
    );
  }

  return {
    intent: candidate.intent,
    company_names: candidate.company_names,
    sector_tags: candidate.sector_tags,
    funding_stage: candidate.funding_stage,
    geography: candidate.geography,
    country_code: countryCode,
    region,
    employees_min: candidate.employees_min,
    employees_max: candidate.employees_max,
    founded_after: candidate.founded_after,
    founded_before: candidate.founded_before,
    revenue_min: candidate.revenue_min,
    revenue_max: candidate.revenue_max,
    ebitda_min: candidate.ebitda_min,
    ebitda_max: candidate.ebitda_max,
    keywords: candidate.keywords,
    raw_query: rawQuery,
  };
}

/**
 * Merge a filter parse into an existing mandate structured query.
 * Non-empty filter fields override; empty/null filter fields keep prior values.
 */
export function mergeStructuredFilter(base, filter) {
  const next = { ...base };

  if (filter.sector_tags?.length) next.sector_tags = filter.sector_tags;
  if (filter.funding_stage?.length) next.funding_stage = filter.funding_stage;
  if (filter.geography?.length) next.geography = filter.geography;
  if (filter.country_code != null) next.country_code = filter.country_code;
  if (filter.region != null) next.region = filter.region;
  if (filter.employees_min != null) next.employees_min = filter.employees_min;
  if (filter.employees_max != null) next.employees_max = filter.employees_max;
  if (filter.founded_after != null) next.founded_after = filter.founded_after;
  if (filter.founded_before != null) next.founded_before = filter.founded_before;
  if (filter.revenue_min != null) next.revenue_min = filter.revenue_min;
  if (filter.revenue_max != null) next.revenue_max = filter.revenue_max;
  if (filter.ebitda_min != null) next.ebitda_min = filter.ebitda_min;
  if (filter.ebitda_max != null) next.ebitda_max = filter.ebitda_max;
  if (filter.keywords?.length) {
    next.keywords = [...new Set([...(base.keywords ?? []), ...filter.keywords])];
  }

  next.intent = "mandate_search";
  next.company_names = [];
  return next;
}

export function parseJsonSafely(text) {
  try {
    return { ok: true, value: JSON.parse(text) };
  } catch (error) {
    return { ok: false, error };
  }
}
