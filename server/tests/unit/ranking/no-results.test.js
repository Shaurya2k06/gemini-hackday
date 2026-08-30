import { test } from "node:test";
import assert from "node:assert/strict";
import { buildNoResultsMessage, buildDiscoveryResults } from "../../../src/chatbot/results.js";

const structured = {
  sector_tags: ["fintech"],
  funding_stage: ["seed"],
  geography: ["Mumbai"],
  keywords: [],
  raw_query: "seed stage fintech companies in Mumbai",
  employees_min: null,
  employees_max: null,
  revenue_min: null,
  revenue_max: null,
};

test("buildNoResultsMessage reflects per-source counts and geography", () => {
  const message = buildNoResultsMessage({
    structured,
    heavyOutcomes: [
      { source: "crunchbase", results: [] },
      { source: "wellfound", results: [] },
      { source: "linkedin", results: [] },
      { source: "github", results: [{ name: "x" }, { name: "y" }] },
      { source: "startup_india", results: [{ name: "z" }] },
    ],
    normalizeSummary: { rawRecordCount: 3, companyCount: 0, skippedCount: 3 },
  });

  assert.match(message, /Mumbai/);
  assert.match(message, /Crunchbase \(0\)/);
  assert.match(message, /GitHub \(2\)/);
  assert.match(message, /Startup India \(1\)/);
  assert.match(message, /3 raw result/);
  assert.doesNotMatch(message, /employee count constraints/);
});

test("buildDiscoveryResults uses dynamic no-results message when context provided", () => {
  const { message } = buildDiscoveryResults([], {
    structured,
    noResultsContext: {
      heavyOutcomes: [{ source: "crunchbase", results: [] }],
      normalizeSummary: { rawRecordCount: 0, companyCount: 0, skippedCount: 0 },
    },
  });
  assert.match(message, /No companies found matching/);
  assert.match(message, /Crunchbase \(0\)/);
});

test("buildNoResultsMessage reports search failure instead of empty domains", () => {
  const message = buildNoResultsMessage({
    structured,
    heavyOutcomes: [
      {
        source: "openai_web_search",
        success: false,
        method: "error",
        results: [],
        error: 'SyntaxError: Unexpected token "u", ..."ded_year":unknown',
      },
    ],
    normalizeSummary: { rawRecordCount: 0, companyCount: 0, skippedCount: 0 },
  });

  assert.match(message, /search failed/);
  assert.match(message, /SyntaxError/);
  assert.doesNotMatch(message, /0 results with resolvable domains/);
});
