/**
 * LLM-primary mandate normalization for the incremental pill builder.
 * Light Agent owns geography semantics; deterministic code handles syntax + ISO fallback.
 */

import { FUNDING_STAGES } from "./schema.js";
import { lookupCountry, extractCountriesFromText, inferCountryAndRegion, lookupRegion, extractRegionsFromText } from "./geo/countries.js";
import { expandAbbreviation, extractAbbreviationsFromText } from "./geo/abbreviations.js";
import { fundingStagesAtOrAbove } from "./funding-stage.js";

function normalizeKey(value) {
  return String(value ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const STAGE_ALIASES = [
  [/pre\s*[-_]?\s*seed/gi, "pre-seed"],
  [/\bseed\s+stage\b/gi, "seed"],
  [/\bseed\b/gi, "seed"],
  [/\bseries\s*c\s*(\+|plus)?\b/gi, "series_c_plus"],
  [/\bseries\s*b\b/gi, "series_b"],
  [/\bseries\s*a\b/gi, "series_a"],
];

const STAGE_LABEL_TO_ENUM = {
  "pre-seed": "pre-seed",
  preseed: "pre-seed",
  seed: "seed",
  "series a": "series_a",
  seriesa: "series_a",
  series_a: "series_a",
  "series b": "series_b",
  seriesb: "series_b",
  series_b: "series_b",
  "series c": "series_c_plus",
  "series c+": "series_c_plus",
  "series c plus": "series_c_plus",
  series_c_plus: "series_c_plus",
};

const STAGE_LETTER_TO_ENUM = { a: "series_a", b: "series_b", c: "series_c_plus" };

/**
 * Generic entity words implied by any mandate search — never useful as keyword pills.
 */
const GENERIC_ENTITY_WORDS = new Set(
  ["startup", "startups", "company", "companies"].map(normalizeKey)
);

/**
 * Atomic thesis / business-model phrases that belong in `keywords`.
 * Matched longest-first so "recently funded" is kept whole, not split.
 */
const KEYWORD_PHRASES = [
  "recently funded",
  "recent funding",
  "pre revenue",
  "pre-revenue",
  "open source",
  "open-source",
  "business to business",
  "business to consumer",
  "b2b",
  "b2c",
  "enterprise",
  "bootstrapped",
  "venture backed",
  "venture-backed",
  "y combinator",
  "yc backed",
  "yc-backed",
  "techstars backed",
  "techstars-backed",
].sort((a, b) => b.length - a.length);

const KEYWORD_PHRASE_KEYS = new Set(KEYWORD_PHRASES.map(normalizeKey));

/** Command phrases to strip from text — never become keywords. */
const COMMAND_PHRASES = ["give me", "show me", "looking for", "find me"].sort(
  (a, b) => b.length - a.length
);

/**
 * Tokens that are only debris from splitting a known phrase (e.g. "business"/"to"
 * from "business to business"). Dropped when the atomic phrase is present, or alone.
 */
const PHRASE_FRAGMENT_TOKENS = new Set(
  [
    "recently",
    "funded",
    "funding",
    "related",
    "business",
    "to",
    "venture",
    "backed",
    "yc",
    "combinator",
    "techstars",
    "open",
    "source",
    "pre",
    "revenue",
  ].map(normalizeKey)
);

const STOP_WORDS = new Set(
  [
    "in",
    "from",
    "based",
    "at",
    "the",
    "a",
    "an",
    "and",
    "or",
    "with",
    "for",
    "of",
    "to",
    "near",
    "located",
    "headquartered",
    "operating",
    // mandate command / filler — not search criteria
    "give",
    "me",
    "show",
    "find",
    "search",
    "list",
    "discover",
    "get",
    "please",
    "want",
    "need",
    "looking",
    "tell",
    "help",
    "i",
    "my",
    "us",
    "we",
    "you",
    "all",
    "some",
    "any",
    "can",
    "could",
    "would",
    "should",
    "that",
    "this",
    "those",
    "these",
    "what",
    "which",
    "who",
    "where",
    "when",
    "how",
    "why",
    "is",
    "are",
    "was",
    "were",
    "be",
    "been",
    "being",
    "have",
    "has",
    "had",
    "do",
    "does",
    "did",
    "will",
    "shall",
    "may",
    "might",
    "must",
  ].map(normalizeKey)
);

/**
 * Trailing "<preposition> <place>" pattern — catches cities/regions we don't have
 * in any hardcoded list (e.g. "startups in Prayagraj"), without needing a world gazetteer.
 * Only fires when the location words sit at the end of the (already-trimmed) fragment,
 * right after a location preposition, to avoid false positives.
 */
const LOCATION_PREPOSITIONS = [
  "based in",
  "headquartered in",
  "located in",
  "operating in",
  "in",
  "at",
  "near",
  "from",
];

const PREPOSITION_LOCATION_RE = new RegExp(
  `\\b(?:${LOCATION_PREPOSITIONS.slice()
    .sort((a, b) => b.length - a.length)
    .map((p) => p.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
    .join("|")})\\s+([a-z][a-z\\s]{1,40})$`,
  "i"
);

function titleCase(text) {
  return text
    .split(/\s+/)
    .map((w) => (w ? w.charAt(0).toUpperCase() + w.slice(1) : w))
    .join(" ");
}

function splitPlaceList(text) {
  return String(text ?? "")
    .split(/\s+(?:and|or)\s+/i)
    .map((s) => s.trim())
    .filter((s) => s && !STOP_WORDS.has(normalizeKey(s)));
}

/** Split glued geography like "Jodhpur And Darjeeling" into separate places. */
function flattenCompoundGeography(geography) {
  const out = [];
  for (const entry of geography ?? []) {
    const label = String(entry ?? "").trim();
    if (!label) continue;
    const parts = splitPlaceList(label);
    if (parts.length > 1) out.push(...parts.map(titleCase));
    else out.push(label);
  }
  return out;
}

function extractPrepositionalLocation(text) {
  const source = String(text ?? "");
  const match = source.match(PREPOSITION_LOCATION_RE);
  if (!match) return { geography: [], remaining: source };

  const captured = match[1].trim();
  if (!captured || STOP_WORDS.has(normalizeKey(captured))) {
    return { geography: [], remaining: source };
  }

  const remaining = source.slice(0, match.index).trim();
  const places = splitPlaceList(captured).map(titleCase);
  return { geography: places.length ? places : [titleCase(captured)], remaining };
}

/**
 * Keys used to drop keywords that duplicate an LLM sector tag.
 * No alias dictionary — match by normalized equality, compact form, multi-word
 * tokens, and stem/prefix overlap (media ↔ media tech, biotech ↔ biotechnology).
 */
function sectorMatchKeys(sectorTags = []) {
  const keys = new Set();
  for (const tag of sectorTags) {
    const key = normalizeKey(tag);
    if (!key) continue;
    keys.add(key);
    keys.add(key.replace(/\s+/g, ""));
    for (const token of key.split(/\s+/)) {
      if (token.length >= 3) keys.add(token);
    }
  }
  return keys;
}

function keywordOverlapsSector(kwKey, sectorTags = []) {
  const kw = normalizeKey(kwKey);
  if (!kw) return false;
  const kwCompact = kw.replace(/\s+/g, "");

  for (const tag of sectorTags) {
    const sector = normalizeKey(tag);
    if (!sector) continue;
    const sectorCompact = sector.replace(/\s+/g, "");

    if (kw === sector || kwCompact === sectorCompact) return true;
    if (sector.split(/\s+/).some((tok) => tok.length >= 3 && tok === kw)) return true;

    // Stem overlap without a hard-coded synonym list
    if (
      sectorCompact.length >= 4 &&
      kwCompact.length >= 4 &&
      (kwCompact.startsWith(sectorCompact) || sectorCompact.startsWith(kwCompact))
    ) {
      return true;
    }

    // Shared root (agri↔agricultural↔agritech) — min 4 shared leading chars
    const shared = Math.min(sectorCompact.length, kwCompact.length);
    let i = 0;
    while (i < shared && sectorCompact[i] === kwCompact[i]) i += 1;
    if (i >= 4) return true;
  }
  return false;
}

/**
 * LLM owns sector naming. Code only normalizes shape and dedupes.
 * Multiple distinct sectors stay as multiple tags (healthtech + mediatech).
 * Returns { tags, demoted } — demoted ultra-generic tags can be kept as keywords.
 */
function normalizeSectorTags(tags) {
  const seen = new Set();
  const out = [];

  for (const tag of tags ?? []) {
    const raw = String(tag ?? "").trim();
    if (!raw) continue;
    const key = normalizeKey(raw);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(key);
  }

  // Drop ultra-generic "tech"/"technology" when a more specific sector is present
  if (out.length > 1) {
    const demoted = out.filter((t) => t === "technology" || t === "tech");
    return {
      tags: out.filter((t) => t !== "technology" && t !== "tech"),
      demoted,
    };
  }
  return { tags: out, demoted: [] };
}

function canonicalKeywordKey(value) {
  const key = normalizeKey(value);
  if (!key) return key;
  if (
    key.endsWith("s") &&
    key.length > 3 &&
    GENERIC_ENTITY_WORDS.has(key.slice(0, -1))
  ) {
    return key.slice(0, -1);
  }
  return key;
}

function displayKeywordLabel(key) {
  const match = KEYWORD_PHRASES.find((p) => normalizeKey(p) === key);
  if (match) {
    if (key === "b2b" || key === "b2c") return key.toUpperCase();
    return match;
  }
  return key;
}

/**
 * Keep real thesis keywords; drop command filler, generic entity words, geo/sector
 * duplicates, and orphan fragments of known phrases.
 */
function dedupeKeywords(keywords, { sectorTags = [], geography = [] } = {}) {
  const sectorKeys = sectorMatchKeys(sectorTags);
  const geoKeys = new Set(geography.map(normalizeKey));
  const seen = new Set();
  const out = [];

  // First pass: normalize and collect candidates (prefer atomic phrases)
  const candidates = [];
  for (const kw of keywords ?? []) {
    const raw = String(kw ?? "").trim();
    if (!raw) continue;

    const collapsed = normalizeKey(raw)
      .replace(/\bbusiness to business\b/g, "b2b")
      .replace(/\bbusiness to consumer\b/g, "b2c");

    const key = normalizeKey(cleanToken(collapsed) || collapsed);
    if (!key || key.length <= 1) continue;
    if (STOP_WORDS.has(key) || GENERIC_ENTITY_WORDS.has(key)) continue;
    if (looksLikeMoneyOrHeadcountToken(raw) || looksLikeMoneyOrHeadcountToken(key)) continue;
    if (geoKeys.has(key) || sectorKeys.has(key) || keywordOverlapsSector(key, sectorTags)) {
      continue;
    }
    // Also drop if any token of a multi-word keyword overlaps a sector
    if (key.split(/\s+/).some((tok) => tok.length >= 3 && keywordOverlapsSector(tok, sectorTags))) {
      continue;
    }
    candidates.push({ key, label: displayKeywordLabel(key) });
  }

  const candidateKeys = new Set(candidates.map((c) => c.key));

  // Promote split "recently"+"funded" into the atomic phrase
  if (
    (candidateKeys.has("recently") && candidateKeys.has("funded")) ||
    (candidateKeys.has("recent") && candidateKeys.has("funding"))
  ) {
    candidates.push({ key: "recently funded", label: "recently funded" });
    candidateKeys.add("recently funded");
  }

  if (candidateKeys.has("yc") && candidateKeys.has("backed")) {
    candidates.push({ key: "yc backed", label: "yc backed" });
    candidateKeys.add("yc backed");
  }

  if (candidateKeys.has("y") && candidateKeys.has("combinator")) {
    candidates.push({ key: "y combinator", label: "y combinator" });
    candidateKeys.add("y combinator");
  }

  for (const { key, label } of candidates) {
    // Drop orphan fragments when the full phrase is present
    if (PHRASE_FRAGMENT_TOKENS.has(key)) {
      const coveredByPhrase = [...KEYWORD_PHRASE_KEYS].some(
        (phrase) => candidateKeys.has(phrase) && phrase.includes(key)
      );
      if (coveredByPhrase) continue;
      // Lone fragment with no phrase — still drop (not a useful thesis alone)
      if (!KEYWORD_PHRASE_KEYS.has(key)) continue;
    }

    if (seen.has(key)) continue;
    seen.add(key);
    out.push(label);
  }

  return out;
}

/** Drop filler / generic tokens before pills or search use keywords. */
export function sanitizeKeywordsForDisplay(keywords, structured = {}) {
  return dedupeKeywords(keywords, {
    sectorTags: structured.sector_tags ?? [],
    geography: structured.geography ?? [],
  });
}

const MERGE_SCALAR_FIELDS = [
  "employees_min",
  "employees_max",
  "founded_after",
  "founded_before",
  "revenue_min",
  "revenue_max",
  "ebitda_min",
  "ebitda_max",
];

function emptyPatch() {
  return {
    geography: [],
    sector_tags: [],
    funding_stage: [],
    keywords: [],
    employees_min: null,
    employees_max: null,
    founded_after: null,
    founded_before: null,
    revenue_min: null,
    revenue_max: null,
    ebitda_min: null,
    ebitda_max: null,
    country_code: null,
    region: null,
  };
}

function containsPhrase(text, phrase) {
  const hay = normalizeKey(text);
  const needle = normalizeKey(phrase);
  if (!needle) return false;
  const re = new RegExp(`\\b${needle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i");
  return re.test(hay);
}

function removePhrase(text, phrase) {
  const re = new RegExp(
    `\\b${normalizeKey(phrase).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`,
    "gi"
  );
  return text.replace(re, " ").replace(/\s+/g, " ").trim();
}

function cleanToken(word) {
  return String(word ?? "").replace(/^[^a-zA-Z0-9+]+|[^a-zA-Z0-9+]+$/g, "");
}

/** Parse $15M / 15m / 40 million → USD number. */
export function parseUsdAmount(token) {
  const raw = String(token ?? "").trim().replace(/,/g, "");
  if (!raw) return null;
  const match = raw.match(/^\$?\s*([\d.]+)\s*(k|m|b|thousand|million|billion)?$/i);
  if (!match) return null;
  const n = Number(match[1]);
  if (!Number.isFinite(n)) return null;
  const unit = (match[2] ?? "").toLowerCase();
  if (unit === "k" || unit === "thousand") return n * 1_000;
  if (unit === "m" || unit === "million") return n * 1_000_000;
  if (unit === "b" || unit === "billion") return n * 1_000_000_000;
  return n;
}

function looksLikeMoneyOrHeadcountToken(text) {
  const t = String(text ?? "").trim();
  if (!t) return false;
  const key = normalizeKey(t);
  if (KEYWORD_PHRASE_KEYS.has(key) || key === "b2b" || key === "b2c") return false;
  // Bare headcount vocabulary left over from "100+ employees"
  if (/^(employees?|headcount|people|ftes?|staff)$/i.test(key)) return true;
  if (/^\d[\d,]*(?:\+)?$/.test(key)) return true;
  if (/\$/.test(t) && /\d/.test(t)) return true;
  // Require a digit immediately before the unit (15m, 40 million) — not "b2b"
  if (/\d[\d,]*(?:\.\d+)?\s*(?:k|m|b|million|billion|thousand)\b/i.test(t)) return true;
  if (/\d+\s*[-–—]\s*\$?\s*\d/i.test(t)) return true;
  if (/\d+\s+to\s+\$?\s*\d/i.test(t)) return true;
  if (/\d+\+/.test(t)) return true;
  if (/\b(?:revenue|ebitda|arr|employees?|headcount|people|ftes?)\b/i.test(t) && /\d/.test(t)) {
    return true;
  }
  return false;
}

/**
 * Pull revenue / EBITDA / employee ranges out of free text.
 * Returns structured min/max fields + remaining text with those spans removed.
 */
export function extractFinancialRanges(text) {
  let remaining = String(text ?? "");
  const out = {
    revenue_min: null,
    revenue_max: null,
    ebitda_min: null,
    ebitda_max: null,
    employees_min: null,
    employees_max: null,
  };

  const amount = String.raw`\$?\s*[\d,]+(?:\.\d+)?\s*(?:k|m|b|thousand|million|billion)?`;
  const moneyAmount = String.raw`(?:\$\s*[\d,]+(?:\.\d+)?\s*(?:k|m|b|thousand|million|billion)?|[\d,]+(?:\.\d+)?\s*(?:k|m|b|thousand|million|billion))`;
  const sep = String.raw`\s*[-–—to]+\s*`;

  // Require $ or unit so bare "50-200" is not treated as revenue
  const moneyRangeRe = new RegExp(
    `(${moneyAmount})${sep}(${moneyAmount})(?:\\s*(?:in\\s+)?(?:annual\\s+)?(revenue|arr|ebitda))?`,
    "gi"
  );
  const labeledMoneyRe = new RegExp(
    `\\b(revenue|arr|ebitda)\\b(?:\\s*(?:of|between|from|:))?\\s*(${amount})(?:${sep}(${amount}))?`,
    "gi"
  );
  const employeeRangeRe = new RegExp(
    `\\b(\\d{1,6})${sep}(\\d{1,6})\\s*(?:employees?|headcount|people|ftes?)\\b`,
    "gi"
  );
  const employeeMinPlusRe = new RegExp(
    `\\b(\\d{1,6})\\+\\s*(?:employees?|headcount|people|ftes?)\\b`,
    "gi"
  );
  const labeledEmployeesRe = new RegExp(
    `\\b(?:employees?|headcount|ftes?)\\b(?:\\s*(?:of|between|from|:|at\\s+least|over|above))?\\s*(\\d{1,6})(?:\\+|(?:${sep}(\\d{1,6})))?`,
    "gi"
  );

  remaining = remaining.replace(moneyRangeRe, (full, a, b, kind) => {
    const min = parseUsdAmount(a);
    const max = parseUsdAmount(b);
    if (min == null || max == null) return full;
    const field = String(kind ?? "revenue").toLowerCase() === "ebitda" ? "ebitda" : "revenue";
    out[`${field}_min`] = min;
    out[`${field}_max`] = max;
    return " ";
  });

  remaining = remaining.replace(labeledMoneyRe, (full, kind, a, b) => {
    const min = parseUsdAmount(a);
    const max = b ? parseUsdAmount(b) : null;
    if (min == null) return full;
    const field = String(kind).toLowerCase() === "ebitda" ? "ebitda" : "revenue";
    out[`${field}_min`] = min;
    if (max != null) out[`${field}_max`] = max;
    return " ";
  });

  remaining = remaining.replace(employeeRangeRe, (full, a, b) => {
    const min = Number(a);
    const max = Number(b);
    if (!Number.isFinite(min) || !Number.isFinite(max)) return full;
    out.employees_min = min;
    out.employees_max = max;
    return " ";
  });

  remaining = remaining.replace(employeeMinPlusRe, (full, a) => {
    const min = Number(a);
    if (!Number.isFinite(min)) return full;
    out.employees_min = min;
    out.employees_max = null;
    return " ";
  });

  remaining = remaining.replace(labeledEmployeesRe, (full, a, b) => {
    const min = Number(a);
    if (!Number.isFinite(min)) return full;
    out.employees_min = min;
    if (b) {
      const max = Number(b);
      if (Number.isFinite(max)) out.employees_max = max;
    }
    return " ";
  });

  return { ...out, remaining: remaining.replace(/\s+/g, " ").trim() };
}

/**
 * Pull known keyword phrases out of remaining text (keep as keywords),
 * strip command phrases, leave everything else for token classification.
 */
function extractKnownPhrases(text) {
  let remaining = String(text ?? "");
  const keywords = [];

  for (const phrase of COMMAND_PHRASES) {
    if (containsPhrase(remaining, phrase)) {
      remaining = removePhrase(remaining, phrase);
    }
  }

  for (const phrase of KEYWORD_PHRASES) {
    if (containsPhrase(remaining, phrase)) {
      keywords.push(displayKeywordLabel(normalizeKey(phrase)));
      remaining = removePhrase(remaining, phrase);
    }
  }

  return { keywords, remaining: remaining.replace(/\s+/g, " ").trim() };
}

export function expandSeriesOrShorthand(text) {
  let t = String(text ?? "");

  t = t.replace(
    /\bseries\s+([a-c])\s+or\s+([a-c])(\+|plus)?\b/gi,
    (_, first, second, plus) =>
      `series ${first} series ${second}${plus ? ` ${plus}` : ""}`
  );

  if (/\bseries\b/i.test(t)) {
    t = t.replace(/\bor\s+([a-c])(\+|plus)?\b/gi, (_, letter, plus) =>
      `series ${letter}${plus ? ` ${plus}` : ""}`
    );
  }

  return t.replace(/\s+/g, " ").trim();
}

function parseFundingStageToken(token) {
  const key = normalizeKey(token);
  if (STAGE_LABEL_TO_ENUM[key]) return STAGE_LABEL_TO_ENUM[key];
  for (const [re, stage] of STAGE_ALIASES) {
    re.lastIndex = 0;
    if (re.test(token)) return stage;
  }
  return null;
}

function extractFundingStages(text) {
  const stages = new Set();
  let remaining = expandSeriesOrShorthand(text);

  remaining = remaining.replace(
    /\bseries\s*([a-c])\s*(\+|plus)(?=\s|$|,)/gi,
    (_, letter) => {
      const min = STAGE_LETTER_TO_ENUM[letter.toLowerCase()];
      if (min) {
        for (const stage of fundingStagesAtOrAbove(min)) stages.add(stage);
      }
      return " ";
    }
  );

  for (const [re, stage] of STAGE_ALIASES) {
    re.lastIndex = 0;
    if (re.test(remaining)) {
      stages.add(stage);
      remaining = remaining.replace(re, " ");
    }
  }

  const key = normalizeKey(remaining);
  if (STAGE_LABEL_TO_ENUM[key]) {
    stages.add(STAGE_LABEL_TO_ENUM[key]);
    remaining = removePhrase(remaining, key);
  }

  return { stages: [...stages], remaining: remaining.replace(/\s+/g, " ").trim() };
}

/**
 * Classify a single token: stage → ISO country → abbrev → thesis keyword.
 * Sectors are LLM-owned — deterministic path does not invent sector tags.
 */
export function classifyToken(token, { originalText = "" } = {}) {
  const trimmed = String(token ?? "").trim();
  if (!trimmed) return { kind: "skip" };

  const key = normalizeKey(trimmed);
  if (STOP_WORDS.has(key)) return { kind: "skip" };

  const stage = parseFundingStageToken(trimmed);
  if (stage) return { kind: "funding_stage", value: stage };

  if (key.length === 1 && STAGE_LETTER_TO_ENUM[key] && /\bseries\b/i.test(originalText)) {
    return { kind: "funding_stage", value: STAGE_LETTER_TO_ENUM[key] };
  }

  const country = lookupCountry(trimmed);
  if (country) return { kind: "geography", value: country.name };

  const region = lookupRegion(trimmed);
  if (region) return { kind: "geography", value: region.label };

  const abbrev = expandAbbreviation(trimmed);
  if (abbrev.length > 0) return { kind: "geography", value: abbrev };

  if (KEYWORD_PHRASE_KEYS.has(key)) {
    return { kind: "keyword", value: displayKeywordLabel(key) };
  }

  if (key === "yc" || key === "ycombinator") {
    return { kind: "keyword", value: "y combinator" };
  }

  if (GENERIC_ENTITY_WORDS.has(key) || PHRASE_FRAGMENT_TOKENS.has(key)) {
    return { kind: "skip" };
  }

  return { kind: "keyword", value: trimmed };
}

/**
 * Split mandate text into clauses (commas + safe "or" lists).
 */
export function splitMandateClauses(text) {
  const expanded = expandSeriesOrShorthand(text);
  const clauses = [];

  for (const commaPart of expanded.split(",")) {
    const trimmed = commaPart.trim();
    if (!trimmed) continue;
    const orParts = trimmed.split(/\s+or\s+/i).map((s) => s.trim()).filter(Boolean);
    clauses.push(...orParts);
  }

  return clauses;
}

/**
 * Deterministic syntax patch: stages, ISO countries, abbrevs, finances —
 * not sector invention (LLM owns sector_tags).
 */
export function extractSyntaxPatch(fragment) {
  const patch = emptyPatch();
  const original = String(fragment ?? "").trim();
  if (!original) return patch;

  let text = expandSeriesOrShorthand(original);

  const finances = extractFinancialRanges(text);
  for (const field of [
    "revenue_min",
    "revenue_max",
    "ebitda_min",
    "ebitda_max",
    "employees_min",
    "employees_max",
  ]) {
    if (finances[field] != null) patch[field] = finances[field];
  }
  text = finances.remaining;

  const stages = extractFundingStages(text);
  patch.funding_stage.push(...stages.stages);
  text = stages.remaining;

  const abbrevs = extractAbbreviationsFromText(text);
  patch.geography.push(...abbrevs.geography);
  text = abbrevs.remaining;

  const countries = extractCountriesFromText(text);
  patch.geography.push(...countries.geography);
  text = countries.remaining;

  const regions = extractRegionsFromText(text);
  patch.geography.push(...regions.geography);
  text = regions.remaining;

  const known = extractKnownPhrases(text);
  patch.keywords.push(...known.keywords);
  text = known.remaining;

  const prepLocation = extractPrepositionalLocation(text);
  patch.geography.push(...prepLocation.geography);
  text = prepLocation.remaining;

  const words = text
    .split(/\s+/)
    .map((w) => cleanToken(w.trim()))
    .filter(Boolean);
  for (const word of words) {
    const key = normalizeKey(word);
    if (!key || STOP_WORDS.has(key)) continue;
    const classified = classifyToken(word, { originalText: original });
    if (classified.kind === "funding_stage") patch.funding_stage.push(classified.value);
    else if (classified.kind === "geography") {
      if (typeof classified.value === "string") patch.geography.push(classified.value);
      else if (Array.isArray(classified.value)) patch.geography.push(...classified.value);
    } else if (classified.kind === "keyword") patch.keywords.push(classified.value);
  }

  return patch;
}

/** @deprecated alias — use extractSyntaxPatch */
export const parseFragmentDeterministic = extractSyntaxPatch;

function extractSyntaxPatchFromText(accumulatedText) {
  const clauses = splitMandateClauses(accumulatedText);
  let patch = emptyPatch();
  for (const clause of clauses) {
    patch = mergePatches(patch, extractSyntaxPatch(clause));
  }
  return patch;
}

function dedupeList(items, keyFn = normalizeKey) {
  const seen = new Set();
  const out = [];
  for (const item of items ?? []) {
    const key = keyFn(item);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(typeof item === "string" ? item.trim() : item);
  }
  return out;
}

function dedupeGeography(geography) {
  return dedupeList(geography);
}

function dedupeStages(stages) {
  const seen = new Set();
  const out = [];
  for (const stage of stages ?? []) {
    const normalized = parseFundingStageToken(stage) ?? stage;
    if (!FUNDING_STAGES.includes(normalized) || seen.has(normalized)) continue;
    seen.add(normalized);
    out.push(normalized);
  }
  return out;
}

function mergePatches(a, b) {
  const merged = emptyPatch();
  merged.geography = [...(a.geography ?? []), ...(b.geography ?? [])];
  merged.sector_tags = [...(a.sector_tags ?? []), ...(b.sector_tags ?? [])];
  merged.funding_stage = [...(a.funding_stage ?? []), ...(b.funding_stage ?? [])];
  merged.keywords = [...(a.keywords ?? []), ...(b.keywords ?? [])];
  for (const field of MERGE_SCALAR_FIELDS) {
    merged[field] = b[field] ?? a[field] ?? null;
  }
  merged.country_code = b.country_code ?? a.country_code;
  merged.region = b.region ?? a.region;
  return merged;
}

/**
 * Re-run each LLM keyword through the syntax pipeline. Known thesis phrases stay
 * intact; mixed strings like "agricultural prayagraj" are split and relocated.
 * Money / headcount tokens become financial fields, not keywords.
 */
function relocateMisfiledKeywords(structured) {
  const geography = [...(structured.geography ?? [])];
  const sector_tags = [...(structured.sector_tags ?? [])];
  const funding_stage = [...(structured.funding_stage ?? [])];
  const keywords = [];
  const finances = {
    revenue_min: structured.revenue_min ?? null,
    revenue_max: structured.revenue_max ?? null,
    ebitda_min: structured.ebitda_min ?? null,
    ebitda_max: structured.ebitda_max ?? null,
    employees_min: structured.employees_min ?? null,
    employees_max: structured.employees_max ?? null,
  };

  for (const kw of structured.keywords ?? []) {
    const trimmed = String(kw ?? "").trim();
    if (!trimmed) continue;

    const key = normalizeKey(trimmed);
    if (KEYWORD_PHRASE_KEYS.has(key)) {
      keywords.push(displayKeywordLabel(key));
      continue;
    }

    if (looksLikeMoneyOrHeadcountToken(trimmed)) {
      const patch = extractSyntaxPatch(trimmed);
      for (const field of Object.keys(finances)) {
        if (patch[field] != null) finances[field] = patch[field];
      }
      continue;
    }

    const patch = extractSyntaxPatch(trimmed);
    geography.push(...patch.geography);
    sector_tags.push(...patch.sector_tags);
    funding_stage.push(...patch.funding_stage);
    for (const field of Object.keys(finances)) {
      if (patch[field] != null) finances[field] = patch[field];
    }
    keywords.push(...patch.keywords);
  }

  return { geography, sector_tags, funding_stage, keywords, ...finances };
}

export function normalizeMandateStructure(structured, { rawQuery = "" } = {}) {
  if (!structured) return structured;

  const withFlatGeo = {
    ...structured,
    geography: flattenCompoundGeography(structured.geography),
  };
  const relocated = relocateMisfiledKeywords(withFlatGeo);
  const promoted = promoteGeographyFromKeywords(relocated, rawQuery);
  const geography = dedupeGeography(flattenCompoundGeography(promoted.geography));
  const countryHint = inferCountryAndRegion(geography);

  const fromQuery = rawQuery ? extractFinancialRanges(rawQuery) : null;
  const { tags: sectorTags, demoted: demotedSectors } = normalizeSectorTags(
    promoted.sector_tags
  );
  // Keep demoted generic "tech" as a keyword so adding a specific sector
  // (e.g. healthcare) does not erase the earlier tech criterion.
  const keywords = dedupeKeywords(
    [...(promoted.keywords ?? []), ...demotedSectors],
    { sectorTags, geography }
  );

  return {
    ...structured,
    geography,
    sector_tags: sectorTags,
    funding_stage: dedupeStages(promoted.funding_stage),
    keywords,
    revenue_min: promoted.revenue_min ?? fromQuery?.revenue_min ?? structured.revenue_min ?? null,
    revenue_max: promoted.revenue_max ?? fromQuery?.revenue_max ?? structured.revenue_max ?? null,
    ebitda_min: promoted.ebitda_min ?? fromQuery?.ebitda_min ?? structured.ebitda_min ?? null,
    ebitda_max: promoted.ebitda_max ?? fromQuery?.ebitda_max ?? structured.ebitda_max ?? null,
    employees_min:
      promoted.employees_min ?? fromQuery?.employees_min ?? structured.employees_min ?? null,
    employees_max:
      promoted.employees_max ?? fromQuery?.employees_max ?? structured.employees_max ?? null,
    country_code:
      structured.country_code ??
      (geography.length > 1 ? null : countryHint.country_code),
    region: structured.region ?? countryHint.region,
  };
}

/** @deprecated alias */
export const normalizeMandateGeography = normalizeMandateStructure;

function emptyStructured(intent = "mandate_search") {
  return {
    intent,
    company_names: [],
    geography: [],
    sector_tags: [],
    funding_stage: [],
    keywords: [],
    country_code: null,
    region: null,
    employees_min: null,
    employees_max: null,
    founded_after: null,
    founded_before: null,
    revenue_min: null,
    revenue_max: null,
    ebitda_min: null,
    ebitda_max: null,
  };
}

function patchToStructured(patch, intent = "mandate_search") {
  return normalizeMandateStructure({
    ...emptyStructured(intent),
    geography: patch.geography ?? [],
    sector_tags: patch.sector_tags ?? [],
    funding_stage: patch.funding_stage ?? [],
    keywords: patch.keywords ?? [],
    country_code: patch.country_code,
    region: patch.region,
    ...Object.fromEntries(MERGE_SCALAR_FIELDS.map((f) => [f, patch[f] ?? null])),
  });
}

/**
 * LLM-primary reconcile: Light Agent structured output + deterministic syntax patches.
 */
export function rebuildFromAccumulatedText(accumulatedText, llmStructured = null) {
  const syntaxPatch = extractSyntaxPatchFromText(accumulatedText);

  if (!llmStructured) {
    return patchToStructured(syntaxPatch);
  }

  const merged = normalizeMandateStructure(
    {
      ...emptyStructured(llmStructured.intent ?? "mandate_search"),
      ...Object.fromEntries(
        MERGE_SCALAR_FIELDS.filter((f) => llmStructured[f] != null).map((f) => [
          f,
          llmStructured[f],
        ])
      ),
      intent: llmStructured.intent ?? "mandate_search",
      company_names: llmStructured.company_names ?? [],
      geography: dedupeList([
        ...(llmStructured.geography ?? []),
        ...(syntaxPatch.geography ?? []),
      ]),
      sector_tags: dedupeList([
        ...(llmStructured.sector_tags ?? []),
        ...(syntaxPatch.sector_tags ?? []),
      ]),
      funding_stage: dedupeStages([
        ...(llmStructured.funding_stage ?? []),
        ...(syntaxPatch.funding_stage ?? []),
      ]),
      keywords: dedupeList([
        ...(llmStructured.keywords ?? []),
        ...(syntaxPatch.keywords ?? []),
      ]),
      country_code: llmStructured.country_code,
      region: llmStructured.region,
    },
    { rawQuery: accumulatedText }
  );

  return merged;
}

export function mergeIncrementalMandate(prior, addition, fragmentText = "") {
  if (!prior && !addition) return null;

  const syntaxPatch = extractSyntaxPatch(fragmentText);
  const llmLike = {
    ...emptyStructured(prior?.intent ?? "mandate_search"),
    ...prior,
    geography: dedupeList([
      ...(prior?.geography ?? []),
      ...(addition?.geography ?? []),
      ...(syntaxPatch.geography ?? []),
    ]),
    sector_tags: dedupeList([
      ...(prior?.sector_tags ?? []),
      ...(addition?.sector_tags ?? []),
      ...(syntaxPatch.sector_tags ?? []),
    ]),
    funding_stage: dedupeStages([
      ...(prior?.funding_stage ?? []),
      ...(addition?.funding_stage ?? []),
      ...(syntaxPatch.funding_stage ?? []),
    ]),
    keywords: dedupeList([
      ...(prior?.keywords ?? []),
      ...(addition?.keywords ?? []),
      ...(syntaxPatch.keywords ?? []),
    ]),
    country_code: addition?.country_code ?? prior?.country_code,
    region: addition?.region ?? prior?.region,
  };

  for (const field of MERGE_SCALAR_FIELDS) {
    if (addition?.[field] != null) llmLike[field] = addition[field];
  }

  return normalizeMandateStructure(llmLike);
}

/**
 * True when text is (or resolves entirely to) known geography:
 * ISO country, macro-region, or city abbreviation.
 */
export function isKnownGeographyFragment(text) {
  const trimmed = String(text ?? "").trim();
  if (!trimmed) return false;
  if (lookupCountry(trimmed) || lookupRegion(trimmed)) return true;
  if (expandAbbreviation(trimmed).length > 0) return true;

  const countries = extractCountriesFromText(trimmed);
  const regions = extractRegionsFromText(countries.remaining);
  const abbrevs = extractAbbreviationsFromText(regions.remaining);
  const geoCount =
    countries.geography.length + regions.geography.length + abbrevs.geography.length;
  if (geoCount === 0) return false;

  const leftover = abbrevs.remaining
    .split(/\s+/)
    .map((w) => normalizeKey(w))
    .filter((w) => w && !STOP_WORDS.has(w) && !GENERIC_ENTITY_WORDS.has(w));
  return leftover.length === 0;
}

/**
 * Short alphabetic fragment that may be an unlisted city/region name.
 * Used only when promoting misfiled keywords after an incremental add.
 */
function isBarePlaceNameCandidate(text) {
  const trimmed = String(text ?? "").trim();
  if (!trimmed || trimmed.length > 48) return false;
  if (/\d/.test(trimmed)) return false;
  if (parseFundingStageToken(trimmed)) return false;
  if (looksLikeMoneyOrHeadcountToken(trimmed)) return false;
  if (KEYWORD_PHRASE_KEYS.has(normalizeKey(trimmed))) return false;
  const words = trimmed.split(/\s+/);
  if (words.length === 0 || words.length > 3) return false;
  return words.every((w) => {
    const key = normalizeKey(w);
    return (
      /^[a-zA-Z][a-zA-Z'-]*$/.test(w) &&
      !STOP_WORDS.has(key) &&
      !GENERIC_ENTITY_WORDS.has(key)
    );
  });
}

/**
 * If the LLM dumped a place into keywords, move it to geography.
 */
function promoteGeographyFromKeywords(structured, fragment = "") {
  if (!structured) return structured;
  const geography = [...(structured.geography ?? [])];
  const keywords = [];
  const fragKey = normalizeKey(fragment);

  for (const kw of structured.keywords ?? []) {
    const trimmed = String(kw ?? "").trim();
    if (!trimmed) continue;
    const key = normalizeKey(trimmed);

    if (
      isKnownGeographyFragment(trimmed) ||
      (fragKey &&
        key === fragKey &&
        isBarePlaceNameCandidate(trimmed) &&
        !keywordOverlapsSector(key, structured.sector_tags ?? []))
    ) {
      const region = lookupRegion(trimmed);
      const country = lookupCountry(trimmed);
      const abbrev = expandAbbreviation(trimmed);
      if (region) geography.push(region.label);
      else if (country) geography.push(country.name);
      else if (abbrev.length) geography.push(...abbrev);
      else geography.push(titleCase(trimmed));
      continue;
    }
    keywords.push(trimmed);
  }

  return {
    ...structured,
    geography,
    keywords,
  };
}

export function looksLikeLocationFragment(text) {
  const trimmed = String(text ?? "").trim();
  if (!trimmed) return false;
  if (isKnownGeographyFragment(trimmed)) return true;

  const countries = extractCountriesFromText(trimmed);
  const regions = extractRegionsFromText(countries.remaining);
  const abbrevs = extractAbbreviationsFromText(regions.remaining);
  const geoCount =
    countries.geography.length + regions.geography.length + abbrevs.geography.length;
  const remaining = abbrevs.remaining
    .split(/\s+/)
    .filter((w) => w && !STOP_WORDS.has(normalizeKey(w)));
  return geoCount > 0 && remaining.length <= 1;
}

export function mergeFieldAddition(prior, field, text) {
  if (!prior || !field) return prior;

  const fragment = String(text ?? "").trim();
  if (!fragment) return prior;

  const patch = extractSyntaxPatch(fragment);
  let values = [];

  if (field === "geography") {
    values = patch.geography.length
      ? flattenCompoundGeography(patch.geography)
      : [titleCase(fragment)];
  } else if (field === "sector_tags") {
    values = [normalizeKey(fragment)];
  } else if (field === "funding_stage") {
    values = patch.funding_stage.length
      ? patch.funding_stage
      : parseFundingStageToken(fragment)
        ? [parseFundingStageToken(fragment)]
        : [];
  } else if (field === "keywords") {
    values = patch.keywords.length ? patch.keywords : [fragment];
  } else {
    return prior;
  }

  if (!values.length) return prior;
  return mergeIncrementalMandate(prior, { [field]: values }, fragment);
}

export function reconcileMandateStructured(accumulatedText, llmStructured) {
  return rebuildFromAccumulatedText(accumulatedText, llmStructured);
}
