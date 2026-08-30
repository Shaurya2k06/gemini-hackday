import { test } from "node:test";
import assert from "node:assert/strict";
import {
  scoreEntityPlausibility,
  DOMAIN_RESOLUTION_PLAUSIBILITY_THRESHOLD,
} from "../../../src/heavy_agent/entity-plausibility.js";
import { PRIMARY_PLAUSIBILITY_THRESHOLD } from "../../../src/ranking/plausibility.js";

const LOW_EXAMPLES = [
  { name: "Global Fintech Fest", label: "Global Fintech Fest" },
  { name: "India FinTech Forum", label: "India FinTech Forum" },
  { name: "Mumbai FinTech Hub", label: "Mumbai FinTech Hub" },
  { name: "FinTech-National Startup Awards 2020", label: "FinTech-National Startup Awards 2020" },
  { name: "Fintech", label: "generic Fintech" },
  { name: "AFRICA FinTech", label: "AFRICA FinTech" },
];

test("regional false positives score below primary threshold", () => {
  for (const { name, label } of LOW_EXAMPLES) {
    const { score, reasons } = scoreEntityPlausibility({ name });
    assert.ok(
      score < PRIMARY_PLAUSIBILITY_THRESHOLD,
      `${label} expected < ${PRIMARY_PLAUSIBILITY_THRESHOLD}, got ${score} (${reasons.join(", ")})`
    );
  }
});

test("legitimate company names score high (false-negative guard)", () => {
  for (const name of ["bonify", "Flow Fintech", "Stripe", "Razorpay"]) {
    const { score } = scoreEntityPlausibility({ name });
    assert.ok(score >= 0.7, `${name} expected >= 0.7, got ${score}`);
  }
});

test("low plausibility skips domain resolution", () => {
  const { skip_domain_resolution, score } = scoreEntityPlausibility({
    name: "Global Fintech Fest",
  });
  assert.ok(score < DOMAIN_RESOLUTION_PLAUSIBILITY_THRESHOLD);
  assert.equal(skip_domain_resolution, true);
});
