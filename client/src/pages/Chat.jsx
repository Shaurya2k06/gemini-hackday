import React, { useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { AnimatePresence } from 'framer-motion';
import { ArrowLeft } from 'lucide-react';
import { Monogram } from '../components/brand/Brand';
import { MandateComposer } from '../components/mandate/MandateComposer';
import { PipelineProgress } from '../components/discovery/PipelineProgress';
import { PromptCoachBanner } from '../components/discovery/PromptCoachBanner';
import { ChatSidebar } from '../components/chat/ChatSidebar';
import { mapApiCardToCompany } from '../components/discovery/format';
import { pickRandomMandates } from '../lib/sampleMandates';
import { friendlyChatError } from '../lib/chatErrors';
import { consumeSseStream } from '../lib/sse';
import { apiFetch, apiUrl } from '../lib/api';
import { saveDiscoveryState } from '../lib/discoveryStorage';
import { createChat } from '../lib/auth';
import {
  loadConstraintMode,
  saveConstraintMode,
  normalizeConstraintMode,
} from '../lib/constraintMode';
import {
  assessPromptQuality,
  improvePrompt,
  hasSeenPromptCoach,
  markPromptCoachSeen,
} from '../lib/mandatePromptCoach';

function AssistantBubble({ children }) {
  return (
    <div className="flex justify-start">
      <div className="max-w-[90%] px-4 py-3 text-[14px] leading-relaxed bg-[#fbf7ec] border border-hairline text-ink whitespace-pre-wrap">
        {children}
      </div>
    </div>
  );
}

function Chat() {
  const navigate = useNavigate();
  const composerRef = useRef(null);

  const [exampleMandates] = useState(() => pickRandomMandates(4));
  const [promptCoach, setPromptCoach] = useState(null);
  const [pendingSend, setPendingSend] = useState(null);
  const [processing, setProcessing] = useState(false);
  const [feedEvents, setFeedEvents] = useState([]);
  const [infoReplies, setInfoReplies] = useState([]);
  const [composerInput, setComposerInput] = useState('');
  const [constraintMode, setConstraintMode] = useState(() => loadConstraintMode());
  const [thesisParsing, setThesisParsing] = useState(false);
  const [thesisError, setThesisError] = useState(null);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [sidebarRefreshKey, setSidebarRefreshKey] = useState(0);

  const setMode = (mode) => {
    setConstraintMode(saveConstraintMode(mode));
  };

  const appendProgress = (evt) => {
    setFeedEvents((prev) => {
      const last = prev[prev.length - 1];
      if (last && last.step === evt.step && last.detail === evt.detail) return prev;
      return [...prev, evt].slice(-30);
    });
  };

  const runDiscover = async ({ structured, accumulatedText }) => {
    let parsedStructured = structured;
    if (!parsedStructured) {
      const parseRes = await apiFetch('/mandate/parse', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: accumulatedText, accumulatedText: '' }),
      });
      const parseData = await parseRes.json();
      if (!parseRes.ok) throw new Error(parseData.error || 'Parse failed');
      parsedStructured = parseData.structured;
    }

    setFeedEvents([{ step: 'Mandate received', detail: 'Starting sourcing workflow', at: Date.now() }]);

    const mode = normalizeConstraintMode(constraintMode);
    const res = await apiFetch('/discover/stream', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        structured: parsedStructured,
        rawQuery: accumulatedText,
        constraintMode: mode,
      }),
    });

    const result = await consumeSseStream(res, { onProgress: appendProgress });
    const companies = (result.cards ?? []).map(mapApiCardToCompany);
    const payload = {
      companies,
      cards: result.cards,
      structured: result.structured ?? parsedStructured,
      rawQuery: accumulatedText,
      message: result.message,
      constraintMode: mode,
    };

    if (companies.length > 0) {
      try {
        const saved = await createChat({
          rawQuery: payload.rawQuery,
          structured: payload.structured,
          constraintMode: payload.constraintMode,
          companies: payload.companies,
          cards: payload.cards,
          message: payload.message,
        });
        payload.chatId = saved.id;
        setSidebarRefreshKey((k) => k + 1);
      } catch {
        // Saving is best-effort — still show results locally.
      }
    }

    saveDiscoveryState(payload);
    navigate('/results', { state: payload });
  };

  const runCompanyLookup = async ({ structured }) => {
    setFeedEvents([{ step: 'Looking up company…', detail: structured.company_names?.[0], at: Date.now() }]);

    const res = await apiFetch('/company/lookup/stream', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ structured }),
    });

    const result = await consumeSseStream(res, { onProgress: appendProgress });
    if (!result.found) {
      throw new Error(result.message ?? 'Company not found');
    }

    const company = mapApiCardToCompany(result.card);
    navigate(`/company/${encodeURIComponent(result.domain)}`, {
      state: { company, structured: result.structured ?? structured },
    });
  };

  const runGeneralInfo = async (text, { replacePending = false } = {}) => {
    setFeedEvents([{ step: 'Thinking…', detail: null, at: Date.now() }]);

    const res = await apiFetch('/general-info/stream', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: text }),
    });

    const result = await consumeSseStream(res, { onProgress: appendProgress });
    setInfoReplies((prev) => {
      if (replacePending) {
        const idx = prev.findIndex((item) => item.pending && item.question === text);
        if (idx >= 0) {
          const next = [...prev];
          next[idx] = { question: text, answer: result.text };
          return next;
        }
      }
      return [...prev, { question: text, answer: result.text }];
    });
  };

  const executeSend = async ({ intent, structured, accumulatedText }) => {
    setProcessing(true);
    setFeedEvents([]);

    if (intent === 'general_info') {
      setInfoReplies((prev) => [...prev, { question: accumulatedText, answer: null, pending: true }]);
    }

    try {
      if (intent === 'general_info') {
        await runGeneralInfo(accumulatedText, { replacePending: true });
      } else if (intent === 'company_lookup') {
        await runCompanyLookup({ structured });
      } else {
        await runDiscover({ structured, accumulatedText });
      }
    } catch (err) {
      setInfoReplies((prev) => {
        const idx = prev.findIndex((item) => item.pending && item.question === accumulatedText);
        const entry = { question: accumulatedText, answer: friendlyChatError(err.message) };
        if (idx >= 0) {
          const next = [...prev];
          next[idx] = entry;
          return next;
        }
        return [...prev, entry];
      });
    } finally {
      setProcessing(false);
      setFeedEvents([]);
    }
  };

  const handleSend = async (payload) => {
    if (processing) return;

    if (payload.intent !== 'general_info' && payload.intent !== 'company_lookup' && !hasSeenPromptCoach()) {
      const assessment = assessPromptQuality(payload.accumulatedText);
      if (assessment.poor) {
        setPendingSend(payload);
        setPromptCoach({
          original: payload.accumulatedText,
          improved: improvePrompt(payload.accumulatedText),
        });
        return;
      }
    }

    setPromptCoach(null);
    setPendingSend(null);
    await executeSend(payload);
  };

  const handleThesisUpload = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;

    setThesisError(null);
    setThesisParsing(true);
    try {
      const form = new FormData();
      form.append('file', file);
      const res = await fetch(apiUrl('/mandate/parse-thesis'), {
        method: 'POST',
        body: form,
        credentials: 'include',
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Could not parse thesis PDF');
      composerRef.current?.applyParseResult?.(data);
    } catch (err) {
      setThesisError(friendlyChatError(err.message));
    } finally {
      setThesisParsing(false);
    }
  };

  return (
    <div className="h-screen w-screen flex overflow-hidden bg-cream text-ink font-sans antialiased">
      <ChatSidebar
        open={sidebarOpen}
        onToggle={() => setSidebarOpen((v) => !v)}
        refreshKey={sidebarRefreshKey}
      />
      <div className="flex-1 min-w-0 flex flex-col overflow-hidden">
      <header className="shrink-0 h-16 bg-cream/95 backdrop-blur border-b border-hairline px-4 md:px-6 flex items-center justify-between z-40">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => navigate('/')}
            className="p-1.5 text-secondary hover:text-ink transition-colors border-none bg-transparent cursor-pointer flex items-center justify-center"
            aria-label="Back to home"
          >
            <ArrowLeft size={16} />
          </button>
          <button
            type="button"
            onClick={() => navigate('/')}
            className="flex items-center gap-2.5 bg-transparent border-none cursor-pointer p-0"
          >
            <Monogram />
            <span className="font-sans font-bold text-[15px] tracking-tight">Zoron</span>
          </button>
        </div>
        <span className="font-mono text-[11px] uppercase tracking-[0.08em] text-[#8f8b80] hidden sm:inline">
          New Mandate
        </span>
      </header>

      <main className="flex-1 min-h-0 overflow-y-auto overscroll-y-contain" data-lenis-prevent>
        <div className="max-w-3xl mx-auto px-4 md:px-6 py-10 space-y-8">
          <div className="pt-6 pb-2 text-center">
            <div className="flex items-center justify-center gap-2 mb-5">
              <span className="w-1.5 h-1.5 rounded-full bg-accent-red" />
              <span className="font-mono text-[11px] uppercase tracking-[0.08em] text-accent-red">
                Plain-English Mandate
              </span>
            </div>
            <h1 className="font-sans text-[32px] md:text-[42px] font-semibold tracking-[-0.02em] leading-[1.05] mb-4">
              Set your screening criteria.
            </h1>
            <p className="text-[15px] text-secondary max-w-md mx-auto leading-[1.55]">
              Describe your target in plain language — sector, geography, revenue or EBITDA bands.
              Send when ready for a ranked, at-a-glance shortlist.
            </p>
            {thesisError ? (
              <p className="mt-4 text-[13px] text-accent-red font-mono">{thesisError}</p>
            ) : null}
          </div>

          {infoReplies.map((item, idx) => (
            <div key={idx} className="space-y-3">
              <div className="flex justify-end">
                <div className="max-w-[90%] px-4 py-3 text-[14px] leading-relaxed bg-ink text-cream">
                  {item.question}
                </div>
              </div>
              <AssistantBubble>
                {item.pending ? 'Thinking…' : item.answer}
              </AssistantBubble>
            </div>
          ))}

          {processing && feedEvents.length > 0 && infoReplies.every((item) => !item.pending) ? (
            <PipelineProgress events={feedEvents} active />
          ) : null}

          {!processing && infoReplies.length === 0 ? (
            <div className="flex flex-col items-center gap-3">
              <span className="font-mono text-[10px] uppercase tracking-[0.1em] text-[#8f8b80]">
                Try an example
              </span>
              <div className="flex flex-wrap gap-2 justify-center">
                {exampleMandates.map((chip) => (
                  <button
                    key={chip}
                    type="button"
                    onClick={() => {
                      setComposerInput('');
                      composerRef.current?.commitText?.(chip);
                    }}
                    className="px-3 py-1.5 text-[12px] bg-[#fbf7ec] border border-hairline text-secondary hover:border-ink/40 hover:text-ink transition-colors cursor-pointer"
                  >
                    {chip}
                  </button>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      </main>

      <footer className="shrink-0 border-t border-hairline bg-cream px-4 md:px-6 py-4">
        <div className="max-w-3xl mx-auto space-y-3">
          <AnimatePresence>
            {promptCoach && !processing ? (
              <PromptCoachBanner
                original={promptCoach.original}
                improved={promptCoach.improved}
                onUseImproved={async () => {
                  const text = promptCoach?.improved;
                  markPromptCoachSeen();
                  setPromptCoach(null);
                  if (!text) return;
                  try {
                    const parseRes = await apiFetch('/mandate/parse', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ text, accumulatedText: '' }),
                    });
                    const data = await parseRes.json();
                    if (!parseRes.ok) throw new Error(data.error);
                    await executeSend({
                      intent: data.intent,
                      structured: data.structured,
                      accumulatedText: data.accumulatedText,
                    });
                  } catch (err) {
                    setInfoReplies((prev) => [
                      ...prev,
                      { question: text, answer: friendlyChatError(err.message) },
                    ]);
                  }
                }}
                onSendAnyway={() => {
                  markPromptCoachSeen();
                  setPromptCoach(null);
                  if (pendingSend) executeSend(pendingSend);
                }}
                onDismiss={() => {
                  markPromptCoachSeen();
                  setPromptCoach(null);
                }}
              />
            ) : null}
          </AnimatePresence>

          <MandateComposer
            ref={composerRef}
            onSend={handleSend}
            disabled={processing}
            input={composerInput}
            setInput={setComposerInput}
            constraintMode={constraintMode}
            onConstraintModeChange={setMode}
            onThesisUpload={handleThesisUpload}
            thesisParsing={thesisParsing}
          />
        </div>
      </footer>
      </div>
    </div>
  );
}

export default Chat;
