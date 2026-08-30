import { test } from "node:test";
import assert from "node:assert/strict";
import {
  parseEvidenceDate,
  parseCutoff,
  detectOutcomeLeakage,
  enforceCutoff,
  auditPointInTime,
  buildCutoffInstruction,
} from "../../../src/foresight/point-in-time.js";

function sig(key, evidence_date, extra = {}) {
  return {
    key,
    present: true,
    confidence: "high",
    evidence_date,
    source_url: "https://example.com/x",
    ...extra,
  };
}

test("parseEvidenceDate accepts YYYY-MM and YYYY-MM-DD", () => {
  assert.ok(parseEvidenceDate("2024-03") !== null);
  assert.ok(parseEvidenceDate("2024-03-15") !== null);
  assert.equal(parseEvidenceDate("March 2024"), null);
  assert.equal(parseEvidenceDate("2024"), null);
  assert.equal(parseEvidenceDate("2024-13-01"), null, "rejects impossible month");
  assert.equal(parseEvidenceDate(""), null);
  assert.equal(parseEvidenceDate(null), null);
});

test("parseCutoff rejects unusable cutoffs loudly", () => {
  assert.throws(() => parseCutoff("last year"), /Invalid cutoff date/);
  assert.throws(() => parseCutoff(null), /Invalid cutoff date/);
  assert.ok(parseCutoff("2024-01-01") > 0);
});

// --- the core defence: no future evidence may survive ----------------------

test("evidence dated after the cutoff is dropped, not down-weighted", () => {
  const result = enforceCutoff(
    [sig("advisor_engaged", "2024-01-10"), sig("corp_dev_hire", "2024-09-01")],
    "2024-06-30"
  );

  assert.equal(result.kept.length, 1);
  assert.equal(result.kept[0].key, "advisor_engaged");
  assert.equal(result.rejected[0].key, "corp_dev_hire");
  assert.equal(result.rejected[0].reason, "evidence dated after cutoff");
  assert.equal(result.contaminated, true, "future evidence must flag contamination");
});

test("evidence exactly on the cutoff date is admissible", () => {
  const result = enforceCutoff([sig("advisor_engaged", "2024-06-30")], "2024-06-30");
  assert.equal(result.kept.length, 1);
  assert.equal(result.contaminated, false);
});

test("undated evidence is rejected because it cannot be proven pre-cutoff", () => {
  const result = enforceCutoff([sig("advisor_engaged", null)], "2024-06-30");
  assert.equal(result.kept.length, 0);
  assert.match(result.rejected[0].reason, /undated evidence/);
  assert.equal(result.contaminated, false, "undated is unusable but not contamination");
});

test("outcome language inside evidence is treated as contamination", () => {
  const cases = [
    "The company was acquired by Vista in late 2024",
    "It has been acquired following a competitive process",
    "acquisition completed in Q3",
    "Now a subsidiary of Thoma Bravo",
    "The founders sold to Acme Corp",
    "The business merged with a larger rival",
    "The company went public on the LSE",
    "Later taken private",
  ];

  for (const note of cases) {
    const result = enforceCutoff([sig("advisor_engaged", "2024-01-01", { note })], "2024-06-30");
    assert.equal(result.kept.length, 0, `should reject: ${note}`);
    assert.equal(result.contaminated, true, `should flag contamination: ${note}`);
    assert.match(result.rejected[0].reason, /outcome language/);
  }
});

test("ordinary pre-cutoff notes are not mistaken for outcome language", () => {
  const cases = [
    "Founder has led the business since 2013",
    "Hired its first CFO in March 2024",
    "Registry filing shows a share transfer between existing holders",
    "Founder discussed succession planning in an interview",
    "Company acquired a small competitor to expand its product line",
  ];

  for (const note of cases) {
    const result = enforceCutoff([sig("advisor_engaged", "2024-01-01", { note })], "2024-06-30");
    assert.equal(result.kept.length, 1, `should keep: ${note}`);
  }
});

test("detectOutcomeLeakage reports what it matched", () => {
  const { leaked, matches } = detectOutcomeLeakage("Acme was acquired by Globex in 2025");
  assert.equal(leaked, true);
  assert.ok(matches.length > 0);
  assert.equal(detectOutcomeLeakage("Acme raised a Series B").leaked, false);
  assert.equal(detectOutcomeLeakage(null).leaked, false);
});

// --- full audit -------------------------------------------------------------

test("auditPointInTime passes a clean historical snapshot", () => {
  const audit = auditPointInTime({
    cutoff: "2024-06-30",
    signals: [sig("advisor_engaged", "2024-02-01"), sig("founder_tenure_window", "2024-03-01")],
    narrative: "Founder-led logistics software vendor, self-funded since inception.",
  });

  assert.equal(audit.clean, true);
  assert.equal(audit.keptCount, 2);
  assert.equal(audit.rejectedCount, 0);
  assert.equal(audit.narrativeLeaked, false);
});

test("auditPointInTime fails a snapshot whose narrative reveals the outcome", () => {
  const audit = auditPointInTime({
    cutoff: "2024-06-30",
    signals: [sig("advisor_engaged", "2024-02-01")],
    narrative: "A profitable vendor that was acquired by a strategic buyer the following year.",
  });

  assert.equal(audit.clean, false, "narrative leakage must invalidate the sample");
  assert.equal(audit.narrativeLeaked, true);
  assert.ok(audit.narrativeMatches.length > 0);
  assert.equal(audit.keptCount, 1, "signals still audited independently");
});

test("auditPointInTime fails when any signal post-dates the cutoff", () => {
  const audit = auditPointInTime({
    cutoff: "2024-06-30",
    signals: [sig("advisor_engaged", "2025-01-01")],
    narrative: "Clean narrative.",
  });

  assert.equal(audit.clean, false);
  assert.equal(audit.keptCount, 0);
});

test("cutoff instruction states the constraint unambiguously", () => {
  const text = buildCutoffInstruction("2024-06-30");
  assert.match(text, /cutoff date 2024-06-30/);
  assert.match(text, /on or before 2024-06-30/);
  assert.match(text, /Do NOT state or imply whether the company was later acquired/);
  assert.match(text, /no knowledge of the future/);
  assert.throws(() => buildCutoffInstruction("nonsense"), /Invalid cutoff date/);
});

test("enforceCutoff tolerates malformed signal arrays", () => {
  assert.equal(enforceCutoff(null, "2024-06-30").kept.length, 0);
  assert.equal(enforceCutoff([null, 5, "x"], "2024-06-30").kept.length, 0);
});
