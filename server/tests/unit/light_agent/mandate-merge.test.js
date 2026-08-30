import { test } from "node:test";
import assert from "node:assert/strict";
import {
  normalizeMandateStructure,
  mergeIncrementalMandate,
  looksLikeLocationFragment,
  rebuildFromAccumulatedText,
  extractSyntaxPatch,
  parseFragmentDeterministic,
  reconcileMandateStructured,
  mergeFieldAddition,
  extractFinancialRanges,
  classifyToken,
} from "../../../src/light_agent/mandate-merge.js";
import { structuredToPills } from "../../../src/light_agent/pills.js";
import { lookupCountry } from "../../../src/light_agent/geo/countries.js";

const EMPTY_SCALARS = {
  employees_min: null,
  employees_max: null,
  founded_after: null,
  founded_before: null,
  revenue_min: null,
  revenue_max: null,
  ebitda_min: null,
  ebitda_max: null,
};

function mockLlm(overrides = {}) {
  return {
    intent: "mandate_search",
    company_names: [],
    sector_tags: [],
    funding_stage: [],
    geography: [],
    keywords: [],
    country_code: null,
    region: null,
    ...EMPTY_SCALARS,
    ...overrides,
  };
}

test("ISO lookup resolves bosnia sweden uruguay", () => {
  assert.equal(lookupCountry("bosnia")?.name, "Bosnia and Herzegovina");
  assert.equal(lookupCountry("sweden")?.name, "Sweden");
  assert.equal(lookupCountry("uruguay")?.name, "Uruguay");
});

test("normalizeMandateStructure moves Delhi from keywords via abbrev", () => {
  const result = normalizeMandateStructure({
    intent: "mandate_search",
    company_names: [],
    sector_tags: [],
    funding_stage: [],
    geography: ["Hyderabad", "Telangana", "India"],
    country_code: "IN",
    region: "india",
    keywords: ["startup", "Delhi"],
    ...EMPTY_SCALARS,
  });

  assert.ok(result.geography.some((g) => /delhi/i.test(g)));
  assert.ok(!result.keywords.some((k) => /delhi/i.test(k)));
  assert.equal(result.keywords.length, 0);
});

test("rebuildFromAccumulatedText syntax-only classifies ISO countries", () => {
  const result = rebuildFromAccumulatedText("startups from bosnia or sweden or uruguay");

  assert.ok(result.geography.some((g) => /bosnia/i.test(g)));
  assert.ok(result.geography.some((g) => /sweden/i.test(g)));
  assert.ok(result.geography.some((g) => /uruguay/i.test(g)));
  assert.ok(!result.keywords.some((k) => /bosnia|sweden|uruguay/i.test(k)));
});

test("reconcile preserves LLM geography and unions syntax stages", () => {
  const llm = mockLlm({
    geography: ["Bosnia and Herzegovina", "Sweden", "Uruguay"],
    keywords: ["startups"],
    funding_stage: [],
  });

  const result = reconcileMandateStructured(
    "series b or c startups from bosnia or sweden or uruguay",
    llm
  );

  assert.ok(result.geography.some((g) => /bosnia/i.test(g)));
  assert.ok(result.geography.some((g) => /sweden/i.test(g)));
  assert.ok(result.geography.some((g) => /uruguay/i.test(g)));
  assert.ok(result.funding_stage.includes("series_b"));
  assert.ok(result.funding_stage.includes("series_c_plus"));
  assert.equal(result.country_code, null);
});

test("rebuildFromAccumulatedText with LLM primary for cities and countries", () => {
  const llm = mockLlm({
    geography: ["Berlin", "Germany"],
    keywords: ["startup"],
    funding_stage: [],
    country_code: "DE",
    region: "europe",
  });

  const result = rebuildFromAccumulatedText(
    "startup in berlin, germany, seed, series a, series b",
    llm
  );

  assert.ok(result.geography.some((g) => /berlin/i.test(g)));
  assert.ok(result.geography.some((g) => /germany/i.test(g)));
  assert.equal(result.geography.filter((g) => /berlin/i.test(g)).length, 1);
  assert.ok(result.funding_stage.includes("seed"));
  assert.ok(result.funding_stage.includes("series_a"));
  assert.ok(result.funding_stage.includes("series_b"));
});

