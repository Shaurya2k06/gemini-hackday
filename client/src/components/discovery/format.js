const STAGE_LABELS = {
  'pre-seed': 'Pre-Seed',
  seed: 'Seed',
  series_a: 'Series A',
  series_b: 'Series B',
  series_c_plus: 'Series C+',
  unknown: 'Unknown',
};

export function formatStage(stage) {
  if (!stage) return '—';
  return STAGE_LABELS[stage] ?? String(stage).replace(/_/g, ' ');
}

export function formatGeography(geo) {
  if (!geo || geo === 'unknown') return '—';
  if (typeof geo === 'object' && !Array.isArray(geo)) {
    return [geo.city, geo.region, geo.state, geo.country].filter(Boolean).join(', ') || '—';
  }
  const text = String(geo).trim();
  return text === '[object Object]' ? '—' : text;
}

export function formatUsdCompact(usd) {
  if (usd == null || typeof usd !== 'number' || Number.isNaN(usd)) return null;
  if (Math.abs(usd) >= 1_000_000) {
    const m = usd / 1_000_000;
    return `$${m >= 10 ? Math.round(m) : m.toFixed(1)}M`;
  }
  if (Math.abs(usd) >= 1_000) return `$${Math.round(usd / 1_000)}K`;
  return `$${Math.round(usd)}`;
}

export function formatUsdDisplay(usd) {
  return formatUsdCompact(usd) ?? '—';
}

export function formatDate(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) {
    const year = String(iso).match(/\b(19|20)\d{2}\b/);
    return year ? year[0] : '—';
  }
  return d.toLocaleDateString(undefined, { month: 'short', year: 'numeric' });
}

export function stripMarkdownLinks(text) {
  if (!text) return '';
  return String(text)
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/\s+/g, ' ')
    .trim();
}

export function mapApiCardToCompany(card) {
  const fields = card.fields ?? {};
  const websiteUrl =
    card.links?.find((l) => l.label === 'Website')?.url ??
    (fields.domain && fields.domain !== '—' ? `https://${fields.domain}` : null);

  return {
    rank: card.rank ?? null,
    name: fields.name ?? 'Unknown',
    domain: fields.domain ?? '—',
    websiteUrl,
    description: fields.description ?? '',
    stage: fields.funding_stage ?? 'unknown',
    geography: formatGeography(fields.geography),
    foundedDate: fields.founded_date ?? null,
    lastFundingDate: fields.last_funding_date ?? null,
    revenue: fields.annual_revenue_usd ?? null,
    ebitda: fields.annual_ebitda_usd ?? null,
    raised: fields.total_raised ?? null,
    employees: fields.employees_count ?? null,
    contactEmail: fields.contact_email ?? null,
    contactPhone: fields.contact_phone ?? null,
    sectors: fields.sector_tags ?? [],
    investors: fields.investors ?? [],
    leadership: fields.leadership ?? [],
    ownershipSignals: fields.ownership_signals ?? null,
    recentRounds: fields.recent_rounds ?? [],
    competitivePositioning: fields.competitive_positioning ?? null,
    investmentSummary: stripMarkdownLinks(card.investment_summary ?? ''),
    enrichmentSources: card.enrichment_sources ?? fields.enrichment_sources ?? [],
    sources: card.sources ?? [],
    links: card.links ?? [],
    confidence: card.confidence ?? {},
    gateReason: card.gate_reason ?? null,
    gateReasons: card.gate_reasons ?? [],
    peFitScore: card.pe_fit_score ?? null,
    fitSummary: card.fit_summary ?? null,
    fitStatus: card.fit_status ?? null,
    gated: false,
  };
}
