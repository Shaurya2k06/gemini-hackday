import { test } from "node:test";
import assert from "node:assert/strict";
import { runDiscoveryFromParsed, runDiscoveryExpand } from "../../../src/chatbot/pipeline.js";
import { OPENAI_WEB_SEARCH_SOURCE } from "../../../src/heavy_agent/openai-search.js";

const STRUCTURED = {
  intent: "mandate_search",
  sector_tags: ["technology"],
  geography: ["San Francisco"],
  country_code: "US",
  raw_query: "YC backed startups in SF",
};

function makeHeavy(domains) {
  return {
    outcomes: [
      {
        source: OPENAI_WEB_SEARCH_SOURCE,
        success: true,
        results: domains.map((domain) => {
          const label = domain.split(".")[0];
          return {
            name: label.charAt(0).toUpperCase() + label.slice(1),
            domain,
            description: "YC-backed startup",
            geography: "San Francisco, CA",
            funding_stage: "seed",
            investors: ["Y Combinator"],
            source: OPENAI_WEB_SEARCH_SOURCE,
          };
        }),
        resultsRawCount: domains.length,
      },
    ],
    openaiResultCount: domains.length,
    openaiSearchUsed: true,
  };
}

test("first-pass fill reaches 10 when initial search returns fewer after gate", async () => {
  let call = 0;
  const heavySearchRunner = async (_structured, { openAILimit, excludeDomains = [] }) => {
    call += 1;
    if (call === 1) {
      return makeHeavy([
        "one.com",
        "two.com",
        "three.com",
        "four.com",
        "five.com",
        "six.com",
      ]);
    }
    const exclude = new Set(excludeDomains);
    const pool = ["seven.com", "eight.com", "nine.com", "ten.com", "eleven.com"];
    const fresh = pool.filter((d) => !exclude.has(d)).slice(0, openAILimit);
    return makeHeavy(fresh);
  };

  const enrichRunner = async (companies) => ({
    companies,
    enrichedCount: companies.length,
    enrichCalls: companies.length,
  });

  const result = await runDiscoveryFromParsed(STRUCTURED, STRUCTURED.raw_query, {
    heavySearchRunner,
    enrichRunner,
  });

  assert.equal(result.ranked.results.length, 10);
  assert.ok(result.stages.some((s) => s.name === "heavy_search_fill"));
  assert.ok(call >= 2);
});

test("enrichment only runs on shortlisted companies not the full over-fetch", async () => {
  const many = Array.from({ length: 18 }, (_, i) => `co${i + 1}.com`);
  let enrichSizes = [];

  const heavySearchRunner = async () => makeHeavy(many);
  const enrichRunner = async (companies) => {
    enrichSizes.push(companies.length);
    return {
      companies: companies.map((c) => ({
        ...c,
        total_raised: 2_000_000,
        investors: ["Y Combinator"],
        domain_verified: true,
        entity_type: "operating_startup",
        investment_summary: "Seed-backed operating company.",
      })),
      enrichedCount: companies.length,
      enrichCalls: companies.length,
    };
  };

  const result = await runDiscoveryFromParsed(STRUCTURED, STRUCTURED.raw_query, {
    heavySearchRunner,
    enrichRunner,
  });

  assert.ok(enrichSizes.length >= 1);
  assert.ok(
    enrichSizes.every((n) => n <= 12),
    `expected enrich fan-out <= 12, got ${enrichSizes.join(",")}`
  );
  assert.ok(result.ranked.results.length <= 10);
  assert.equal(result.costInputs?.openai_enrich?.calls, enrichSizes[0]);
});

test("runDiscoveryExpand retries and over-fetches to satisfy the requested additional count", async () => {
  const existingDomains = Array.from({ length: 15 }, (_, i) => `existing${i + 1}.com`);
  let call = 0;

  // Simulate real-world attrition: half of what comes back gets dropped by the gate
  // (no investor signal), so a single un-broadened search can't satisfy the request.
  const heavySearchRunner = async (_structured, { openAILimit, excludeDomains = [] }) => {
    call += 1;
    const exclude = new Set(excludeDomains);
    const pool = Array.from({ length: 40 }, (_, i) => `new${i + 1}.com`).filter(
      (d) => !exclude.has(d)
    );
    const batch = pool.slice(0, openAILimit);
    return {
      outcomes: [
        {
          source: OPENAI_WEB_SEARCH_SOURCE,
          success: true,
          results: batch.map((domain, idx) => {
            const label = domain.split(".")[0];
            return {
              name: label.charAt(0).toUpperCase() + label.slice(1),
              domain,
              description: "YC-backed startup",
              geography: "San Francisco, CA",
              funding_stage: "seed",
              source: OPENAI_WEB_SEARCH_SOURCE,
              investors: idx % 3 === 0 ? ["Y Combinator"] : [],
              // Two of every three results are gated out as non-operating entities,
              // so a single un-broadened search can't satisfy the request.
              entity_type: idx % 3 === 0 ? "operating_startup" : "directory",
            };
          }),
          resultsRawCount: batch.length,
        },
      ],
      openaiResultCount: batch.length,
      openaiSearchUsed: true,
    };
  };

  const enrichRunner = async (companies) => ({
    companies,
    enrichedCount: companies.length,
    enrichCalls: companies.length,
  });

  const result = await runDiscoveryExpand(STRUCTURED, STRUCTURED.raw_query, {
    existingDomains,
    additionalCount: 10,
    heavySearchRunner,
    enrichRunner,
  });

  assert.equal(result.ranked.results.length, 10);
  assert.ok(call >= 2, `expected retries because a single over-fetch wasn't enough, got ${call}`);
});

test("lite mode uses extra fill attempts for non-PE mandates", async () => {
  const structured = {
    intent: "mandate_search",
    sector_tags: ["healthcare"],
    geography: ["Australia"],
    country_code: "AU",
    raw_query: "Healthcare startups in Australia",
  };

  let call = 0;
  const heavySearchRunner = async (_structured, { openAILimit, excludeDomains = [] }) => {
    call += 1;
    const exclude = new Set(excludeDomains);
    // Return only 5 new companies per call so Lite's target of 25 needs multiple fills.
    const start = (call - 1) * 5;
    const pool = Array.from({ length: 5 }, (_, i) => `au-health${start + i + 1}.com`).filter(
      (d) => !exclude.has(d)
    );
    const domains = pool.slice(0, openAILimit);
    return {
      outcomes: [
        {
          source: OPENAI_WEB_SEARCH_SOURCE,
          success: true,
          results: domains.map((domain) => {
            const label = domain.split(".")[0];
            return {
              name: label.charAt(0).toUpperCase() + label.slice(1),
              domain,
              description: "Healthcare startup",
              geography: "Sydney, Australia",
              funding_stage: "seed",
              source: OPENAI_WEB_SEARCH_SOURCE,
            };
          }),
          resultsRawCount: domains.length,
        },
      ],
      openaiResultCount: domains.length,
      openaiSearchUsed: true,
    };
  };

  const enrichRunner = async (companies) => ({
    companies,
    enrichedCount: companies.length,
    enrichCalls: companies.length,
  });

  const result = await runDiscoveryFromParsed(structured, structured.raw_query, {
    heavySearchRunner,
    enrichRunner,
    constraintMode: "lite",
  });

  // Initial search + 4 Lite fill attempts = up to 5 search calls.
  assert.ok(call >= 4, `expected Lite to use extra fill attempts, got ${call} search calls`);
  assert.equal(result.ranked.results.length, 25);
  assert.ok(result.stages.filter((s) => s.name === "heavy_search_fill").length >= 3);
});
