import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizeHeavySearchResults } from "../../../src/normalize/index.js";
import { applyCountryHardGate } from "../../../src/heavy_agent/geo.js";
import { buildDiscoveryResults } from "../../../src/chatbot/results.js";
import { OPENAI_WEB_SEARCH_SOURCE } from "../../../src/heavy_agent/openai-search.js";

/**
 * Spain agritech regression: OpenAI-sourced Spanish companies must survive;
 * Ireland/India false positives must be geo-gated out of the primary list.
 */
const SPAIN_STRUCTURED = {
  intent: "mandate_search",
  company_names: [],
  sector_tags: ["agritech"],
  funding_stage: [],
  geography: ["Spain"],
  country_code: "ES",
  region: "europe",
  employees_min: null,
  employees_max: null,
  founded_after: null,
  founded_before: null,
  revenue_min: null,
  revenue_max: null,
  ebitda_min: null,
  ebitda_max: null,
  keywords: ["agriculture", "agtech"],
  raw_query: "Agritech companies in spain",
};

const MIXED_HEAVY = {
  outcomes: [
    {
      source: OPENAI_WEB_SEARCH_SOURCE,
      success: true,
      results: [
        {
          name: "Spherag",
          domain: "spherag.com",
          geography: "Zaragoza, Spain",
          funding_stage: "seed",
          description: "Irrigation IoT for Spanish farms",
          source: OPENAI_WEB_SEARCH_SOURCE,
        },
        {
          name: "Agroptima",
          domain: "agroptima.com",
          geography: "Barcelona, Spain",
          funding_stage: "series_a",
          description: "Farm management software",
          source: OPENAI_WEB_SEARCH_SOURCE,
        },
        {
          name: "FieldPad",
          domain: "fieldpad.es",
          geography: "Elche, Spain",
          funding_stage: "seed",
          description: "Digital field notebook",
          source: OPENAI_WEB_SEARCH_SOURCE,
        },
      ],
    },
    {
      source: "linkedin",
      success: true,
      results: [
        {
          name: "AgTech Ireland",
          domain: "agtechireland.ie",
          geography: "Ireland",
          funding_stage: "unknown",
          description: "Irish agritech association",
          source: "linkedin",
        },
        {
          name: "KhetiBuddy",
          domain: "khetibuddy.com",
          geography: "India",
          funding_stage: "unknown",
          description: "Indian farm platform",
          source: "linkedin",
        },
      ],
    },
  ],
};

test("Spain agritech fixture: normalize keeps OpenAI fields", () => {
  const normalized = normalizeHeavySearchResults(MIXED_HEAVY);
  const spherag = normalized.companies.find((c) => c.domain === "spherag.com");
  assert.ok(spherag);
  assert.equal(spherag.geography, "Zaragoza, Spain");
  assert.equal(spherag.funding_stage, "seed");
  assert.ok(spherag.sources_found.includes(OPENAI_WEB_SEARCH_SOURCE));
});

test("Spain agritech fixture: geo gate removes Ireland and India", () => {
  const normalized = normalizeHeavySearchResults(MIXED_HEAVY);
  const { kept, dropped } = applyCountryHardGate(normalized.companies, SPAIN_STRUCTURED);
  assert.ok(kept.length >= 3);
  assert.ok(kept.every((c) => !/\.ie$/i.test(c.domain)));
  assert.ok(!kept.some((c) => /ireland|india/i.test(c.geography ?? "")));
  assert.ok(dropped.some((d) => d.company.domain === "agtechireland.ie"));
  assert.ok(dropped.some((d) => d.company.domain === "khetibuddy.com"));
});

test("Spain agritech fixture: primary list has no Ireland top hit", () => {
  const normalized = normalizeHeavySearchResults(MIXED_HEAVY);
  const { kept } = applyCountryHardGate(normalized.companies, SPAIN_STRUCTURED);
  const ranked = buildDiscoveryResults(kept, { structured: SPAIN_STRUCTURED });
  assert.ok(ranked.results.length >= 1);
  const topDomains = ranked.results.map((r) => r.company.domain);
  assert.ok(!topDomains.includes("agtechireland.ie"));
  assert.ok(!topDomains.includes("khetibuddy.com"));
  assert.ok(topDomains.some((d) => ["spherag.com", "agroptima.com", "fieldpad.es"].includes(d)));
});
