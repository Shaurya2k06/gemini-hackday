import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildCompanyProfileContext,
  buildCustomColumnSearchPrompt,
  validateCustomColumnQuery,
  formatCustomColumnLabel,
  normalizeResultsMap,
  extractCustomColumn,
  MAX_CUSTOM_COLUMN_QUERY_LENGTH,
} from "../../../src/chatbot/custom-column.js";
import { buildDeepDiveResearchPrompt } from "../../../src/heavy_agent/openai-enrich.js";

const SAMPLE_CARD = {
  rank: 1,
  investment_summary: "Raised $15M Series A led by Sequoia in 2023.",
  enrichment_sources: ["https://techcrunch.com/example"],
  sources: ["openai_web_enrich"],
  verification_urls: { crunchbase: "https://crunchbase.com/organization/stripe" },
  fields: {
    name: "Stripe",
    domain: "stripe.com",
    description: "Financial infrastructure",
    funding_stage: "series_c_plus",
    total_raised: 2_000_000_000,
    last_funding_date: "2023-01-01",
    investors: ["Sequoia", "a16z"],
    employees_count: 8000,
    founded_date: "2010-01-01",
    geography: "San Francisco, CA",
    annual_revenue_usd: null,
    annual_ebitda_usd: null,
    contact_email: null,
    contact_phone: null,
    sector_tags: ["fintech", "payments"],
  },
};

test("buildCompanyProfileContext includes investors and summary", () => {
  const ctx = buildCompanyProfileContext(SAMPLE_CARD);
  assert.equal(ctx.domain, "stripe.com");
  assert.ok(ctx.investors.includes("Sequoia"));
  assert.ok(ctx.investment_summary.includes("Series A"));
  assert.ok(ctx.enrichment_sources.length > 0);
});

test("buildCustomColumnSearchPrompt asks for broad web research", () => {
  const profile = buildCompanyProfileContext(SAMPLE_CARD);
  const prompt = buildCustomColumnSearchPrompt("Who led the last round?", profile);
  assert.ok(prompt.includes("Search the web broadly"));
  assert.ok(prompt.includes("stripe.com"));
  assert.ok(prompt.includes("Do not limit yourself"));
});

test("buildDeepDiveResearchPrompt asks to go beyond prior sources", () => {
  const prompt = buildDeepDiveResearchPrompt(
    {
      name: "Stripe",
      domain: "stripe.com",
      investment_summary: "Payments leader.",
      enrichment_sources: ["https://techcrunch.com/example"],
    },
    { raw_query: "fintech in SF" }
  );
  assert.ok(prompt.includes("Do not limit yourself"));
  assert.ok(prompt.includes("minimum 5 distinct URLs"));
  assert.ok(prompt.includes("leadership"));
});

test("validateCustomColumnQuery rejects empty and overlong queries", () => {
  assert.equal(validateCustomColumnQuery("").ok, false);
  assert.equal(validateCustomColumnQuery("   ").ok, false);
  assert.equal(validateCustomColumnQuery("Who led the last round?").ok, true);
  assert.equal(
    validateCustomColumnQuery("x".repeat(MAX_CUSTOM_COLUMN_QUERY_LENGTH + 1)).ok,
    false
  );
});

test("formatCustomColumnLabel truncates long queries", () => {
  assert.equal(formatCustomColumnLabel("Short"), "Short");
  const long = "Who was the lead investor in their most recent institutional round?";
  assert.ok(formatCustomColumnLabel(long).endsWith("…"));
  assert.ok(formatCustomColumnLabel(long).length <= 41);
});

test("normalizeResultsMap fills missing domains with null", () => {
  const results = normalizeResultsMap(
    { "stripe.com": "Sequoia", "https://www.ramp.com/": "Founders Fund" },
    ["stripe.com", "ramp.com", "brex.com"]
  );
  assert.equal(results["stripe.com"], "Sequoia");
  assert.equal(results["ramp.com"], "Founders Fund");
  assert.equal(results["brex.com"], null);
});

test("extractCustomColumn uses per-company web search", async () => {
  const cards = [
    SAMPLE_CARD,
    {
      ...SAMPLE_CARD,
      fields: { ...SAMPLE_CARD.fields, name: "Ramp", domain: "ramp.com" },
      investment_summary: "Corporate card for startups.",
    },
  ];

  const searchCaller = async ({ domain }) => ({
    content: JSON.stringify({
      value: domain === "stripe.com" ? "Sequoia" : "Founders Fund",
    }),
    model: "test",
  });

  const result = await extractCustomColumn(cards, "Who led their last round?", {
    searchCaller,
  });
  assert.equal(result.query, "Who led their last round?");
  assert.equal(result.results["stripe.com"], "Sequoia");
  assert.equal(result.results["ramp.com"], "Founders Fund");
});

test("extractCustomColumn rejects empty query", async () => {
  await assert.rejects(
    () => extractCustomColumn([SAMPLE_CARD], "  "),
    (err) => err.status === 400
  );
});
