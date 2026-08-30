import { test } from "node:test";
import assert from "node:assert/strict";
import {
  hasFinancialMandate,
  buildFinancialMandateLines,
  getPeDiscoveryLimit,
  getSearchFetchLimit,
  getPeResultCap,
  buildFinancialFitSummary,
  isMandateTooVague,
  clampExpandCount,
  SHORTLIST_MAX,
} from "../../../src/heavy_agent/pe-mandate.js";
import { buildDiscoveryPrompt } from "../../../src/heavy_agent/openai-search.js";
import { assessPeQuality } from "../../../src/heavy_agent/pe-quality-gate.js";
import { buildDiscoveryResults } from "../../../src/chatbot/results.js";
import { rankCompanies } from "../../../src/ranking/index.js";

test("hasFinancialMandate detects revenue and EBITDA thresholds", () => {
  assert.equal(hasFinancialMandate({ revenue_min: 10_000_000 }), true);
  assert.equal(hasFinancialMandate({ ebitda_max: 5_000_000 }), true);
  assert.equal(hasFinancialMandate({ sector_tags: ["fintech"] }), false);
});

test("buildFinancialMandateLines formats revenue band", () => {
  const lines = buildFinancialMandateLines({
    revenue_min: 10_000_000,
    revenue_max: 50_000_000,
    employees_min: 50,
    employees_max: 200,
  });
  assert.ok(lines.some((l) => l.includes("Annual revenue")));
  assert.ok(lines.some((l) => l.includes("Employees")));
});

test("getPeDiscoveryLimit defaults to 10", () => {
  assert.equal(getPeDiscoveryLimit({ revenue_min: 1_000_000 }), 10);
  assert.equal(getPeDiscoveryLimit({ sector_tags: ["software"] }), 10);
});

test("getSearchFetchLimit overfetches before PE gate attrition", () => {
  assert.equal(getSearchFetchLimit(10), 20);
  assert.equal(getSearchFetchLimit(4), 8);
  assert.equal(getSearchFetchLimit(15), 30);
  // Lite target (25) must get a real 2x buffer, not clamp to SHORTLIST_MAX.
  assert.equal(getSearchFetchLimit(25), 50);
  assert.equal(getSearchFetchLimit(50), 50);
});

test("getPeResultCap is larger in lite mode", () => {
  assert.equal(getPeResultCap("heavy"), 10);
  assert.equal(getPeResultCap("lite"), SHORTLIST_MAX);
});

test("clampExpandCount respects shortlist max of 25", () => {
  assert.equal(SHORTLIST_MAX, 25);
  assert.equal(clampExpandCount(10, 5), 5);
  assert.equal(clampExpandCount(22, 10), 3);
  assert.equal(clampExpandCount(25, 5), 0);
});

test("buildDiscoveryPrompt includes PE financials and skips pre-2000 rule", () => {
  const prompt = buildDiscoveryPrompt(
    {
      sector_tags: ["software"],
      geography: ["Germany"],
      country_code: "DE",
      revenue_min: 10_000_000,
      revenue_max: 50_000_000,
      raw_query: "software $10M-$50M revenue Germany",
    },
    12
  );
  assert.ok(prompt.includes("Annual revenue"));
  assert.ok(!prompt.includes("founded before 2000"));
  assert.ok(prompt.includes("buyout-relevant"));
});

test("buildDiscoveryPrompt lite PE pushes recall and size estimates", () => {
  const prompt = buildDiscoveryPrompt(
    {
      sector_tags: ["retail tech"],
      geography: ["Mexico"],
      country_code: "MX",
      revenue_min: 10_000_000,
      revenue_max: 30_000_000,
      employees_min: 100,
      raw_query: "Retail tech in Mexico, $10M–$30M revenue and 100+ employees",
    },
    10,
    { constraintMode: "lite", fillPass: true }
  );
  assert.ok(prompt.includes("near-misses"));
  assert.ok(prompt.includes("Do not stop early"));
  assert.ok(prompt.includes("annual_revenue_usd"));
  assert.ok(prompt.includes("Fill pass"));
  assert.ok(prompt.includes("Target size (soft"));
  assert.ok(!prompt.includes("INCLUDE ONLY: independently operating companies headquartered"));
});

