import { test } from "node:test";
import assert from "node:assert/strict";
import {
  mergeEnrichmentIntoCompany,
  mergeDeepDiveIntoCompany,
  needsEnrichment,
  OPENAI_WEB_ENRICH_SOURCE,
  sanitizeEnrichmentAgainstMandate,
} from "../../../src/heavy_agent/openai-enrich.js";

const BASE_COMPANY = {
  name: "Spherag",
  domain: "spherag.com",
  description: "Irrigation IoT",
  sector_tags: ["agritech"],
  funding_stage: "unknown",
  geography: "Spain",
  total_raised: null,
  investors: [],
  sources_found: ["openai_web_search"],
  confidence_scores: {},
};

test("needsEnrichment returns true when investment fields missing", () => {
  assert.equal(needsEnrichment(BASE_COMPANY), true);
});

test("needsEnrichment returns false when fresh with full PE fields", () => {
  assert.equal(
    needsEnrichment(
      {
        ...BASE_COMPANY,
        total_raised: 5_000_000,
        last_funding_date: "2024-10-01",
        investors: ["Sequoia"],
        investment_summary: "Raised €3M seed in 2024.",
        entity_type: "operating_startup",
        contact_email: "hello@spherag.com",
        last_scraped_at: new Date().toISOString(),
      },
      new Date()
    ),
    false
  );
});

test("needsEnrichment returns true when funding date exists but total_raised is null", () => {
  assert.equal(
    needsEnrichment(
      {
        ...BASE_COMPANY,
        last_funding_date: "2024-10-01",
        investors: ["Mozaik Capital"],
        investment_summary: "Seed round in Oct 2024.",
        entity_type: "operating_startup",
        last_scraped_at: new Date().toISOString(),
      },
      new Date()
    ),
    true
  );
});

test("sanitizeEnrichmentAgainstMandate clears foreign HQ for Spain mandate", () => {
  const sanitized = sanitizeEnrichmentAgainstMandate(
    {
      total_raised: 3_000_000,
      funding_stage: "seed",
      domain_verified: true,
      entity_type: "operating_startup",
      investment_summary: "Raised $3M seed led by Mercantil Colpatria.",
      geography: "Bogotá, Colombia",
    },
    { name: "DemetrIA", domain: "demetria.es", geography: "Jaén, Spain" },
    { country_code: "ES", geography: ["Spain"] }
  );
  assert.equal(sanitized.total_raised, null);
  assert.equal(sanitized.domain_verified, false);
  assert.equal(sanitized.investment_summary, null);
});

test("sanitizeEnrichmentAgainstMandate clears foreign HQ for India mandate", () => {
  const sanitized = sanitizeEnrichmentAgainstMandate(
    {
      investment_summary: "Singapore-based fintech platform expanding in APAC.",
      total_raised: 1_000_000,
      geography: "Singapore",
    },
    { name: "Example", domain: "example.in", geography: "Mumbai, India" },
    { country_code: "IN", geography: ["Mumbai"] }
  );
  assert.equal(sanitized.investment_summary, null);
  assert.equal(sanitized.total_raised, null);
});

test("sanitizeEnrichmentAgainstMandate stringifies object geography", () => {
  const sanitized = sanitizeEnrichmentAgainstMandate(
    { geography: { city: "Almería", country: "Spain" } },
    { domain: "grodi.es" },
    {}
  );
  assert.equal(sanitized.geography, "Almería, Spain");
});

test("sanitizeEnrichmentAgainstMandate keeps discovery stage when enrich mismatches mandate", () => {
  const sanitized = sanitizeEnrichmentAgainstMandate(
    { funding_stage: "series_a" },
    { name: "Nowports", domain: "nowports.com", funding_stage: "unknown" },
    { funding_stage: ["series_b", "series_c_plus"] }
  );
  assert.equal(sanitized.funding_stage, "unknown");
});

test("sanitizeEnrichmentAgainstMandate allows enrich stage when it matches mandate", () => {
  const sanitized = sanitizeEnrichmentAgainstMandate(
    { funding_stage: "series_c_plus" },
    { name: "Nowports", domain: "nowports.com", funding_stage: "unknown" },
    { funding_stage: ["series_b", "series_c_plus"] }
  );
  assert.equal(sanitized.funding_stage, "series_c_plus");
});

test("mergeEnrichmentIntoCompany applies financial fields and summary", () => {
  const merged = mergeEnrichmentIntoCompany(BASE_COMPANY, {
    funding_stage: "series_a",
    total_raised: 12_000_000,
    annual_revenue_usd: 3_500_000,
    investors: ["Sequoia"],
    investment_summary: "Raised $12M Series A per TechCrunch.",
    enrichment_sources: ["https://techcrunch.com/example"],
    source: OPENAI_WEB_ENRICH_SOURCE,
  });

  assert.equal(merged.funding_stage, "series_a");
  assert.equal(merged.total_raised, 12_000_000);
  assert.equal(merged.annual_revenue_usd, 3_500_000);
  assert.deepEqual(merged.investors, ["Sequoia"]);
  assert.equal(merged.investment_summary, "Raised $12M Series A per TechCrunch.");
  assert.ok(merged.sources_found.includes(OPENAI_WEB_ENRICH_SOURCE));
});

test("mergeEnrichmentIntoCompany preserves discovery domain_verified over enrich false", () => {
  const merged = mergeEnrichmentIntoCompany(
    {
      ...BASE_COMPANY,
      domain_verified: true,
      confidence_scores: { discovery_domain_match: 0.9 },
    },
    {
      domain_verified: false,
      entity_type: "operating_startup",
      investment_summary: "Enrich said unverified.",
    }
  );
  assert.equal(merged.domain_verified, true);
});

test("mergeEnrichmentIntoCompany maps Series C+ string variants to series_c_plus", () => {
  for (const stage of ["Series C+", "series_c+", "series c plus", "Series C"]) {
    const merged = mergeEnrichmentIntoCompany(BASE_COMPANY, {
      funding_stage: stage,
      investment_summary: "Test",
    });
    assert.equal(merged.funding_stage, "series_c_plus", `failed for ${JSON.stringify(stage)}`);
  }
});

test("mergeEnrichmentIntoCompany unions investors and preserves discovery YC evidence", () => {
  const merged = mergeEnrichmentIntoCompany(
    {
      ...BASE_COMPANY,
      funding_stage: "seed",
      investors: ["Y Combinator"],
      entity_type: "operating_startup",
    },
    {
      funding_stage: "unknown",
      investors: ["Sequoia"],
      entity_type: "unknown",
      investment_summary: "",
      geography: "Unknown",
    }
  );
  assert.equal(merged.funding_stage, "seed");
  assert.ok(merged.investors.includes("Y Combinator"));
  assert.ok(merged.investors.includes("Sequoia"));
  assert.equal(merged.entity_type, "operating_startup");
  assert.equal(merged.geography, "Spain");
});

test("mergeDeepDiveIntoCompany infers Series C+ from recent_rounds when stage unknown", () => {
  const merged = mergeDeepDiveIntoCompany(
    { ...BASE_COMPANY, funding_stage: "unknown" },
    {
      funding_stage: "unknown",
      recent_rounds: [
        "Series C+, $260 million, June 18, 2026, co-led by Bicycle Capital",
      ],
    }
  );
  assert.equal(merged.funding_stage, "series_c_plus");
  assert.ok(merged.recent_rounds[0].includes("Series C+"));
});
