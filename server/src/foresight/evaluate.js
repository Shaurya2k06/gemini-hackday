/**
 * Case-control evaluation.
 *
 * Precision@k over a mandate-derived pool cannot measure a rare event: at a ~4%
 * transaction rate, 24 candidates yield one positive and precision can only
 * take a handful of values, none of them informative. Both earlier backtests
 * failed to measure anything for that reason, independent of whether the thesis
 * was right.
 *
 * The fix is to stop sampling by mandate and sample by outcome: deliberately
 * assemble companies that did transact (cases) and comparable ones that did not
 * (controls), then ask whether the score ranks cases above controls. That is
 * AUC, it is well defined with modest samples, and it is invariant to the base
 * rate.
 *
 * AUC reads directly: 0.5 is a coin flip, below 0.5 means the score is
 * inverted, and 1.0 is perfect separation.
 */

/**
 * Area under the ROC curve via the Mann-Whitney U statistic.
 *
 * Equal to the probability that a randomly chosen case outscores a randomly
 * chosen control, with ties counted as half.
 */
export function computeAuc(caseScores, controlScores) {
  const cases = (caseScores ?? []).filter((n) => Number.isFinite(n));
  const controls = (controlScores ?? []).filter((n) => Number.isFinite(n));
  if (!cases.length || !controls.length) return null;

  let wins = 0;
  for (const c of cases) {
    for (const k of controls) {
      if (c > k) wins += 1;
      else if (c === k) wins += 0.5;
    }
  }
  return wins / (cases.length * controls.length);
}

