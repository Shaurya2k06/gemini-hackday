import { COUNTRY_ENTRIES } from "./countries-data.js";

/** ISO 3166-1 alpha-2 → region bucket for Light Agent. */
const CODE_TO_REGION = {
  IN: "india",
  US: "us",
  CA: "us",
  GB: "europe",
  UK: "europe",
  DE: "europe",
  FR: "europe",
  ES: "europe",
  IT: "europe",
  NL: "europe",
  BE: "europe",
  SE: "europe",
  NO: "europe",
  DK: "europe",
  FI: "europe",
  CH: "europe",
  AT: "europe",
  IE: "europe",
  PL: "europe",
  PT: "europe",
  GR: "europe",
  CZ: "europe",
  RO: "europe",
  HU: "europe",
  BA: "europe",
  HR: "europe",
  RS: "europe",
  UA: "europe",
  JP: "apac",
  CN: "apac",
  KR: "apac",
  SG: "apac",
  AU: "apac",
  NZ: "apac",
  TW: "apac",
  HK: "apac",
  TH: "apac",
  VN: "apac",
  ID: "apac",
  MY: "apac",
  PH: "apac",
  PK: "apac",
  BD: "apac",
  BR: "latam",
  MX: "latam",
  AR: "latam",
  CO: "latam",
  CL: "latam",
  PE: "latam",
  UY: "latam",
  NG: "africa",
  KE: "africa",
  ZA: "africa",
  EG: "africa",
  GH: "africa",
  AE: "other",
  IL: "other",
  SA: "other",
  TR: "other",
};

