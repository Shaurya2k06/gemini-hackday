import { test } from "node:test";
import assert from "node:assert/strict";
import {
  scoreTransition,
  bandForScore,
  isUsableSignal,
  rankByTransition,
} from "../../../src/foresight/transition-score.js";
import { HORIZON_BASE_RATE, baseRateForHorizon } from "../../../src/foresight/signals.js";

function sig(key, overrides = {}) {
  return {
    key,
    present: true,
    confidence: "high",
    evidence_date: "2024-03-01",
    source_url: "https://example.com/filing",
    ...overrides,
  };
}

test("unsourced signals are ignored so they cannot inflate a score", () => {
  const withSource = scoreTransition([sig("advisor_engaged")]);
  const withoutSource = scoreTransition([sig("advisor_engaged", { source_url: null })]);

  assert.ok(withSource.score > 0);
  assert.equal(withoutSource.score, 0, "a claim without a source must not move the score");
  assert.equal(withoutSource.usedSignals, 0);
  assert.equal(withoutSource.ignoredSignals[0].reason, "missing dated source");
});

test("undated signals are ignored", () => {
  const result = scoreTransition([sig("corp_dev_hire", { evidence_date: null })]);
  assert.equal(result.score, 0);
  assert.equal(result.ignoredSignals[0].reason, "missing dated source");
});

test("signals marked not present are ignored without penalty", () => {
  const result = scoreTransition([sig("advisor_engaged", { present: false })]);
  assert.equal(result.score, 0);
  assert.equal(result.ignoredSignals[0].reason, "not present");
});

test("unknown signal keys are rejected", () => {
  const result = scoreTransition([sig("vibes_are_good")]);
  assert.equal(result.score, 0);
  assert.equal(result.ignoredSignals[0].reason, "unknown signal");
});

test("duplicate observations of one signal do not stack", () => {
  const single = scoreTransition([sig("advisor_engaged")]);
  const doubled = scoreTransition([
    sig("advisor_engaged"),
    sig("advisor_engaged", { source_url: "https://example.com/other" }),
  ]);

  assert.equal(doubled.score, single.score, "repeat evidence must not double-count");
  assert.equal(doubled.ignoredSignals.some((i) => i.reason === "duplicate"), true);
});

test("negative signals reduce the score", () => {
  const positiveOnly = scoreTransition([sig("no_institutional_capital")]);
  const withNegative = scoreTransition([
    sig("no_institutional_capital"),
    sig("recent_large_raise"),
  ]);

  assert.ok(
    withNegative.score < positiveOnly.score,
    "a fresh institutional round should lower transition likelihood"
  );
  assert.equal(withNegative.negativeSignals, 1);
});

test("confidence scales a signal's contribution", () => {
  const high = scoreTransition([sig("advisor_engaged", { confidence: "high" })]);
  const medium = scoreTransition([sig("advisor_engaged", { confidence: "medium" })]);
  const low = scoreTransition([sig("advisor_engaged", { confidence: "low" })]);

  assert.ok(high.score > medium.score);
  assert.ok(medium.score > low.score);
  assert.ok(low.score > 0);
});

test("unknown confidence values fall back to medium rather than throwing", () => {
  const weird = scoreTransition([sig("advisor_engaged", { confidence: "extremely sure" })]);
  const medium = scoreTransition([sig("advisor_engaged", { confidence: "medium" })]);
  assert.equal(weird.score, medium.score);
});

test("bands escalate with score", () => {
  assert.equal(bandForScore(-1), "dormant");
  assert.equal(bandForScore(0.5), "dormant");
  assert.equal(bandForScore(1.5), "background");
  assert.equal(bandForScore(3.0), "watch");
  assert.equal(bandForScore(5.0), "elevated");
});

test("probability stays anchored to the base rate and never implies certainty", () => {
  const empty = scoreTransition([]);
  assert.ok(
    Math.abs(empty.probability - HORIZON_BASE_RATE) < 0.005,
    "a company with no signals should sit near the base rate"
  );
  assert.equal(empty.lift, 1);

  const loaded = scoreTransition([
    sig("advisor_engaged"),
    sig("corp_dev_hire"),
    sig("registry_share_transfer"),
    sig("founder_tenure_window"),
    sig("succession_language"),
    sig("no_institutional_capital"),
    sig("first_finance_hire"),
  ]);

  assert.equal(loaded.band, "elevated");
  assert.ok(loaded.lift > 2, "a stacked signal set should lift meaningfully above base rate");
  assert.ok(
    loaded.probability < 0.65,
    "even the strongest band must stay well short of certainty"
  );
});

