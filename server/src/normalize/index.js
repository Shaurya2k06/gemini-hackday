import { resolveEntities } from "./entity-resolution.js";
import { mergeEntityGroup } from "./field-merge.js";
import { validateUnifiedCompany } from "./schema.js";

/**
 * Flatten heavy-search outcomes into raw source records.
 */
export function extractRawRecords(heavySearchResult, { scrapedAt = new Date() } = {}) {
  const outcomes = heavySearchResult.outcomes ?? heavySearchResult;
  if (!Array.isArray(outcomes)) {
    return [];
  }

  const records = [];
  for (const outcome of outcomes) {
    if (!outcome.success || !Array.isArray(outcome.results)) continue;
    for (const result of outcome.results) {
      records.push({
        ...result,
        scrapedAt,
      });
    }
  }
  return records;
}

/**
 * Normalize heavy-search output into unified company records.
 */
export function normalizeHeavySearchResults(heavySearchResult, { scrapedAt = new Date() } = {}) {
  const rawRecords = extractRawRecords(heavySearchResult, { scrapedAt });
  const groups = resolveEntities(rawRecords);

  const companies = [];
  const skipped = [];
  const allConflicts = [];

  for (const group of groups) {
    const merged = mergeEntityGroup(group, { scrapedAt });

    if (!merged.domain) {
      skipped.push({
        reason: "no_resolvable_domain",
        name: merged.name,
        sources: merged.sources_found,
      });
      continue;
    }

    const { valid, errors, company: forDb } = validateUnifiedCompany({
      name: merged.name,
      domain: merged.domain,
      description: merged.description,
      sector_tags: merged.sector_tags,
      funding_stage: merged.funding_stage,
      total_raised: merged.total_raised,
      last_funding_date: merged.last_funding_date,
      investors: merged.investors,
      employees_count: merged.employees_count,
      annual_revenue_usd: merged.annual_revenue_usd,
      annual_ebitda_usd: merged.annual_ebitda_usd,
      founded_date: merged.founded_date,
      geography: merged.geography,
      entity_type: merged.entity_type,
      domain_verified: merged.domain_verified,
      confidence_scores: merged.confidence_scores,
      sources_found: merged.sources_found,
      verification_urls: merged.verification_urls ?? {},
    });

    if (!valid) {
      skipped.push({
        reason: errors.join("; "),
        name: merged.name,
        domain: merged.domain,
        sources: merged.sources_found,
      });
      continue;
    }

    companies.push({
      ...forDb,
      conflicts: merged.conflicts,
      field_provenance: merged.field_provenance,
      source_records: merged.source_records,
    });

    allConflicts.push(...merged.conflicts.map((c) => ({ domain: merged.domain, ...c })));
  }

  return {
    companies,
    skipped,
    conflicts: allConflicts,
    summary: {
      rawRecordCount: rawRecords.length,
      entityGroupCount: groups.length,
      companyCount: companies.length,
      skippedCount: skipped.length,
      conflictCount: allConflicts.length,
    },
  };
}

export { resolveEntities } from "./entity-resolution.js";
export { mergeEntityGroup } from "./field-merge.js";
export { validateUnifiedCompany, assertValidUnifiedCompany, coerceUnifiedCompany } from "./schema.js";
export { computeFieldConfidence } from "./confidence.js";
export { detectConflicts } from "./conflicts.js";
export { SOURCE_RELIABILITY, reliabilityFor } from "./source-reliability.js";
