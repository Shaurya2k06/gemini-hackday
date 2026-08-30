const SECTION_6_FIELDS = [
  "name",
  "domain",
  "description",
  "sector_tags",
  "funding_stage",
  "total_raised",
  "last_funding_date",
  "investors",
  "employees_count",
  "founded_date",
  "geography",
  "annual_revenue_usd",
  "annual_ebitda_usd",
  "contact_email",
  "contact_phone",
  "leadership",
  "ownership_signals",
  "recent_rounds",
  "competitive_positioning",
];

const VERIFICATION_LINK_LABELS = {
  crunchbase: "Crunchbase",
  linkedin: "LinkedIn",
  github: "GitHub",
  openai_web_search: "Web search",
  openai_web_enrich: "Web research",
};

function buildSourceLinks(company) {
  const links = [{ label: "Website", url: `https://${company.domain}` }];
  const verificationUrls = company.verification_urls ?? {};

  for (const [platform, url] of Object.entries(verificationUrls)) {
    if (!url) continue;
    const label = VERIFICATION_LINK_LABELS[platform] ?? platform;
    links.push({ label, url });
  }

  const sources = company.sources_found ?? [];
  if (sources.includes("github") && !verificationUrls.github) {
    links.push({
      label: "GitHub",
      url: `https://github.com/${company.domain.split(".")[0]}`,
    });
  }

  for (const url of company.enrichment_sources ?? []) {
    if (url && !links.some((l) => l.url === url)) {
      let label = "Source";
      try {
        label = new URL(url).hostname.replace(/^www\./, "") || "Source";
      } catch {
        // keep Source
      }
      links.push({ label, url });
    }
  }

  return links;
}

export function formatCompanyCard(resultRow) {
  const {
    company,
    rank,
    investment_summary,
    enrichment_sources,
    gate_reason,
    gate_reasons,
    pe_fit_score,
    revenue_ebitda_fit,
    fit_summary,
    fit_status,
  } = resultRow;

  const fields = {};
  for (const field of SECTION_6_FIELDS) {
    fields[field] = company[field] ?? null;
  }

  return {
    rank,
    investment_summary: investment_summary ?? company.investment_summary ?? null,
    enrichment_sources: enrichment_sources ?? company.enrichment_sources ?? [],
    gate_reason: gate_reason ?? null,
    gate_reasons: gate_reasons ?? [],
    pe_fit_score: pe_fit_score ?? null,
    revenue_ebitda_fit: revenue_ebitda_fit ?? null,
    fit_summary: fit_summary ?? null,
    fit_status: fit_status ?? null,
    fields,
    sources: company.sources_found ?? [],
    verification_urls: company.verification_urls ?? {},
    confidence: company.confidence_scores ?? {},
    links: buildSourceLinks(company),
  };
}

export function formatDiscoveryResponse({
  ranked,
  message = null,
  intent = null,
  pipelineStages = null,
}) {
  const cards = (ranked.results ?? []).map(formatCompanyCard);
  const otherCards = (ranked.other_results ?? []).map(formatCompanyCard);
  const intro =
    message ??
    (cards.length
      ? intent === "company_lookup"
        ? `Here's what we found on ${cards.map((c) => c.fields.name).join(", ")}.`
        : `Found ${cards.length} companies matching your screening criteria.`
      : ranked.message);

  return {
    type: "discovery",
    text: intro,
    cards,
    other_cards: otherCards,
    other_intro:
      otherCards.length > 0
        ? "Gated matches — incumbents, associations, or entities that failed PE diligence checks."
        : null,
    summary: ranked.summary,
    pipeline_stages: pipelineStages,
  };
}

export function formatTextResponse(type, text, meta = {}) {
  return { type, text, cards: [], meta };
}
