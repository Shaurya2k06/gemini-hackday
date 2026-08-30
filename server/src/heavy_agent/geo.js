/**
 * Geography → Serper geo params and regional source hints.
 * City/country expansion is owned by Light Agent (country_code, region, geography[]).
 */
import {
  inferCountryAndRegion,
  lookupCountry,
  getRegionForCountryCode,
  inferCountryCodeFromGeoString,
} from "../light_agent/geo/countries.js";

/**
 * Country-code → ccTLD that strongly imply a different country.
 * Used as a hard gate when mandate country_code is set.
 */
const COUNTRY_CONFLICT_TLDS = {
  ES: [".ie", ".in", ".ng", ".br", ".mx", ".jp", ".kr", ".au", ".za", ".ke"],
  DE: [".ie", ".in", ".br", ".ng", ".es", ".jp"],
  FR: [".ie", ".in", ".br", ".ng", ".de", ".es"],
  GB: [".ie", ".in", ".br", ".ng", ".us"],
  UK: [".ie", ".in", ".br", ".ng"],
  IE: [".in", ".es", ".br", ".ng", ".de"],
  IN: [".ie", ".es", ".br", ".ng", ".de", ".uk"],
  BR: [".ie", ".in", ".es", ".ng", ".de"],
  US: [".ie", ".in", ".br", ".ng", ".es", ".de", ".uk"],
  NG: [".ie", ".in", ".es", ".br", ".de"],
  SG: [".ie", ".in", ".es", ".br", ".ng"],
  CO: [".ie", ".in", ".es", ".ng", ".de", ".uk", ".br"],
};

function normalizeGeoKey(value) {
  return String(value ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}

function resolveMandateCountryCode(structured) {
  let code = String(structured?.country_code ?? "")
    .trim()
    .toUpperCase();
  if (code) return code;

  const inferred = inferCountryAndRegion(structured?.geography ?? []);
  return inferred.country_code ?? "";
}

export function resolveGeoParams(structured) {
  const geography = structured?.geography ?? [];
  const location = geography.filter(Boolean).join(", ") || undefined;
  const code = resolveMandateCountryCode(structured);
  const region =
    structured?.region ?? (code ? getRegionForCountryCode(code) : null) ?? null;

  if (code && /^[A-Z]{2}$/.test(code)) {
    return {
      gl: code.toLowerCase(),
      location: location ?? region ?? undefined,
      jurisdictionHint: code.toLowerCase(),
      region,
      country_code: code,
    };
  }

  if (region) {
    return {
      gl: undefined,
      location,
      jurisdictionHint: undefined,
      region,
      country_code: null,
    };
  }

  if (location) {
    return {
      gl: undefined,
      location,
      jurisdictionHint: undefined,
      region: null,
      country_code: null,
    };
  }

  return {};
}

export function isIndiaGeography(structured) {
  if (structured?.region === "india") return true;
  if (String(structured?.country_code ?? "").toUpperCase() === "IN") return true;
  return resolveGeoParams(structured).region === "india";
}

/** Client-side location filter for GitHub org profiles — token overlap only. */
export function locationMatchesGeography(location, structured) {
  const loc = String(location ?? "").toLowerCase();
  if (!loc) return false;
  const geos = structured?.geography ?? [];
  if (geos.length === 0) return true;

  for (const geo of geos) {
    const key = normalizeGeoKey(geo);
    if (key && loc.includes(key)) return true;
  }

  const mandateCountry = resolveMandateCountryCode(structured);
  if (mandateCountry) {
    const country = lookupCountry(mandateCountry);
    if (country && loc.includes(normalizeGeoKey(country.name))) return true;
  }

  return false;
}

function domainHasConflictTld(domain, countryCode) {
  const host = String(domain ?? "").toLowerCase().replace(/^www\./, "");
  if (!host || !countryCode) return false;
  const conflicts = COUNTRY_CONFLICT_TLDS[countryCode] ?? [];
  return conflicts.some((tld) => host.endsWith(tld));
}

function geographyOverlapsMandate(geography, structured) {
  const geo = normalizeGeoKey(geography);
  if (!geo || geo === "unknown") return false;

  const mandateGeos = structured?.geography ?? [];
  for (const token of mandateGeos) {
    const key = normalizeGeoKey(token);
    if (key && (geo.includes(key) || key.includes(geo))) return true;
  }

  const mandateCode = resolveMandateCountryCode(structured);
  if (mandateCode) {
    const country = lookupCountry(mandateCode);
    if (country && geo.includes(normalizeGeoKey(country.name))) return true;
  }

  return false;
}

function geographyConflictsCountry(geography, countryCode, structured) {
  if (!countryCode) return false;

  const inferred = inferCountryCodeFromGeoString(geography);
  if (inferred && inferred !== countryCode) return true;

  if (geographyOverlapsMandate(geography, structured ?? { country_code: countryCode })) {
    return false;
  }

  return false;
}

/**
 * Hard geo gate: when mandate has country_code, reject clear wrong-country domains/HQ.
 * Returns { ok, reason }.
 */
export function passesCountryHardGate(company, structured) {
  const code = resolveMandateCountryCode(structured);
  if (!code) return { ok: true, reason: null };

  const domain = company?.domain ?? null;
  if (domainHasConflictTld(domain, code)) {
    return { ok: false, reason: `domain_tld_conflicts_${code}` };
  }

  if (geographyConflictsCountry(company?.geography, code, structured)) {
    return { ok: false, reason: `geography_conflicts_${code}` };
  }

  return { ok: true, reason: null };
}

/**
 * Filter company list with country hard gate. Returns { kept, dropped }.
 */
export function applyCountryHardGate(companies, structured) {
  const kept = [];
  const dropped = [];
  for (const company of companies ?? []) {
    const gate = passesCountryHardGate(company, structured);
    if (gate.ok) kept.push(company);
    else dropped.push({ company, reason: gate.reason });
  }
  return { kept, dropped };
}
