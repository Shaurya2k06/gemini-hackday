import { test } from "node:test";
import assert from "node:assert/strict";
import {
  hasFundingStageMandate,
  formatStageMandateLabel,
  isStrictSingleStageMandate,
  buildStageSourceHint,
} from "../../../src/heavy_agent/stage-mandate.js";

test("hasFundingStageMandate detects non-empty funding_stage", () => {
  assert.equal(hasFundingStageMandate({ funding_stage: ["series_a"] }), true);
  assert.equal(hasFundingStageMandate({ funding_stage: [] }), false);
  assert.equal(hasFundingStageMandate({ funding_stage: ["unknown"] }), false);
});

test("formatStageMandateLabel maps enums to labels", () => {
  assert.equal(formatStageMandateLabel(["series_a"]), "Series A");
  assert.equal(formatStageMandateLabel(["series_b", "series_c_plus"]), "Series B / Series C+");
});

test("isStrictSingleStageMandate is true for one stage only", () => {
  assert.equal(isStrictSingleStageMandate({ funding_stage: ["series_a"] }), true);
  assert.equal(
    isStrictSingleStageMandate({ funding_stage: ["series_b", "series_c_plus"] }),
    false
  );
});

test("buildStageSourceHint includes Dealroom for Colombia", () => {
  const hint = buildStageSourceHint({ country_code: "CO", region: "latam" });
  assert.ok(hint.includes("Dealroom Colombia"));
});
