/**
 * Point-in-time discipline for backtesting.
 *
 * This is the part of a backtest that is easiest to get wrong and most likely
 * to produce impressively fraudulent results. The model already knows which
 * companies were acquired, so if any post-cutoff knowledge reaches the scoring
 * step, the backtest measures recall of the model's memory rather than the
 * predictive power of a thesis.
 *
 * Three independent defences, because the prompt instruction alone is not
 * trustworthy:
 *  1. Evidence dated after the cutoff is dropped, not down-weighted.
 *  2. Outcome language ("was acquired by") is treated as contamination.
 *  3. Undated evidence is rejected, since it cannot be proven pre-cutoff.
 */

/** Phrases that reveal the model is describing a completed outcome. */
const OUTCOME_PATTERNS = [
  /\bwas\s+(acquired|bought|purchased)\b/i,
  /\b(has|have)\s+been\s+acquired\b/i,
  /\bacquisition\s+(was\s+)?(completed|closed|announced)\b/i,
  /\bacquired\s+by\s+[A-Z]/,
  /\bmerged\s+with\b/i,
  /\bwent\s+public\b/i,
  /\bIPO'?d\b/i,
  /\bcompleted\s+its\s+IPO\b/i,
  /\bdelisted\b/i,
  /\btaken\s+private\b/i,
  /\bexit(ed)?\s+(to|via)\b/i,
  /\bsold\s+to\s+[A-Z]/,
  /\bnow\s+(a\s+)?(part|subsidiary)\s+of\b/i,
];

const ISO_DATE = /^(\d{4})-(\d{2})(?:-(\d{2}))?$/;

/** Parse `YYYY-MM` or `YYYY-MM-DD` into a UTC timestamp, or null. */
export function parseEvidenceDate(value) {
  if (typeof value !== "string") return null;
  const match = value.trim().match(ISO_DATE);
  if (!match) return null;
  const [, y, m, d] = match;
  const year = Number(y);
  const month = Number(m);
  const day = d ? Number(d) : 1;
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  const ts = Date.UTC(year, month - 1, day);
  return Number.isFinite(ts) ? ts : null;
}

export function parseCutoff(cutoff) {
  const ts = parseEvidenceDate(cutoff);
  if (ts === null) {
    throw new Error(`Invalid cutoff date "${cutoff}" — use YYYY-MM-DD.`);
  }
  return ts;
}

/**
 * Detect language implying knowledge of an outcome.
 * @returns {{ leaked: boolean, matches: string[] }}
 */
export function detectOutcomeLeakage(text) {
  const value = String(text ?? "");
  const matches = [];
  for (const pattern of OUTCOME_PATTERNS) {
    const found = value.match(pattern);
    if (found) matches.push(found[0].trim());
  }
  return { leaked: matches.length > 0, matches };
}

/**
 * Enforce the cutoff across a set of extracted signals.
 *
 * Signals are dropped rather than penalised: a backtest that keeps
 * post-cutoff evidence at reduced weight is still contaminated.
 *
 * @returns {{ kept: Array, rejected: Array, contaminated: boolean }}
 */
export function enforceCutoff(signals, cutoff) {
  const cutoffTs = parseCutoff(cutoff);
  const kept = [];
  const rejected = [];

  for (const signal of Array.isArray(signals) ? signals : []) {
    const ts = parseEvidenceDate(signal?.evidence_date);

    if (ts === null) {
      rejected.push({
        key: signal?.key ?? null,
        reason: "undated evidence cannot be proven pre-cutoff",
        evidence_date: signal?.evidence_date ?? null,
      });
      continue;
    }

    if (ts > cutoffTs) {
      rejected.push({
        key: signal?.key ?? null,
        reason: "evidence dated after cutoff",
        evidence_date: signal.evidence_date,
      });
      continue;
    }

    const note = detectOutcomeLeakage(signal?.note);
    if (note.leaked) {
      rejected.push({
        key: signal?.key ?? null,
        reason: `outcome language in evidence: ${note.matches.join("; ")}`,
        evidence_date: signal.evidence_date,
      });
      continue;
    }

    kept.push(signal);
  }

  return {
    kept,
    rejected,
    contaminated: rejected.some(
      (r) => r.reason.startsWith("outcome language") || r.reason === "evidence dated after cutoff"
    ),
  };
}

/**
 * Audit a whole extraction payload before it is trusted.
 *
 * Returns a verdict rather than throwing so a backtest can record contamination
 * as a finding instead of silently failing.
 */
export function auditPointInTime({ cutoff, signals = [], narrative = "" }) {
  const cutoffTs = parseCutoff(cutoff);
  const { kept, rejected, contaminated } = enforceCutoff(signals, cutoff);
  const narrativeLeak = detectOutcomeLeakage(narrative);

  return {
    cutoff,
    cutoffTs,
    kept,
    rejected,
    keptCount: kept.length,
    rejectedCount: rejected.length,
    narrativeLeaked: narrativeLeak.leaked,
    narrativeMatches: narrativeLeak.matches,
    // Either channel leaking is enough to distrust the sample.
    clean: !contaminated && !narrativeLeak.leaked,
  };
}

/** Instruction block appended to any point-in-time extraction prompt. */
export function buildCutoffInstruction(cutoff) {
  parseCutoff(cutoff);
  return [
    `POINT-IN-TIME CONSTRAINT — cutoff date ${cutoff}.`,
    `Report only what was publicly observable on or before ${cutoff}.`,
    `Every signal MUST include evidence_date (YYYY-MM-DD, on or before ${cutoff}) and a source_url.`,
    `If you cannot date a signal to on or before ${cutoff}, omit it entirely.`,
    `Do NOT mention or rely on anything that happened after ${cutoff}.`,
    `Do NOT state or imply whether the company was later acquired, merged, sold, or went public.`,
    `Treat this strictly as a historical snapshot: you are standing on ${cutoff} with no knowledge of the future.`,
  ].join("\n");
}
