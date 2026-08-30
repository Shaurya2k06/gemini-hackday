import { test } from "node:test";
import assert from "node:assert/strict";
import {
  isCompanyLookupIntent,
  buildFocusedLookupStructured,
  runCompanyLookupPipeline,
  COMPANY_LOOKUP_NO_RESULTS_MESSAGE,
} from "../../../src/light_agent/company-lookup.js";
import { validateStructuredQuery } from "../../../src/light_agent/schema.js";

const CURSOR_LOOKUP = validateStructuredQuery(
  {
    intent: "company_lookup",
    company_names: ["Cursor"],
    sector_tags: [],
    funding_stage: [],
    geography: [],
    employees_min: null,
    employees_max: null,
    founded_after: null,
    founded_before: null,
    revenue_min: null,
    revenue_max: null,
    ebitda_min: null,
    ebitda_max: null,
    keywords: [],
  },
  "Tell me about cursor as an investment"
);

test("isCompanyLookupIntent detects company lookup queries", () => {
  assert.equal(isCompanyLookupIntent(CURSOR_LOOKUP), true);
  assert.equal(
    isCompanyLookupIntent({ ...CURSOR_LOOKUP, intent: "mandate_search" }),
    false
  );
});

test("buildFocusedLookupStructured uses company names only for heavy search", () => {
  const noisy = validateStructuredQuery(
    {
      intent: "company_lookup",
      company_names: ["Cursor"],
      sector_tags: ["ai"],
      funding_stage: ["series_a"],
      geography: ["San Francisco"],
      employees_min: null,
      employees_max: null,
      founded_after: null,
      founded_before: null,
      revenue_min: null,
      revenue_max: null,
      ebitda_min: null,
      ebitda_max: null,
      keywords: ["investment"],
    },
    "Tell me about cursor as an investment"
  );

  const focused = buildFocusedLookupStructured(noisy);
  assert.deepEqual(focused.keywords, ["Cursor"]);
  assert.deepEqual(focused.sector_tags, []);
  assert.deepEqual(focused.geography, []);
});

test("runCompanyLookupPipeline uses normalized companies from heavy search", async () => {
  const light = {
    structured: validateStructuredQuery(
      {
        intent: "company_lookup",
        company_names: ["Niteshift AI"],
        sector_tags: [],
        funding_stage: [],
        geography: [],
        employees_min: null,
        employees_max: null,
        founded_after: null,
        founded_before: null,
        revenue_min: null,
        revenue_max: null,
        ebitda_min: null,
        ebitda_max: null,
        keywords: [],
      },
      "tell me more about niteshift ai"
    ),
    model: "mock",
    attempts: 1,
  };

  const result = await runCompanyLookupPipeline(light, {
    skipHeavySearch: false,
    heavySearchRunner: async () => ({
      successCount: 1,
      totalResults: 1,
      outcomes: [],
      openaiResultCount: 1,
    }),
    enrichRunner: async (companies) => ({ companies, enrichedCount: 0 }),
    onNormalized: () => ({
      companies: [
        {
          name: "Niteshift AI",
          domain: "niteshift.ai",
          description: "AI company",
          sources_found: ["openai_search"],
          sector_tags: [],
          funding_stage: "unknown",
          confidence_scores: { domain_relevance: 1, entity_plausibility: 1 },
        },
      ],
      skipped: [],
    }),
  });

  assert.equal(result.ranked.results.length, 1);
  assert.equal(result.ranked.results[0].company.domain, "niteshift.ai");
  assert.ok(result.ranked.message !== COMPANY_LOOKUP_NO_RESULTS_MESSAGE);
});
