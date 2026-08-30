import { test } from "node:test";
import assert from "node:assert/strict";
import { rankCompanies, scoreCompany } from "../../../src/ranking/index.js";
import {
  SEED_COMPANIES,
  FINTECH_SF,
  SERIES_B_DEVTOOLS,
  AI_ANY_STAGE,
} from "../../fixtures/ranking/companies.js";

const EXPLANATION_CASES = [
  {
    id: "stripe_fintech_sf",
    structured: FINTECH_SF,
    domain: "stripe.com",
    mustInclude: ["sector", "San Francisco"],
  },
  {
    id: "mercury_fintech_sf",
    structured: FINTECH_SF,
    domain: "mercury.com",
    mustInclude: ["sector", "fintech"],
  },
  {
    id: "linear_series_b_devtools",
    structured: SERIES_B_DEVTOOLS,
    domain: "linear.app",
    mustInclude: ["Funding stage", "series b"],
  },
  {
    id: "replicate_series_b_devtools",
    structured: SERIES_B_DEVTOOLS,
    domain: "replicate.com",
    mustInclude: ["Funding stage"],
  },
  {
    id: "anthropic_ai",
    structured: AI_ANY_STAGE,
    domain: "anthropic.com",
    mustInclude: ["sector"],
  },
];

for (const example of EXPLANATION_CASES) {
  test(`explanation is clear and accurate: ${example.id}`, () => {
    const company = SEED_COMPANIES.find((c) => c.domain === example.domain);
    assert.ok(company, `missing fixture company ${example.domain}`);

    const scored = scoreCompany(example.structured, company);
    assert.ok(scored.explanation.length > 20);
    assert.ok(scored.explanation.endsWith("."));

    const lower = scored.explanation.toLowerCase();
    for (const phrase of example.mustInclude) {
      assert.ok(
        lower.includes(phrase.toLowerCase()),
        `expected "${phrase}" in: ${scored.explanation}`
      );
    }
  });
}

test("ranked output includes composite score, dimension scores, and rank", () => {
  const { results } = rankCompanies(FINTECH_SF, SEED_COMPANIES);
  const top = results[0];

  assert.equal(top.rank, 1);
  assert.ok(top.composite_score > 0);
  assert.ok(top.dimension_scores);
  assert.ok(top.explanation);
});
