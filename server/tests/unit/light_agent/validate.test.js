import { test } from "node:test";
import assert from "node:assert/strict";
import {
  validateStructuredQuery,
  StructuredQueryValidationError,
  parseJsonSafely,
  STRUCTURED_QUERY_FIELDS,
} from "../../../src/light_agent/schema.js";

const validOutput = {
  intent: "mandate_search",
  company_names: [],
  sector_tags: ["fintech"],
  funding_stage: ["series_b"],
  geography: ["San Francisco"],
  country_code: null,
  region: null,
  employees_min: 50,
  employees_max: 200,
  founded_after: "2020-01-01",
  founded_before: null,
  revenue_min: null,
  revenue_max: null,
  ebitda_min: null,
  ebitda_max: null,
  keywords: ["payments"],
};

test("validateStructuredQuery accepts a valid Section 7 payload", () => {
  const result = validateStructuredQuery(validOutput, "original query");
  assert.equal(result.raw_query, "original query");
  assert.deepEqual(result.sector_tags, ["fintech"]);
});

test("validateStructuredQuery requires all Section 7 fields", () => {
  const incomplete = { ...validOutput };
  delete incomplete.keywords;

  assert.throws(
    () => validateStructuredQuery(incomplete, "q"),
    StructuredQueryValidationError
  );
});

test("validateStructuredQuery rejects invalid funding_stage enum", () => {
  assert.throws(
    () =>
      validateStructuredQuery(
        { ...validOutput, funding_stage: ["series_z"] },
        "q"
      ),
    StructuredQueryValidationError
  );
});

test("validateStructuredQuery rejects invalid date format", () => {
  assert.throws(
    () =>
      validateStructuredQuery(
        { ...validOutput, founded_after: "2020" },
        "q"
      ),
    StructuredQueryValidationError
  );
});

test("validateStructuredQuery rejects inverted employee range", () => {
  assert.throws(
    () =>
      validateStructuredQuery(
        { ...validOutput, employees_min: 500, employees_max: 100 },
        "q"
      ),
    StructuredQueryValidationError
  );
});

test("parseJsonSafely returns error on malformed JSON", () => {
  const result = parseJsonSafely("{not json");
  assert.equal(result.ok, false);
});

test("STRUCTURED_QUERY_FIELDS matches Section 7 contract", () => {
  assert.equal(STRUCTURED_QUERY_FIELDS.length, 17);
  assert.ok(STRUCTURED_QUERY_FIELDS.includes("raw_query"));
  assert.ok(STRUCTURED_QUERY_FIELDS.includes("intent"));
  assert.ok(STRUCTURED_QUERY_FIELDS.includes("company_names"));
  assert.ok(STRUCTURED_QUERY_FIELDS.includes("country_code"));
  assert.ok(STRUCTURED_QUERY_FIELDS.includes("region"));
  assert.ok(STRUCTURED_QUERY_FIELDS.includes("ebitda_min"));
  assert.ok(STRUCTURED_QUERY_FIELDS.includes("ebitda_max"));
});

test("validateStructuredQuery accepts country_code and region", () => {
  const result = validateStructuredQuery(
    {
      ...validOutput,
      geography: ["Hyderabad", "Telangana", "India"],
      country_code: "IN",
      region: "india",
    },
    "seed agri in hyd"
  );
  assert.equal(result.country_code, "IN");
  assert.equal(result.region, "india");
});

test("validateStructuredQuery defaults missing country_code and region to null", () => {
  const result = validateStructuredQuery(validOutput, "original query");
  assert.equal(result.country_code, null);
  assert.equal(result.region, null);
});

test("mergeStructuredFilter overlays non-empty filter fields", async () => {
  const { mergeStructuredFilter } = await import("../../../src/light_agent/schema.js");
  const base = validateStructuredQuery(
    {
      ...validOutput,
      geography: ["San Francisco", "California", "United States"],
      country_code: "US",
      region: "us",
    },
    "fintech sf"
  );
  const merged = mergeStructuredFilter(base, {
    funding_stage: ["series_a"],
    sector_tags: [],
    geography: [],
    country_code: null,
    region: null,
    keywords: [],
  });
  assert.deepEqual(merged.funding_stage, ["series_a"]);
  assert.deepEqual(merged.sector_tags, ["fintech"]);
  assert.equal(merged.country_code, "US");
});

test("validateStructuredQuery accepts company_lookup with company_names", () => {
  const result = validateStructuredQuery(
    {
      intent: "company_lookup",
      company_names: ["Cursor"],
      sector_tags: [],
      funding_stage: [],
      geography: [],
      employees_min: null,
      employees_max: null,
      founded_after: null,
      founded_before: null,
      revenue_min: null,
      revenue_max: null,
      ebitda_min: null,
      ebitda_max: null,
      keywords: [],
    },
    "Tell me about Cursor"
  );
  assert.equal(result.intent, "company_lookup");
  assert.deepEqual(result.company_names, ["Cursor"]);
});

test("validateStructuredQuery rejects company_lookup without company_names", () => {
  assert.throws(
    () =>
      validateStructuredQuery(
        {
          intent: "company_lookup",
          company_names: [],
          sector_tags: [],
          funding_stage: [],
          geography: [],
          employees_min: null,
          employees_max: null,
          founded_after: null,
          founded_before: null,
          revenue_min: null,
          revenue_max: null,
          ebitda_min: null,
          ebitda_max: null,
          keywords: [],
        },
        "Tell me about Cursor"
      ),
    StructuredQueryValidationError
  );
});