function mean(values) {
  if (!values.length) return null;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

function stdev(values) {
  if (values.length < 2) return 0;
  const m = mean(values);
  const variance = values.reduce((sum, v) => sum + (v - m) ** 2, 0) / (values.length - 1);
  return Math.sqrt(variance);
}

/** Standardised difference in means; a scale-free view of separation. */
export function cohensD(caseScores, controlScores) {
  if (caseScores.length < 2 || controlScores.length < 2) return null;
  const sdCase = stdev(caseScores);
  const sdControl = stdev(controlScores);
  const n1 = caseScores.length;
  const n2 = controlScores.length;
  const pooled = Math.sqrt(
    ((n1 - 1) * sdCase ** 2 + (n2 - 1) * sdControl ** 2) / (n1 + n2 - 2)
  );
  if (pooled === 0) return null;
  return (mean(caseScores) - mean(controlScores)) / pooled;
}

/**
 * Share of cases landing in the top half of the combined ranking.
 * A blunter companion to AUC that is easier to sanity-check by eye.
 */
export function topHalfRecall(rows) {
  const ranked = [...rows].sort((a, b) => b.score - a.score);
  if (!ranked.length) return null;
  const half = Math.ceil(ranked.length / 2);
  const casesTotal = ranked.filter((r) => r.label === "case").length;
  if (!casesTotal) return null;
  const casesInTopHalf = ranked.slice(0, half).filter((r) => r.label === "case").length;
  return casesInTopHalf / casesTotal;
}

/**
 * Interpret an AUC honestly, including the inverted case.
 *
 * A materially sub-0.5 AUC is more useful than a near-0.5 one: it means the
 * signals carry information with the wrong sign.
 */
export function interpretAuc(auc, { cases, controls }) {
  if (auc === null) return "AUC undefined — need at least one case and one control.";

  const smallest = Math.min(cases, controls);
  const fragile = smallest < 10;
  const suffix = fragile
    ? ` Sample is thin (${cases} cases / ${controls} controls), so treat the value as directional only.`
    : "";

  if (auc >= 0.7) return `Strong separation (AUC ${auc.toFixed(2)}).${suffix}`;
  if (auc >= 0.6) return `Modest but real separation (AUC ${auc.toFixed(2)}).${suffix}`;
  if (auc > 0.55) return `Weak separation (AUC ${auc.toFixed(2)}).${suffix}`;
  if (auc >= 0.45)
    return `No separation (AUC ${auc.toFixed(2)}) — the score is indistinguishable from a coin flip.${suffix}`;
  if (auc >= 0.3)
    return `Inverted (AUC ${auc.toFixed(2)}) — the signals carry information but with the wrong sign, so the weights should be reconsidered rather than discarded.${suffix}`;
  return `Strongly inverted (AUC ${auc.toFixed(2)}) — the score reliably ranks transactors last.${suffix}`;
}

/**
 * Evaluate a scored case-control set.
 *
 * @param rows array of { name, domain, label: 'case'|'control', score, population, cutoff }
 */
export function evaluateCaseControl(rows) {
  const list = Array.isArray(rows) ? rows : [];
  const cases = list.filter((r) => r.label === "case");
  const controls = list.filter((r) => r.label === "control");

  const caseScores = cases.map((r) => r.score);
  const controlScores = controls.map((r) => r.score);

  const auc = computeAuc(caseScores, controlScores);

  // Per-population breakdown, since the whole point is that these populations
  // behave differently and a blended figure can hide an inversion in one.
  const byPopulation = {};
  for (const row of list) {
    const key = row.population ?? "unknown";
    byPopulation[key] ??= { cases: [], controls: [] };
    if (row.label === "case") byPopulation[key].cases.push(row.score);
    else byPopulation[key].controls.push(row.score);
  }
  const populationAuc = {};
  for (const [key, group] of Object.entries(byPopulation)) {
    populationAuc[key] = {
      cases: group.cases.length,
      controls: group.controls.length,
      auc: computeAuc(group.cases, group.controls),
      meanCase: group.cases.length ? Number(mean(group.cases).toFixed(3)) : null,
      meanControl: group.controls.length ? Number(mean(group.controls).toFixed(3)) : null,
    };
  }

  const warnings = [];
  if (cases.length < 10 || controls.length < 10) {
    warnings.push(
      `Thin sample (${cases.length} cases / ${controls.length} controls). AUC is defined here but its confidence interval is wide; do not tune weights on this alone.`
    );
  }
  if (auc !== null && auc < 0.45) {
    warnings.push(
      "AUC below 0.45 indicates the weights are inverted for this population, which is a sign error rather than a lack of signal."
    );
  }

  return {
    cases: cases.length,
    controls: controls.length,
    auc: auc === null ? null : Number(auc.toFixed(3)),
    interpretation: interpretAuc(auc, { cases: cases.length, controls: controls.length }),
    meanCaseScore: caseScores.length ? Number(mean(caseScores).toFixed(3)) : null,
    meanControlScore: controlScores.length ? Number(mean(controlScores).toFixed(3)) : null,
    cohensD: (() => {
      const d = cohensD(caseScores, controlScores);
      return d === null ? null : Number(d.toFixed(3));
    })(),
    topHalfRecall: (() => {
      const r = topHalfRecall(list);
      return r === null ? null : Number(r.toFixed(3));
    })(),
    populationAuc,
    warnings,
  };
}

/** Compact text rendering of a case-control evaluation. */
export function formatEvaluation(report, rows = []) {
  const lines = [];
  lines.push(
    `Case-control evaluation — ${report.cases} cases (transacted) vs ${report.controls} controls`
  );
  lines.push(`  AUC ${report.auc ?? "n/a"} · ${report.interpretation}`);
  lines.push(
    `  mean score: cases ${report.meanCaseScore ?? "n/a"} · controls ${report.meanControlScore ?? "n/a"} · Cohen's d ${report.cohensD ?? "n/a"}`
  );
  if (report.topHalfRecall !== null) {
    lines.push(`  cases landing in the top half of the ranking: ${(report.topHalfRecall * 100).toFixed(0)}%`);
  }

  const pops = Object.entries(report.populationAuc).filter(([, g]) => g.cases && g.controls);
  if (pops.length) {
    lines.push("");
    lines.push("By population:");
    for (const [name, g] of pops) {
      lines.push(
        `  ${name.padEnd(14)} AUC ${g.auc === null ? "n/a" : g.auc.toFixed(2)} (${g.cases} cases / ${g.controls} controls) · mean ${g.meanCase} vs ${g.meanControl}`
      );
    }
  }

  if (rows.length) {
    lines.push("");
    lines.push("Ranking (score · population · label):");
    for (const row of [...rows].sort((a, b) => b.score - a.score)) {
      lines.push(
        `  ${String(row.score).padStart(6)} ${String(row.population ?? "?").padEnd(14)} ${(row.label === "case" ? "CASE" : "control").padEnd(8)} ${row.name ?? row.domain} (cutoff ${row.cutoff})`
      );
    }
  }

  if (report.warnings.length) {
    lines.push("");
    lines.push("Caveats:");
    for (const w of report.warnings) lines.push(`  - ${w}`);
  }

  return lines.join("\n");
}
