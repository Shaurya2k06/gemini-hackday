import React from 'react';

const MODES = [
  { id: 'heavy', label: 'Heavy' },
  { id: 'lite', label: 'Lite' },
];

export function ConstraintModeToggle({ value = 'heavy', onChange, disabled = false }) {
  const activeIndex = value === 'lite' ? 1 : 0;

  return (
    <div
      className="relative shrink-0 inline-flex items-center rounded-full border border-[#dfdcd5] dark:border-[#444] bg-[#f5f4f1] dark:bg-[#1a1a1a] p-0.5"
      role="group"
      aria-label="Search constraint mode"
    >
      <span
        aria-hidden
        className="absolute top-0.5 bottom-0.5 left-0.5 w-[calc(50%-2px)] rounded-full bg-white dark:bg-[#2a2a2a] shadow-sm border border-[#dfdcd5]/80 dark:border-[#444] transition-transform duration-200 ease-out"
        style={{ transform: `translateX(${activeIndex * 100}%)` }}
      />
      {MODES.map((mode) => {
        const selected = value === mode.id;
        return (
          <button
            key={mode.id}
            type="button"
            disabled={disabled}
            onClick={() => onChange?.(mode.id)}
            aria-pressed={selected}
            className={`relative z-10 min-w-[2.75rem] px-2.5 py-1 rounded-full text-[10px] font-medium transition-colors border-none cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed ${
              selected
                ? 'text-black dark:text-white'
                : 'text-[#595855] dark:text-[#888] hover:text-black dark:hover:text-white'
            }`}
          >
            {mode.label}
          </button>
        );
      })}
    </div>
  );
}
