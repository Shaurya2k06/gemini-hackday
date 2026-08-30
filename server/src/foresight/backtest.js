/**
 * Backtest orchestration.
 *
 * Rewinds to a cutoff, scores each candidate on pre-cutoff evidence only,
 * resolves what actually happened afterwards, and reports whether the ranking
 * carried information.
 *
 * The metric that matters is precision@k against the base rate, not accuracy.
 * With a ~1.5% six-month base rate, a model that predicts "nobody transacts"
 * scores ~98% accuracy and is useless. Lift over base rate is the only honest
 * summary, and a small sample cannot establish it — so the report states its
 * own statistical weakness rather than leaving the reader to infer it.
 */

import { extractSignalsAsOf } from "./extract-signals.js";
import { resolveOutcome } from "./outcome-oracle.js";
import { scoreTransition, rankByTransition } from "./transition-score.js";
import { HORIZON_BASE_RATE } from "./signals.js";
import { parseCutoff } from "./point-in-time.js";

/** Bounded-concurrency map so a large watchlist does not stampede the API. */
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

function precisionAtK(ranked, k) {
  const top = ranked.slice(0, k);
  const scored = top.filter((r) => r.outcome.label !== "unknown");
  if (!scored.length) return null;
  const hits = scored.filter((r) => r.outcome.transacted).length;
  return { k, hits, evaluated: scored.length, precision: hits / scored.length };
}

/**
 * Run a point-in-time backtest.
 *
 * @param candidates array of { name, domain }
 * @param cutoff     the historical vantage point (YYYY-MM-DD)
 * @param asOf       end of the evaluation window (defaults to today)
 */
export async function runBacktest(
  candidates,
  { cutoff, asOf = new Date().toISOString().slice(0, 10), concurrency = 3, onProgress = null } = {}
) {
  parseCutoff(cutoff);
  parseCutoff(asOf);

  const list = (Array.isArray(candidates) ? candidates : []).filter((c) => c?.domain);
  if (!list.length) {
    throw new Error("Backtest requires at least one candidate with a domain.");
  }

  const started = Date.now();
  onProgress?.({
    step: `Rewinding to ${cutoff}…`,
    detail: `${list.length} candidates`,
    at: Date.now(),
  });

  // Stage 1 — observe each company as it stood at the cutoff.
  const observations = await pool(list, concurrency, (company) =>
    extractSignalsAsOf({ ...company, cutoff }, { onProgress })
  );

  // Stage 2 — score from audited, pre-cutoff evidence only.
  const scored = observations.map((obs) => ({
    name: obs.name,
    domain: obs.domain,
    snapshot: obs.snapshot,
    score: scoreTransition(obs.signals),
    audit: obs.audit,
    extractionError: obs.error,
  }));

  onProgress?.({ step: "Resolving actual outcomes…", detail: `${list.length} companies`, at: Date.now() });

  // Stage 3 — find out what actually happened.
  const outcomes = await pool(scored, concurrency, (row) =>
    resolveOutcome({ name: row.name, domain: row.domain }, { cutoff, asOf }, { onProgress })
  );

  const rows = scored.map((row, i) => ({ ...row, outcome: outcomes[i] }));
  const ranked = rankByTransition(rows);

  const evaluable = ranked.filter((r) => r.outcome.label !== "unknown");
  const transacted = evaluable.filter((r) => r.outcome.transacted);
  const contaminated = ranked.filter((r) => r.audit && !r.audit.clean);

  const observedRate = evaluable.length ? transacted.length / evaluable.length : null;
  const pAt3 = precisionAtK(ranked, 3);
  const pAt5 = precisionAtK(ranked, 5);

  // Did ranking beat picking at random from the same pool?
  const lift = pAt5 && observedRate ? Number((pAt5.precision / observedRate).toFixed(2)) : null;

  const bandBreakdown = {};
  for (const row of ranked) {
    const band = row.score.band;
    bandBreakdown[band] ??= { companies: 0, transacted: 0, unknown: 0 };
    bandBreakdown[band].companies += 1;
    if (row.outcome.label === "unknown") bandBreakdown[band].unknown += 1;
    else if (row.outcome.transacted) bandBreakdown[band].transacted += 1;
  }

  const warnings = [];
  if (contaminated.length) {
    warnings.push(
      `${contaminated.length} of ${ranked.length} observations tripped a point-in-time guard; their leaked evidence was discarded before scoring.`
    );
  }
  if (evaluable.length < ranked.length) {
    warnings.push(
      `${ranked.length - evaluable.length} outcomes could not be resolved and are excluded from precision rather than counted as negatives.`
    );
  }
  if (ranked.length < 20) {
    warnings.push(
      `Sample of ${ranked.length} is far too small for statistical significance. Treat this as a smoke test of the method, not evidence the thesis works.`
    );
  }
  if (transacted.length === 0 && evaluable.length > 0) {
    warnings.push(
      "No candidate transacted in the window, so precision cannot discriminate. Widen the window or pick a period with known activity."
    );
  }

  return {
    cutoff,
    asOf,
    candidates: ranked.length,
    evaluated: evaluable.length,
    unresolved: ranked.length - evaluable.length,
    transacted: transacted.length,
    observedRate: observedRate === null ? null : Number(observedRate.toFixed(4)),
    priorBaseRate: Number(HORIZON_BASE_RATE.toFixed(4)),
    precisionAt3: pAt3,
    precisionAt5: pAt5,
    liftOverPool: lift,
    bandBreakdown,
    contaminatedCount: contaminated.length,
    warnings,
    ranked,
    elapsedMs: Date.now() - started,
  };
}

/** Compact, reviewable text rendering of a backtest. */
export function formatBacktest(report) {
  const lines = [];
  lines.push(`Backtest — vantage point ${report.cutoff}, outcomes through ${report.asOf}`);
  lines.push(
    `  candidates ${report.candidates} · outcomes resolved ${report.evaluated} · transacted ${report.transacted} · guards tripped ${report.contaminatedCount}`
  );
  if (report.precisionAt3) {
    lines.push(
      `  precision@3 ${(report.precisionAt3.precision * 100).toFixed(0)}% (${report.precisionAt3.hits}/${report.precisionAt3.evaluated})`
    );
  }
  if (report.precisionAt5) {
    lines.push(
      `  precision@5 ${(report.precisionAt5.precision * 100).toFixed(0)}% (${report.precisionAt5.hits}/${report.precisionAt5.evaluated})`
    );
  }
  if (report.observedRate !== null) {
    lines.push(`  pool transaction rate ${(report.observedRate * 100).toFixed(0)}%`);
  }
  if (report.liftOverPool !== null) {
    lines.push(`  lift of top 5 over pool ${report.liftOverPool}x`);
  }

  lines.push("");
  lines.push("Ranked at cutoff (score · band · outcome):");
  for (const row of report.ranked) {
    const outcome =
      row.outcome.label === "transacted"
        ? `TRANSACTED ${row.outcome.outcome_date ?? ""} ${row.outcome.counterparty ?? ""}`.trim()
        : row.outcome.label;
    lines.push(
      `  ${String(row.score.score).padStart(6)} ${row.score.band.padEnd(11)} ${(row.name ?? row.domain).padEnd(24)} ${outcome}`
    );
    for (const c of row.score.contributions.slice(0, 3)) {
      lines.push(`         ${c.direction === "negative" ? "-" : "+"} ${c.key} (${c.evidence_date})`);
    }
  }

  if (report.warnings.length) {
    lines.push("");
    lines.push("Caveats:");
    for (const w of report.warnings) lines.push(`  - ${w}`);
  }

  return lines.join("\n");
}
