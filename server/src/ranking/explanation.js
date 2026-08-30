import { companyFinancialValue, formatUsdMillions } from "./dimensions.js";

const DIMENSION_LABELS = {
  sector_alignment: "sector alignment",
  funding_stage_match: "funding stage match",
  geography_match: "geography match",
  founded_recency: "founded recency",
  employee_count_fit: "employee count fit",
  signal_recency: "data freshness",
  revenue_ebitda_fit: "revenue/EBITDA fit",
};

function formatStage(stage) {
  return String(stage).replace(/_/g, " ");
}

function formatRevenueRange(structured) {
  const { revenue_min: min, revenue_max: max } = structured;
  if (min != null && max != null) {
    return `${formatUsdMillions(min)}–${formatUsdMillions(max)}`;
  }
  if (min != null) return `≥${formatUsdMillions(min)}`;
  if (max != null) return `≤${formatUsdMillions(max)}`;
  return null;
}

function hasKnownFundingStage(company) {
  const stage = company.funding_stage;
  return stage != null && stage !== "unknown";
}

function hasKnownGeography(company) {
  const geo = company.geography;
  return geo != null && String(geo).trim() !== "" && geo !== "unknown";
}

export function buildExplanation(structured, company, dimensionScores, {
  plausibility = 1,
  domainRelevance = 1,
} = {}) {
  const parts = [];
  const hasRevenueMandate =
    structured.revenue_min != null || structured.revenue_max != null;
  const hasFundingFilter = (structured.funding_stage ?? []).length > 0;
  const hasGeoFilter = (structured.geography ?? []).length > 0;
  const hasEmployeeFilter =
    structured.employees_min != null || structured.employees_max != null;

  if (dimensionScores.sector_alignment >= 0.8) {
    const tags = (company.sector_tags ?? []).slice(0, 3).join(", ");
    parts.push(`Strong sector alignment${tags ? ` (${tags})` : ""}`);
  } else if (dimensionScores.sector_alignment >= 0.4) {
    parts.push("Partial sector alignment with your thesis");
  }

  if (hasFundingFilter) {
    const stageScore = dimensionScores.funding_stage_match;
    if (stageScore === null) {
      parts.push("Funding stage unavailable — dimension excluded from score");
    } else if (stageScore >= 1 && hasKnownFundingStage(company)) {
      parts.push(`Funding stage matches (${formatStage(company.funding_stage)})`);
    } else if (stageScore === 0 && hasKnownFundingStage(company)) {
      parts.push(
        `Funding stage is ${formatStage(company.funding_stage)}, outside requested stages`
      );
    }
  }

  if (hasGeoFilter) {
    const geoScore = dimensionScores.geography_match;
    if (geoScore === null) {
      parts.push("HQ geography unavailable — dimension excluded from score");
    } else if (geoScore >= 0.8 && hasKnownGeography(company)) {
      parts.push(`HQ geography matches (${company.geography})`);
    } else if (geoScore > 0 && geoScore < 0.8 && hasKnownGeography(company)) {
      parts.push(`HQ in ${company.geography}, limited geography overlap`);
    } else if (geoScore === 0 && hasKnownGeography(company)) {
      parts.push(`HQ in ${company.geography}, outside requested geographies`);
    }
  }

  if (dimensionScores.founded_recency >= 0.8 && company.founded_date) {
    parts.push(`Founded ${company.founded_date.slice(0, 4)}, relatively recent`);
  }

  if (hasEmployeeFilter) {
    const empScore = dimensionScores.employee_count_fit;
    if (empScore === null) {
      parts.push("Employee count unavailable — dimension excluded from score");
    } else if (empScore === 0) {
      parts.push("Employee count outside requested range");
    } else if (empScore === 1 && company.employees_count != null) {
      parts.push(`Employee count (${company.employees_count}) fits your size filter`);
    }
  }

  if (hasRevenueMandate) {
    const revenueScore = dimensionScores.revenue_ebitda_fit;
    const financial = companyFinancialValue(company);
    const range = formatRevenueRange(structured);

    if (revenueScore === null) {
      parts.push(
        "Revenue/EBITDA data unavailable for this company — dimension excluded from score"
      );
    } else if (revenueScore >= 1 && financial) {
      parts.push(
        `Annual ${financial.label} (${formatUsdMillions(financial.value)}) fits your ${range} mandate`
      );
    } else if (revenueScore === 0 && financial) {
      parts.push(
        `Annual ${financial.label} (${formatUsdMillions(financial.value)}) is outside your ${range} mandate`
      );
    }
  }

  if (dimensionScores.signal_recency >= 0.8) {
    parts.push("Recently scraped company data");
  } else if (dimensionScores.signal_recency < 0.5) {
    parts.push("Company data may be stale relative to TTL policy");
  }

  if (parts.length === 0) {
    const top = Object.entries(dimensionScores)
      .filter(([, score]) => score != null)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 2)
      .map(([key]) => DIMENSION_LABELS[key]);
    parts.push(`Ranked primarily on ${top.join(" and ")}`);
  }

  if (plausibility < 0.6) {
    parts.push(
      "Note: this result may be an event, association, or directory rather than an operating company — verify before pursuing"
    );
  }

  if (domainRelevance < 1) {
    parts.push(
      "Website could not be verified as belonging to this company — confirm manually before outreach"
    );
  }

  return `${parts.join("; ")}.`;
}

