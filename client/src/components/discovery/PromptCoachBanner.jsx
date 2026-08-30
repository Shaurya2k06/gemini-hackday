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
      className="border border-hairline border-l-2 border-l-accent-red bg-[#fbf7ec] p-4 space-y-3"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-2 min-w-0">
          <Sparkles size={16} className="text-accent-red shrink-0 mt-0.5" />
          <div className="min-w-0">
            <p className="text-[14px] font-semibold text-ink">
              Your screening criteria could be more specific
            </p>
            <p className="text-[13px] text-secondary mt-1 leading-relaxed">
              Target screening works best with sector, geography, and size criteria. Try this version
              instead — or send your original query.
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={onDismiss}
          className="text-secondary hover:text-ink border-none bg-transparent cursor-pointer p-1 shrink-0"
          aria-label="Dismiss"
        >
          <X size={16} />
        </button>
      </div>

      <div className="bg-cream border border-hairline px-3 py-2.5">
        <p className="font-mono text-[10px] uppercase tracking-[0.1em] text-[#8f8b80] mb-1">
          Suggested criteria
        </p>
        <p className="text-[14px] text-ink leading-relaxed">{improved}</p>
      </div>

      <div className="bg-cream/60 border border-hairline px-3 py-2.5">
        <p className="font-mono text-[10px] uppercase tracking-[0.1em] text-[#8f8b80] mb-2">
          Parameters you can specify
        </p>
        <ul className="space-y-1.5">
          {MANDATE_PARAMETER_HINTS.map((hint) => (
            <li key={hint.label} className="text-[13px] text-secondary leading-relaxed">
              <span className="font-medium text-ink">{hint.label}:</span>{' '}
              {hint.examples}
            </li>
          ))}
        </ul>
      </div>

      <div className="flex flex-wrap gap-2 pt-1">
        <button
          type="button"
          onClick={onUseImproved}
          className="inline-flex items-center gap-1.5 h-[36px] px-4 bg-accent-red text-white font-mono text-[11px] uppercase tracking-[0.06em] border-none cursor-pointer hover:brightness-105 transition-all"
        >
          Use suggested criteria
          <ArrowRight size={12} />
        </button>
        <button
          type="button"
          onClick={onSendAnyway}
          className="h-[36px] px-4 font-mono text-[11px] uppercase tracking-[0.06em] text-secondary hover:text-ink border border-ink/20 hover:border-ink bg-transparent cursor-pointer transition-colors"
        >
          Send anyway
        </button>
      </div>

      {original ? (
        <p className="text-[11px] font-mono text-[#8f8b80] truncate">
          Your query: &ldquo;{original}&rdquo;
        </p>
      ) : null}
    </motion.div>
  );
}
