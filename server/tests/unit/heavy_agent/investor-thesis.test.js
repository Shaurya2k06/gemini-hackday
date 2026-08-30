import { test } from "node:test";
import assert from "node:assert/strict";
import {
  detectInvestorThesis,
  hasInvestorThesis,
  companyHasYcBacking,
  companyMatchesInvestorThesis,
} from "../../../src/heavy_agent/investor-thesis.js";

test("detectInvestorThesis finds YC from keywords and raw query", () => {
  assert.equal(detectInvestorThesis({ keywords: ["yc backed"] })?.id, "yc");
  assert.equal(
    detectInvestorThesis({ raw_query: "Y Combinator startups in SF" })?.id,
    "yc"
  );
  assert.equal(hasInvestorThesis({ keywords: ["y combinator"] }), true);
});

test("detectInvestorThesis finds Techstars thesis", () => {
  assert.equal(detectInvestorThesis({ keywords: ["techstars backed"] })?.id, "techstars");
});

test("companyHasYcBacking matches Y Combinator investor strings", () => {
  assert.equal(companyHasYcBacking({ investors: ["Y Combinator"] }), true);
  assert.equal(companyHasYcBacking({ investors: ["YC"] }), true);
  assert.equal(companyHasYcBacking({ investors: ["ycombinator"] }), true);
  assert.equal(companyHasYcBacking({ investors: ["Sequoia"] }), false);
});

test("companyHasYcBacking matches batch codes and ycombinator.com sources", () => {
  assert.equal(companyHasYcBacking({ investors: ["S24"] }), true);
  assert.equal(companyHasYcBacking({ investors: ["W25"] }), true);
  assert.equal(companyHasYcBacking({ investors: ["Spring 2025"] }), true);
  assert.equal(
    companyHasYcBacking({
      investors: [],
      enrichment_sources: ["https://www.ycombinator.com/companies/stripe"],
    }),
    true
  );
  assert.equal(
    companyHasYcBacking({
      investors: ["Sequoia"],
      enrichment_sources: ["https://techcrunch.com/example"],
    }),
    false
  );
});

test("companyMatchesInvestorThesis aligns company with mandate thesis", () => {
  const thesis = detectInvestorThesis({ keywords: ["yc backed"] });
  assert.equal(
    companyMatchesInvestorThesis({ investors: ["Y Combinator"] }, thesis),
    true
  );
  assert.equal(companyMatchesInvestorThesis({ investors: ["Sequoia"] }, thesis), false);
});
