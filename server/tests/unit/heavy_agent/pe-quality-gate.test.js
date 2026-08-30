import { test } from "node:test";
import assert from "node:assert/strict";
import { assessPeQuality, applyPeQualityGate } from "../../../src/heavy_agent/pe-quality-gate.js";

const SPAIN_STRUCTURED = {
  geography: ["Spain"],
  country_code: "ES",
  funding_stage: [],
};

test("assessPeQuality rejects century-old incumbent (Artal-style)", () => {
  const artal = {
    name: "Artal",
    domain: "artal.net",
    description: "Family agrochemical company since 1895",
    founded_date: "1895-01-01",
    entity_type: "incumbent",
    geography: "Murcia, Spain",
    funding_stage: "unknown",
  };
  const result = assessPeQuality(artal, SPAIN_STRUCTURED);
  assert.equal(result.pass, false);
  assert.ok(result.hardFail);
  assert.ok(result.reasons.some((r) => r.includes("incumbent") || r.includes("1895")));
});

test("assessPeQuality passes operating startup with investment signal", () => {
  const startup = {
    name: "Spherag",
    domain: "spherag.com",
    description: "Irrigation IoT",
    founded_date: "2018-01-01",
    entity_type: "operating_startup",
    domain_verified: true,
    geography: "Zaragoza, Spain",
    funding_stage: "seed",
    total_raised: 3_000_000,
    last_funding_date: "2024-06-01",
    investors: ["EIC"],
  };
  const result = assessPeQuality(startup, SPAIN_STRUCTURED);
  assert.equal(result.pass, true);
});

test("applyPeQualityGate moves incumbents to dropped", () => {
  const companies = [
    {
      name: "Spherag",
      domain: "spherag.com",
      founded_date: "2018-01-01",
      entity_type: "operating_startup",
      domain_verified: true,
      total_raised: 3_000_000,
      funding_stage: "seed",
    },
    {
      name: "Artal",
      domain: "artal.net",
      founded_date: "1895-01-01",
      entity_type: "incumbent",
      funding_stage: "unknown",
    },
    {
      name: "Grupo Agrotecnología",
      domain: "grupoagrotecnologia.com",
      founded_date: "1985-01-01",
      entity_type: "growth_company",
      funding_stage: "unknown",
    },
  ];

  const { kept, dropped } = applyPeQualityGate(companies, SPAIN_STRUCTURED);
  assert.equal(kept.length, 1);
  assert.equal(kept[0].domain, "spherag.com");
  assert.equal(dropped.length, 2);
  assert.ok(dropped.some((d) => d.company.domain === "artal.net"));
});

test("applyPeQualityGate drops Series A when mandate requires Series B+", () => {
  const structured = {
    geography: ["Mexico"],
    funding_stage: ["series_b", "series_c_plus"],
  };
  const companies = [
    {
      name: "Nowports",
      domain: "nowports.com",
      funding_stage: "series_c_plus",
      domain_verified: true,
      total_raised: 10_000_000,
    },
    {
      name: "Solvento",
      domain: "solvento.ai",
      funding_stage: "series_a",
      domain_verified: true,
      total_raised: 5_000_000,
    },
  ];

  const { kept, dropped } = applyPeQualityGate(companies, structured);
  assert.equal(kept.length, 1);
  assert.equal(kept[0].domain, "nowports.com");
  assert.ok(dropped.some((d) => d.company.domain === "solvento.ai"));
  assert.ok(dropped.some((d) => d.reason.includes("stage_mismatch")));
});

test("Lite mode keeps softFail stage mismatch that Heavy drops", () => {
  const structured = {
    geography: ["Mexico"],
    funding_stage: ["series_b", "series_c_plus"],
  };
  const softFailCompany = {
    name: "Solvento",
    domain: "solvento.ai",
    funding_stage: "series_a",
    domain_verified: true,
    total_raised: 5_000_000,
    founded_date: "2019-01-01",
    entity_type: "operating_startup",
  };

  const heavy = assessPeQuality(softFailCompany, structured, { constraintMode: "heavy" });
  assert.equal(heavy.pass, false);
  assert.equal(heavy.softFail, true);
  assert.equal(heavy.hardFail, false);

  const lite = assessPeQuality(softFailCompany, structured, { constraintMode: "lite" });
  assert.equal(lite.pass, true);
  assert.equal(lite.softFail, true);
  assert.equal(lite.hardFail, false);

  const gated = applyPeQualityGate([softFailCompany], structured, { constraintMode: "lite" });
  assert.equal(gated.kept.length, 1);
  assert.equal(gated.kept[0].domain, "solvento.ai");
});

