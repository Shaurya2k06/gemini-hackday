/**
 * Pure transition scoring.
 *
 * Turns a set of observed signals into a calibrated likelihood band. Kept free
 * of I/O so it can be tested exhaustively and so a backtest can re-score
 * historical snapshots deterministically.
 *
 * Design constraints that matter more than the maths:
 *  - Every contributing signal must carry dated, cited evidence, otherwise it
 *    is ignored. Unsourced assertions must never move a score.
 *  - Output is a probability *band* plus lift over the base rate, never a bare
 *    "this company will sell". At a ~1.5% six-month base rate, even the top
 *    band is more likely wrong than right, and the UI must not hide that.
 */

import {
  SIGNALS,
  NEGATIVE_SIGNAL_KEYS,
  DEFAULT_HORIZON_MONTHS,
  baseRateForHorizon,
  isKnownSignal,
} from "./signals.js";

/** Confidence in an observation, as reported by extraction. */
const CONFIDENCE_FACTORS = { high: 1, medium: 0.65, low: 0.3 };

const BANDS = [
  { name: "elevated", minScore: 4.0 },
  { name: "watch", minScore: 2.5 },
  { name: "background", minScore: 1.0 },
  { name: "dormant", minScore: -Infinity },
];

function confidenceFactor(value) {
  return CONFIDENCE_FACTORS[String(value ?? "medium").toLowerCase()] ?? CONFIDENCE_FACTORS.medium;
}

/**
 * A signal only counts when it is present, recognised, and evidenced.
 * `requireEvidence` is on by default precisely so that a model that asserts a
 * signal without a source cannot inflate the score.
 */
export function isUsableSignal(signal, { requireEvidence = true } = {}) {
  if (!signal || typeof signal !== "object") return false;
  if (!isKnownSignal(signal.key)) return false;
  if (signal.present !== true) return false;
  if (!requireEvidence) return true;
  const hasSource = typeof signal.source_url === "string" && /^https?:\/\//i.test(signal.source_url);
  const hasDate = typeof signal.evidence_date === "string" && signal.evidence_date.length >= 7;
  return hasSource && hasDate;
}

/** Logistic squash. `midpoint` is the score treated as even odds of the band. */
function logistic(x, midpoint, steepness) {
  return 1 / (1 + Math.exp(-steepness * (x - midpoint)));
}

export function bandForScore(score) {
  return BANDS.find((band) => score >= band.minScore).name;
}

/**
 * Score a company's transition likelihood from its observed signals.
 *
 * @param signals array of { key, present, confidence, evidence_date, source_url, note }
 * @param options.horizonMonths window the probability refers to. Callers running
 *        a backtest must pass the same span they will evaluate over.
 */
export function scoreTransition(
  signals,
  { requireEvidence = true, horizonMonths = DEFAULT_HORIZON_MONTHS } = {}
) {
  const baseRate = baseRateForHorizon(horizonMonths);
  const list = Array.isArray(signals) ? signals : [];
  const contributions = [];
  const ignored = [];
  const seen = new Set();

  for (const signal of list) {
    if (!isUsableSignal(signal, { requireEvidence })) {
      ignored.push({
        key: signal?.key ?? null,
        reason: !isKnownSignal(signal?.key)
          ? "unknown signal"
          : signal?.present !== true
            ? "not present"
            : "missing dated source",
      });
      continue;
    }
    // Repeated observations of the same signal must not stack.
    if (seen.has(signal.key)) {
      ignored.push({ key: signal.key, reason: "duplicate" });
      continue;
    }
    seen.add(signal.key);

    const def = SIGNALS[signal.key];
    const factor = confidenceFactor(signal.confidence);
    const magnitude = def.weight * factor;
    const delta = def.direction === "negative" ? -magnitude : magnitude;

    contributions.push({
      key: signal.key,
      direction: def.direction,
      weight: def.weight,
      confidence: String(signal.confidence ?? "medium").toLowerCase(),
      delta: Number(delta.toFixed(3)),
      evidence_date: signal.evidence_date ?? null,
      source_url: signal.source_url ?? null,
      note: signal.note ?? null,
    });
  }

  const score = contributions.reduce((sum, c) => sum + c.delta, 0);
  const band = bandForScore(score);

  // Map score onto a probability anchored to the horizon base rate. A zero
  // score should land near the base rate, not near 50%.
  const relative = logistic(score, 4.0, 0.55) / logistic(0, 4.0, 0.55);
  const probability = Math.min(0.85, baseRate * relative);
  const lift = probability / baseRate;

  const positives = contributions.filter((c) => c.direction === "positive").length;

  return {
    score: Number(score.toFixed(3)),
    band,
    probability: Number(probability.toFixed(4)),
    lift: Number(lift.toFixed(2)),
    baseRate: Number(baseRate.toFixed(4)),
    horizonMonths,
    contributions,
    usedSignals: contributions.length,
    ignoredSignals: ignored,
    evidenceComplete: ignored.every((i) => i.reason === "not present"),
    caveat:
      `Base rate over ${horizonMonths} months is ${(baseRate * 100).toFixed(1)}%. ` +
      `A score of ${score.toFixed(1)} implies roughly ${(probability * 100).toFixed(1)}% ` +
      `(${lift.toFixed(1)}x base). Most companies in any band will not transact; ` +
      `use this to rank outreach order, not to predict individual outcomes.`,
    positiveSignals: positives,
    negativeSignals: contributions.length - positives,
  };
}

/** Rank companies by transition score, highest first, ties broken by evidence count. */
export function rankByTransition(scored) {
  return [...scored].sort((a, b) => {
    const diff = (b.score?.score ?? 0) - (a.score?.score ?? 0);
    if (diff !== 0) return diff;
    return (b.score?.usedSignals ?? 0) - (a.score?.usedSignals ?? 0);
  });
}

export { NEGATIVE_SIGNAL_KEYS };
