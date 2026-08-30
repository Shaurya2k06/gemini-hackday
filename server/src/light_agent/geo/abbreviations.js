/** PE-analyst city/region slang — small map only; countries use ISO lookup. */

export const CITY_ABBREVIATIONS = {
  hyd: ["Hyderabad", "Telangana"],
  hyderabad: ["Hyderabad", "Telangana"],
  delhi: ["Delhi"],
  ncr: ["Delhi"],
  blr: ["Bengaluru", "Karnataka"],
  bangalore: ["Bengaluru", "Karnataka"],
  bengaluru: ["Bengaluru", "Karnataka"],
  mum: ["Mumbai", "Maharashtra"],
  mumbai: ["Mumbai", "Maharashtra"],
  chennai: ["Chennai", "Tamil Nadu"],
  pune: ["Pune", "Maharashtra"],
  kolkata: ["Kolkata", "West Bengal"],
  sf: ["San Francisco", "California"],
  "san francisco": ["San Francisco", "California"],
  nyc: ["New York", "New York"],
  "new york": ["New York", "New York"],
  la: ["Los Angeles", "California"],
  "los angeles": ["Los Angeles", "California"],
};

const ABBREV_KEYS_LONGEST_FIRST = Object.keys(CITY_ABBREVIATIONS).sort(
  (a, b) => b.length - a.length
);

function normalizeKey(value) {
  return String(value ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function expandAbbreviation(token) {
  const key = normalizeKey(token);
  if (!key) return [];
  return CITY_ABBREVIATIONS[key] ? [...CITY_ABBREVIATIONS[key]] : [];
}

export function extractAbbreviationsFromText(text) {
  const geography = [];
  let remaining = String(text ?? "");

  for (const key of ABBREV_KEYS_LONGEST_FIRST) {
    const re = new RegExp(`\\b${key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i");
    if (re.test(remaining)) {
      geography.push(...CITY_ABBREVIATIONS[key]);
      remaining = remaining.replace(re, " ").replace(/\s+/g, " ").trim();
    }
  }

  return { geography, remaining };
}
