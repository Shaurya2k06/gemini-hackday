import React, { useEffect, useState, useMemo } from 'react';
import { useParams, useNavigate, useLocation, Link } from 'react-router-dom';
import { ArrowLeft, ExternalLink, Download, Mail } from 'lucide-react';
import { Monogram } from '../components/brand/Brand';
import { PipelineProgress } from '../components/discovery/PipelineProgress';
import { ChatSidebar } from '../components/chat/ChatSidebar';
import { mapApiCardToCompany, formatStage, formatUsdDisplay, formatDate } from '../components/discovery/format';
import { consumeSseStream } from '../lib/sse';
import { apiFetch } from '../lib/api';
import { friendlyChatError } from '../lib/chatErrors';
import { loadDiscoveryState } from '../lib/discoveryStorage';

function DossierSection({ title, children }) {
  return (
    <section className="space-y-2">
      <h2 className="text-[10px] font-mono uppercase tracking-[0.12em] text-[#8f8b80]">
        {title}
      </h2>
      <div className="text-[14px] text-ink leading-relaxed">{children}</div>
    </section>
  );
}

function CompanyDive() {
  const { domain } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const decodedDomain = decodeURIComponent(domain ?? '');

  const [feedEvents, setFeedEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [dossier, setDossier] = useState(null);
  const [dossierCard, setDossierCard] = useState(null);
  const [exportingPdf, setExportingPdf] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);

  const initialCompany = location.state?.company;
  const structured = location.state?.structured ?? null;
  const rawQuery = location.state?.rawQuery ?? '';
  const activeChatId =
    location.state?.chatId ?? loadDiscoveryState()?.chatId ?? null;

  const companyPayload = useMemo(() => {
    if (initialCompany?.name) {
      return {
        name: initialCompany.name,
        domain: initialCompany.domain ?? decodedDomain,
        description: initialCompany.description ?? '',
        geography: initialCompany.geography,
        funding_stage: initialCompany.stage,
        total_raised: initialCompany.raised,
        annual_revenue_usd: initialCompany.revenue,
        annual_ebitda_usd: initialCompany.ebitda,
        contact_email: initialCompany.contactEmail,
        contact_phone: initialCompany.contactPhone,
        investors: initialCompany.investors ?? [],
        sector_tags: initialCompany.sectors ?? [],
        investment_summary: initialCompany.investmentSummary ?? null,
        enrichment_sources: initialCompany.enrichmentSources ?? [],
        founded_date: initialCompany.foundedDate ?? null,
        last_funding_date: initialCompany.lastFundingDate ?? null,
        employees_count: initialCompany.employees ?? null,
      };
    }
    const guess = decodedDomain.split('.')[0];
    return {
      name: guess.charAt(0).toUpperCase() + guess.slice(1),
      domain: decodedDomain,
      description: '',
    };
  }, [initialCompany, decodedDomain]);

  useEffect(() => {
    let cancelled = false;

    async function run() {
      setLoading(true);
      setError(null);
      setDossierCard(null);
      setFeedEvents([{ step: 'Opening investor dossier…', detail: decodedDomain, at: Date.now() }]);

      try {
        const res = await apiFetch('/company/deep-dive/stream', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            company: companyPayload,
            structured: structured ?? { raw_query: rawQuery, intent: 'company_lookup' },
          }),
        });

        const result = await consumeSseStream(res, {
          onProgress: (evt) => {
            if (!cancelled) {
              setFeedEvents((prev) => [...prev, evt].slice(-30));
            }
          },
        });

        if (!cancelled) {
          const card = result.dossier ?? null;
          setDossierCard(card);
          setDossier(card ? mapApiCardToCompany(card) : mapApiCardToCompany({ fields: result.company, rank: 1 }));
        }
      } catch (err) {
        if (!cancelled) setError(friendlyChatError(err.message));
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    run();
    return () => {
      cancelled = true;
    };
  }, [decodedDomain, companyPayload, structured, rawQuery]);

  const co = dossier ?? mapApiCardToCompany({ fields: companyPayload, rank: 1 });

  const exportPdf = async () => {
    const card = dossierCard ?? { fields: companyPayload, rank: 1 };
    setExportingPdf(true);
    try {
      const res = await apiFetch('/export/pdf', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ companies: [card] }),
      });
      if (!res.ok) return;
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${decodedDomain || 'company'}-deep-dive.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setExportingPdf(false);
    }
  };

  return (
    <div className="h-screen w-screen flex overflow-hidden bg-cream text-ink font-sans antialiased">
      <ChatSidebar
        open={sidebarOpen}
        onToggle={() => setSidebarOpen((v) => !v)}
        activeChatId={activeChatId}
      />
      <div className="flex-1 min-w-0 flex flex-col overflow-hidden">
      <header className="shrink-0 h-16 bg-cream/95 backdrop-blur border-b border-hairline px-4 md:px-6 flex items-center justify-between gap-3 z-40">
        <div className="flex items-center gap-3 min-w-0">
          <button
            type="button"
            onClick={() => navigate(-1)}
            className="p-1.5 text-secondary hover:text-ink transition-colors border-none bg-transparent cursor-pointer flex items-center justify-center shrink-0"
            aria-label="Back"
          >
            <ArrowLeft size={16} />
          </button>
          <Monogram />
          <div className="min-w-0">
            <p className="font-mono text-[10px] uppercase tracking-[0.1em] text-[#8f8b80] leading-none mb-0.5">
              Deep dive
            </p>
            <h1 className="font-sans text-[14px] font-semibold tracking-tight truncate leading-none">{co.name}</h1>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            title="Coming soon"
            onClick={() => {}}
            className="inline-flex items-center gap-1.5 h-[34px] px-3 font-mono text-[11px] uppercase tracking-[0.06em] border border-ink/20 bg-cream text-secondary hover:border-ink hover:text-ink transition-colors cursor-pointer"
          >
            <Mail size={12} />
            Email
          </button>
          <button
            type="button"
            disabled={loading || exportingPdf}
            onClick={exportPdf}
            className="inline-flex items-center gap-1.5 h-[34px] px-3 font-mono text-[11px] uppercase tracking-[0.06em] border border-ink/20 bg-cream text-ink hover:border-ink transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <Download size={12} />
            {exportingPdf ? 'PDF…' : 'PDF'}
          </button>
        </div>
      </header>

      <main className="flex-1 min-h-0 overflow-y-auto overscroll-y-contain" data-lenis-prevent>
        <div className="max-w-3xl mx-auto px-4 md:px-6 py-8 space-y-8">
        {loading ? <PipelineProgress events={feedEvents} active /> : null}
        {error ? <p className="text-[13px] font-mono text-accent-red">{error}</p> : null}

        {!loading && (
          <>
            <header className="space-y-2 pb-6 border-b border-hairline">
              <h2 className="font-sans text-[26px] font-semibold tracking-[-0.02em]">{co.name}</h2>
              {co.websiteUrl ? (
                <a
                  href={co.websiteUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="text-[14px] text-secondary hover:text-accent-red inline-flex items-center gap-1"
                >
                  {co.domain}
                  <ExternalLink size={12} />
                </a>
              ) : (
                <p className="text-[14px] text-secondary">{co.domain}</p>
              )}
              {co.geography ? (
                <p className="text-[13px] text-secondary">HQ: {co.geography}</p>
              ) : null}
              {co.fitSummary ? (
                <p className="text-[11px] font-mono uppercase tracking-[0.04em] px-2 py-1 bg-accent-green text-cream inline-block mt-1">
                  {co.fitSummary}
                </p>
              ) : null}
            </header>

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {[
                ['Stage', formatStage(co.stage)],
                ['Total raised', formatUsdDisplay(co.raised)],
                ['Revenue', formatUsdDisplay(co.revenue)],
                ['EBITDA', formatUsdDisplay(co.ebitda)],
                ['Employees', co.employees ?? '—'],
                ['Founded', formatDate(co.foundedDate)],
              ].map(([label, value]) => (
                <div
                  key={label}
                  className="border border-hairline p-3 bg-[#fbf7ec]"
                >
                  <p className="text-[9px] font-mono uppercase tracking-[0.08em] text-[#8f8b80]">{label}</p>
                  <p className="text-[14px] font-semibold mt-1">{value}</p>
                </div>
              ))}
            </div>

            {co.investors?.length ? (
              <DossierSection title="Investors">
                <p>{co.investors.join(', ')}</p>
              </DossierSection>
            ) : null}

            {co.leadership?.length ? (
              <DossierSection title="Leadership">
                <ul className="list-disc pl-4 space-y-1">
                  {co.leadership.map((person) => (
                    <li key={person}>{person}</li>
                  ))}
                </ul>
              </DossierSection>
            ) : null}

            {co.ownershipSignals ? (
              <DossierSection title="Ownership">
                <p>{co.ownershipSignals}</p>
              </DossierSection>
            ) : null}

            {co.recentRounds?.length ? (
              <DossierSection title="Recent rounds">
                <ul className="list-disc pl-4 space-y-1">
                  {co.recentRounds.map((round) => (
                    <li key={round}>{round}</li>
                  ))}
                </ul>
              </DossierSection>
            ) : null}

            {co.competitivePositioning ? (
              <DossierSection title="Competitive positioning">
                <p>{co.competitivePositioning}</p>
              </DossierSection>
            ) : null}

            {co.investmentSummary ? (
              <DossierSection title="Investment thesis">
                <p className="whitespace-pre-wrap">{co.investmentSummary}</p>
              </DossierSection>
            ) : null}

            <DossierSection title="Contact">
              <p>
                {co.contactEmail ? (
                  <a href={`mailto:${co.contactEmail}`} className="hover:underline">
                    {co.contactEmail}
                  </a>
                ) : (
                  'Email not found'
                )}
              </p>
              <p className="mt-1">{co.contactPhone ?? 'Phone not found'}</p>
            </DossierSection>

            {co.enrichmentSources?.length || co.links?.length ? (
              <DossierSection title="Sources">
                <ul className="space-y-1">
                  {(co.enrichmentSources ?? []).map((url) => (
                    <li key={url}>
                      <a href={url} target="_blank" rel="noreferrer" className="text-xs hover:underline break-all">
                        {url}
                      </a>
                    </li>
                  ))}
                  {(co.links ?? []).map((l) => (
                    <li key={l.url}>
                      <a href={l.url} target="_blank" rel="noreferrer" className="text-xs hover:underline">
                        {l.label}
                      </a>
                    </li>
                  ))}
                </ul>
              </DossierSection>
            ) : null}

            <div className="pt-4 border-t border-hairline">
              <Link
                to="/chat"
                className="font-mono text-[11px] uppercase tracking-[0.06em] text-secondary hover:text-accent-red transition-colors"
              >
                ← New mandate
              </Link>
            </div>
          </>
        )}
        </div>
      </main>
      </div>
    </div>
  );
}

export default CompanyDive;
