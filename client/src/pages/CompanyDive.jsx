import React, { useEffect, useState, useMemo } from 'react';
import { useParams, useNavigate, useLocation, Link } from 'react-router-dom';
import { ArrowLeft, ExternalLink, Download, Mail } from 'lucide-react';
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
      <h2 className="text-[10px] font-mono uppercase tracking-[0.15em] text-[#595855] dark:text-[#808080]">
        {title}
      </h2>
      <div className="text-sm text-black dark:text-white leading-relaxed">{children}</div>
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
    <div className="h-screen w-screen flex overflow-hidden bg-[#ebebeb] dark:bg-[#0a0a0a] text-black dark:text-white transition-colors duration-300">
      <ChatSidebar
        open={sidebarOpen}
        onToggle={() => setSidebarOpen((v) => !v)}
        activeChatId={activeChatId}
      />
      <div className="flex-1 min-w-0 flex flex-col overflow-hidden">
      <header className="fixed top-4 left-1/2 -translate-x-1/2 w-[calc(100%-2rem)] max-w-3xl h-12 bg-white/70 dark:bg-black/70 backdrop-blur-md border border-border/80 shadow-md rounded-full px-4 flex items-center justify-between z-50 transition-all duration-300">
        <div className="flex items-center gap-3 min-w-0">
          <button
            type="button"
            onClick={() => navigate(-1)}
            className="p-1.5 rounded-full hover:bg-black/5 dark:hover:bg-white/5 text-muted-foreground transition-colors border-none bg-transparent cursor-pointer flex items-center justify-center shrink-0"
          >
            <ArrowLeft size={16} />
          </button>
          <div className="min-w-0">
            <p className="text-[9px] font-mono uppercase tracking-[0.2em] text-[#595855] dark:text-[#808080] leading-none">
              Deep dive
            </p>
            <h1 className="font-davinci text-sm font-semibold truncate">{co.name}</h1>
          </div>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <button
            type="button"
            title="Coming soon"
            onClick={() => {}}
            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] border border-[#dfdcd5] dark:border-[#333] bg-transparent text-[#595855] dark:text-[#a0a0a0] hover:border-black/30 dark:hover:border-white/30 hover:text-black dark:hover:text-white transition-colors cursor-pointer"
          >
            <Mail size={12} />
            Email
          </button>
          <button
            type="button"
            disabled={loading || exportingPdf}
            onClick={exportPdf}
            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] border border-[#dfdcd5] dark:border-[#333] bg-transparent text-[#595855] dark:text-[#a0a0a0] hover:border-black/30 dark:hover:border-white/30 hover:text-black dark:hover:text-white transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <Download size={12} />
            {exportingPdf ? 'PDF…' : 'PDF'}
          </button>
        </div>
      </header>

      <main className="flex-1 min-h-0 overflow-y-auto overscroll-y-contain pt-20" data-lenis-prevent>
        <div className="max-w-3xl mx-auto px-4 md:px-6 py-8 space-y-8">
        {loading ? <PipelineProgress events={feedEvents} active /> : null}
        {error ? <p className="text-sm text-amber-700 dark:text-amber-400">{error}</p> : null}

        {!loading && (
          <>
            <header className="space-y-2 pb-6 border-b border-[#dfdcd5] dark:border-[#222]">
              <h2 className="font-davinci text-2xl font-semibold">{co.name}</h2>
              {co.websiteUrl ? (
                <a
                  href={co.websiteUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="text-sm text-[#595855] dark:text-[#808080] hover:underline inline-flex items-center gap-1"
                >
                  {co.domain}
                  <ExternalLink size={12} />
                </a>
              ) : (
                <p className="text-sm text-[#595855]">{co.domain}</p>
              )}
              {co.geography ? (
                <p className="text-xs text-[#595855] dark:text-[#808080]">HQ: {co.geography}</p>
              ) : null}
              {co.fitSummary ? (
                <p className="text-xs px-2 py-1 rounded-md bg-emerald-500/10 text-emerald-800 dark:text-emerald-300 inline-block">
                  {co.fitSummary}
                </p>
              ) : null}
            </header>

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
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
                  className="rounded-lg border border-[#dfdcd5] dark:border-[#222] p-3 bg-white dark:bg-[#111]"
                >
                  <p className="text-[9px] font-mono uppercase text-[#595855] dark:text-[#666]">{label}</p>
                  <p className="text-sm font-medium mt-1">{value}</p>
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

            <div className="pt-4">
              <Link to="/chat" className="text-xs text-[#595855] hover:underline">
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
