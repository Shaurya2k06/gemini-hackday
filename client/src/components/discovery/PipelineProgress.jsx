import React, { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Check, Loader2, Circle } from 'lucide-react';

function StepIcon({ status }) {
  if (status === 'done') {
    return (
      <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-black text-white dark:bg-white dark:text-black">
        <Check size={11} strokeWidth={2.5} />
      </span>
    );
  }
  if (status === 'active') {
    return (
      <span className="flex h-5 w-5 shrink-0 items-center justify-center">
        <Loader2 size={16} className="animate-spin text-black dark:text-white" />
      </span>
    );
  }
  return (
    <span className="flex h-5 w-5 shrink-0 items-center justify-center">
      <Circle size={8} className="text-[#c4c3b6] dark:text-[#333]" fill="currentColor" />
    </span>
  );
}

/** Elapsed ms → `m:ss` or `h:mm:ss`. */
export function formatElapsed(ms) {
  const totalSec = Math.max(0, Math.floor(Number(ms) / 1000));
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  if (h > 0) {
    return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  }
  return `${m}:${String(s).padStart(2, '0')}`;
}

function useElapsedMs(startedAt, { active = false, endedAt = null } = {}) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!active || startedAt == null) return undefined;
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(id);
  }, [active, startedAt]);

  if (startedAt == null) return 0;
  const end = active ? now : (endedAt ?? now);
  return Math.max(0, end - startedAt);
}

const PLACEHOLDER_EVENT = {
  step: 'Starting target screening…',
  detail: 'Understanding your request',
};

export function PipelineProgress({ events = [], active = false }) {
  const displayEvents =
    events.length > 0
      ? events
      : active
        ? [{ ...PLACEHOLDER_EVENT, at: Date.now() }]
        : [];

  const startedAt = displayEvents.reduce((min, evt) => {
    if (evt?.at == null) return min;
    return min == null ? evt.at : Math.min(min, evt.at);
  }, null);

  const endedAt = !active
    ? displayEvents.reduce((max, evt) => {
        if (evt?.at == null) return max;
        return max == null ? evt.at : Math.max(max, evt.at);
      }, null)
    : null;

  const elapsedMs = useElapsedMs(startedAt, { active, endedAt });

  if (!displayEvents.length) return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-xl border border-[#dfdcd5] dark:border-[#2a2a2a] bg-white dark:bg-[#111] overflow-hidden"
    >
      <div className="px-4 py-3 border-b border-[#dfdcd5] dark:border-[#2a2a2a] flex items-center justify-between gap-3">
        <span className="text-xs font-medium text-black dark:text-white">Sourcing workflow</span>
        <span className="text-[10px] text-[#595855] dark:text-[#808080] tabular-nums shrink-0">
          {active ? `In progress · ${formatElapsed(elapsedMs)}` : `Complete · ${formatElapsed(elapsedMs)}`}
        </span>
      </div>

      <ol className="px-4 py-2 max-h-64 overflow-y-auto">
        {displayEvents.map((evt, idx) => {
          const isLast = idx === displayEvents.length - 1;
          const status = active && isLast ? 'active' : 'done';
          const stepElapsed =
            startedAt != null && evt.at != null ? Math.max(0, evt.at - startedAt) : null;

          return (
            <li
              key={`${evt.at ?? idx}-${evt.step}`}
              className="flex gap-3 py-2.5 border-b border-[#dfdcd5]/60 dark:border-[#2a2a2a] last:border-0"
            >
              <StepIcon status={status} />
              <div className="min-w-0 flex-1">
                <p
                  className={`text-sm leading-snug ${
                    status === 'active'
                      ? 'text-black dark:text-white font-medium'
                      : 'text-[#595855] dark:text-[#a0a0a0]'
                  }`}
                >
                  {evt.step}
                </p>
                {evt.detail ? (
                  <p className="text-xs text-[#595855] dark:text-[#808080] mt-0.5 truncate">
                    {evt.detail}
                  </p>
                ) : null}
              </div>
              <span className="text-[10px] text-[#595855] dark:text-[#666] shrink-0 tabular-nums pt-0.5">
                {status === 'active'
                  ? formatElapsed(elapsedMs)
                  : stepElapsed != null
                    ? formatElapsed(stepElapsed)
                    : '—'}
              </span>
            </li>
          );
        })}
      </ol>
    </motion.div>
  );
}
