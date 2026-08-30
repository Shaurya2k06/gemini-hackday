const TTL_DAYS_BY_STAGE = {
  "pre-seed": 14,
  seed: 30,
  series_a: 90,
  series_b: 90,
  series_c_plus: 180,
  unknown: 14,
};

function ttlDaysForStage(fundingStage) {
  const days = TTL_DAYS_BY_STAGE[fundingStage];
  if (days === undefined) {
    throw new Error(`Unknown funding stage: ${fundingStage}`);
  }
  return days;
}

function normalizeToken(value) {
  return String(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function tokenSet(value) {
  return new Set(normalizeToken(value).split(/\s+/).filter(Boolean));
}

function tagsOverlap(queryTags, companyTags, description = "") {
  if (queryTags.length === 0) return 1;

  const descTokens = tokenSet(description);
  let matches = 0;

  for (const tag of queryTags) {
    const normalized = normalizeToken(tag);
    const tagTokens = tokenSet(tag);

    const sectorHit = companyTags.some((companyTag) => {
      const ct = normalizeToken(companyTag);
      return ct.includes(normalized) || normalized.includes(ct);
    });

    const descHit = [...tagTokens].some((t) => descTokens.has(t));

    if (sectorHit || descHit) {
      matches += 1;
    }
  }

  return matches / queryTags.length;
}

export function scoreSectorAlignment(structured, company) {
  const queryTags = [
    ...(structured.sector_tags ?? []),
    ...(structured.keywords ?? []),
  ].filter(Boolean);

  if (queryTags.length === 0) return 1;

  return tagsOverlap(queryTags, company.sector_tags ?? [], company.description ?? "");
}

export function scoreFundingStageMatch(structured, company) {
  const queryStages = structured.funding_stage ?? [];
  if (queryStages.length === 0) return null;

  const stage = company.funding_stage;
  if (!stage || stage === "unknown") return null;
  if (queryStages.includes(stage)) return 1;
  return 0;
}

export function scoreGeographyMatch(structured, company) {
  const queryGeos = structured.geography ?? [];
  if (queryGeos.length === 0) return null;

  const companyGeo = normalizeToken(company.geography ?? "");
  if (!companyGeo || companyGeo === "unknown") return null;

  const hits = queryGeos.filter((geo) => companyGeo.includes(normalizeToken(geo)));
  if (hits.length === 0) return 0;
  return hits.length / queryGeos.length;
}

export function scoreFoundedRecency(structured, company, now = new Date()) {
  const founded = company.founded_date ? new Date(company.founded_date) : null;

  if (structured.founded_after || structured.founded_before) {
    if (!founded) return 0.4;
    if (structured.founded_after && founded < new Date(structured.founded_after)) {
      return 0;
    }
    if (structured.founded_before && founded > new Date(structured.founded_before)) {
      return 0;
    }
    return 1;
  }

  if (!founded) return 0.5;

  const ageYears = (now.getTime() - founded.getTime()) / (365.25 * 24 * 60 * 60 * 1000);
  return Math.max(0, Math.min(1, 1 - ageYears / 20));
}

export function scoreEmployeeCountFit(structured, company) {
  const { employees_min: min, employees_max: max } = structured;
  if (min == null && max == null) return null;

  const count = company.employees_count;
  if (count == null) return null;

  if (min != null && count < min) return 0;
  if (max != null && count > max) return 0;
  return 1;
}

export function scoreSignalRecency(company, now = new Date()) {
  const scrapedAt = company.last_scraped_at ? new Date(company.last_scraped_at) : null;
  if (!scrapedAt) return 0.5;

  const daysSince = (now.getTime() - scrapedAt.getTime()) / (24 * 60 * 60 * 1000);
  const ttlDays = ttlDaysForStage(company.funding_stage ?? "unknown");
  return Math.max(0, Math.min(1, 1 - daysSince / ttlDays));
}

function companyFinancialValue(company) {
  if (company.annual_ebitda_usd != null) {
    return { value: Number(company.annual_ebitda_usd), label: "EBITDA" };
  }
  if (company.annual_revenue_usd != null) {
    return { value: Number(company.annual_revenue_usd), label: "revenue" };
  }
  return null;
}

function formatUsdMillions(amount) {
  const millions = amount / 1_000_000;
  return millions >= 1 ? `$${millions.toFixed(1)}M` : `$${(amount / 1000).toFixed(0)}K`;
}

export function scoreRevenueEbitdaFit(structured, company) {
  const { revenue_min: min, revenue_max: max } = structured;
  if (min == null && max == null) return null;

  const financial = companyFinancialValue(company);
  if (!financial) return null;

  const { value } = financial;
  if (min != null && value < min) return 0;
  if (max != null && value > max) return 0;
  return 1;
}

export { formatUsdMillions, companyFinancialValue };

export function scoreAllDimensions(structured, company, { now = new Date() } = {}) {
  return {
    sector_alignment: scoreSectorAlignment(structured, company),
    funding_stage_match: scoreFundingStageMatch(structured, company),
    geography_match: scoreGeographyMatch(structured, company),
    founded_recency: scoreFoundedRecency(structured, company, now),
    employee_count_fit: scoreEmployeeCountFit(structured, company),
    signal_recency: scoreSignalRecency(company, now),
    revenue_ebitda_fit: scoreRevenueEbitdaFit(structured, company),
  };
}
