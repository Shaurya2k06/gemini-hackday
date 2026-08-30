import { test } from "node:test";
import assert from "node:assert/strict";
import { formatBacktest } from "../../../src/foresight/backtest.js";

/**
 * The reporting layer is where a backtest either tells the truth about its own
 * weakness or quietly flatters itself, so the warnings are worth asserting
 * directly rather than trusting by inspection.
 */
function report(overrides = {}) {
  return {
    cutoff: "2023-06-30",
    asOf: "2026-08-30",
    horizonMonths: 38,
    candidates: 24,
    evaluated: 24,
    unresolved: 0,
    transacted: 1,
    observedRate: 0.0417,
    priorBaseRate: 0.095,
    precisionAt3: { k: 3, hits: 0, evaluated: 3, precision: 0 },
    precisionAt5: { k: 5, hits: 0, evaluated: 5, precision: 0 },
    liftOverPool: 0,
    bandBreakdown: {},
    contaminatedCount: 0,
    warnings: [],
    ranked: [
      {
        name: "Kentico",
        domain: "kentico.com",
        score: {
          score: 3.3,
          band: "watch",
          contributions: [
            {
              key: "succession_language",
              direction: "positive",
              evidence_date: "2022-07-13",
            },
          ],
        },
        outcome: { label: "none", transacted: false, outcome_date: null, counterparty: null },
      },
      {
        name: "AgriWebb",
        domain: "agriwebb.com",
        score: { score: -1, band: "dormant", contributions: [] },
        outcome: {
          label: "transacted",
          transacted: true,
          outcome_date: "2026-05-18",
          counterparty: "URUS Group LP",
        },
      },
    ],
    elapsedMs: 111557,
    ...overrides,
  };
}

test("formatBacktest states the horizon alongside the window", () => {
  const text = formatBacktest(report());
  assert.match(text, /vantage point 2023-06-30/);
  assert.match(text, /outcomes through 2026-08-30/);
  assert.match(text, /38-month horizon/, "horizon must be visible, not implied");
});

test("formatBacktest reports precision, pool rate and lift", () => {
  const text = formatBacktest(report());
  assert.match(text, /precision@3 0% \(0\/3\)/);
  assert.match(text, /precision@5 0% \(0\/5\)/);
  assert.match(text, /pool transaction rate 4%/);
  assert.match(text, /lift of top 5 over pool 0x/);
});

test("formatBacktest names the company that transacted and its counterparty", () => {
  const text = formatBacktest(report());
  assert.match(text, /AgriWebb\s+TRANSACTED 2026-05-18 URUS Group LP/);
});

test("formatBacktest shows each company's contributing signals with dates", () => {
  const text = formatBacktest(report());
  assert.match(text, /\+ succession_language \(2022-07-13\)/);
});

test("formatBacktest surfaces caveats rather than burying them", () => {
  const text = formatBacktest(
    report({ warnings: ["Only 1 positive event(s) in the pool.", "Signals decay over 38 months."] })
  );
  assert.match(text, /Caveats:/);
  assert.match(text, /Only 1 positive event/);
  assert.match(text, /Signals decay/);
});

test("formatBacktest omits the caveat block when there is nothing to warn about", () => {
  const text = formatBacktest(report({ warnings: [] }));
  assert.doesNotMatch(text, /Caveats:/);
});