export const NO_RESULTS_MESSAGE =
  "No companies matched your query. Try broadening sector tags, geography, or funding stage filters, or removing employee count constraints.";

const SOURCE_LABELS = {
  crunchbase: "Crunchbase",
  linkedin: "LinkedIn",
  github: "GitHub",
  startup_india: "Startup India",
};

function formatStageList(stages) {
  return stages.map((s) => s.replace(/_/g, " ")).join(", ");
}

function describeQueryConstraints(structured) {
  const parts = [];
  if ((structured.funding_stage ?? []).length > 0) {
    parts.push(formatStageList(structured.funding_stage));
  }
  if ((structured.sector_tags ?? []).length > 0) {
    parts.push(structured.sector_tags.join(", "));
  }
  if ((structured.geography ?? []).length > 0) {
    parts.push(`in ${structured.geography.join(", ")}`);
  }
  if (structured.employees_min != null || structured.employees_max != null) {
    parts.push("with employee count constraints");
  }
  if (structured.revenue_min != null || structured.revenue_max != null) {
    parts.push("with revenue mandate");
  }
  return parts.length ? parts.join(" ") : structured.raw_query ?? "your criteria";
}

/**
 * Build a query-specific zero-results message from actual per-source counts.
 */
export function buildNoResultsMessage({ structured, heavyOutcomes = [], normalizeSummary = {} }) {
  const criteria = describeQueryConstraints(structured);
  const sourceParts = [];

  for (const outcome of heavyOutcomes) {
    const label = SOURCE_LABELS[outcome.source] ?? outcome.source;
    const count = outcome.results?.length ?? 0;
    if (outcome.method === "skipped_non_india") continue;
    sourceParts.push(`${label} (${count})`);
  }

  const searched =
    sourceParts.length > 0 ? sourceParts.join(", ") : "no external sources";

  const rawCount = normalizeSummary.rawRecordCount ?? 0;
  const persisted = normalizeSummary.companyCount ?? 0;
  const skipped = normalizeSummary.skippedCount ?? 0;

  const failedOutcomes = heavyOutcomes.filter(
    (outcome) => !outcome.success || outcome.method === "error"
  );

  let detail = "";
  if (failedOutcomes.length > 0 && rawCount === 0) {
    const errorText = failedOutcomes.map((o) => o.error).find(Boolean);
    detail = errorText
      ? ` — search failed (${String(errorText).slice(0, 80)})`
      : " — search failed";
  } else if (rawCount > 0 && persisted === 0) {
    detail = ` — ${rawCount} raw result(s) found but ${skipped} lacked resolvable domains`;
  } else if (rawCount === 0) {
    detail = " — 0 results with resolvable domains";
  }

  const geo = (structured.geography ?? []).join(", ");
  const geoSuffix = geo ? ` for ${geo}` : "";

  return `No companies found matching ${criteria}. Searched ${searched}${detail}${geoSuffix}.`;
}
