import React from 'react';

/**
 * Shared Meredian brand primitives — kept in sync with the landing page so every
 * app surface reads as one editorial system: warm cream, ink, signature red,
 * square corners, hairline borders, and mono uppercase eyebrows.
 */

// Square monogram logo mark (SafetyKit-style squared brand).
export const Monogram = ({ light = false, className = '' }) => (
  <div
    className={`w-7 h-7 flex items-center justify-center font-sans font-bold text-[13px] shrink-0 ${
      light ? 'bg-cream text-ink' : 'bg-ink text-cream'
    } ${className}`}
  >
    Z
  </div>
);

// Uppercase mono eyebrow label.
export const Eyebrow = ({ children, tone = 'muted', className = '' }) => (
  <span
    className={`font-mono text-[11px] uppercase tracking-[0.08em] leading-[1.2] ${
      tone === 'red'
        ? 'text-accent-red'
        : tone === 'cream'
          ? 'text-cream/70'
          : 'text-[#8f8b80]'
    } ${className}`}
  >
    {children}
  </span>
);

// Wordmark lockup: monogram + name.
export const BrandLockup = ({ light = false, onClick }) => (
  <button
    type="button"
    onClick={onClick}
    className="flex items-center gap-2.5 bg-transparent border-none cursor-pointer p-0"
  >
    <Monogram light={light} />
    <span className={`font-sans font-bold text-[15px] tracking-tight ${light ? 'text-cream' : 'text-ink'}`}>
      Meredian
    </span>
  </button>
);

// Button recipes shared across the app (square, mono uppercase labels).
export const btnPrimary =
  'inline-flex items-center justify-center gap-2 h-[42px] px-5 bg-accent-red text-white font-mono text-[12px] font-medium uppercase tracking-[0.06em] hover:brightness-105 transition-all cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed';
export const btnDark =
  'inline-flex items-center justify-center gap-2 h-[42px] px-5 bg-ink text-cream font-mono text-[12px] font-medium uppercase tracking-[0.06em] hover:bg-ink/90 transition-all cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed';
export const btnOutline =
  'inline-flex items-center justify-center gap-2 h-[42px] px-5 bg-cream text-ink border border-ink/25 font-mono text-[12px] font-medium uppercase tracking-[0.06em] hover:border-ink transition-all cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed';
