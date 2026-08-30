/**
 * Case-control study runner.
 *
 * Two methodological choices distinguish this from the earlier backtests:
 *
 *  1. Sampling is by *outcome*, not by mandate. Cases are companies that
 *     transacted; controls are comparable companies that did not. This makes
 *     the measurement possible at all for a rare event.
 *
 *  2. Cutoffs are *anchored per company*. Each case is observed a fixed number
 *     of months before its own transaction, so signals are read at the moment
 *     they should be predictive. A single calendar cutoff for everyone means
 *     one company is observed a month before its deal and another three years
 *     before, which conflates timing with signal quality.
 */

import { extractSignalsAsOf } from "./extract-signals.js";
import { resolveOutcome } from "./outcome-oracle.js";
import { scoreTransition } from "./transition-score.js";
import { evaluateCaseControl, formatEvaluation } from "./evaluate.js";
import { addMonths, parseCutoff } from "./point-in-time.js";

async function pool(items, concurrency, worker) {
  const results = new Array(items.length);
  let index = 0;
  async function run() {
    while (index < items.length) {
      const i = index++;
      results[i] = await worker(items[i], i);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, run));
  return results;
}

/**
 * Verify a discovered transaction independently before trusting it as a label.
 *
 * The finder and the oracle are separate grounded calls, so agreement between
 * them is a genuine check rather than the same answer echoed twice.
 */
export async function verifyCases(transactions, { leadMonths, concurrency = 5, onProgress = null } = {}) {
  return pool(transactions, concurrency, async (t) => {
    const cutoff = addMonths(t.announced_date, -leadMonths);
    // Confirm the deal lands in a window that starts at our cutoff.
    const verification = await resolveOutcome(
      { name: t.name, domain: t.domain },
      { cutoff, asOf: addMonths(t.announced_date, 1) },
      { onProgress }
    );
    return {
      ...t,
      cutoff,
      verified: verification.transacted === true,
      verification,
    };
  });
}

/**
 * Run the study.
 *
 * @param cases     verified transactions, each with { name, domain, cutoff, was_venture_backed }
 * @param controls  companies believed not to have transacted, each with { name, domain }
 * @param leadMonths how far before a transaction each case is observed
 */
export async function runCaseControl(
  cases,
  controls,
  { leadMonths = 12, controlCutoff, concurrency = 6, onProgress = null } = {}
) {
  if (!cases.length) throw new Error("Case-control study requires at least one verified case.");
  if (!controls.length) throw new Error("Case-control study requires at least one control.");
  parseCutoff(controlCutoff);

  const started = Date.now();

  const subjects = [
    ...cases.map((c) => ({
      name: c.name,
      domain: c.domain,
      label: "case",
      cutoff: c.cutoff,
      populationHint: c.was_venture_backed ? "vc_backed" : "founder_owned",
      announced_date: c.announced_date,
      acquirer: c.acquirer ?? null,
    })),
    ...controls.map((c) => ({
      name: c.name,
      domain: c.domain,
      label: "control",
      cutoff: controlCutoff,
      populationHint: null,
      announced_date: null,
      acquirer: null,
    })),
  ];

  onProgress?.({
    step: "Observing subjects at anchored cutoffs…",
    detail: `${cases.length} cases / ${controls.length} controls`,
    at: Date.now(),
  });

  const observations = await pool(subjects, concurrency, (s) =>
    extractSignalsAsOf({ name: s.name, domain: s.domain, cutoff: s.cutoff }, { onProgress })
  );

  const rows = subjects.map((subject, i) => {
    const obs = observations[i];
    // Population comes from observed signals; the label's own hint is used only
    // as a fallback so the outcome cannot leak into the population choice.
    const score = scoreTransition(obs.signals, { horizonMonths: leadMonths });
    return {
      name: subject.name,
      domain: subject.domain,
      label: subject.label,
      cutoff: subject.cutoff,
      announced_date: subject.announced_date,
      acquirer: subject.acquirer,
      population: score.population,
      populationHint: subject.populationHint,
      score: score.score,
      band: score.band,
      signals: score.contributions.map((c) => c.key),
      usedSignals: score.usedSignals,
      auditClean: obs.audit?.clean ?? null,
      extractionError: obs.error,
      detail: score,
    };
  });

  const evaluation = evaluateCaseControl(rows);

  const contaminated = rows.filter((r) => r.auditClean === false).length;
  if (contaminated) {
    evaluation.warnings.push(
      `${contaminated} observation(s) tripped a point-in-time guard; the offending evidence was discarded before scoring.`
    );
  }
  const noSignal = rows.filter((r) => r.usedSignals === 0).length;
  if (noSignal) {
    evaluation.warnings.push(
      `${noSignal} of ${rows.length} subjects yielded no usable dated signals and scored 0, which flattens separation regardless of whether the weights are right.`
    );
  }

  return {
    leadMonths,
    controlCutoff,
    evaluation,
    rows,
    contaminated,
    elapsedMs: Date.now() - started,
  };
}

export { formatEvaluation };
