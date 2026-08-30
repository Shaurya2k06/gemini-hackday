import { test } from "node:test";
import assert from "node:assert/strict";
import {
  weightFor,
  inferPopulation,
  isKnownPopulation,
  POPULATIONS,
  POPULATION_WEIGHTS,
} from "../../../src/foresight/populations.js";
import { scoreTransition } from "../../../src/foresight/transition-score.js";
import { SIGNAL_KEYS } from "../../../src/foresight/signals.js";

function sig(key, overrides = {}) {
  return {
    key,
    present: true,
    confidence: "high",
    evidence_date: "2023-01-01",
    source_url: "https://example.com/x",
    ...overrides,
  };
}

test("every population profile covers every known signal", () => {
  for (const population of POPULATIONS) {
    for (const key of SIGNAL_KEYS) {
      assert.ok(
        Object.prototype.hasOwnProperty.call(POPULATION_WEIGHTS[population], key),
        `${population} is missing a weight for ${key}`
      );
    }
  }
});

test("the two populations disagree on capital-structure signals", () => {
  // This disagreement is the entire point of splitting them.
  assert.ok(weightFor("no_institutional_capital", "founder_owned") > 0);
  assert.equal(
    weightFor("no_institutional_capital", "vc_backed"),
    0,
    "bootstrapping cannot describe a venture-backed company"
  );

  assert.ok(
    weightFor("funding_dormancy", "vc_backed") > weightFor("funding_dormancy", "founder_owned"),
    "years without a round is exit pressure for a fund, self-sufficiency for an owner"
  );
  assert.ok(
    weightFor("hiring_velocity_decay", "vc_backed") >
      weightFor("hiring_velocity_decay", "founder_owned"),
    "a stalled growth curve closes the venture path"
  );
  assert.ok(
    weightFor("recent_large_raise", "vc_backed") > weightFor("recent_large_raise", "founder_owned"),
    "a fresh round is less disqualifying for a company already on an exit path"
  );
});

test("succession language matters more to an owner-driven exit", () => {
  assert.ok(
    weightFor("succession_language", "founder_owned") >
      weightFor("succession_language", "vc_backed")
  );
});

test("unknown signals and populations degrade to zero rather than throwing", () => {
  assert.equal(weightFor("not_a_signal", "founder_owned"), 0);
  assert.equal(weightFor("advisor_engaged", "not_a_population"), 1.6, "falls back to default profile");
  assert.equal(isKnownPopulation("vc_backed"), true);
  assert.equal(isKnownPopulation("nonsense"), false);
});

// --- inference --------------------------------------------------------------

test("population is inferred from observable capital structure", () => {
  assert.equal(inferPopulation([sig("recent_large_raise")]), "vc_backed");
  assert.equal(inferPopulation([sig("no_institutional_capital")]), "founder_owned");
});

test("a recent raise outweighs other hints when inferring population", () => {
  assert.equal(
    inferPopulation([sig("founder_tenure_window"), sig("recent_large_raise")]),
    "vc_backed"
  );
});

test("inference falls back to founder_owned, the conservative choice for a buyout screen", () => {
  assert.equal(inferPopulation([]), "founder_owned");
  assert.equal(inferPopulation(null), "founder_owned");
  assert.equal(inferPopulation([sig("profitable_and_stable")]), "founder_owned");
});

test("signals marked not present do not drive inference", () => {
  assert.equal(
    inferPopulation([sig("recent_large_raise", { present: false })]),
    "founder_owned"
  );
});

// --- scoring integration ----------------------------------------------------

test("the same evidence scores differently under each population", () => {
  const signals = [sig("funding_dormancy"), sig("hiring_velocity_decay")];
  const founder = scoreTransition(signals, { population: "founder_owned" });
  const vc = scoreTransition(signals, { population: "vc_backed" });

  assert.ok(
    vc.score > founder.score,
    "dormancy plus a growth stall reads as exit pressure for a fund-backed company"
  );
  assert.equal(founder.population, "founder_owned");
  assert.equal(vc.population, "vc_backed");
});

test("AgriWebb's signal pattern is no longer penalised as a venture-backed company", () => {
  // The pattern that scored -1 and then transacted: recently raised, expanding.
  const signals = [
    sig("recent_large_raise", { evidence_date: "2022-10-11" }),
    sig("aggressive_expansion", { evidence_date: "2021-02-09" }),
    sig("founder_tenure_window", { evidence_date: "2022-10-11" }),
  ];

  const blended = scoreTransition(signals, { population: "founder_owned" });
  const correct = scoreTransition(signals, { population: "vc_backed" });

  assert.ok(blended.score < 0, "the old profile buried it");
  assert.ok(
    correct.score > blended.score,
    "reading it as venture-backed removes the mistaken penalty"
  );
});

test("signals with zero weight are recorded as uninformative, not scored", () => {
  const result = scoreTransition([sig("no_institutional_capital")], {
    population: "vc_backed",
  });
  assert.equal(result.score, 0);
  assert.equal(result.usedSignals, 0);
  assert.match(result.ignoredSignals[0].reason, /no weight for vc_backed/);
});

test("an explicit population overrides inference", () => {
  const result = scoreTransition([sig("recent_large_raise")], {
    population: "founder_owned",
  });
  assert.equal(result.population, "founder_owned");
});

test("the caveat names the population used", () => {
  const result = scoreTransition([sig("advisor_engaged")], { population: "vc_backed" });
  assert.match(result.caveat, /Scored as vc_backed/);
});
