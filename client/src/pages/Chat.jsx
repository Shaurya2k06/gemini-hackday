import React, { useState, useContext, useRef, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { AnimatePresence } from 'framer-motion';
import { ArrowLeft, Sun, Moon } from 'lucide-react';
import { ThemeContext } from '../App';
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
      <div className="max-w-[90%] rounded-2xl px-4 py-3 text-sm leading-relaxed bg-white dark:bg-[#161616] border border-[#dfdcd5] dark:border-[#2a2a2a] text-[#333] dark:text-[#e0e0e0] whitespace-pre-wrap">
        {children}
      </div>
    </div>
  );
}

function Chat() {
  const navigate = useNavigate();
  const location = useLocation();
  const { isDark, toggleTheme } = useContext(ThemeContext);
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

  useEffect(() => {
    const voiceText = location.state?.voiceText;
    if (!voiceText) return;
    setComposerInput('');
    composerRef.current?.commitText?.(voiceText);
    navigate('.', { replace: true, state: null });
  }, [location.state]);

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
    <div className="h-screen w-screen flex overflow-hidden bg-background text-black dark:text-white transition-colors duration-300">
      <ChatSidebar
        open={sidebarOpen}
        onToggle={() => setSidebarOpen((v) => !v)}
        refreshKey={sidebarRefreshKey}
      />
      <div className="flex-1 min-w-0 flex flex-col overflow-hidden">
      <header className="fixed top-4 left-1/2 -translate-x-1/2 w-[calc(100%-2rem)] max-w-3xl h-12 bg-white/70 dark:bg-black/70 backdrop-blur-md border border-border/80 shadow-md rounded-full px-4 flex items-center justify-between z-50 transition-all duration-300">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => navigate('/')}
            className="p-1.5 rounded-full hover:bg-black/5 dark:hover:bg-white/5 text-muted-foreground transition-colors border-none bg-transparent cursor-pointer flex items-center justify-center"
          >
            <ArrowLeft size={16} />
          </button>
          <span className="font-davinci font-semibold text-sm tracking-wide">Zoron</span>
        </div>
        <button
          type="button"
          onClick={toggleTheme}
          className="p-1.5 rounded-full hover:bg-black/5 dark:hover:bg-white/5 text-muted-foreground transition-colors border-none bg-transparent cursor-pointer flex items-center justify-center"
        >
          {isDark ? <Sun size={16} className="text-amber-500" /> : <Moon size={16} />}
        </button>
      </header>

      <main className="flex-1 min-h-0 overflow-y-auto overscroll-y-contain pt-20" data-lenis-prevent>
        <div className="max-w-3xl mx-auto px-4 md:px-6 py-8 space-y-8">
          <div className="pt-8 pb-4 text-center">
            <h1 className="font-davinci text-3xl md:text-4xl font-medium tracking-tight mb-3">
              Set screening criteria
            </h1>
            <p className="text-sm text-[#595855] dark:text-[#808080] max-w-md mx-auto leading-relaxed">
              Describe criteria in plain language, Send when ready
              for a 10-company at-a-glance shortlist.
            </p>
            {thesisError ? (
              <p className="mt-3 text-sm text-amber-700 dark:text-amber-400">{thesisError}</p>
            ) : null}
          </div>

          {infoReplies.map((item, idx) => (
            <div key={idx} className="space-y-3">
              <div className="flex justify-end">
                <div className="max-w-[90%] rounded-2xl px-4 py-3 text-sm bg-black text-white dark:bg-white dark:text-black">
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
            <div className="flex flex-wrap gap-2 justify-center">
              {exampleMandates.map((chip) => (
                <button
                  key={chip}
                  type="button"
                  onClick={() => {
                    setComposerInput('');
                    composerRef.current?.commitText?.(chip);
                  }}
                  className="px-3 py-1.5 rounded-full text-xs bg-white dark:bg-[#161616] border border-[#dfdcd5] dark:border-[#333] text-[#595855] dark:text-[#a0a0a0] hover:border-black/30 dark:hover:border-white/30 hover:text-black dark:hover:text-white transition-colors cursor-pointer"
                >
                  {chip}
                </button>
              ))}
            </div>
          ) : null}
        </div>
      </main>

      <footer className="shrink-0 border-t border-border bg-background px-4 md:px-6 py-4">
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