function normalizeKey(value) {
  return String(value ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const ALIAS_TO_COUNTRY = new Map();
const NAME_TO_CODE = new Map();

for (const entry of COUNTRY_ENTRIES) {
  const aliases = new Set([
    normalizeKey(entry.name),
    ...entry.aliases.map(normalizeKey),
  ]);
  for (const alias of aliases) {
    if (alias) ALIAS_TO_COUNTRY.set(alias, entry);
  }
  NAME_TO_CODE.set(normalizeKey(entry.name), entry.code);
}

const ALIAS_KEYS_LONGEST_FIRST = [...ALIAS_TO_COUNTRY.keys()].sort(
  (a, b) => b.length - a.length
);

/**
 * Lookup a single token against ISO country names/aliases.
 * @returns {{ name: string, code: string } | null}
 */
export function lookupCountry(token) {
  const key = normalizeKey(token);
  if (!key) return null;
  const entry = ALIAS_TO_COUNTRY.get(key);
  return entry ? { name: entry.name, code: entry.code } : null;
}

/**
 * Extract country names from free text (longest alias match).
 */
export function extractCountriesFromText(text) {
  const geography = [];
  const codes = new Set();
  let remaining = String(text ?? "");

  for (const alias of ALIAS_KEYS_LONGEST_FIRST) {
    const re = new RegExp(`\\b${alias.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i");
    if (!re.test(remaining)) continue;
    const entry = ALIAS_TO_COUNTRY.get(alias);
    if (!entry || codes.has(entry.code)) {
      remaining = remaining.replace(re, " ").replace(/\s+/g, " ").trim();
      continue;
    }
    codes.add(entry.code);
    geography.push(entry.name);
    remaining = remaining.replace(re, " ").replace(/\s+/g, " ").trim();
  }

  return { geography, remaining, codes: [...codes] };
}

/**
 * Macro-regions from the Light Agent region enum + common PE aliases.
 * Closed set (not city hardcoding) — complements ISO country lookup.
 */
const REGION_ALIAS_TO_META = new Map();

function registerRegionAlias(alias, id, label) {
  const key = normalizeKey(alias);
  if (key) REGION_ALIAS_TO_META.set(key, { id, label });
}

for (const [id, label] of [
  ["europe", "Europe"],
  ["apac", "APAC"],
  ["latam", "LatAm"],
  ["africa", "Africa"],
  ["india", "India"],
  ["us", "United States"],
]) {
  registerRegionAlias(id, id, label);
}

for (const [alias, id, label] of [
  ["eu", "europe", "Europe"],
  ["emea", "europe", "Europe"],
  ["european union", "europe", "Europe"],
  ["asia pacific", "apac", "APAC"],
  ["asia-pacific", "apac", "APAC"],
  ["southeast asia", "apac", "APAC"],
  ["sea", "apac", "APAC"],
  ["latin america", "latam", "LatAm"],
  ["south america", "latam", "LatAm"],
  ["north america", "us", "North America"],
  ["usa", "us", "United States"],
  ["u.s.", "us", "United States"],
  ["u.s.a.", "us", "United States"],
]) {
  registerRegionAlias(alias, id, label);
}

const REGION_ALIAS_KEYS_LONGEST_FIRST = [...REGION_ALIAS_TO_META.keys()].sort(
  (a, b) => b.length - a.length
);

/**
 * Lookup a macro-region token (europe, apac, latam, …).
 * @returns {{ id: string, label: string } | null}
 */
export function lookupRegion(token) {
  const key = normalizeKey(token);
  if (!key) return null;
  return REGION_ALIAS_TO_META.get(key) ?? null;
}

/**
 * Extract macro-region labels from free text.
 */
export function extractRegionsFromText(text) {
  const geography = [];
  const regions = new Set();
  let remaining = String(text ?? "");

  for (const alias of REGION_ALIAS_KEYS_LONGEST_FIRST) {
    const re = new RegExp(`\\b${alias.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i");
    if (!re.test(remaining)) continue;
    const meta = REGION_ALIAS_TO_META.get(alias);
    if (!meta || regions.has(meta.id)) {
      remaining = remaining.replace(re, " ").replace(/\s+/g, " ").trim();
      continue;
    }
    regions.add(meta.id);
    geography.push(meta.label);
    remaining = remaining.replace(re, " ").replace(/\s+/g, " ").trim();
  }

  return { geography, remaining, regions: [...regions] };
}

/** True when token is a known country, city abbrev, or macro-region. */
export function isKnownGeographyToken(token) {
  if (!String(token ?? "").trim()) return false;
  if (lookupCountry(token)) return true;
  if (lookupRegion(token)) return true;
  // Lazy import avoided — callers may also check abbreviations
  return false;
}

export function inferCountryAndRegion(geography) {
  const codes = new Set();
  let regionFromLabel = null;

  for (const g of geography ?? []) {
    const hit = lookupCountry(g);
    if (hit) codes.add(hit.code);
    else {
      const byName = NAME_TO_CODE.get(normalizeKey(g));
      if (byName) codes.add(byName);
    }
    const regionHit = lookupRegion(g);
    if (regionHit) regionFromLabel = regionHit.id;
  }

  if (codes.size === 1) {
    const [code] = [...codes];
    return {
      country_code: code,
      region: CODE_TO_REGION[code] ?? regionFromLabel ?? "other",
    };
  }

  if (regionFromLabel) {
    return { country_code: null, region: regionFromLabel };
  }

  return { country_code: null, region: null };
}

/** Region bucket for a known ISO country code. */
export function getRegionForCountryCode(code) {
  const upper = String(code ?? "")
    .trim()
    .toUpperCase();
  if (!upper) return null;
  return CODE_TO_REGION[upper] ?? "other";
}

/**
 * Infer ISO country from a single geography string (e.g. company HQ line).
 * @returns {string | null} ISO 3166-1 alpha-2
 */
export function inferCountryCodeFromGeoString(geo) {
  const text = String(geo ?? "").trim();
  if (!text) return null;

  const tokens = text.split(/[,;]/).map((part) => part.trim()).filter(Boolean);
  const { country_code } = inferCountryAndRegion(tokens.length > 0 ? tokens : [text]);
  return country_code;
}