test("every scored signal carries its citation through to the output", () => {
  const result = scoreTransition([
    sig("advisor_engaged", {
      source_url: "https://news.example.com/mandate",
      evidence_date: "2024-05-10",
      note: "Corporate finance boutique named as adviser",
    }),
  ]);

  const contribution = result.contributions[0];
  assert.equal(contribution.source_url, "https://news.example.com/mandate");
  assert.equal(contribution.evidence_date, "2024-05-10");
  assert.equal(contribution.note, "Corporate finance boutique named as adviser");
});

test("caveat states the base rate and discourages individual prediction", () => {
  const result = scoreTransition([sig("advisor_engaged")]);
  assert.match(result.caveat, /Base rate over 6 months/);
  assert.match(result.caveat, /will not transact/);
  assert.match(result.caveat, /rank outreach order/);
});

test("requireEvidence can be relaxed for exploratory scoring only", () => {
  const strict = scoreTransition([sig("advisor_engaged", { source_url: null })]);
  const relaxed = scoreTransition([sig("advisor_engaged", { source_url: null })], {
    requireEvidence: false,
  });

  assert.equal(strict.score, 0);
  assert.ok(relaxed.score > 0);
});

test("isUsableSignal guards shape as well as content", () => {
  assert.equal(isUsableSignal(null), false);
  assert.equal(isUsableSignal({}), false);
  assert.equal(isUsableSignal(sig("advisor_engaged")), true);
  assert.equal(isUsableSignal(sig("advisor_engaged", { source_url: "ftp://x" })), false);
});

test("rankByTransition orders by score then evidence depth", () => {
  const alpha = { domain: "a.com", score: scoreTransition([sig("advisor_engaged")]) };
  const beta = {
    domain: "b.com",
    score: scoreTransition([sig("advisor_engaged"), sig("corp_dev_hire")]),
  };
  const gamma = { domain: "c.com", score: scoreTransition([]) };

  assert.deepEqual(
    rankByTransition([gamma, alpha, beta]).map((x) => x.domain),
    ["b.com", "a.com", "c.com"]
  );
});

test("scoreTransition tolerates malformed input", () => {
  assert.equal(scoreTransition(null).score, 0);
  assert.equal(scoreTransition(undefined).score, 0);
  assert.equal(scoreTransition([null, undefined, 42, "x"]).score, 0);
});

// --- horizon must travel with the score ------------------------------------
// An earlier version fixed the horizon at six months while backtests evaluated
// multi-year windows, so a company correctly scored "not selling soon" counted
// as a miss for selling years later.

test("base rate scales with the horizon", () => {
  assert.ok(baseRateForHorizon(6) < baseRateForHorizon(12));
  assert.ok(baseRateForHorizon(12) < baseRateForHorizon(36));
  assert.equal(baseRateForHorizon(12), 0.03, "one year equals the annual base rate");
  assert.ok(baseRateForHorizon(600) <= 0.75, "clamped to a plausible ceiling");
  assert.throws(() => baseRateForHorizon(0), /Invalid horizonMonths/);
  assert.throws(() => baseRateForHorizon(-3), /Invalid horizonMonths/);
});

test("the reported horizon and base rate match what was requested", () => {
  const short = scoreTransition([sig("advisor_engaged")], { horizonMonths: 6 });
  const long = scoreTransition([sig("advisor_engaged")], { horizonMonths: 38 });

  assert.equal(short.horizonMonths, 6);
  assert.equal(long.horizonMonths, 38);
  assert.ok(long.baseRate > short.baseRate);
  assert.ok(
    long.probability > short.probability,
    "the same evidence implies a higher chance over a longer window"
  );
});

test("lift is horizon-invariant so ranking is unaffected by window length", () => {
  const signals = [sig("advisor_engaged"), sig("corp_dev_hire")];
  const short = scoreTransition(signals, { horizonMonths: 6 });
  const long = scoreTransition(signals, { horizonMonths: 38 });

  assert.equal(short.score, long.score, "the score itself is horizon-free");
  assert.ok(
    Math.abs(short.lift - long.lift) < 0.01,
    "lift over base rate should not depend on the window"
  );
});

test("caveat reports the horizon actually used", () => {
  const result = scoreTransition([sig("advisor_engaged")], { horizonMonths: 38 });
  assert.match(result.caveat, /Base rate over 38 months/);
});
