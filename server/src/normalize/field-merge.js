import { computeAllFieldConfidences } from "./confidence.js";
import { detectConflicts, logConflicts } from "./conflicts.js";
import { extractDomain } from "./entity-resolution.js";

const MERGEABLE_FIELDS = [
  "name",
  "domain",
  "description",
  "sector_tags",
  "funding_stage",
  "total_raised",
  "last_funding_date",
  "investors",
  "employees_count",
  "annual_revenue_usd",
  "annual_ebitda_usd",
  "founded_date",
  "geography",
];

const VALID_FUNDING_STAGES = new Set([
  "pre-seed",
  "seed",
  "series_a",
  "series_b",
  "series_c_plus",
  "unknown",
]);

function pickScalarWinner(field, candidates, confidenceResult) {
  if (confidenceResult?.winner != null) {
    return confidenceResult.winner;
  }
  const filled = candidates.filter((c) => c.value != null && c.value !== "");
  return filled.length ? filled[0].value : null;
}

function mergeArrayField(candidates, confidenceResult) {
  if (confidenceResult?.winner != null && Array.isArray(confidenceResult.winner)) {
    return [...new Set(confidenceResult.winner.map(String))];
  }
  const merged = new Set();
  for (const c of candidates) {
    if (Array.isArray(c.value)) {
      for (const v of c.value) merged.add(String(v));
    }
  }
  return [...merged];
}

function extractFieldCandidates(group, scrapedAt) {
  const fieldCandidates = Object.fromEntries(MERGEABLE_FIELDS.map((f) => [f, []]));

  for (const { record } of group.items) {
    const source = record.source;
    const scraped = record.scrapedAt ?? scrapedAt;

    fieldCandidates.name.push({ source, value: record.name ?? null, scrapedAt: scraped });
    fieldCandidates.domain.push({
      source,
      value: extractDomain(record),
      scrapedAt: scraped,
    });
    fieldCandidates.description.push({
      source,
      value: record.description ?? record.raw?.description ?? null,
      scrapedAt: scraped,
    });
    fieldCandidates.sector_tags.push({
      source,
      value: record.sector_tags ?? record.raw?.sector_tags ?? null,
      scrapedAt: scraped,
    });
    fieldCandidates.funding_stage.push({
      source,
      value: record.funding_stage ?? record.raw?.funding_stage ?? null,
      scrapedAt: scraped,
    });
    fieldCandidates.total_raised.push({
      source,
      value: record.total_raised ?? record.raw?.total_raised ?? null,
      scrapedAt: scraped,
    });
    fieldCandidates.last_funding_date.push({
      source,
      value: record.last_funding_date ?? record.raw?.last_funding_date ?? null,
      scrapedAt: scraped,
    });
    fieldCandidates.investors.push({
      source,
      value: record.investors ?? record.raw?.investors ?? null,
      scrapedAt: scraped,
    });
    fieldCandidates.employees_count.push({
      source,
      value: record.employees_count ?? record.raw?.employees_count ?? null,
      scrapedAt: scraped,
    });
    fieldCandidates.annual_revenue_usd.push({
      source,
      value: record.annual_revenue_usd ?? record.raw?.annual_revenue_usd ?? null,
      scrapedAt: scraped,
    });
    fieldCandidates.annual_ebitda_usd.push({
      source,
      value: record.annual_ebitda_usd ?? record.raw?.annual_ebitda_usd ?? null,
      scrapedAt: scraped,
    });
    fieldCandidates.founded_date.push({
      source,
      value: record.founded_date ?? record.raw?.founded_date ?? null,
      scrapedAt: scraped,
    });
    fieldCandidates.geography.push({
      source,
      value: record.geography ?? record.raw?.geography ?? null,
      scrapedAt: scraped,
    });
  }

  return fieldCandidates;
}

/**
 * Merge a resolved entity group into one unified company record.
 */
