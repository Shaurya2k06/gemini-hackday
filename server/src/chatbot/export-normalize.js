/**
 * Normalize heterogeneous company payloads into the `{ rank, company }` rows
 * that `generateCsv` / `generatePdf` expect.
 *
 * Callers hand us three different shapes:
 *  - already-normalized ranked rows (`{ rank, company, ... }`)
 *  - formatted display cards from `formatCompanyCard` (nested under `fields`)
 *  - bare company objects
 *
 * Shared by the Express export routes and the MCP export tool so both stay in
 * step.
 */
export function normalizeExportCompanies(companies) {
  if (!Array.isArray(companies)) return [];
  return companies.map((item, idx) => {
    if (item?.company) return item;
    if (item?.fields) {
      return {
        rank: item.rank ?? idx + 1,
        company: {
          ...item.fields,
          investment_summary: item.investment_summary,
          enrichment_sources: item.enrichment_sources,
          sources_found: item.sources,
        },
        investment_summary: item.investment_summary,
        enrichment_sources: item.enrichment_sources,
        // Preserved so exporters can emit researched columns.
        custom_columns: item.custom_columns,
      };
    }
    return {
      rank: idx + 1,
      company: item,
      investment_summary: item.investment_summary,
      enrichment_sources: item.enrichment_sources,
      custom_columns: item.custom_columns,
    };
  });
}
