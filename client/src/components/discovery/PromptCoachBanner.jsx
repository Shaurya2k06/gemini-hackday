import React from 'react';
import { motion } from 'framer-motion';
import { X, Sparkles, ArrowRight } from 'lucide-react';
import { MANDATE_PARAMETER_HINTS } from '../../lib/mandatePromptCoach';

export function PromptCoachBanner({
  original,
  improved,
  onUseImproved,
  onSendAnyway,
  onDismiss,
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 8 }}
      className="rounded-xl border border-amber-200 dark:border-amber-900/50 bg-amber-50 dark:bg-amber-950/30 p-4 space-y-3"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-2 min-w-0">
          <Sparkles size={16} className="text-amber-700 dark:text-amber-400 shrink-0 mt-0.5" />
          <div className="min-w-0">
            <p className="text-sm font-medium text-amber-950 dark:text-amber-100">
              Your screening criteria could be more specific
            </p>
            <p className="text-xs text-amber-900/80 dark:text-amber-200/80 mt-1 leading-relaxed">
              Target screening works best with sector, geography, and size criteria. Try this version
              instead — or send your original query.
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={onDismiss}
          className="text-amber-700 dark:text-amber-400 hover:text-amber-950 dark:hover:text-amber-100 border-none bg-transparent cursor-pointer p-1 shrink-0"
          aria-label="Dismiss"
        >
          <X size={16} />
        </button>
      </div>

      <div className="rounded-lg bg-white dark:bg-[#161616] border border-amber-200/60 dark:border-amber-900/40 px-3 py-2.5">
        <p className="text-[10px] uppercase tracking-wider text-[#595855] dark:text-[#808080] mb-1">
          Suggested criteria
        </p>
        <p className="text-sm text-black dark:text-white leading-relaxed">{improved}</p>
      </div>

      <div className="rounded-lg bg-white/60 dark:bg-[#111]/60 border border-amber-200/40 dark:border-amber-900/30 px-3 py-2.5">
        <p className="text-[10px] uppercase tracking-wider text-[#595855] dark:text-[#808080] mb-2">
          Parameters you can specify
        </p>
        <ul className="space-y-1.5">
          {MANDATE_PARAMETER_HINTS.map((hint) => (
            <li key={hint.label} className="text-xs text-[#595855] dark:text-[#a0a0a0] leading-relaxed">
              <span className="font-medium text-black dark:text-[#e0e0e0]">{hint.label}:</span>{' '}
              {hint.examples}
            </li>
          ))}
        </ul>
      </div>

      <div className="flex flex-wrap gap-2 pt-1">
        <button
          type="button"
          onClick={onUseImproved}
          className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-black text-white dark:bg-white dark:text-black text-xs font-medium border-none cursor-pointer hover:opacity-90 transition-opacity"
        >
          Use suggested criteria
          <ArrowRight size={12} />
        </button>
        <button
          type="button"
          onClick={onSendAnyway}
          className="px-3 py-2 rounded-lg text-xs font-medium text-[#595855] dark:text-[#a0a0a0] hover:text-black dark:hover:text-white border border-[#dfdcd5] dark:border-[#333] bg-transparent cursor-pointer transition-colors"
        >
          Send anyway
        </button>
      </div>

      {original ? (
        <p className="text-[10px] text-amber-900/70 dark:text-amber-300/60 truncate">
          Your query: &ldquo;{original}&rdquo;
        </p>
      ) : null}
    </motion.div>
  );
}
