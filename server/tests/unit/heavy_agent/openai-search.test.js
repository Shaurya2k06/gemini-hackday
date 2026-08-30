import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildDiscoveryPrompt,
  extractJsonObject,
  normalizeStage,
  parseOpenAIDiscoveryRecord,
} from "../../../src/heavy_agent/openai-search.js";
import { parseLlmJson } from "../../../src/lib/parse-llm-json.js";

const SPAIN_STRUCTURED = {
  intent: "mandate_search",
  sector_tags: ["agritech"],
  geography: ["Spain"],
  country_code: "ES",
  raw_query: "Agritech companies in spain",
};

test("buildDiscoveryPrompt requires startups and country", () => {
  const prompt = buildDiscoveryPrompt(SPAIN_STRUCTURED, 8);
  assert.ok(prompt.includes("ES"));
  assert.ok(prompt.includes("operating companies"));
  assert.ok(prompt.includes("founded_year"));
  assert.ok(prompt.includes("founded before 2000"));
  assert.ok(prompt.includes("null when unknown"));
  assert.ok(prompt.includes("never use the bare token unknown"));
  assert.ok(prompt.includes("aim for 8 distinct matches"));
});

test("buildDiscoveryPrompt excludes domains already on shortlist", () => {
  const prompt = buildDiscoveryPrompt(SPAIN_STRUCTURED, 5, {
    excludeDomains: ["stripe.com", "ramp.com"],
  });
  assert.ok(prompt.includes("stripe.com"));
  assert.ok(prompt.includes("do NOT return these domains"));
});

test("extractJsonObject parses fenced JSON", () => {
  const raw = 'Here is data:\n```json\n{"companies":[{"name":"Groots","domain":"groots.eco"}]}\n```';
  const parsed = extractJsonObject(raw);
  assert.equal(parsed.companies.length, 1);
});

test("parseOpenAIDiscoveryRecord handles repaired founded_year unknown", () => {
  const raw =
    '{"companies":[{"name":"Ramp","domain":"ramp.com","geography":"San Francisco, CA","funding_stage":"series_b","founded_year":unknown,"description":"Corporate card startup"}]}';
  const { parsed } = parseLlmJson(raw);
  const row = parseOpenAIDiscoveryRecord(parsed.companies[0]);
  assert.equal(row.domain, "ramp.com");
  assert.equal(row.founded_date, null);
});

test("normalizeStage maps series aliases", () => {
  assert.equal(normalizeStage("Series A"), "series_a");
  assert.equal(normalizeStage("pre-seed"), "pre-seed");
  assert.equal(normalizeStage("nonsense"), "unknown");
});

test("parseOpenAIDiscoveryRecord normalizes domain and founded year", () => {
  const row = parseOpenAIDiscoveryRecord({
    name: "Spherag",
    domain: "spherag.com",
    geography: "Zaragoza, Spain",
    funding_stage: "seed",
    founded_year: 2020,
    description: "Irrigation IoT",
  });
  assert.equal(row.domain, "spherag.com");
  assert.equal(row.founded_date, "2020-01-01");
  assert.equal(row.funding_stage, "seed");
});

test("parseOpenAIDiscoveryRecord keeps estimated PE size fields", () => {
  const row = parseOpenAIDiscoveryRecord({
    name: "Cuvitek",
    domain: "cuvitek.com",
    geography: "Mexico",
    funding_stage: "unknown",
    founded_year: 2010,
    description: "Grocery retail software",
    annual_revenue_usd: 15_000_000,
    employees_count: 150,
  });
  assert.equal(row.annual_revenue_usd, 15_000_000);
  assert.equal(row.employees_count, 150);
});

const YC_STRUCTURED = {
  intent: "mandate_search",
  sector_tags: [],
  geography: ["San Francisco"],
  country_code: "US",
  keywords: ["yc backed"],
  raw_query: "YC backed startups in SF",
};

test("buildDiscoveryPrompt uses YC portfolio source guidance", () => {
  const prompt = buildDiscoveryPrompt(YC_STRUCTURED, 10);
  assert.ok(prompt.includes("Investor thesis (required): Y Combinator-backed"));
  assert.ok(prompt.includes("ycombinator.com/companies"));
  assert.ok(!prompt.includes("EXCLUDE: trade associations, conferences, government agencies, accelerators, directories"));
  assert.ok(prompt.includes("directory or accelerator organizations as companies"));
  assert.ok(prompt.includes("investors (string array — must include"));
  assert.ok(prompt.includes("Sectors: any sector"));
});

test("buildDiscoveryPrompt fill pass broadens within YC portfolio", () => {
  const prompt = buildDiscoveryPrompt(YC_STRUCTURED, 3, { broader: true, fillPass: true });
  assert.ok(prompt.includes("additional companies not already shortlisted"));
  assert.ok(prompt.includes("adjacent YC batches"));
});

test("buildDiscoveryPrompt generic mandate still excludes directories", () => {
  const prompt = buildDiscoveryPrompt(SPAIN_STRUCTURED, 8);
  assert.ok(prompt.includes("directories"));
  assert.ok(!prompt.includes("ycombinator.com/companies"));
});

const COLOMBIA_SERIES_A = {
  intent: "mandate_search",
  sector_tags: [],
  funding_stage: ["series_a"],
  geography: ["Colombia", "Bogotá"],
  country_code: "CO",
  region: "latam",
  raw_query: "Series A startups in Colombia",
};

test("buildDiscoveryPrompt uses stage-filtered LATAM source guidance", () => {
  const prompt = buildDiscoveryPrompt(COLOMBIA_SERIES_A, 10);
  assert.ok(prompt.includes("Funding stage (required): Series A"));
  assert.ok(prompt.includes("latest disclosed institutional round"));
  assert.ok(prompt.includes("Dealroom Colombia"));
  assert.ok(prompt.includes("Sectors: any sector"));
  assert.ok(prompt.includes("total_raised_usd"));
  assert.ok(!prompt.match(/EXCLUDE:.*directories/));
});

test("buildDiscoveryPrompt stage fill pass broadens within geography", () => {
  const prompt = buildDiscoveryPrompt(COLOMBIA_SERIES_A, 6, {
    broader: true,
    fillPass: true,
  });
  assert.ok(prompt.includes("not already shortlisted"));
  assert.ok(prompt.includes("still Series A"));
});