test("Lite mode keeps companies slightly above revenue band that Heavy hard-fails", () => {
  const structured = {
    geography: ["Germany"],
    country_code: "DE",
    sector_tags: ["manufacturing software"],
    revenue_min: 10_000_000,
    revenue_max: 30_000_000,
    employees_min: 100,
  };
  const nearMiss = {
    name: "Tebis AG",
    domain: "tebis.com",
    description: "CAD/CAM for manufacturing",
    founded_date: "1984-01-01",
    entity_type: "growth_company",
    domain_verified: true,
    geography: "Germany",
    funding_stage: "unknown",
    annual_revenue_usd: 45_000_000,
    employees_count: 300,
  };

  const heavy = assessPeQuality(nearMiss, structured, { constraintMode: "heavy" });
  assert.equal(heavy.pass, false);
  assert.ok(heavy.hardFail);
  assert.ok(heavy.reasons.some((r) => r.startsWith("revenue_above_mandate:")));

  const lite = assessPeQuality(nearMiss, structured, { constraintMode: "lite" });
  assert.equal(lite.pass, true);
  assert.equal(lite.hardFail, false);
  assert.equal(lite.softFail, true);
});

test("Lite mode still drops hardFail junk entities", () => {
  const artal = {
    name: "Artal",
    domain: "artal.net",
    description: "Family agrochemical company since 1895",
    founded_date: "1895-01-01",
    entity_type: "directory",
    geography: "Murcia, Spain",
    funding_stage: "unknown",
  };
  const result = assessPeQuality(artal, SPAIN_STRUCTURED, { constraintMode: "lite" });
  assert.equal(result.pass, false);
  assert.ok(result.hardFail);
});

const YC_STRUCTURED = {
  geography: ["San Francisco"],
  country_code: "US",
  keywords: ["yc backed"],
  funding_stage: [],
};

test("Lite mode skips diligence — keeps companies Heavy would soft/hard fail on fit", () => {
  const nearMiss = {
    name: "Webflow",
    domain: "webflow.com",
    description: "No-code website builder",
    founded_date: "2013-01-01",
    entity_type: "operating_startup",
    domain_verified: true,
    geography: "San Francisco, CA",
    funding_stage: "series_c_plus",
    total_raised: 300_000_000,
    investors: ["Sequoia"],
  };
  const heavy = assessPeQuality(nearMiss, YC_STRUCTURED, { constraintMode: "heavy" });
  assert.equal(heavy.pass, false);
  assert.ok(heavy.reasons.some((r) => r.startsWith("thesis_mismatch:")));

  const lite = assessPeQuality(nearMiss, YC_STRUCTURED, { constraintMode: "lite" });
  assert.equal(lite.pass, true);
  assert.equal(lite.hardFail, false);
  assert.equal(lite.softFail, true);
});

test("assessPeQuality passes YC-backed company with only Y Combinator investor", () => {
  const company = {
    name: "Shepherd",
    domain: "shepherd.com",
    description: "Enterprise AI search",
    founded_date: "2024-01-01",
    entity_type: "operating_startup",
    domain_verified: false,
    geography: "San Francisco, CA",
    funding_stage: "seed",
    investors: ["Y Combinator"],
  };
  const result = assessPeQuality(company, YC_STRUCTURED);
  assert.equal(result.pass, true);
  assert.ok(!result.reasons.includes("domain_not_verified"));
});

test("assessPeQuality passes YC company identified only by batch code", () => {
  const company = {
    name: "BatchCo",
    domain: "batchco.com",
    description: "Developer tools",
    founded_date: "2024-01-01",
    entity_type: "operating_startup",
    domain_verified: true,
    geography: "San Francisco, CA",
    funding_stage: "seed",
    investors: ["S24"],
  };
  const result = assessPeQuality(company, YC_STRUCTURED);
  assert.equal(result.pass, true);
  assert.ok(!result.reasons.some((r) => r.startsWith("thesis_mismatch:")));
});