test("assessPeQuality allows pre-2000 company under PE revenue mandate", () => {
  const company = {
    name: "MatureSoft",
    domain: "maturesoft.de",
    description: "B2B software",
    founded_date: "1995-01-01",
    entity_type: "growth_company",
    domain_verified: true,
    annual_revenue_usd: 30_000_000,
    funding_stage: "unknown",
  };
  const result = assessPeQuality(company, {
    country_code: "DE",
    revenue_min: 10_000_000,
    revenue_max: 50_000_000,
  });
  assert.equal(result.pass, true);
  assert.ok(!result.reasons.some((r) => r.includes("founded_1995")));
});

test("assessPeQuality hard-fails revenue outside band", () => {
  const company = {
    name: "SmallCo",
    domain: "smallco.de",
    description: "SMB software",
    founded_date: "2015-01-01",
    entity_type: "operating_startup",
    domain_verified: true,
    annual_revenue_usd: 2_000_000,
    total_raised: 1_000_000,
    funding_stage: "seed",
  };
  const result = assessPeQuality(company, {
    revenue_min: 10_000_000,
    revenue_max: 50_000_000,
  });
  assert.equal(result.pass, false);
  assert.ok(result.hardFail);
  assert.ok(result.reasons.some((r) => r.startsWith("revenue_below_mandate")));
});

test("assessPeQuality soft-gates unknown financials for PE mandate", () => {
  const company = {
    name: "UnknownRev",
    domain: "unknownrev.de",
    description: "Software",
    founded_date: "2018-01-01",
    entity_type: "operating_startup",
    domain_verified: true,
    total_raised: 5_000_000,
    funding_stage: "series_a",
  };
  const result = assessPeQuality(company, {
    revenue_min: 10_000_000,
    revenue_max: 50_000_000,
  });
  assert.equal(result.pass, false);
  assert.ok(result.softFail);
  assert.ok(result.reasons.includes("financials_unknown_for_pe_mandate"));
});

test("PE revenue mandate ranks highrev first and buildDiscoveryResults carries fit", () => {
  const structured = {
    sector_tags: ["software"],
    revenue_min: 10_000_000,
    revenue_max: 50_000_000,
    geography: [],
    funding_stage: [],
  };
  const companies = [
    {
      name: "LowRevCo",
      domain: "lowrev.com",
      description: "enterprise software",
      sector_tags: ["software"],
      funding_stage: "series_b",
      geography: "USA",
      annual_revenue_usd: 8_000_000,
    },
    {
      name: "HighRevCo",
      domain: "highrev.com",
      description: "enterprise software",
      sector_tags: ["software"],
      funding_stage: "series_b",
      geography: "USA",
      annual_revenue_usd: 40_000_000,
    },
  ];

  const ranked = rankCompanies(structured, companies);
  assert.equal(ranked.results[0].company.domain, "highrev.com");

  const rankMetaByDomain = new Map(
    ranked.results.map((row) => [row.company.domain, row])
  );
  const discovery = buildDiscoveryResults([ranked.results[0].company], {
    structured,
    rankMetaByDomain,
  });
  assert.equal(discovery.results[0].pe_fit_score, ranked.results[0].composite_score);
  assert.equal(discovery.results[0].fit_status, "in_band");
  assert.equal(buildFinancialFitSummary(structured, companies[1]).status, "in_band");
});

test("isMandateTooVague flags generic startup-only queries", () => {
  assert.equal(
    isMandateTooVague({
      intent: "mandate_search",
      sector_tags: ["startup"],
      geography: [],
      funding_stage: [],
    }),
    true
  );
  assert.equal(
    isMandateTooVague({
      intent: "mandate_search",
      sector_tags: ["fintech"],
      geography: ["Germany"],
      funding_stage: [],
    }),
    false
  );
  assert.equal(
    isMandateTooVague({
      intent: "mandate_search",
      sector_tags: ["fintech"],
      geography: ["Germany"],
      revenue_min: 10_000_000,
    }),
    false
  );
});
