import { logger } from "../lib/logger.js";

export const DOMAIN_RESOLUTION_PLAUSIBILITY_THRESHOLD = 0.25;

const NON_COMPANY_KEYWORDS = [
  "summit",
  "forum",
  "fest",
  "festival",
  "awards",
  "hub",
  "association",
  "meetup",
  "conference",
  "week",
];

const WEAK_NON_COMPANY_KEYWORDS = ["foundry"];

const YEAR_RE = /\b(201[0-9]|202[0-9]|2030)\b/;

export const GENERIC_SECTOR_WORDS = new Set([
  "fintech",
  "finance",
  "tech",
  "startup",
  "startups",
  "africa",
  "india",
  "europe",
  "asia",
]);

function tokenizeName(name) {
  return String(name ?? "")
    .replace(/[,.|–—]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .split(" ")
    .filter(Boolean);
}

function isAllCapsGenericPattern(name) {
  const tokens = tokenizeName(name);
  if (tokens.length < 2) return false;

  const lower = name.toLowerCase();
  if (!lower.includes("fintech") && !lower.includes("finance")) return false;

  const first = tokens[0];
  if (first === first.toUpperCase() && /^[A-Z]+$/.test(first)) {
    return true;
  }

  const upperTokens = tokens.filter((t) => t === t.toUpperCase() && /[A-Z]/.test(t));
  if (upperTokens.length < 2) return false;

  const upperRatio = upperTokens.length / tokens.length;
  return upperRatio >= 0.5;
}

function isGenericSingleWordName(name) {
  const cleaned = String(name ?? "")
    .replace(/\b(inc|incorporated|llc|ltd|limited|corp|corporation|company|co|gmbh|plc)\b/gi, "")
    .replace(/[^a-zA-Z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  const tokens = cleaned.split(" ").filter(Boolean);
  if (tokens.length !== 1) return false;

  return GENERIC_SECTOR_WORDS.has(tokens[0].toLowerCase());
}

function hasEventKeyword(lower) {
  return NON_COMPANY_KEYWORDS.some((keyword) => new RegExp(`\\b${keyword}\\b`, "i").test(lower));
}

function hasSectorKeyword(lower) {
  return [...GENERIC_SECTOR_WORDS].some((word) => new RegExp(`\\b${word}\\b`, "i").test(lower));
}

/**
 * Score how likely a Serper hit is an operating company (0-1).
 */
export function scoreEntityPlausibility(record) {
  const name = String(record.name ?? record.raw?.serpItem?.title ?? "").trim();
  const reasons = [];
  let score = 1;
  const lower = name.toLowerCase();

  for (const keyword of NON_COMPANY_KEYWORDS) {
    const re = new RegExp(`\\b${keyword}\\b`, "i");
    if (re.test(lower)) {
      score -= 0.55;
      reasons.push(`name_contains_${keyword}`);
    }
  }

  if (hasEventKeyword(lower) && hasSectorKeyword(lower)) {
    score -= 0.25;
    reasons.push("sector_keyword_with_event_signal");
  }

  for (const keyword of WEAK_NON_COMPANY_KEYWORDS) {
    const re = new RegExp(`\\b${keyword}\\b`, "i");
    if (re.test(lower)) {
      score -= 0.15;
      reasons.push(`name_contains_${keyword}`);
    }
  }

  if (YEAR_RE.test(name)) {
    score -= 0.3;
    reasons.push("name_contains_year");
  }

  if (isGenericSingleWordName(name)) {
    score -= 0.75;
    reasons.push("generic_single_word_name");
  }

  if (isAllCapsGenericPattern(name)) {
    score -= 0.75;
    reasons.push("all_caps_generic_pattern");
  }

  score = Math.max(0, Math.min(1, Math.round(score * 1000) / 1000));
  const skip_domain_resolution = score < DOMAIN_RESOLUTION_PLAUSIBILITY_THRESHOLD;

  return { score, reasons, skip_domain_resolution };
}

/**
 * Annotate all raw heavy-search results with plausibility before domain resolution.
 */
export function applyPlausibilityToOutcomes(outcomes) {
  let deprioritized = 0;
  let skipDomainCount = 0;

  for (const outcome of outcomes) {
    for (const result of outcome.results ?? []) {
      const { score, reasons, skip_domain_resolution } = scoreEntityPlausibility(result);
      result.entity_plausibility = score;
      result.entity_plausibility_reasons = reasons;
      result.skip_domain_resolution = skip_domain_resolution;

      if (score < 1) deprioritized += 1;
      if (skip_domain_resolution) skipDomainCount += 1;

      logger.info("entity_plausibility_scored", {
        name: result.name,
        source: outcome.source,
        score,
        reasons,
        skip_domain_resolution,
      });
    }
  }

  return { deprioritized, skipDomainCount };
}
