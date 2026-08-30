import { test } from "node:test";
import assert from "node:assert/strict";
import { RANKING_WEIGHTS, RANKING_DIMENSIONS } from "../../../src/ranking/weights.js";
import { scoreAllDimensions } from "../../../src/ranking/dimensions.js";
import { rankCompanies } from "../../../src/ranking/index.js";
import {
  SEED_COMPANIES,
  FINTECH_SF,
  SERIES_B_DEVTOOLS,
} from "../../fixtures/ranking/companies.js";

test("ranking weights match Section 10 defaults and sum to 1", () => {
  assert.equal(RANKING_WEIGHTS.sector_alignment, 0.34);
  assert.equal(RANKING_WEIGHTS.funding_stage_match, 0.21);
  assert.equal(RANKING_WEIGHTS.geography_match, 0.13);
  assert.equal(RANKING_WEIGHTS.founded_recency, 0.09);
  assert.equal(RANKING_WEIGHTS.employee_count_fit, 0.04);
  assert.equal(RANKING_WEIGHTS.signal_recency, 0.04);
  assert.equal(RANKING_WEIGHTS.revenue_ebitda_fit, 0.15);

  const sum = Object.values(RANKING_WEIGHTS).reduce((a, b) => a + b, 0);
  assert.ok(Math.abs(sum - 1) < 0.001);
  assert.equal(RANKING_DIMENSIONS.length, 7);
});

test("scoreAllDimensions returns all seven Section 10 dimensions", () => {
  const company = SEED_COMPANIES.find((c) => c.domain === "stripe.com");
  const scores = scoreAllDimensions(FINTECH_SF, company);

  for (const dimension of RANKING_DIMENSIONS) {
    const score = scores[dimension];
    if (score === null) continue;
    assert.ok(typeof score === "number");
    assert.ok(score >= 0 && score <= 1);
  }
  assert.equal(scores.revenue_ebitda_fit, null);
});

test("fintech SF query ranks Stripe above non-fintech companies", () => {
  const { results } = rankCompanies(FINTECH_SF, SEED_COMPANIES);
  const stripe = results.find((r) => r.company.domain === "stripe.com");
  const notion = results.find((r) => r.company.domain === "notion.so");

  assert.ok(stripe.composite_score > notion.composite_score);
  assert.ok(stripe.dimension_scores.sector_alignment >= 0.9);
  assert.ok(stripe.dimension_scores.geography_match >= 0.9);
});

test("series B devtools query ranks Linear and Replicate highly", () => {
  const { results } = rankCompanies(SERIES_B_DEVTOOLS, SEED_COMPANIES);
  const domains = results.slice(0, 5).map((r) => r.company.domain);

  assert.ok(domains.includes("linear.app"));
  assert.ok(domains.includes("replicate.com"));
});

test("results sorted by composite score descending", () => {
  const { results } = rankCompanies(FINTECH_SF, SEED_COMPANIES);

  for (let i = 1; i < results.length; i++) {
    assert.ok(results[i - 1].composite_score >= results[i].composite_score);
    assert.equal(results[i - 1].rank, i);
  }
});

test("no results returns helpful message", () => {
  const { results, message } = rankCompanies(FINTECH_SF, []);

  assert.equal(results.length, 0);
  assert.ok(message);
  assert.ok(message.toLowerCase().includes("no companies"));
});
