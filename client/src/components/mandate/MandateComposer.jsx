import React, { useState, useCallback, forwardRef, useImperativeHandle, useRef, useEffect } from 'react';
import { Plus, FileUp, FormInput, Mic, Square, Loader2 } from 'lucide-react';
import { AnimatePresence, motion } from 'framer-motion';
import { CriterionPills } from './CriterionPills';
import { ConstraintModeToggle } from './ConstraintModeToggle';
import { ManualFieldsForm } from './ManualFieldsForm';
import { friendlyChatError } from '../../lib/chatErrors';
import { apiFetch } from '../../lib/api';
import { pickAudioMimeType } from '../../lib/audioRecording';

function looksLikeChatQuestion(text) {
  const trimmed = String(text ?? '').trim();
  if (!trimmed) return false;
  return (
    /^(who|what|when|where|why|how|is|are|does|do|can|could|tell\s+me)\b/i.test(trimmed) ||
    /\b(who\s+owns|valuation|worth|ceo|founder|founded|last\s+round)\b/i.test(trimmed)
  );
}

export const MandateComposer = forwardRef(function MandateComposer(
  {
    onSend,
    disabled = false,
    placeholder = 'Describe your target criteria or ask a question…',
    input: externalInput,
    setInput: externalSetInput,
    constraintMode = 'heavy',
    onConstraintModeChange,
    onThesisUpload,
    thesisParsing = false,
  },
  ref
) {
  const thesisInputRef = useRef(null);
  const plusMenuRef = useRef(null);
  const [pills, setPills] = useState([]);
  const [structured, setStructured] = useState(null);
  const [intent, setIntent] = useState('mandate_search');
  const [accumulatedText, setAccumulatedText] = useState('');
  const [localInput, setLocalInput] = useState('');
  const input = externalInput !== undefined ? externalInput : localInput;
  const setInput = externalSetInput !== undefined ? externalSetInput : setLocalInput;
  const [addingField, setAddingField] = useState(null);
  const [fieldInput, setFieldInput] = useState('');
  const [addMoreOpen, setAddMoreOpen] = useState(false);
  const [plusMenuOpen, setPlusMenuOpen] = useState(false);
  const [manualFormOpen, setManualFormOpen] = useState(false);
  const [parsing, setParsing] = useState(false);
  const [parseError, setParseError] = useState(null);
  const [voiceRecording, setVoiceRecording] = useState(false);
  const [voiceTranscribing, setVoiceTranscribing] = useState(false);
  const [voiceError, setVoiceError] = useState(null);
  const mediaRecorderRef = useRef(null);
  const voiceChunksRef = useRef([]);
  const voiceStreamRef = useRef(null);

  useEffect(() => {
    if (!plusMenuOpen) return;
    const onDoc = (e) => {
      if (plusMenuRef.current && !plusMenuRef.current.contains(e.target)) {
        setPlusMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [plusMenuOpen]);

  useEffect(() => {
    return () => {
      mediaRecorderRef.current?.stop();
      voiceStreamRef.current?.getTracks().forEach((track) => track.stop());
    };
  }, []);

  const isMandateBuilder =
    intent === 'mandate_search' &&
    (pills.length > 0 ||
      structured?.revenue_min != null ||
      structured?.revenue_max != null ||
      structured?.ebitda_min != null ||
      structured?.ebitda_max != null ||
      structured?.employees_min != null ||
      structured?.employees_max != null);
  const isChatMode = intent === 'general_info' || intent === 'company_lookup';

  const applyParseResult = (data) => {
    const nextIntent = data.intent ?? 'mandate_search';
    setStructured(data.structured);
    setIntent(nextIntent);
    setAccumulatedText(data.accumulatedText ?? '');
    setPills(nextIntent === 'mandate_search' ? data.pills ?? [] : []);
    if (nextIntent !== 'mandate_search') {
      setAddMoreOpen(false);
      setAddingField(null);
      setFieldInput('');
      setManualFormOpen(false);
      setPlusMenuOpen(false);
    }
    setParseError(null);
    return nextIntent;
  };

  const stopVoiceStream = () => {
    voiceStreamRef.current?.getTracks().forEach((track) => track.stop());
    voiceStreamRef.current = null;
  };

  const handleVoiceStopped = async (mimeType) => {
    stopVoiceStream();
    const blob = new Blob(voiceChunksRef.current, { type: mimeType });
    voiceChunksRef.current = [];

    if (!blob.size) {
      setVoiceError('No audio captured. Try again.');
      return;
    }

    setVoiceTranscribing(true);
    setVoiceError(null);
    try {
      const form = new FormData();
      const ext = mimeType.includes('mp4') ? 'm4a' : 'webm';
      form.append('audio', blob, `mandate.${ext}`);
      if (structured) form.append('priorStructured', JSON.stringify(structured));
      if (accumulatedText) form.append('accumulatedText', accumulatedText);
      const res = await apiFetch('/mandate/parse-audio', { method: 'POST', body: form });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Could not transcribe audio');
      applyParseResult(data);
    } catch (err) {
      setVoiceError(friendlyChatError(err.message, { intent }));
    } finally {
      setVoiceTranscribing(false);
    }
  };

  const startVoiceRecording = async () => {
    setVoiceError(null);
    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
      setVoiceError('Microphone access is not supported in this browser.');
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      voiceStreamRef.current = stream;
      const mimeType = pickAudioMimeType();
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      voiceChunksRef.current = [];
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) voiceChunksRef.current.push(e.data);
      };
      recorder.onstop = () => handleVoiceStopped(mimeType || recorder.mimeType || 'audio/webm');
      recorder.start();
      mediaRecorderRef.current = recorder;
      setVoiceRecording(true);
    } catch {
      setVoiceError('Microphone access was denied. Allow microphone access and try again.');
      stopVoiceStream();
    }
  };

  const stopVoiceRecording = () => {
    mediaRecorderRef.current?.stop();
    setVoiceRecording(false);
  };

  const resetComposer = () => {
    setPills([]);
    setStructured(null);
    setIntent('mandate_search');
    setAccumulatedText('');
    setInput('');
    setAddingField(null);
    setFieldInput('');
    setAddMoreOpen(false);
    setPlusMenuOpen(false);
    setManualFormOpen(false);
    setParseError(null);
  };

  const dispatchSend = (payload) => {
    if (!payload?.accumulatedText?.trim()) return;
    onSend?.(payload);
    resetComposer();
  };

  const runParse = useCallback(
    async (
      text,
      prior = accumulatedText,
      priorStructured = structured,
      fieldHint = null,
      { autoSendChat = false } = {}
    ) => {
      const fragment = String(text ?? '').trim();
      if (!fragment && !prior) {
        setPills([]);
        setStructured(null);
        setIntent('mandate_search');
        setAccumulatedText('');
        return;
      }

      setParsing(true);
      setParseError(null);
      try {
        const res = await apiFetch('/mandate/parse', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            text: fragment,
            accumulatedText: prior,
            priorStructured: prior && (fragment || fieldHint) ? priorStructured : null,
            fieldHint,
          }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Parse failed');

        const nextIntent = applyParseResult(data);
        if (autoSendChat && nextIntent === 'general_info') {
          dispatchSend({
            intent: data.intent,
            structured: data.structured,
            accumulatedText: data.accumulatedText,
            pills: [],
          });
        }
        return data;
      } catch (err) {
        if (looksLikeChatQuestion(fragment || prior)) {
          const question = prior && fragment ? `${prior}, ${fragment}` : prior || fragment;
          applyParseResult({
            intent: 'general_info',
            structured: { intent: 'general_info', raw_query: question },
            pills: [],
            accumulatedText: question,
          });
          setParseError(null);
          if (autoSendChat) {
            dispatchSend({
              intent: 'general_info',
              structured: { intent: 'general_info', raw_query: question },
              accumulatedText: question,
              pills: [],
            });
          }
        } else {
          setParseError(friendlyChatError(err.message, { intent }));
        }
      } finally {
        setParsing(false);
      }
    },
    [accumulatedText, structured, intent, onSend]
  );

  useImperativeHandle(
    ref,
    () => ({
      applyParseResult,
      commitText: async (text) => {
        const fragment = String(text ?? '').trim();
        if (!fragment) return null;
        setInput('');
        setAddMoreOpen(false);
        return runParse(fragment, accumulatedText, structured, null, { autoSendChat: false });
      },
    }),
    [runParse, accumulatedText, structured]
  );

  const handleManualFieldsApply = async (text) => {
    const fragment = String(text ?? '').trim();
    if (!fragment) return;
    setManualFormOpen(false);
    setPlusMenuOpen(false);
    await runParse(fragment, accumulatedText, structured, null, { autoSendChat: false });
  };

  const handleBlurOrCommit = async ({ autoSendChat = false } = {}) => {
    const fragment = input.trim();
    if (!fragment) return;
    await runParse(fragment, accumulatedText, structured, null, { autoSendChat });
    setInput('');
    setAddMoreOpen(false);
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleBlurOrCommit({ autoSendChat: true });
    }
  };

  const handleRemovePill = (pill) => {
    if (!structured) return;

    const nextStructured = { ...structured };
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

    const nextPills = pills.filter((p) => p.id !== pill.id);
    setStructured(nextStructured);
    setPills(nextPills);
    if (nextPills.length === 0) setAddMoreOpen(false);
  };

  const handleStartAdd = (field) => {
    setAddMoreOpen(false);
    setAddingField(field);
    setFieldInput('');
  };

  const handleCommitFieldAdd = async () => {
    const value = fieldInput.trim();
    if (!value || !addingField) return;
    await runParse(value, accumulatedText, structured, addingField);
    setFieldInput('');
    setAddingField(null);
  };

  const handleCancelAdd = () => {
    setFieldInput('');
    setAddingField(null);
  };

  const handleRangeChange = (kind, { min, max }) => {
    if (!structured) return;
    const next = { ...structured };
    if (kind === 'revenue') {
      next.revenue_min = min;
      next.revenue_max = max;
    } else if (kind === 'ebitda') {
      next.ebitda_min = min;
      next.ebitda_max = max;
    } else if (kind === 'employees') {
      next.employees_min = min;
      next.employees_max = max;
    }
    setStructured(next);
    setPills((prev) =>
      prev.filter((p) => p.field !== 'revenue' && p.field !== 'ebitda' && p.field !== 'employees')
    );
  };

  const handleSend = async () => {
    if (disabled || parsing) return;

    let finalStructured = structured;
    let finalText = accumulatedText;
    let finalIntent = intent;
    let finalPills = pills;

    if (input.trim()) {
      setParsing(true);
      try {
        const res = await apiFetch('/mandate/parse', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            text: input.trim(),
            accumulatedText,
            priorStructured: structured,
          }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Parse failed');
        finalStructured = data.structured;
        finalText = data.accumulatedText;
        finalIntent = data.intent;
        finalPills = data.intent === 'mandate_search' ? data.pills ?? [] : [];
        applyParseResult(data);
        setInput('');
      } catch (err) {
        if (looksLikeChatQuestion(input.trim() || accumulatedText)) {
          finalIntent = 'general_info';
          finalText = input.trim() || accumulatedText;
          finalStructured = { intent: 'general_info', raw_query: finalText };
          finalPills = [];
          applyParseResult({
            intent: 'general_info',
            structured: finalStructured,
            pills: [],
            accumulatedText: finalText,
          });
          setInput('');
        } else {
          setParseError(friendlyChatError(err.message, { intent }));
          setParsing(false);
          return;
        }
      }
      setParsing(false);
    }

    const ready =
      finalIntent === 'general_info'
        ? Boolean(finalText?.trim() || input.trim())
        : finalIntent === 'company_lookup'
          ? Boolean(finalStructured?.company_names?.length)
          : Boolean(finalStructured && finalText?.trim());

    if (!ready) return;

    dispatchSend({
      intent: finalIntent,
      structured: finalStructured,
      accumulatedText: finalText,
      pills: finalPills,
    });
  };

  const canSend =
    !disabled &&
    !parsing &&
    (Boolean(input.trim()) ||
      (intent === 'general_info' && Boolean(accumulatedText)) ||
      (intent === 'company_lookup' && Boolean(structured?.company_names?.length)) ||
      (intent === 'mandate_search' && Boolean(structured && accumulatedText)));

  const showMainInput = pills.length === 0 || isChatMode || addMoreOpen;

  /** Plus menu (PDF / manual fields) belongs on the empty composer only — not "Anything else". */
  const showPlusEntry = !isChatMode && pills.length === 0 && !addMoreOpen && !manualFormOpen;

  return (
    <div className="space-y-3">
      {isMandateBuilder ? (
        <CriterionPills
          pills={pills}
          structured={structured}
          onRemove={handleRemovePill}
          onRangeChange={handleRangeChange}
          addingField={addingField}
          fieldInput={fieldInput}
          onStartAdd={handleStartAdd}
          onFieldInputChange={setFieldInput}
          onCommitFieldAdd={handleCommitFieldAdd}
          onCancelAdd={handleCancelAdd}
          disabled={disabled || parsing}
        />
      ) : null}

      {manualFormOpen ? (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.18, ease: 'easeOut' }}
        >
          <ManualFieldsForm
            disabled={disabled || parsing}
            onCancel={() => setManualFormOpen(false)}
            onApply={handleManualFieldsApply}
          />
        </motion.div>
      ) : null}

      {isMandateBuilder && !addMoreOpen && !addingField && !manualFormOpen ? (
        <button
          type="button"
          onClick={() => setAddMoreOpen(true)}
          disabled={disabled || parsing}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[12px] border border-dashed border-ink/25 text-secondary hover:border-ink/50 hover:text-ink bg-transparent cursor-pointer disabled:opacity-40 transition-colors"
        >
          <Plus size={12} />
          Anything else you&apos;d like to add?
        </button>
      ) : null}

      {showMainInput && (
        <div className="flex items-center gap-2 border border-ink/20 bg-[#fbf7ec] px-2 py-2 focus-within:border-ink/45 transition-colors">
          {showPlusEntry ? (
            <div className="relative shrink-0" ref={plusMenuRef}>
              <button
                type="button"
                disabled={disabled || parsing || thesisParsing}
                onClick={() => setPlusMenuOpen((open) => !open)}
                title="Add criteria"
                aria-expanded={plusMenuOpen}
                aria-haspopup="menu"
                className="p-1.5 text-secondary hover:bg-ink/5 hover:text-ink transition-colors border-none bg-transparent cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <Plus size={16} />
              </button>
              <AnimatePresence>
                {plusMenuOpen ? (
                  <motion.div
                    role="menu"
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: 8 }}
                    transition={{ duration: 0.16, ease: 'easeOut' }}
                    className="absolute left-0 bottom-full mb-1 z-20 w-[220px] border border-hairline bg-cream shadow-lg py-1 origin-bottom"
                  >
                    <button
                      type="button"
                      role="menuitem"
                      disabled={disabled || parsing || thesisParsing || !onThesisUpload}
                      onClick={() => {
                        setPlusMenuOpen(false);
                        thesisInputRef.current?.click();
                      }}
                      className="w-full flex items-center gap-2 px-3 py-2 text-[13px] text-left text-ink hover:bg-[#fbf7ec] border-none bg-transparent cursor-pointer disabled:opacity-40"
                    >
                      <FileUp size={14} className="shrink-0 text-secondary" />
                      Upload PDF
                    </button>
                    <button
                      type="button"
                      role="menuitem"
                      disabled={disabled || parsing || thesisParsing}
                      onClick={() => {
                        setPlusMenuOpen(false);
                        setManualFormOpen(true);
                      }}
                      className="w-full flex items-center gap-2 px-3 py-2 text-[13px] text-left text-ink hover:bg-[#fbf7ec] border-none bg-transparent cursor-pointer disabled:opacity-40"
                    >
                      <FormInput size={14} className="shrink-0 text-secondary" />
                      Enter fields manually
                    </button>
                  </motion.div>
                ) : null}
              </AnimatePresence>
              <input
                ref={thesisInputRef}
                type="file"
                accept="application/pdf,.pdf"
                className="hidden"
                onChange={onThesisUpload}
              />
            </div>
          ) : null}
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            onBlur={() => {
              if (input.trim()) handleBlurOrCommit({ autoSendChat: false });
            }}
            disabled={disabled || parsing || voiceRecording || voiceTranscribing}
            placeholder={
              parsing
                ? 'Parsing…'
                : thesisParsing
                  ? 'Reading thesis…'
                  : voiceRecording
                    ? 'Listening…'
                    : voiceTranscribing
                      ? 'Transcribing…'
                      : isChatMode
                        ? 'Ask a follow-up…'
                        : pills.length
                          ? 'Add another criterion…'
                          : placeholder
            }
            className="flex-1 min-w-0 bg-transparent border-none outline-none text-[14px] text-ink placeholder:text-[#8f8b80] disabled:opacity-50 py-1 px-1"
          />
          <button
            type="button"
            onClick={voiceRecording ? stopVoiceRecording : startVoiceRecording}
            disabled={disabled || parsing || thesisParsing || voiceTranscribing}
            title={voiceRecording ? 'Stop recording' : 'Speak your criteria'}
            className={`shrink-0 p-1.5 rounded-lg transition-colors border-none cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed ${
              voiceRecording
                ? 'bg-red-600 text-white hover:bg-red-700'
                : 'bg-transparent text-[#595855] dark:text-[#a0a0a0] hover:bg-black/5 dark:hover:bg-white/5 hover:text-black dark:hover:text-white'
            }`}
          >
            {voiceTranscribing ? (
              <Loader2 size={16} className="animate-spin" />
            ) : voiceRecording ? (
              <Square size={14} />
            ) : (
              <Mic size={16} />
            )}
          </button>
        </div>
      )}

      {voiceError ? <p className="text-xs text-amber-700 dark:text-amber-400">{voiceError}</p> : null}

      {parseError || thesisParsing ? (
        <p className="text-[12px] font-mono text-accent-red">
          {parseError ?? (thesisParsing ? 'Reading investment thesis…' : null)}
        </p>
      ) : null}

      <div className="flex items-center justify-end gap-2">
        {!isChatMode && onConstraintModeChange ? (
          <ConstraintModeToggle
            value={constraintMode}
            onChange={onConstraintModeChange}
            disabled={disabled || parsing}
          />
        ) : null}
        <button
          type="button"
          onClick={handleSend}
          disabled={!canSend}
          title={
            intent === 'company_lookup'
              ? 'Open dossier'
              : intent === 'general_info'
                ? 'Ask'
                : 'Run search'
          }
          aria-label={
            intent === 'company_lookup'
              ? 'Open dossier'
              : intent === 'general_info'
                ? 'Ask'
                : 'Run search'
          }
          className="inline-flex items-center justify-center w-10 h-10 bg-accent-red text-white border-none disabled:opacity-30 disabled:cursor-not-allowed hover:brightness-105 transition-all cursor-pointer"
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            aria-hidden="true"
          >
            <path
              d="M5 12h14M13 6l6 6-6 6"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>
      </div>
    </div>
  );
});
