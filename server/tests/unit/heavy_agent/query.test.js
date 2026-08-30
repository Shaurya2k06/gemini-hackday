import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildGitHubSearchQuery,
  buildPlatformSearchQuery,
  stripFundingStageTerms,
} from "../../../src/heavy_agent/query.js";

const mumbaiStructured = {
  sector_tags: ["fintech"],
  funding_stage: ["seed"],
  geography: ["Mumbai"],
  keywords: ["seed", "fintech"],
  raw_query: "seed stage fintech companies in Mumbai",
};

test("buildGitHubSearchQuery excludes funding stage terms", () => {
  const q = buildGitHubSearchQuery(mumbaiStructured);
  assert.ok(!/\bseed\b/i.test(q), `query should not contain seed: ${q}`);
  assert.ok(q.includes("fintech"));
});

test("buildPlatformSearchQuery includes geography but not funding stage", () => {
  const q = buildPlatformSearchQuery(mumbaiStructured);
  assert.ok(q.includes("Mumbai"));
  assert.ok(!/\bseed\b/i.test(q.split(" ").filter((w) => w !== "fintech").join(" ")));
  assert.ok(q.includes("fintech"));
});

test("stripFundingStageTerms removes stage vocabulary", () => {
  const stripped = stripFundingStageTerms(["seed", "fintech", "series_a", "payments"]);
  assert.deepEqual(stripped, ["fintech", "payments"]);
});

test("Light Agent keywords carry sector synonyms without heavy-agent synonym map", () => {
  const structured = {
    sector_tags: ["agritech"],
    funding_stage: ["seed"],
    geography: ["Hyderabad", "Telangana", "India"],
    country_code: "IN",
    region: "india",
    keywords: ["agriculture", "agtech"],
    raw_query: "seed agri startups in hyd",
  };

  const platform = buildPlatformSearchQuery(structured);
  assert.ok(platform.includes("agritech"));
  assert.ok(platform.includes("agriculture"));
  assert.ok(platform.includes("Hyderabad"));
  assert.ok(!/\bseed\b/i.test(platform));

  const github = buildGitHubSearchQuery(structured);
  assert.ok(github.includes("agritech"));
  assert.ok(github.includes("agriculture"));
  assert.ok(!github.includes("Hyderabad"));
});