test("structuredToPills does not duplicate geography", () => {
  const pills = structuredToPills({
    geography: ["Berlin", "Germany", "Berlin"],
    sector_tags: [],
    funding_stage: ["seed"],
    keywords: ["startup"],
  });

  const berlinPills = pills.filter((p) => p.category === "Geography" && /berlin/i.test(p.label));
  assert.equal(berlinPills.length, 1);
  assert.ok(pills.some((p) => p.category === "Funding stage" && p.label === "Seed"));
});

test("extractSyntaxPatch handles stage-only fragments", () => {
  const patch = extractSyntaxPatch("series a");
  assert.deepEqual(patch.funding_stage, ["series_a"]);
  assert.equal(patch.keywords.length, 0);
});

test("parseFragmentDeterministic is alias for extractSyntaxPatch", () => {
  assert.equal(parseFragmentDeterministic, extractSyntaxPatch);
});

test("mergeIncrementalMandate adds Delhi to existing Hyderabad mandate", () => {
  const prior = {
    intent: "mandate_search",
    geography: ["Hyderabad", "Telangana", "India"],
    country_code: "IN",
    region: "india",
    keywords: ["startup"],
    sector_tags: [],
    funding_stage: [],
    ...EMPTY_SCALARS,
  };

  const merged = mergeIncrementalMandate(prior, { keywords: ["delhi"] }, "delhi");
  assert.ok(merged.geography.some((g) => /hyderabad/i.test(g)));
  assert.ok(merged.geography.some((g) => /delhi/i.test(g)));
  assert.ok(!merged.keywords.some((k) => /delhi/i.test(k)));
});

test("extractSyntaxPatch handles series b or c with ISO countries", () => {
  const patch = extractSyntaxPatch("series b or c startups from netherlands or japan");
  assert.ok(patch.funding_stage.includes("series_b"));
  assert.ok(patch.funding_stage.includes("series_c_plus"));
  assert.ok(patch.geography.some((g) => /netherlands/i.test(g)));
  assert.ok(patch.geography.some((g) => /japan/i.test(g)));
});

test("extractSyntaxPatch expands Series B+ to B and later stages", () => {
  const patch = extractSyntaxPatch("Logistics software in Mexico, Series B+");
  assert.ok(patch.funding_stage.includes("series_b"));
  assert.ok(patch.funding_stage.includes("series_c_plus"));
  assert.equal(patch.funding_stage.includes("series_a"), false);
});

test("relocate misfiled countries from LLM keywords via ISO", () => {
  const result = normalizeMandateStructure(
    mockLlm({
      geography: [],
      keywords: ["startups", "bosnia", "sweden", "uruguay"],
    })
  );

  assert.ok(result.geography.some((g) => /bosnia/i.test(g)));
  assert.ok(result.geography.some((g) => /sweden/i.test(g)));
  assert.ok(result.geography.some((g) => /uruguay/i.test(g)));
  assert.ok(!result.keywords.some((k) => /bosnia|sweden|uruguay/i.test(k)));
});

test("looksLikeLocationFragment detects city-only follow-ups", () => {
  assert.equal(looksLikeLocationFragment("delhi"), true);
  assert.equal(looksLikeLocationFragment("sweden"), true);
  assert.equal(looksLikeLocationFragment("recently funded"), false);
});

test("extractSyntaxPatch finds an unlisted city via preposition (prayagraj)", () => {
  const patch = extractSyntaxPatch("agricultural startups in prayagraj");
  // Sectors are LLM-owned — deterministic patch does not invent agritech
  assert.equal(patch.sector_tags.length, 0);
  assert.ok(patch.geography.some((g) => /prayagraj/i.test(g)));
  assert.ok(!patch.keywords.includes("startups"));
  assert.ok(!patch.keywords.some((k) => /prayagraj/i.test(k)));
});

