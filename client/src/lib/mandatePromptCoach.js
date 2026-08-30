export const PROMPT_COACH_STORAGE_KEY = 'meredian_prompt_coach_seen';

export const MANDATE_PARAMETER_HINTS = [
  { label: 'Sector', examples: 'B2B SaaS, Fintech, Healthcare, Industrial tech' },
  { label: 'Geography', examples: 'Germany, US, Singapore, Brazil, DACH' },
  { label: 'Revenue / EBITDA', examples: '$10M–$50M revenue, $5M+ EBITDA' },
  { label: 'Headcount', examples: '50–200 employees, 100+ employees' },
  { label: 'Funding stage', examples: 'Series B+, Seed, Pre-revenue growth' },
];

const NONSENSE_PATTERNS = [
  /^[^a-zA-Z0-9]+$/,
  /^(asdf|qwerty|test|hello|hi|ok|lol|abc)+$/i,
  /^(.)\1{6,}$/,
];

const SECTOR_SIGNALS =
  /\b(software|saas|fintech|health|healthcare|tech|b2b|industrial|logistics|proptech|edtech|cyber|devtools|ai|manufacturing|legal|hr|insur|agri|climate|retail|construction|media|payments|platform|startup|company|companies)\b/i;

const GEO_SIGNALS =
  /\b(germany|france|uk|united kingdom|us|usa|america|singapore|brazil|india|canada|australia|netherlands|spain|italy|nordic|dach|europe|asia|mexico|japan|korea|uae|poland|emea|apac|latam)\b/i;

const FINANCIAL_SIGNALS =
  /\$|\brevenue\b|\bebitda\b|\bmillion\b|\bemployees?\b|\bseries\s*[a-d]\b|\bseed\b|\bfunding\b|\braised\b|\b\d+\s*[-–]\s*\d+\b/i;

const GENERIC_ONLY =
  /^(find|show|get|list|search|give)\s+(me\s+)?(some\s+)?(good\s+)?(companies|startups|businesses|deals|opportunities)\.?$/i;

export function hasSeenPromptCoach() {
  try {
    return localStorage.getItem(PROMPT_COACH_STORAGE_KEY) === '1';
  } catch {
    return false;
  }
}

export function markPromptCoachSeen() {
  try {
    localStorage.setItem(PROMPT_COACH_STORAGE_KEY, '1');
  } catch {
    /* ignore */
  }
}

export function assessPromptQuality(query) {
  const trimmed = (query ?? '').trim();
  if (!trimmed) return { poor: false };

  for (const pattern of NONSENSE_PATTERNS) {
    if (pattern.test(trimmed)) {
      return { poor: true, reason: 'nonsense' };
    }
  }

  if (GENERIC_ONLY.test(trimmed)) {
    return { poor: true, reason: 'generic' };
  }

  const wordCount = trimmed.split(/\s+/).filter(Boolean).length;
  const hasSector = SECTOR_SIGNALS.test(trimmed);
  const hasGeo = GEO_SIGNALS.test(trimmed);
  const hasFinancial = FINANCIAL_SIGNALS.test(trimmed);
  const signalCount = [hasSector, hasGeo, hasFinancial].filter(Boolean).length;

  if (trimmed.length < 12 || wordCount < 3) {
    return { poor: true, reason: 'short' };
  }

  if (signalCount === 0) {
    return { poor: true, reason: 'missing_criteria' };
  }

  if (signalCount === 1 && wordCount < 5) {
    return { poor: true, reason: 'thin' };
  }

  return { poor: false };
}

function titleCase(text) {
  return text.replace(/\b\w/g, (c) => c.toUpperCase());
}

export function improvePrompt(query) {
  const trimmed = (query ?? '').trim();
  if (!trimmed) {
    return 'B2B software companies in Germany with $15M–$40M revenue and 50–200 employees';
  }

  const sectorMatch = trimmed.match(
    /\b(b2b\s+software|fintech|healthcare(?:\s+saas)?|industrial\s+tech|logistics|proptech|edtech|cybersecurity|devtools|ai\s+infrastructure|manufacturing|legal\s+tech|hr\s+tech|insurtech|agritech|climate\s+tech|retail\s+tech|payments|saas|software)\b/i
  );
  const geoMatch = trimmed.match(
    /\b(germany|france|uk|united kingdom|us|usa|singapore|brazil|india|canada|australia|netherlands|spain|italy|nordics|dach|europe|southeast asia|mexico|japan|south korea|uae|poland)\b/i
  );
  const hasFinancial = FINANCIAL_SIGNALS.test(trimmed);

  let sector = sectorMatch ? titleCase(sectorMatch[1]) : 'B2B software';
  let geo = geoMatch ? titleCase(geoMatch[1]) : 'Germany';

  if (geoMatch && /^(us|usa|uk)$/i.test(geoMatch[1])) {
    geo = geoMatch[1].toUpperCase() === 'UK' ? 'the UK' : 'the US';
  }
  if (geoMatch && /^dach$/i.test(geoMatch[1])) geo = 'DACH';

  const base = `${sector} companies in ${geo}`;

  if (hasFinancial) {
    if (!sectorMatch || !geoMatch) {
      return `${trimmed} — add sector and geography if missing (e.g. ${base} with $15M–$40M revenue)`;
    }
    return trimmed.endsWith('.') ? trimmed : `${trimmed}, with clear revenue or EBITDA bands`;
  }

  if (/\bemployee/i.test(trimmed)) {
    return `${base}, 50–200 employees`;
  }

  if (/\bseries\b/i.test(trimmed)) {
    return `${base}, Series B+`;
  }

  if (/\bebitda\b/i.test(trimmed)) {
    return `${base} with $5M+ EBITDA`;
  }

  if (sectorMatch && geoMatch) {
    return `${base} with $15M–$40M revenue and 50–200 employees`;
  }

  if (trimmed.length < 40) {
    return `${trimmed} — ${base} with $15M–$40M revenue and 50–200 employees`;
  }

  return `${base} with $15M–$40M revenue and 50–200 employees`;
}
