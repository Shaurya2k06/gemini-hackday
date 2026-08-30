import { test } from "node:test";
import assert from "node:assert/strict";
import { rankCompanies } from "../../../src/ranking/index.js";
import { PRIMARY_PLAUSIBILITY_THRESHOLD } from "../../../src/ranking/plausibility.js";

const FINTECH_SF = {
  sector_tags: ["fintech"],
  funding_stage: [],
  geography: ["San Francisco"],
  keywords: [],
  raw_query: "fintech companies San Francisco",
};

function makeCompany(name, domain, plausibility) {
  return {
    name,
    domain,
    description: "Fintech payments platform",
    sector_tags: ["fintech"],
    funding_stage: "seed",
    geography: "San Francisco",
    confidence_scores: { entity_plausibility: plausibility },
    sources_found: ["crunchbase"],
    verification_urls: {},
  };
}

test("high-plausibility company outranks conference with equal mandate fit", () => {
  const companies = [
    makeCompany("Global Fintech Fest", "globalfintechfest.com", 0.15),
    makeCompany("PayFlow Inc", "payflow.io", 0.95),
  ];

  const { results, other_results } = rankCompanies(FINTECH_SF, companies);

  assert.equal(results.length, 1);
  assert.equal(results[0].company.domain, "payflow.io");
  assert.equal(other_results.length, 1);
  assert.equal(other_results[0].company.domain, "globalfintechfest.com");
  assert.ok(results[0].composite_score > other_results[0].composite_score);
  assert.ok(other_results[0].explanation.toLowerCase().includes("verify"));
});

test("entities below primary threshold land in other_results", () => {
  const { results, other_results } = rankCompanies(FINTECH_SF, [
    makeCompany("India FinTech Forum", "indiafintech.com", 0.2),
  ]);

  assert.equal(results.length, 0);
  assert.equal(other_results.length, 1);
  assert.ok(0.2 < PRIMARY_PLAUSIBILITY_THRESHOLD);
});