test("extractSyntaxPatch preposition heuristic covers based in / from / near", () => {
  assert.ok(extractSyntaxPatch("fintech based in coimbatore").geography.some((g) => /coimbatore/i.test(g)));
  assert.ok(extractSyntaxPatch("startups from siliguri").geography.some((g) => /siliguri/i.test(g)));
  assert.ok(extractSyntaxPatch("companies near jamshedpur").geography.some((g) => /jamshedpur/i.test(g)));
});

test("rebuildFromAccumulatedText backstops unlisted city even when LLM misses it", () => {
  const llm = mockLlm({
    sector_tags: ["agritech"],
    keywords: ["startups"],
  });

  const result = rebuildFromAccumulatedText("agricultural startups in prayagraj", llm);

  assert.ok(result.geography.some((g) => /prayagraj/i.test(g)));
  assert.ok(result.sector_tags.includes("agritech"));
  assert.ok(!result.keywords.some((k) => /prayagraj/i.test(k)));
});

test("normalizeMandateStructure splits a glued keyword phrase instead of leaving it joined", () => {
  const result = normalizeMandateStructure(
    mockLlm({
      sector_tags: ["agritech"],
      keywords: ["agricultural prayagraj"],
    })
  );

  assert.ok(!result.keywords.includes("agricultural prayagraj"));
  assert.ok(result.sector_tags.includes("agritech"));
  // prayagraj may remain as keyword if not relocated to geo without a preposition
  assert.ok(!result.keywords.some((k) => /agricultural/i.test(k)));
});

test("keywords never duplicate an entry already present in geography or sector_tags", () => {
  const result = normalizeMandateStructure(
    mockLlm({
      geography: ["Prayagraj"],
      sector_tags: ["agritech"],
      keywords: ["prayagraj", "agritech", "startups"],
    })
  );

  assert.deepEqual(result.keywords, []);
});

test("normalizeMandateStructure splits jodhpur and darjeeling and cleans keyword noise", () => {
  const result = normalizeMandateStructure(
    mockLlm({
      geography: [
        "Jodhpur",
        "Rajasthan",
        "India",
        "Darjeeling",
        "West Bengal",
        "Jodhpur And Darjeeling",
      ],
      sector_tags: ["biotech"],
      keywords: ["startup", "biotechnology", "startups"],
    })
  );

  assert.ok(result.geography.some((g) => /jodhpur/i.test(g)));
  assert.ok(result.geography.some((g) => /darjeeling/i.test(g)));
  assert.ok(!result.geography.some((g) => /jodhpur and darjeeling/i.test(g)));
  assert.ok(result.sector_tags.includes("biotech"));
  assert.ok(!result.keywords.some((k) => /biotech/i.test(k)));
  assert.equal(result.keywords.length, 0);
});

test("normalizeMandateStructure drops mandate filler words from keywords", () => {
  const result = normalizeMandateStructure(
    mockLlm({
      geography: ["Noida", "Uttar Pradesh", "India", "Bangalore", "Karnataka", "Bengaluru"],
      funding_stage: ["series_a"],
      keywords: ["Give", "me", "startups"],
    })
  );

  assert.deepEqual(result.keywords, []);
  assert.ok(result.geography.some((g) => /noida/i.test(g)));
  assert.ok(result.geography.some((g) => /bangalore|bengaluru/i.test(g)));
  assert.ok(result.funding_stage.includes("series_a"));
});

