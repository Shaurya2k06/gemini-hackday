import { test } from "node:test";
import assert from "node:assert/strict";
import { runDiscoveryExpand } from "../../../src/chatbot/pipeline.js";
import { NO_MORE_COMPANIES_MESSAGE } from "../../../src/chatbot/results.js";
import { OPENAI_WEB_SEARCH_SOURCE } from "../../../src/heavy_agent/openai-search.js";

const STRUCTURED = {
  intent: "mandate_search",
  sector_tags: ["technology"],
  geography: ["San Francisco", "California"],
  country_code: "US",
  raw_query: "Tech startups in SF",
};

function mockHeavyWithDomains(domains) {
  return async () => ({
    outcomes: [
      {
        source: OPENAI_WEB_SEARCH_SOURCE,
        success: true,
        results: domains.map((domain, i) => ({
          name: `Co ${i}`,
          domain,
          description: "Test",
          geography: "San Francisco, CA",
          funding_stage: "seed",
          source: OPENAI_WEB_SEARCH_SOURCE,
        })),
        resultsRawCount: domains.length,
      },
    ],
    openaiResultCount: domains.length,
    openaiSearchUsed: true,
  });
}

test("runDiscoveryExpand returns no-more message when search yields only existing domains", async () => {
  const result = await runDiscoveryExpand(STRUCTURED, STRUCTURED.raw_query, {
    existingDomains: ["stripe.com"],
    additionalCount: 5,
    heavySearchRunner: mockHeavyWithDomains(["stripe.com"]),
    enrichRunner: async (companies) => ({ companies, enrichedCount: 0 }),
  });

  assert.equal(result.addedCount, 0);
  assert.equal(result.ranked.message, NO_MORE_COMPANIES_MESSAGE);
});

test("runDiscoveryExpand adds only new domains not already on shortlist", async () => {
  const result = await runDiscoveryExpand(STRUCTURED, STRUCTURED.raw_query, {
    existingDomains: ["stripe.com"],
    additionalCount: 3,
    heavySearchRunner: mockHeavyWithDomains(["stripe.com", "ramp.com", "brex.com"]),
    enrichRunner: async (companies) => ({ companies, enrichedCount: companies.length }),
  });

  assert.equal(result.addedCount, 2);
  assert.deepEqual(
    result.ranked.results.map((r) => r.company.domain),
    ["ramp.com", "brex.com"]
  );
});

test("runDiscoveryExpand rejects when shortlist already at max", async () => {
  const domains = Array.from({ length: 25 }, (_, i) => `co${i}.com`);
  const result = await runDiscoveryExpand(STRUCTURED, STRUCTURED.raw_query, {
    existingDomains: domains,
    additionalCount: 5,
    heavySearchRunner: mockHeavyWithDomains(["newco.com"]),
    enrichRunner: async (companies) => ({ companies, enrichedCount: 0 }),
  });

  assert.equal(result.addedCount, undefined);
  assert.equal(result.ranked.results.length, 0);
  assert.match(result.ranked.message, /maximum \(25/);
});
