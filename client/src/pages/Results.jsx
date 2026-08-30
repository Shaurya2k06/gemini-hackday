import React, { useState, useMemo, useEffect } from 'react';
import { useNavigate, useLocation, Link } from 'react-router-dom';
import { ArrowLeft, Download, FileSpreadsheet, Plus } from 'lucide-react';
import { Monogram } from '../components/brand/Brand';
import { GlanceTable } from '../components/discovery/GlanceTable';
import { VoiceFeaturesPanel } from '../components/discovery/VoiceFeaturesPanel';
import { PipelineProgress } from '../components/discovery/PipelineProgress';
import { CriterionPills } from '../components/mandate/CriterionPills';
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
  const [voiceReview, setVoiceReview] = useState(null);
  const [voiceApplying, setVoiceApplying] = useState(false);
  const [voiceFeedEvents, setVoiceFeedEvents] = useState([]);
  const [voiceError, setVoiceError] = useState(null);
  const [voiceAddingField, setVoiceAddingField] = useState(null);
  const [voiceFieldInput, setVoiceFieldInput] = useState('');

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
    setVoiceReview(null);
    setVoiceApplying(false);
    setVoiceFeedEvents([]);
    setVoiceError(null);
    setVoiceAddingField(null);
    setVoiceFieldInput('');
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

  const handleVoiceRefined = (result) => {
    setVoiceError(null);
    setVoiceAddingField(null);
    setVoiceFieldInput('');
    setVoiceReview(result);
  };

  const handleDiscardVoiceRefinement = () => {
    setVoiceReview(null);
    setVoiceError(null);
    setVoiceAddingField(null);
    setVoiceFieldInput('');
  };

  const handleVoiceRemovePill = (pill) => {
    if (!voiceReview?.structured) return;

    const nextStructured = { ...voiceReview.structured };
    const valueKey = String(pill.value ?? pill.label).toLowerCase();

    if (Array.isArray(nextStructured[pill.field])) {
      nextStructured[pill.field] = nextStructured[pill.field].filter(
        (v) => String(v).toLowerCase() !== valueKey
      );
    } else if (pill.field === 'revenue') {
      nextStructured.revenue_min = null;
      nextStructured.revenue_max = null;
    } else if (pill.field === 'ebitda') {
      nextStructured.ebitda_min = null;
      nextStructured.ebitda_max = null;
    } else if (pill.field === 'employees') {
      nextStructured.employees_min = null;
      nextStructured.employees_max = null;
    } else if (pill.field === 'founded_after' || pill.field === 'founded_before') {
      nextStructured[pill.field] = null;
    }

    setVoiceReview({
      ...voiceReview,
      structured: nextStructured,
      pills: voiceReview.pills.filter((p) => p.id !== pill.id),
    });
  };

  const handleVoiceRangeChange = (kind, { min, max }) => {
    if (!voiceReview?.structured) return;

    const nextStructured = { ...voiceReview.structured };
    if (kind === 'revenue') {
      nextStructured.revenue_min = min;
      nextStructured.revenue_max = max;
    } else if (kind === 'ebitda') {
      nextStructured.ebitda_min = min;
      nextStructured.ebitda_max = max;
    } else if (kind === 'employees') {
      nextStructured.employees_min = min;
      nextStructured.employees_max = max;
    }

    setVoiceReview({
      ...voiceReview,
      structured: nextStructured,
      pills: voiceReview.pills.filter(
        (p) => p.field !== 'revenue' && p.field !== 'ebitda' && p.field !== 'employees'
      ),
    });
  };

  const handleVoiceStartAdd = (field) => {
    setVoiceAddingField(field);
    setVoiceFieldInput('');
  };

  const handleVoiceCancelAdd = () => {
    setVoiceAddingField(null);
    setVoiceFieldInput('');
  };

  const handleVoiceCommitFieldAdd = async () => {
    const value = voiceFieldInput.trim();
    if (!value || !voiceAddingField || !voiceReview) return;

    try {
      const res = await apiFetch('/mandate/parse', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: value,
          accumulatedText: voiceReview.rawQuery,
          priorStructured: voiceReview.structured,
          fieldHint: voiceAddingField,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Could not add criterion');
      setVoiceReview({
        structured: data.structured,
        rawQuery: data.accumulatedText,
        pills: data.pills ?? [],
        transcript: voiceReview.transcript,
      });
      setVoiceError(null);
    } catch (err) {
      setVoiceError(err.message ?? 'Could not add criterion');
    } finally {
      setVoiceFieldInput('');
      setVoiceAddingField(null);
    }
  };

  const handleApplyVoiceRefinement = async () => {
    if (!voiceReview || voiceApplying) return;

    setVoiceApplying(true);
    setVoiceError(null);
    setVoiceFeedEvents([{ step: 'Updating search…', detail: null, at: Date.now() }]);

    try {
      const res = await apiFetch('/discover/stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          structured: voiceReview.structured,
          rawQuery: voiceReview.rawQuery,
          constraintMode: state.constraintMode ?? 'heavy',
        }),
      });

      const result = await consumeSseStream(res, {
        onProgress: (evt) => setVoiceFeedEvents((prev) => [...prev, evt].slice(-30)),
      });

      const newCompanies = (result.cards ?? []).map(mapApiCardToCompany);
      const next = {
        ...state,
        companies: newCompanies,
        cards: result.cards ?? [],
        structured: result.structured ?? voiceReview.structured,
        rawQuery: voiceReview.rawQuery,
        message: result.message,
        customColumns: [],
      };

      saveDiscoveryState(next);
      setState(next);
      setCustomColumns([]);
      await syncChat(next);
      setVoiceReview(null);
    } catch (err) {
      setVoiceError(err.message ?? 'Could not update search.');
    } finally {
      setVoiceApplying(false);
      setVoiceFeedEvents([]);
    }
  };

  return (
    <div className="h-screen w-screen flex overflow-hidden bg-cream text-ink font-sans antialiased">
      <ChatSidebar
        open={sidebarOpen}
        onToggle={() => setSidebarOpen((v) => !v)}
        refreshKey={sidebarRefreshKey}
        activeChatId={state.chatId ?? null}
      />
      <div className="flex-1 min-w-0 flex flex-col overflow-hidden">
      <header className="shrink-0 h-16 bg-cream/95 backdrop-blur border-b border-hairline px-4 md:px-6 flex items-center justify-between gap-3 z-40">
        <div className="flex items-center gap-3 min-w-0">
          <Link
            to="/chat"
            className="p-1.5 text-secondary hover:text-ink transition-colors flex items-center justify-center shrink-0"
            aria-label="New mandate"
          >
            <ArrowLeft size={16} />
          </Link>
          <Monogram />
          <div className="min-w-0">
            <p className="font-mono text-[10px] uppercase tracking-[0.1em] text-[#8f8b80] leading-none mb-0.5">
              At a glance
            </p>
            <h1 className="font-sans text-[14px] font-semibold tracking-tight truncate leading-none">
              Screening shortlist
            </h1>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => exportBody('csv')}
            disabled={!companies.length}
            className="inline-flex items-center gap-1.5 h-[34px] px-3 font-mono text-[11px] uppercase tracking-[0.06em] border border-ink/20 text-ink disabled:opacity-40 cursor-pointer bg-cream hover:border-ink transition-colors"
          >
            <FileSpreadsheet size={12} />
            CSV
          </button>
          <button
            type="button"
            onClick={() => exportBody('pdf')}
            disabled={!companies.length}
            className="inline-flex items-center gap-1.5 h-[34px] px-3 font-mono text-[11px] uppercase tracking-[0.06em] border border-ink/20 text-ink disabled:opacity-40 cursor-pointer bg-cream hover:border-ink transition-colors"
          >
            <Download size={12} />
            PDF
          </button>
        </div>
      </header>

      <main className="flex-1 min-h-0 overflow-y-auto overscroll-y-contain" data-lenis-prevent>
        <div className="max-w-6xl mx-auto px-4 md:px-6 py-8 space-y-6">
          {state.message ? (
            <p className="text-[14px] text-secondary leading-[1.55]">{state.message}</p>
          ) : null}
          {state.rawQuery ? (
            <div className="border border-hairline bg-[#fbf7ec] px-4 py-3">
              <p className="font-mono text-[10px] uppercase tracking-[0.1em] text-[#8f8b80] mb-1">
                Screening criteria
              </p>
              <p className="text-[13px] font-mono text-ink leading-[1.5]">{state.rawQuery}</p>
            </div>
          ) : null}

          {showUnderfillNote ? (
            <p className="text-[13px] font-mono text-accent-red">
              Only {companies.length}{' '}
              {companies.length === 1 ? 'company' : 'companies'} matched these screening criteria
              {companies.length < INITIAL_SHORTLIST_TARGET
                ? ` (target is ${INITIAL_SHORTLIST_TARGET})`
                : ''}
              .
            </p>
          ) : null}

          {canExpand ? (
            <div className="border border-hairline bg-[#fbf7ec] px-4 py-3 flex flex-wrap items-center gap-3 justify-between">
              <div>
                <p className="text-[14px] font-semibold text-ink">
                  {companies.length} of {SHORTLIST_MAX} companies
                </p>
                <p className="text-[13px] text-secondary mt-0.5">
                  Request more matches using these screening criteria
                </p>
              </div>
              <div className="flex items-center gap-2">
                <label className="text-[13px] text-secondary flex items-center gap-2">
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
                    className="w-14 px-2 py-1.5 text-[13px] border border-hairline bg-cream text-ink text-center outline-none focus:border-ink/40"
                  />
                  more
                </label>
                <button
                  type="button"
                  onClick={handleExpand}
                  disabled={!canExpand}
                  className="inline-flex items-center gap-1.5 h-[34px] px-4 font-mono text-[11px] uppercase tracking-[0.06em] bg-accent-red text-white disabled:opacity-40 cursor-pointer border-none hover:brightness-105 transition-all"
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
              className={`text-[13px] ${
                expandMessage.includes('No more') || expandMessage.includes('not available')
                  ? 'text-accent-red font-mono'
                  : 'text-secondary'
              }`}
            >
              {expandMessage}
            </p>
          ) : null}

          {customColumnError ? (
            <p className="text-[13px] font-mono text-accent-red">{customColumnError}</p>
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

          {companies.length > 0 ? (
            <VoiceFeaturesPanel
              structured={state.structured}
              rawQuery={state.rawQuery}
              onRefined={handleVoiceRefined}
            />
          ) : null}

          {voiceReview ? (
            <div className="rounded-xl border border-[#dfdcd5] dark:border-[#2a2a2a] bg-white dark:bg-[#111] px-4 py-4 space-y-3">
              <div>
                <p className="text-sm font-medium text-black dark:text-white">
                  Updated criteria from your recording
                </p>
                <p className="text-xs text-[#595855] dark:text-[#808080] mt-0.5 italic">
                  "{voiceReview.transcript}"
                </p>
              </div>

              <CriterionPills
                pills={voiceReview.pills}
                structured={voiceReview.structured}
                onRemove={handleVoiceRemovePill}
                onRangeChange={handleVoiceRangeChange}
                addingField={voiceAddingField}
                fieldInput={voiceFieldInput}
                onStartAdd={handleVoiceStartAdd}
                onFieldInputChange={setVoiceFieldInput}
                onCommitFieldAdd={handleVoiceCommitFieldAdd}
                onCancelAdd={handleVoiceCancelAdd}
                disabled={voiceApplying}
              />

              {voiceError ? (
                <p className="text-sm text-amber-700 dark:text-amber-400">{voiceError}</p>
              ) : null}

              {voiceApplying ? <PipelineProgress events={voiceFeedEvents} active /> : null}

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleApplyVoiceRefinement}
                  disabled={voiceApplying}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-black text-white dark:bg-white dark:text-black disabled:opacity-40 cursor-pointer border-none"
                >
                  {voiceApplying ? 'Updating…' : 'Update search'}
                </button>
                <button
                  type="button"
                  onClick={handleDiscardVoiceRefinement}
                  disabled={voiceApplying}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border border-[#dfdcd5] dark:border-[#333] text-[#595855] dark:text-[#808080] disabled:opacity-40 cursor-pointer bg-transparent"
                >
                  Discard
                </button>
              </div>
            </div>
          ) : null}
        </div>
      </main>
      </div>
    </div>
  );
}

export default Results;
