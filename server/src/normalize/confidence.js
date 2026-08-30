import { reliabilityFor } from "./source-reliability.js";
import { normalizeName } from "./entity-resolution.js";

const AGREEMENT_BONUS_PER_SOURCE = 0.08;
const MAX_AGREEMENT_BONUS = 0.2;

function valuesEquivalent(field, a, b) {
  if (a == null && b == null) return true;
  if (a == null || b == null) return false;

  if (field === "name") {
    return normalizeName(String(a)) === normalizeName(String(b));
  }

  if (Array.isArray(a) && Array.isArray(b)) {
    const sa = [...new Set(a.map(String))].sort().join("|");
    const sb = [...new Set(b.map(String))].sort().join("|");
    return sa === sb;
  }

  return String(a).trim().toLowerCase() === String(b).trim().toLowerCase();
}

/**
 * Compute per-field confidence from source reliability, agreement, and recency.
 */
export function computeFieldConfidence(field, candidates, { scrapedAt = new Date() } = {}) {
  if (!candidates.length) {
    return { confidence: 0, sources: [], winner: null };
  }

  const byValue = new Map();
  for (const c of candidates) {
    if (c.value == null || c.value === "" || (Array.isArray(c.value) && c.value.length === 0)) {
      continue;
    }
    const key = Array.isArray(c.value)
      ? [...new Set(c.value.map(String))].sort().join("|")
      : field === "name"
        ? normalizeName(String(c.value))
        : String(c.value).trim().toLowerCase();

    if (!byValue.has(key)) {
      byValue.set(key, { value: c.value, sources: [] });
    }
    byValue.get(key).sources.push({
      source: c.source,
      reliability: reliabilityFor(c.source, field),
      scrapedAt: c.scrapedAt ?? scrapedAt,
    });
  }

  if (byValue.size === 0) {
    return { confidence: 0, sources: [], winner: null };
  }

  let best = null;
  let bestScore = -1;

  for (const entry of byValue.values()) {
    const reliabilities = entry.sources.map((s) => s.reliability);
    const maxReliability = Math.max(...reliabilities);
    const agreementBonus = Math.min(
      MAX_AGREEMENT_BONUS,
      (entry.sources.length - 1) * AGREEMENT_BONUS_PER_SOURCE
    );
    const recencyFactor = 1;
    const score = Math.min(1, (maxReliability + agreementBonus) * recencyFactor);

    if (score > bestScore) {
      bestScore = score;
      best = {
        value: entry.value,
        sources: entry.sources.map((s) => s.source),
        confidence: Math.round(score * 1000) / 1000,
      };
    }
  }

  return {
    confidence: best.confidence,
    sources: best.sources,
    winner: best.value,
    agreementGroups: [...byValue.values()].map((v) => ({
      value: v.value,
      sources: v.sources.map((s) => s.source),
      equivalent: valuesEquivalent(field, v.value, best.winner),
    })),
  };
}

export function computeAllFieldConfidences(fieldCandidates, options = {}) {
  const confidence_scores = {};
  const provenance = {};

  for (const [field, candidates] of Object.entries(fieldCandidates)) {
    const result = computeFieldConfidence(field, candidates, options);
    if (result.winner != null) {
      confidence_scores[field] = result.confidence;
      provenance[field] = {
        sources: result.sources,
        value: result.winner,
      };
    }
  }

  return { confidence_scores, provenance };
}
