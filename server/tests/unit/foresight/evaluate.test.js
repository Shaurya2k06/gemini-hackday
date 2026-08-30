import { test } from "node:test";
import assert from "node:assert/strict";
import {
  computeAuc,
  cohensD,
  topHalfRecall,
  interpretAuc,
  evaluateCaseControl,
  formatEvaluation,
} from "../../../src/foresight/evaluate.js";

test("perfect separation gives AUC 1 and perfect inversion gives 0", () => {
  assert.equal(computeAuc([5, 4, 3], [2, 1, 0]), 1);
  assert.equal(computeAuc([0, 1, 2], [3, 4, 5]), 0);
});

test("identical distributions give AUC 0.5, counting ties as half", () => {
  assert.equal(computeAuc([1, 1], [1, 1]), 0.5);
  assert.equal(computeAuc([2, 1], [2, 1]), 0.5);
});

test("AUC equals the probability a case outranks a control", () => {
  // 1 case, 4 controls, case beats 3 of them: 0.75 by construction.
  assert.equal(computeAuc([3], [1, 2, 4, 0]), 0.75);
});

test("AUC is undefined without both groups", () => {
  assert.equal(computeAuc([], [1, 2]), null);
  assert.equal(computeAuc([1, 2], []), null);
  assert.equal(computeAuc(null, null), null);
});

test("AUC ignores non-numeric scores rather than producing NaN", () => {
  assert.equal(computeAuc([5, null, undefined], [1]), 1);
});

test("cohensD reports the standardised gap and needs two per group", () => {
  assert.equal(cohensD([1], [0]), null);
  const d = cohensD([5, 6, 7], [1, 2, 3]);
  assert.ok(d > 2, "a four-point gap on unit spread is a large effect");
  assert.ok(cohensD([1, 2, 3], [5, 6, 7]) < 0, "sign follows direction");
});

test("cohensD returns null when there is no variance to pool", () => {
  assert.equal(cohensD([2, 2], [2, 2]), null);
});

test("topHalfRecall measures how many cases land in the better half", () => {
  const rows = [
    { label: "case", score: 10 },
    { label: "case", score: 9 },
    { label: "control", score: 2 },
    { label: "control", score: 1 },
  ];
  assert.equal(topHalfRecall(rows), 1);

  const inverted = [
    { label: "control", score: 10 },
    { label: "control", score: 9 },
    { label: "case", score: 2 },
    { label: "case", score: 1 },
  ];
  assert.equal(topHalfRecall(inverted), 0);
});

test("interpretAuc distinguishes no signal from inverted signal", () => {
  const big = { cases: 30, controls: 30 };
  assert.match(interpretAuc(0.75, big), /Strong separation/);
  assert.match(interpretAuc(0.62, big), /Modest but real/);
  assert.match(interpretAuc(0.5, big), /No separation/);
  assert.match(interpretAuc(0.35, big), /Inverted/);
  assert.match(interpretAuc(0.35, big), /wrong sign/);
  assert.match(interpretAuc(0.1, big), /Strongly inverted/);
  assert.match(interpretAuc(null, big), /undefined/);
});

test("interpretAuc flags thin samples as directional only", () => {
  assert.match(interpretAuc(0.8, { cases: 3, controls: 3 }), /Sample is thin/);
  assert.doesNotMatch(interpretAuc(0.8, { cases: 30, controls: 30 }), /Sample is thin/);
});

// --- full evaluation --------------------------------------------------------

function rows() {
  return [
    { name: "A", domain: "a.com", label: "case", score: 4.0, population: "vc_backed", cutoff: "2024-01-01" },
    { name: "B", domain: "b.com", label: "case", score: 3.5, population: "founder_owned", cutoff: "2024-02-01" },
    { name: "C", domain: "c.com", label: "control", score: 1.0, population: "vc_backed", cutoff: "2024-01-01" },
    { name: "D", domain: "d.com", label: "control", score: 0.5, population: "founder_owned", cutoff: "2024-01-01" },
  ];
}

test("evaluateCaseControl computes separation and splits by population", () => {
  const report = evaluateCaseControl(rows());

  assert.equal(report.cases, 2);
  assert.equal(report.controls, 2);
  assert.equal(report.auc, 1);
  assert.ok(report.meanCaseScore > report.meanControlScore);
  assert.equal(report.populationAuc.vc_backed.cases, 1);
  assert.equal(report.populationAuc.founder_owned.cases, 1);
  assert.match(report.interpretation, /Strong separation/);
});

test("evaluateCaseControl warns on thin samples and on inversion", () => {
  const thin = evaluateCaseControl(rows());
  assert.ok(thin.warnings.some((w) => /Thin sample/.test(w)));

  const inverted = evaluateCaseControl([
    { label: "case", score: 0, population: "vc_backed" },
    { label: "control", score: 5, population: "vc_backed" },
  ]);
  assert.equal(inverted.auc, 0);
  assert.ok(
    inverted.warnings.some((w) => /inverted/i.test(w)),
    "an inversion must be called out as a sign error"
  );
});

test("evaluateCaseControl tolerates an empty or malformed set", () => {
  const empty = evaluateCaseControl([]);
  assert.equal(empty.auc, null);
  assert.match(empty.interpretation, /undefined/);
  assert.equal(evaluateCaseControl(null).cases, 0);
});

test("formatEvaluation surfaces AUC, populations, ranking and caveats", () => {
  const data = rows();
  const text = formatEvaluation(evaluateCaseControl(data), data);

  assert.match(text, /2 cases \(transacted\) vs 2 controls/);
  assert.match(text, /AUC 1/);
  assert.match(text, /By population:/);
  assert.match(text, /Ranking \(score · population · label\):/);
  assert.match(text, /CASE/);
  assert.match(text, /control/);
  assert.match(text, /Caveats:/);
});
