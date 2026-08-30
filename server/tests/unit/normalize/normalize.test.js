import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  resolveEntities,
  nameSimilarity,
  FUZZY_NAME_THRESHOLD,
} from "../../../src/normalize/entity-resolution.js";
import {
  normalizeHeavySearchResults,
  validateUnifiedCompany,
  coerceUnifiedCompany,
} from "../../../src/normalize/index.js";
import { detectConflicts } from "../../../src/normalize/conflicts.js";
import { computeFieldConfidence } from "../../../src/normalize/confidence.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURES = JSON.parse(
  await readFile(path.join(__dirname, "../../fixtures/normalize/raw_results.json"), "utf8")
);

test("nameSimilarity merges Stripe variants above threshold", () => {
  assert.ok(nameSimilarity("Stripe", "Stripe, Inc.") >= FUZZY_NAME_THRESHOLD);
  assert.ok(nameSimilarity("Stripe", "stripe") >= FUZZY_NAME_THRESHOLD);
});

test("resolveEntities merges same company across sources by domain and fuzzy name", () => {
  const records = FIXTURES.stripe_multi_source.outcomes.flatMap((o) => o.results);
  const groups = resolveEntities(records);

  assert.equal(groups.length, 1);
  assert.equal(groups[0].domain, "stripe.com");
  assert.equal(groups[0].items.length, 4);
});

test("normalizeHeavySearchResults produces valid unified Stripe record", () => {
  const { companies, summary } = normalizeHeavySearchResults(FIXTURES.stripe_multi_source);

  assert.equal(summary.companyCount, 1);
  const stripe = companies[0];

  assert.equal(stripe.domain, "stripe.com");
  assert.equal(stripe.name, "Stripe");
  assert.ok(stripe.sources_found.includes("crunchbase"));
  assert.ok(stripe.sources_found.includes("linkedin"));
  assert.ok(stripe.sources_found.includes("github"));

  const { valid, errors } = validateUnifiedCompany(stripe);
  assert.equal(valid, true, errors.join(", "));
});

test("confidence_scores are stored per field not only per company", () => {
  const { companies } = normalizeHeavySearchResults(FIXTURES.stripe_multi_source);
  const stripe = companies[0];

  assert.ok(typeof stripe.confidence_scores.name === "number");
  assert.ok(typeof stripe.confidence_scores.domain === "number");
  assert.ok(typeof stripe.confidence_scores.description === "number");
  assert.ok(stripe.confidence_scores.name > 0);
});

test("conflicting descriptions are detected and preserved", () => {
  const { companies } = normalizeHeavySearchResults(FIXTURES.description_conflict);
  const acme = companies[0];

  assert.equal(acme.domain, "acmepay.io");
  assert.ok(acme.conflicts.length >= 1);
  const descConflict = acme.conflicts.find((c) => c.field === "description");
  assert.ok(descConflict);
  assert.equal(descConflict.values.length, 2);
  assert.ok(descConflict.values.some((v) => v.source === "crunchbase"));
  assert.ok(descConflict.values.some((v) => v.source === "wellfound"));
});

test("computeFieldConfidence boosts score when sources agree", () => {
  const agreeing = computeFieldConfidence("name", [
    { source: "crunchbase", value: "Stripe" },
    { source: "linkedin", value: "Stripe" },
  ]);
  const single = computeFieldConfidence("name", [
    { source: "github", value: "stripe" },
  ]);

  assert.ok(agreeing.confidence > single.confidence);
});

test("detectConflicts returns both values with source attribution", () => {
  const conflicts = detectConflicts({
    description: [
      { source: "crunchbase", value: "Payments infra" },
      { source: "wellfound", value: "Consumer wallet" },
    ],
  });

  assert.equal(conflicts.length, 1);
  assert.equal(conflicts[0].field, "description");
  assert.equal(conflicts[0].values.length, 2);
});

test("coerceUnifiedCompany parses string total_raised before validation", () => {
  const { valid, company } = validateUnifiedCompany(
    coerceUnifiedCompany({
      name: "Acme",
      domain: "acme.com",
      description: "B2B software",
      sector_tags: ["software"],
      funding_stage: "series_b",
      total_raised: "12000000",
      last_funding_date: null,
      investors: [],
      employees_count: "150",
      founded_date: "2018-01-01",
      geography: "Germany",
      confidence_scores: { name: 0.9 },
      sources_found: ["openai_web_search"],
      verification_urls: {},
    })
  );
  assert.equal(valid, true);
  assert.equal(company.total_raised, 12_000_000);
  assert.equal(company.employees_count, 150);
});