test("normalizeMandateStructure keeps thesis keywords and drops command filler", () => {
  const q = "Give me series b startups in Tokyo, Recently funded, B2B, and tech related";
  const result = reconcileMandateStructured(q, {
    intent: "mandate_search",
    company_names: [],
    geography: ["Tokyo", "Japan"],
    sector_tags: ["technology"],
    funding_stage: ["series_b"],
    keywords: [
      "recently",
      "funded",
      "b2b",
      "business",
      "to",
      "Give",
      "me",
      "startups",
      "tech",
      "related",
      "recently funded",
      "tech related",
    ],
  });

  assert.ok(result.geography.some((g) => /tokyo/i.test(g)));
  assert.ok(result.funding_stage.includes("series_b"));
  assert.ok(result.sector_tags.includes("technology"));
  assert.ok(!result.sector_tags.includes("b2b"));
  assert.ok(result.keywords.some((k) => /recently funded/i.test(k)));
  assert.ok(result.keywords.some((k) => /^b2b$/i.test(k)));
  assert.ok(!result.keywords.some((k) => /^(give|me|startups|related|business|to|tech)$/i.test(k)));
});

test("extractSyntaxPatch preserves recently funded as a keyword phrase", () => {
  const patch = extractSyntaxPatch("Recently funded");
  assert.ok(patch.keywords.some((k) => /recently funded/i.test(k)));
  assert.ok(!patch.keywords.includes("Recently"));
  assert.ok(!patch.keywords.includes("funded"));
});

test("revenue ranges become financial fields; sectors normalize without alias merge", () => {
  const q = "Climate tech in the US, $15M–$40M revenue";
  const result = reconcileMandateStructured(q, {
    intent: "mandate_search",
    company_names: [],
    geography: ["United States"],
    // LLM should emit one tag; if it errs with synonyms + generic tech, we only
    // drop exact-normalize dupes and ultra-generic technology — not semantic aliases.
    sector_tags: ["climate_tech", "climate tech", "technology"],
    funding_stage: [],
    keywords: ["15m-$40m"],
    revenue_min: 15_000_000,
    revenue_max: 40_000_000,
  });

  assert.deepEqual(result.sector_tags, ["climate tech"]);
  assert.equal(result.revenue_min, 15_000_000);
  assert.equal(result.revenue_max, 40_000_000);
  assert.ok(!result.keywords.some((k) => /15m|40m|\$/i.test(k)));
});

test("extractFinancialRanges parses dollar bands and employee counts", () => {
  const money = extractFinancialRanges("$15M–$40M revenue");
  assert.equal(money.revenue_min, 15_000_000);
  assert.equal(money.revenue_max, 40_000_000);

  const headcount = extractFinancialRanges("50-200 employees");
  assert.equal(headcount.employees_min, 50);
  assert.equal(headcount.employees_max, 200);
});

test("employee min-plus and sector debris do not become keywords", () => {
  const q = "Media tech in Australia, $10M–$30M revenue and 100+ employees";
  const finances = extractFinancialRanges(q);
  assert.equal(finances.employees_min, 100);
  assert.equal(finances.revenue_min, 10_000_000);
  assert.equal(finances.revenue_max, 30_000_000);

  const result = reconcileMandateStructured(q, {
    intent: "mandate_search",
    company_names: [],
    geography: ["Australia"],
    sector_tags: ["media_tech"],
    funding_stage: [],
    keywords: ["media", "100+", "employees"],
    revenue_min: 10_000_000,
    revenue_max: 30_000_000,
    employees_min: 100,
    employees_max: null,
  });

  assert.deepEqual(result.sector_tags, ["media tech"]);
  assert.equal(result.employees_min, 100);
  assert.deepEqual(result.keywords, []);
});

test("multiple distinct sectors are preserved as separate tags", () => {
  const result = normalizeMandateStructure(
    mockLlm({
      sector_tags: ["Health Care", "mediatech", "health_care"],
      keywords: ["healthcare", "media"],
    })
  );

  assert.deepEqual(result.sector_tags, ["health care", "mediatech"]);
  assert.deepEqual(result.keywords, []);
});

