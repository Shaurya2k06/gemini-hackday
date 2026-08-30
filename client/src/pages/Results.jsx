import React, { useState, useMemo, useEffect } from 'react';
import { useNavigate, useLocation, Link } from 'react-router-dom';
import { ArrowLeft, Download, FileSpreadsheet, Plus } from 'lucide-react';
import { GlanceTable } from '../components/discovery/GlanceTable';
import { PipelineProgress } from '../components/discovery/PipelineProgress';
import { ChatSidebar } from '../components/chat/ChatSidebar';
import { mapApiCardToCompany } from '../components/discovery/format';
import { loadDiscoveryState, saveDiscoveryState } from '../lib/discoveryStorage';
import { apiFetch } from '../lib/api';
import { consumeSseStream } from '../lib/sse';
import { updateChat } from '../lib/auth';

const SHORTLIST_MAX = 25;
const INITIAL_SHORTLIST_TARGET = 10;

function loadInitialState(locationState) {
  if (locationState?.companies?.length) {
    const next = {
      ...locationState,
      customColumns: locationState.customColumns ?? [],
    };
    saveDiscoveryState(next);
    return next;
  }
  return (
    loadDiscoveryState() ?? {
      companies: [],
      rawQuery: '',
      structured: null,
      message: '',
      customColumns: [],
    }
  );
}