export function mergeEntityGroup(group, { scrapedAt = new Date() } = {}) {
  const fieldCandidates = extractFieldCandidates(group, scrapedAt);
  const conflicts = detectConflicts(fieldCandidates);
  const { confidence_scores, provenance: field_provenance } = computeAllFieldConfidences(
    fieldCandidates,
    { scrapedAt }
  );

  const entityPlausibility = Math.min(
    ...group.items.map((i) =>
      typeof i.record.entity_plausibility === "number" ? i.record.entity_plausibility : 1
    )
  );
  confidence_scores.entity_plausibility = entityPlausibility;

  const domainRelevance = Math.min(
    ...group.items.map((i) => {
      if (typeof i.record.domain_relevance_score === "number") {
        return i.record.domain_relevance_score;
      }
      return i.record.domain ? 1 : 0;
    })
  );
  confidence_scores.domain_relevance = domainRelevance;

  const domain =
    group.domain ??
    pickScalarWinner("domain", fieldCandidates.domain, {
      winner: field_provenance.domain?.value,
    });

  const name = pickScalarWinner("name", fieldCandidates.name, {
    winner: field_provenance.name?.value,
  });

  logConflicts(conflicts, { domain, name });

  const sources_found = [
    ...new Set(group.items.map((i) => i.record.source).filter(Boolean)),
  ];

  const verification_urls = {};
  for (const { record } of group.items) {
    const urls = record.verification_urls ?? {};
    for (const [platform, url] of Object.entries(urls)) {
      if (url && !verification_urls[platform]) {
        verification_urls[platform] = url;
      }
    }
  }

  const fundingStage = pickScalarWinner(
    "funding_stage",
    fieldCandidates.funding_stage,
    { winner: field_provenance.funding_stage?.value }
  );

  // entity_type / domain_verified aren't part of the confidence-weighted merge —
  // any source flagging a non-operating entity or an unverified domain should stick.
  const entityTypes = group.items
    .map((i) => i.record.entity_type ?? i.record.raw?.entity_type ?? null)
    .filter((v) => v != null);
  const entityType =
    entityTypes.find((v) => v !== "unknown") ?? entityTypes[0] ?? null;

  const domainVerifiedValues = group.items
    .map((i) => i.record.domain_verified)
    .filter((v) => v === true || v === false);
  const domainVerified = domainVerifiedValues.length
    ? domainVerifiedValues.some((v) => v === false)
      ? false
      : true
    : null;

  const company = {
    name: name ?? "Unknown",
    domain: domain ?? null,
    description:
      pickScalarWinner("description", fieldCandidates.description, {
        winner: field_provenance.description?.value,
      }) ?? "",
    sector_tags: mergeArrayField(fieldCandidates.sector_tags, {
      winner: field_provenance.sector_tags?.value,
    }),
    funding_stage: VALID_FUNDING_STAGES.has(fundingStage) ? fundingStage : "unknown",
    total_raised: pickScalarWinner(
      "total_raised",
      fieldCandidates.total_raised,
      { winner: field_provenance.total_raised?.value }
    ),
    last_funding_date: pickScalarWinner(
      "last_funding_date",
      fieldCandidates.last_funding_date,
      { winner: field_provenance.last_funding_date?.value }
    ),
    investors: mergeArrayField(fieldCandidates.investors, {
      winner: field_provenance.investors?.value,
    }),
    employees_count: pickScalarWinner(
      "employees_count",
      fieldCandidates.employees_count,
      { winner: field_provenance.employees_count?.value }
    ),
    annual_revenue_usd: pickScalarWinner(
      "annual_revenue_usd",
      fieldCandidates.annual_revenue_usd,
      { winner: field_provenance.annual_revenue_usd?.value }
    ),
    annual_ebitda_usd: pickScalarWinner(
      "annual_ebitda_usd",
      fieldCandidates.annual_ebitda_usd,
      { winner: field_provenance.annual_ebitda_usd?.value }
    ),
    founded_date: pickScalarWinner(
      "founded_date",
      fieldCandidates.founded_date,
      { winner: field_provenance.founded_date?.value }
    ),
    geography:
      pickScalarWinner("geography", fieldCandidates.geography, {
        winner: field_provenance.geography?.value,
      }) ?? "unknown",
    entity_type: entityType,
    domain_verified: domainVerified,
    confidence_scores,
    sources_found,
    verification_urls,
    conflicts,
    field_provenance,
    source_records: group.items.map((i) => i.record),
  };

  return company;
}