test("extractSyntaxPatch splits multiple cities after in (jodhpur and darjeeling)", () => {
  const patch = extractSyntaxPatch("biotech startups in jodhpur and darjeeling");
  // No deterministic sector invention
  assert.equal(patch.sector_tags.length, 0);
  assert.ok(patch.geography.some((g) => /jodhpur/i.test(g)));
  assert.ok(patch.geography.some((g) => /darjeeling/i.test(g)));
  assert.ok(!patch.geography.some((g) => /and/i.test(g)));
});

test("europe and other macro-regions classify as geography, not keywords", () => {
  const patch = extractSyntaxPatch("europe");
  assert.ok(patch.geography.some((g) => /europe/i.test(g)));
  assert.equal(patch.keywords.length, 0);

  const result = normalizeMandateStructure(
    mockLlm({
      geography: ["Australia"],
      sector_tags: ["mediatech"],
      keywords: ["europe", "apac"],
    })
  );

  assert.ok(result.geography.some((g) => /australia/i.test(g)));
  assert.ok(result.geography.some((g) => /europe/i.test(g)));
  assert.ok(result.geography.some((g) => /apac/i.test(g)));
  assert.ok(!result.keywords.some((k) => /europe|apac/i.test(k)));
  assert.equal(looksLikeLocationFragment("europe"), true);
  assert.equal(looksLikeLocationFragment("EU"), true);
});

test("mergeFieldAddition appends geography without re-parsing full mandate", () => {
  const prior = mockLlm({
    geography: ["Delhi"],
    sector_tags: ["fintech"],
    keywords: ["startup"],
  });

  const merged = mergeFieldAddition(prior, "geography", "mumbai");
  assert.ok(merged.geography.some((g) => /delhi/i.test(g)));
  assert.ok(merged.geography.some((g) => /mumbai/i.test(g)));
});

test("mergeFieldAddition appends a freeform sector without alias rewriting", () => {
  const prior = mockLlm({
    geography: ["Australia"],
    sector_tags: ["fintech"],
  });
  const merged = mergeFieldAddition(prior, "sector_tags", "Climate Tech");
  assert.ok(merged.sector_tags.includes("fintech"));
  assert.ok(merged.sector_tags.includes("climate tech"));
});

test("mergeIncrementalMandate keeps prior tech keyword when healthcare is added", () => {
  const prior = mockLlm({
    geography: ["San Francisco", "California", "United States"],
    sector_tags: [],
    keywords: ["tech"],
  });
  const next = mergeIncrementalMandate(
    prior,
    { sector_tags: ["healthcare"], keywords: [] },
    "healthcare"
  );
  assert.ok(next.keywords.includes("tech"));
  assert.ok(next.sector_tags.includes("healthcare"));
  assert.ok(next.geography.some((g) => /san francisco/i.test(g)));
});

test("normalizeMandateStructure promotes demoted tech sector into keywords", () => {
  const result = normalizeMandateStructure(
    mockLlm({
      geography: ["San Francisco"],
      sector_tags: ["tech", "healthcare"],
      keywords: [],
    })
  );
  assert.ok(result.sector_tags.includes("healthcare"));
  assert.ok(!result.sector_tags.includes("tech"));
  assert.ok(result.keywords.includes("tech"));
});

test("rebuildFromAccumulatedText preserves YC backed as keyword phrase", () => {
  const llm = mockLlm({
    geography: ["San Francisco", "California", "United States"],
    country_code: "US",
    region: "us",
    keywords: ["yc backed"],
  });
  const result = rebuildFromAccumulatedText("YC backed startups in SF", llm);

  assert.ok(result.keywords.some((k) => /yc backed|y combinator/i.test(k)));
  assert.ok(result.geography.some((g) => /san francisco/i.test(g)));
  assert.equal(result.sector_tags.length, 0);
});

test("classifyToken maps yc to y combinator keyword", () => {
  const result = classifyToken("yc");
  assert.equal(result.kind, "keyword");
  assert.equal(result.value, "y combinator");
});
