/** Minimal card fixtures shaped like `formatCompanyCard` output. */
export function makeCard(overrides = {}) {
  const { fields = {}, ...rest } = overrides;
  return {
    rank: 1,
    investment_summary: "Founder-owned, capital-efficient, no institutional backing.",
    enrichment_sources: ["https://example.com/about"],
    gate_reason: null,
    gate_reasons: [],
    pe_fit_score: 82,
    revenue_ebitda_fit: "in range",
    fit_summary: null,
    fit_status: null,
    fields: {
      name: "Acme Analytics",
      domain: "acme.example",
      description: "B2B analytics for logistics operators.",
      sector_tags: ["saas", "logistics"],
      funding_stage: "bootstrapped",
      total_raised: null,
      last_funding_date: null,
      investors: [],
      employees_count: 120,
      founded_date: "2014",
      geography: "Germany",
      annual_revenue_usd: 24000000,
      annual_ebitda_usd: 4200000,
      contact_email: null,
      contact_phone: null,
      leadership: ["Jane Doe, CEO"],
      ownership_signals: ["founder-owned"],
      recent_rounds: [],
      competitive_positioning: null,
      ...fields,
    },
    sources: ["openai_web_search"],
    verification_urls: {},
    confidence: {},
    links: [{ label: "Website", url: "https://acme.example" }],
    ...rest,
  };
}

export function makeShortlistInput(count = 3) {
  return {
    structured: { intent: "mandate_search", raw_query: "german logistics saas" },
    rawQuery: "german logistics saas",
    cards: Array.from({ length: count }, (_, i) =>
      makeCard({
        rank: i + 1,
        fields: { name: `Company ${i + 1}`, domain: `co${i + 1}.example` },
      })
    ),
    otherCards: [],
    dataSource: "openai_search",
    heavySearchRan: true,
    pipelineStages: [],
    message: null,
  };
}

export function makeStructuredMandate(overrides = {}) {
  return {
    intent: "mandate_search",
    raw_query: "european b2b saas 10-50m revenue",
    keywords: ["b2b saas"],
    geography: ["Europe"],
    ...overrides,
  };
}