test("assessPeQuality drops well-funded non-YC company under YC mandate", () => {
  const company = {
    name: "Webflow",
    domain: "webflow.com",
    description: "No-code website builder",
    founded_date: "2013-01-01",
    entity_type: "operating_startup",
    domain_verified: true,
    geography: "San Francisco, CA",
    funding_stage: "series_c_plus",
    total_raised: 300_000_000,
    investors: ["Sequoia", "a16z"],
  };
  const result = assessPeQuality(company, YC_STRUCTURED, { constraintMode: "heavy" });
  assert.equal(result.pass, false);
  assert.equal(result.softFail, true);
  assert.ok(result.reasons.some((r) => r.startsWith("thesis_mismatch:yc")));
});

test("Lite mode keeps thesis_mismatch as soft near-miss under YC mandate", () => {
  const company = {
    name: "Webflow",
    domain: "webflow.com",
    description: "No-code website builder",
    founded_date: "2013-01-01",
    entity_type: "operating_startup",
    domain_verified: true,
    geography: "San Francisco, CA",
    funding_stage: "series_c_plus",
    total_raised: 300_000_000,
    investors: ["Sequoia"],
  };
  const result = assessPeQuality(company, YC_STRUCTURED, { constraintMode: "lite" });
  assert.equal(result.pass, true);
  assert.equal(result.softFail, true);
  assert.ok(result.reasons.some((r) => r.startsWith("thesis_mismatch:yc")));
});

test("assessPeQuality still drops thin non-YC company under YC mandate", () => {
  const company = {
    name: "FurtherAI",
    domain: "furtherai.com",
    description: "AI insurance",
    founded_date: "2023-01-01",
    entity_type: "operating_startup",
    domain_verified: false,
    geography: "San Francisco, CA",
    funding_stage: "series_a",
  };
  const result = assessPeQuality(company, YC_STRUCTURED);
  assert.equal(result.pass, false);
});

test("Heavy PE keeps company with unknown revenue when employees are in-band", () => {
  const company = {
    name: "MittelSoft",
    domain: "mittelsoft.de",
    description: "Manufacturing software",
    founded_date: "2005-01-01",
    entity_type: "growth_company",
    domain_verified: true,
    geography: "Germany",
    funding_stage: "unknown",
    employees_count: 150,
    annual_revenue_usd: null,
  };
  const result = assessPeQuality(
    company,
    {
      geography: ["Germany"],
      country_code: "DE",
      revenue_min: 10_000_000,
      revenue_max: 30_000_000,
      employees_min: 100,
    },
    { constraintMode: "heavy" }
  );
  assert.equal(result.pass, true);
  assert.ok(result.reasons.includes("financials_unknown_for_pe_mandate"));
  assert.equal(result.softFail, false);
});

const CO_SERIES_A_STRUCTURED = {
  geography: ["Colombia"],
  country_code: "CO",
  funding_stage: ["series_a"],
};

test("assessPeQuality passes Colombian series_a with funding despite domain_not_verified", () => {
  const company = {
    name: "Yuno",
    domain: "yuno.com",
    description: "Payments infrastructure",
    founded_date: "2020-01-01",
    entity_type: "operating_startup",
    domain_verified: false,
    geography: "Bogotá, Colombia",
    funding_stage: "series_a",
    total_raised: 10_000_000,
    last_funding_date: "2023-06-01",
  };
  const result = assessPeQuality(company, CO_SERIES_A_STRUCTURED);
  assert.equal(result.pass, true);
});

test("assessPeQuality still drops series_b under series_a Colombia mandate", () => {
  const company = {
    name: "GraduatedCo",
    domain: "graduated.co",
    funding_stage: "series_b",
    domain_verified: true,
    geography: "Bogotá, Colombia",
    total_raised: 20_000_000,
  };
  const result = assessPeQuality(company, CO_SERIES_A_STRUCTURED);
  assert.equal(result.pass, false);
  assert.ok(result.reasons.some((r) => r.startsWith("stage_mismatch:")));
});
