import React from 'react';

/**
 * Circled 'S' Monogram
 * Role: Brand identity — top-left header mark
 * A circled 'S' monogram, ~32px diameter, 1.5px stroke, minimal, monoline, no decoration.
 */
export const CircledSMonogram = ({ isDark = false, className = '' }) => {
  const strokeColor = isDark ? '#ffffff' : '#000000';
  const textColor = isDark ? '#ffffff' : '#000000';

  return (
    <div
      className={`relative inline-flex items-center justify-center select-none ${className}`}
      style={{ width: '32px', height: '32px' }}
      aria-label="Structured Monogram"
    >
      <svg
        width="32"
        height="32"
        viewBox="0 0 32 32"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className="absolute inset-0"
      >
        <circle
          cx="16"
          cy="16"
          r="15"
          stroke={strokeColor}
          strokeWidth="1.5"
        />
      </svg>
      <span
        style={{
          fontFamily: 'var(--font-davinci)',
          fontSize: '18px',
          fontWeight: 500,
          color: textColor,
          lineHeight: 1,
          transform: 'translateY(-0.5px)',
        }}
      >
        S
      </span>
    </div>
  );
};

export default CircledSMonogram;
