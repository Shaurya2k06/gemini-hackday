import { test } from "node:test";
import assert from "node:assert/strict";
import {
  hasMandateCriteria,
  resolveQueryIntent,
  extractCompanyNameFromQuery,
  looksLikeChatQuestion,
} from "../../../src/light_agent/intent-routing.js";

function mockStructured(overrides = {}) {
  return {
    intent: "mandate_search",
    company_names: [],
    sector_tags: [],
    funding_stage: [],
    geography: [],
    keywords: [],
    country_code: null,
    region: null,
    employees_min: null,
    employees_max: null,
    founded_after: null,
    founded_before: null,
    revenue_min: null,
    revenue_max: null,
    ebitda_min: null,
    ebitda_max: null,
    ...overrides,
  };
}

test("looksLikeChatQuestion detects ownership questions", () => {
  assert.equal(looksLikeChatQuestion("Who owns perplexity?"), true);
  assert.equal(looksLikeChatQuestion("fintech startups in berlin"), false);
});

test("extractCompanyNameFromQuery pulls company from ownership question", () => {
  assert.equal(extractCompanyNameFromQuery("Who owns perplexity?"), "perplexity");
});

test("hasMandateCriteria false for generic startup-only query", () => {
  assert.equal(hasMandateCriteria(mockStructured({ keywords: ["startups"] })), false);
});

test("hasMandateCriteria true when geography present", () => {
  assert.equal(hasMandateCriteria(mockStructured({ geography: ["Berlin"] })), true);
});

test("resolveQueryIntent routes ownership question to general_info", () => {
  const result = resolveQueryIntent(
    mockStructured({ intent: "mandate_search", keywords: ["perplexity"] }),
    "Who owns perplexity?"
  );

  assert.equal(result.intent, "general_info");
  assert.deepEqual(result.structured.company_names, []);
  assert.deepEqual(result.structured.sector_tags, []);
  assert.deepEqual(result.structured.geography, []);
});

test("resolveQueryIntent keeps mandate_search when criteria exist", () => {
  const result = resolveQueryIntent(
    mockStructured({ intent: "mandate_search", sector_tags: ["fintech"], geography: ["Singapore"] }),
    "fintech startups in singapore"
  );

  assert.equal(result.intent, "mandate_search");
  assert.ok(result.structured.sector_tags.includes("fintech"));
});

test("resolveQueryIntent clears company_names for general_info", () => {
  const result = resolveQueryIntent(
    mockStructured({ intent: "general_info", company_names: ["Perplexity"] }),
    "Who owns Perplexity?"
  );

  assert.equal(result.intent, "general_info");
  assert.deepEqual(result.structured.company_names, []);
});