function Results() {
  const navigate = useNavigate();
  const location = useLocation();

  const [state, setState] = useState(() => loadInitialState(location.state));
  const [additionalCount, setAdditionalCount] = useState(5);
  const [expanding, setExpanding] = useState(false);
  const [expandMessage, setExpandMessage] = useState(null);
  const [feedEvents, setFeedEvents] = useState([]);
  const [customColumns, setCustomColumns] = useState(() => state.customColumns ?? []);
  const [customColumnBusy, setCustomColumnBusy] = useState(false);
  const [customColumnError, setCustomColumnError] = useState(null);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [sidebarRefreshKey, setSidebarRefreshKey] = useState(0);

  // Re-hydrate when opening another saved chat while already on /results
  // (React Router does not remount this page for same-route navigations).
  useEffect(() => {
    const next = loadInitialState(location.state);
    setState(next);
    setCustomColumns(next.customColumns ?? []);
    setExpandMessage(null);
    setCustomColumnError(null);
    setExpanding(false);
    setFeedEvents([]);
    setAdditionalCount(5);
  }, [location.key]);

  const companies = useMemo(
    () => (state.companies ?? []).map((c) => (c.domain ? c : mapApiCardToCompany(c))),
    [state.companies]
  );

  const syncChat = async (nextState) => {
    if (!nextState?.chatId || !(nextState.companies?.length > 0)) return;
    try {
      await updateChat(nextState.chatId, {
        rawQuery: nextState.rawQuery,
        structured: nextState.structured,
        constraintMode: nextState.constraintMode,
        companies: nextState.companies,
        cards: nextState.cards,
        customColumns: nextState.customColumns ?? [],
        message: nextState.message,
      });
      setSidebarRefreshKey((k) => k + 1);
    } catch {
      // Best-effort persistence.
    }
  };

  const persistCustomColumns = (nextCols) => {
    setCustomColumns(nextCols);
    const next = { ...state, customColumns: nextCols };
    saveDiscoveryState(next);
    setState(next);
    syncChat(next);
  };

  const roomLeft = Math.max(0, SHORTLIST_MAX - companies.length);
  const canExpand =
    companies.length >= INITIAL_SHORTLIST_TARGET &&
    roomLeft > 0 &&
    Boolean(state.structured) &&
    !expanding;
  const showUnderfillNote =
    companies.length > 0 && companies.length < INITIAL_SHORTLIST_TARGET && !expanding;

  const exportBody = async (format) => {
    const cards = state.cards ?? companies;
    const res = await apiFetch(`/export/${format}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ companies: cards }),
    });
    if (!res.ok) return;
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = format === 'pdf' ? 'pef-discovery-results.pdf' : 'pef-discovery-results.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleAddCustomColumn = async (query) => {
    const cards = state.cards ?? [];
    if (!cards.length || customColumnBusy) return;

    const id = `custom-${Date.now()}`;
    const pending = {
      id,
      query,
      label: query.length > 40 ? `${query.slice(0, 40)}…` : query,
      values: {},
      loading: true,
    };
    const withPending = [...customColumns, pending];
    persistCustomColumns(withPending);
    setCustomColumnBusy(true);
    setCustomColumnError(null);

    try {
      const res = await apiFetch('/discover/custom-column', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query, cards }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error ?? 'Could not extract custom column');
      }
      const filled = withPending.map((col) =>
        col.id === id
          ? {
              ...col,
              label: data.label ?? col.label,
              values: data.results ?? {},
              loading: false,
            }
          : col
      );
      persistCustomColumns(filled);
    } catch (err) {
      persistCustomColumns(withPending.filter((col) => col.id !== id));
      setCustomColumnError(err.message ?? 'Could not extract custom column');
    } finally {
      setCustomColumnBusy(false);
    }
  };

  const handleRemoveCustomColumn = (id) => {
    persistCustomColumns(customColumns.filter((col) => col.id !== id));
  };

  const handleExpand = async () => {
    if (!canExpand) return;

    const count = Math.min(Math.max(1, additionalCount), roomLeft, 25);
    setExpanding(true);
    setExpandMessage(null);
    setFeedEvents([{ step: 'Expanding shortlist…', detail: `finding up to ${count} more`, at: Date.now() }]);

    try {
      const existingDomains = companies
        .map((c) => c.domain)
        .filter((d) => d && d !== '—');

      const res = await apiFetch('/discover/expand/stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          structured: state.structured,
          rawQuery: state.rawQuery,
          existingDomains,
          additionalCount: count,
          constraintMode: state.constraintMode ?? 'heavy',
        }),
      });

      const result = await consumeSseStream(res, {
        onProgress: (evt) => setFeedEvents((prev) => [...prev, evt].slice(-30)),
      });

      const newCards = result.cards ?? [];
      const newCompanies = newCards.map(mapApiCardToCompany);

      if (newCompanies.length === 0) {
        setExpandMessage(
          result.message ?? 'No more companies found matching your screening criteria.'
        );
        return;
      }

      const mergedCompanies = [...companies, ...newCompanies].map((c, i) => ({
        ...c,
        rank: i + 1,
      }));
      const existingCards = state.cards ?? [];
      const rankedCards = [...existingCards, ...newCards].map((card, i) => ({
        ...card,
        rank: i + 1,
      }));

      const next = {
        ...state,
        companies: mergedCompanies,
        cards: rankedCards,
        customColumns,
      };
      saveDiscoveryState(next);
      setState(next);
      await syncChat(next);
      if (result.message) setExpandMessage(result.message);
    } catch (err) {
      setExpandMessage(err.message ?? 'Could not expand shortlist.');
    } finally {
      setExpanding(false);
    }
  };

  return (
    <div className="h-screen w-screen flex overflow-hidden bg-[#ebebeb] dark:bg-[#0a0a0a] text-black dark:text-white transition-colors duration-300">
      <ChatSidebar
        open={sidebarOpen}
        onToggle={() => setSidebarOpen((v) => !v)}
        refreshKey={sidebarRefreshKey}
        activeChatId={state.chatId ?? null}
      />
      <div className="flex-1 min-w-0 flex flex-col overflow-hidden">
      <header className="fixed top-4 left-1/2 -translate-x-1/2 w-[calc(100%-2rem)] max-w-4xl h-12 bg-white/70 dark:bg-black/70 backdrop-blur-md border border-border/80 shadow-md rounded-full px-4 flex items-center justify-between z-50 transition-all duration-300">
        <div className="flex items-center gap-3 min-w-0">
          <Link
            to="/chat"
            className="p-1.5 rounded-full hover:bg-black/5 dark:hover:bg-white/5 text-muted-foreground transition-colors flex items-center justify-center shrink-0"
          >
            <ArrowLeft size={16} />
          </Link>
          <div className="min-w-0">
            <p className="text-[9px] font-mono uppercase tracking-[0.2em] text-[#595855] dark:text-[#808080] leading-none">
              At a glance
            </p>
            <h1 className="font-davinci text-sm font-semibold truncate">Screening shortlist</h1>
          </div>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <button
            type="button"
            onClick={() => exportBody('csv')}
            disabled={!companies.length}
            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] border border-[#dfdcd5] dark:border-[#333] disabled:opacity-40 cursor-pointer bg-white/80 dark:bg-[#111]/80 hover:bg-black/5 dark:hover:bg-white/5 transition-colors"
          >
            <FileSpreadsheet size={12} />
            CSV
          </button>
          <button
            type="button"
            onClick={() => exportBody('pdf')}
            disabled={!companies.length}
            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] border border-[#dfdcd5] dark:border-[#333] disabled:opacity-40 cursor-pointer bg-white/80 dark:bg-[#111]/80 hover:bg-black/5 dark:hover:bg-white/5 transition-colors"
          >
            <Download size={12} />
            PDF
          </button>
        </div>
      </header>

      <main className="flex-1 min-h-0 overflow-y-auto overscroll-y-contain pt-20" data-lenis-prevent>
        <div className="max-w-6xl mx-auto px-4 md:px-6 py-8 space-y-6">
          {state.message ? (
            <p className="text-sm text-[#595855] dark:text-[#808080]">{state.message}</p>
          ) : null}
          {state.rawQuery ? (
            <p className="text-xs font-mono text-[#595855] dark:text-[#666]">
              Screening Criteria: {state.rawQuery}
            </p>
          ) : null}

          {showUnderfillNote ? (
            <p className="text-sm text-amber-700 dark:text-amber-400">
              Only {companies.length}{' '}
              {companies.length === 1 ? 'company' : 'companies'} matched these screening criteria
              {companies.length < INITIAL_SHORTLIST_TARGET
                ? ` (target is ${INITIAL_SHORTLIST_TARGET})`
                : ''}
              .
            </p>
          ) : null}

          {canExpand ? (
            <div className="rounded-xl border border-[#dfdcd5] dark:border-[#2a2a2a] bg-white dark:bg-[#111] px-4 py-3 flex flex-wrap items-center gap-3 justify-between">
              <div>
                <p className="text-sm font-medium text-black dark:text-white">
                  {companies.length} of {SHORTLIST_MAX} companies
                </p>
                <p className="text-xs text-[#595855] dark:text-[#808080] mt-0.5">
                  Request more matches using these screening criteria
                </p>
              </div>
              <div className="flex items-center gap-2">
                <label className="text-xs text-[#595855] dark:text-[#808080] flex items-center gap-2">
                  Add
                  <input
                    type="number"
                    min={1}
                    max={Math.min(roomLeft, 25)}
                    value={Math.min(additionalCount, roomLeft)}
                    onChange={(e) => {
                      const n = Number(e.target.value);
                      if (Number.isFinite(n)) {
                        setAdditionalCount(Math.min(Math.max(1, n), roomLeft, 25));
                      }
                    }}
                    disabled={!canExpand}
                    className="w-14 px-2 py-1 rounded-lg text-sm border border-[#dfdcd5] dark:border-[#333] bg-[#ebebeb] dark:bg-[#0a0a0a] text-center"
                  />
                  more
                </label>
                <button
                  type="button"
                  onClick={handleExpand}
                  disabled={!canExpand}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-black text-white dark:bg-white dark:text-black disabled:opacity-40 cursor-pointer border-none"
                >
                  <Plus size={14} />
                  {expanding ? 'Searching…' : 'Find more'}
                </button>
              </div>
            </div>
          ) : null}

          {expanding ? <PipelineProgress events={feedEvents} active /> : null}

          {expandMessage ? (
            <p
              className={`text-sm ${
                expandMessage.includes('No more') || expandMessage.includes('not available')
                  ? 'text-amber-700 dark:text-amber-400'
                  : 'text-[#595855] dark:text-[#808080]'
              }`}
            >
              {expandMessage}
            </p>
          ) : null}

          {customColumnError ? (
            <p className="text-sm text-amber-700 dark:text-amber-400">{customColumnError}</p>
          ) : null}

          <GlanceTable
            companies={companies}
            customColumns={customColumns}
            customColumnBusy={customColumnBusy}
            onAddCustomColumn={handleAddCustomColumn}
            onRemoveCustomColumn={handleRemoveCustomColumn}
            onRowClick={(co) =>
              navigate(`/company/${encodeURIComponent(co.domain)}`, {
                state: {
                  company: co,
                  structured: state.structured,
                  rawQuery: state.rawQuery,
                  chatId: state.chatId ?? null,
                },
              })
            }
          />
        </div>
      </main>
      </div>
    </div>
  );
}

export default Results;
