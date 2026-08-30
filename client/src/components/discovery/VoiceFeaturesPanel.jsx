import React, { useRef, useState } from 'react';
import { AudioLines, Loader2, Mic, Square } from 'lucide-react';
import { apiUrl } from '../../lib/api';
import { friendlyChatError } from '../../lib/chatErrors';
import { pickAudioMimeType } from '../../lib/audioRecording';

const badgeClass =
  'inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-mono uppercase tracking-wide bg-black/5 dark:bg-white/10 text-[#595855] dark:text-[#a0a0a0] shrink-0';

const cardClass =
  'rounded-xl border border-[#dfdcd5] dark:border-[#2a2a2a] bg-white dark:bg-[#111] px-4 py-4 flex flex-col gap-3';

export function VoiceFeaturesPanel({ structured = null, rawQuery = '', onRefined }) {
  const [recording, setRecording] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const [error, setError] = useState(null);
  const mediaRecorderRef = useRef(null);
  const chunksRef = useRef([]);
  const streamRef = useRef(null);

  const stopStream = () => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
  };

  const handleStopped = async (mimeType) => {
    stopStream();
    const blob = new Blob(chunksRef.current, { type: mimeType });
    chunksRef.current = [];

    if (!blob.size) {
      setError('No audio captured. Try again.');
      return;
    }

    setTranscribing(true);
    setError(null);
    try {
      const form = new FormData();
      const ext = mimeType.includes('mp4') ? 'm4a' : 'webm';
      form.append('audio', blob, `mandate.${ext}`);
      if (structured) form.append('priorStructured', JSON.stringify(structured));
      if (rawQuery) form.append('accumulatedText', rawQuery);
      const res = await fetch(apiUrl('/mandate/parse-audio'), {
        method: 'POST',
        body: form,
        credentials: 'include',
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Could not transcribe audio');
      onRefined?.({
        structured: data.structured,
        rawQuery: data.accumulatedText,
        pills: data.pills ?? [],
        transcript: data.transcript,
      });
    } catch (err) {
      setError(friendlyChatError(err.message));
    } finally {
      setTranscribing(false);
    }
  };

  const startRecording = async () => {
    setError(null);
    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
      setError('Microphone access is not supported in this browser.');
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const mimeType = pickAudioMimeType();
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      chunksRef.current = [];
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      recorder.onstop = () => handleStopped(mimeType || recorder.mimeType || 'audio/webm');
      recorder.start();
      mediaRecorderRef.current = recorder;
      setRecording(true);
    } catch {
      setError('Microphone access was denied. Allow microphone access and try again.');
      stopStream();
    }
  };

  const stopRecording = () => {
    mediaRecorderRef.current?.stop();
    setRecording(false);
  };

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
      <div className={cardClass}>
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <Mic size={16} className="text-[#595855] dark:text-[#a0a0a0] shrink-0" />
            <p className="text-sm font-medium text-black dark:text-white truncate">
              Refine by voice
            </p>
          </div>
          <span className={badgeClass}>Gemini 3.5 Transcribe</span>
        </div>
        <p className="text-xs text-[#595855] dark:text-[#808080] leading-relaxed">
          Speak a change instead of typing it — Zoron transcribes it and merges it into this
          search's screening criteria.
        </p>
        {error ? <p className="text-xs text-amber-700 dark:text-amber-400">{error}</p> : null}
        <button
          type="button"
          onClick={recording ? stopRecording : startRecording}
          disabled={transcribing}
          className={`inline-flex items-center justify-center gap-1.5 self-start px-3 py-1.5 rounded-lg text-xs font-medium border-none cursor-pointer disabled:opacity-50 transition-colors ${
            recording ? 'bg-red-600 text-white' : 'bg-black text-white dark:bg-white dark:text-black'
          }`}
        >
          {transcribing ? (
            <>
              <Loader2 size={14} className="animate-spin" />
              Transcribing…
            </>
          ) : recording ? (
            <>
              <Square size={12} />
              Stop recording
            </>
          ) : (
            <>
              <Mic size={14} />
              Speak a refinement
            </>
          )}
        </button>
      </div>

      <div className={`${cardClass} opacity-90`}>
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <AudioLines size={16} className="text-[#595855] dark:text-[#a0a0a0] shrink-0" />
            <p className="text-sm font-medium text-black dark:text-white truncate">
              Live voice analyst
            </p>
          </div>
          <span className={badgeClass}>Gemini 3.1 Flash Live</span>
        </div>
        <p className="text-xs text-[#595855] dark:text-[#808080] leading-relaxed">
          Have a real-time spoken conversation with Zoron about this shortlist or a specific deal.
        </p>
        <button
          type="button"
          disabled
          className="inline-flex items-center justify-center gap-1.5 self-start px-3 py-1.5 rounded-lg text-xs font-medium border border-[#dfdcd5] dark:border-[#333] text-[#595855] dark:text-[#808080] cursor-not-allowed bg-transparent"
        >
          Coming soon
        </button>
      </div>
    </div>
  );
}
