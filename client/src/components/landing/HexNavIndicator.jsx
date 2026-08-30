import React from 'react';

/**
 * Hexagonal Nav Indicator
 * Role: Pagination or section indicator dots
 * Small hexagonal outline shapes (~12px), stroke #000000 on light or #ffffff on dark, fill transparent.
 * Used in groups of 3 below circular features.
 */
export const HexNavIndicator = ({
  active = false,
  isLight = false,
  size = 12,
  onClick,
  className = '',
}) => {
  const strokeColor = isLight ? '#000000' : '#ffffff';
  const fillColor = active ? strokeColor : 'transparent';

  return (
    <button
      type="button"
      onClick={onClick}
      aria-label="Hexagonal Navigation Indicator"
      className={`inline-flex items-center justify-center p-0.5 bg-transparent border-0 cursor-pointer transition-opacity duration-200 ${
        active ? 'opacity-100' : 'opacity-40 hover:opacity-80'
      } ${className}`}
    >
      <svg
        width={size}
        height={size}
        viewBox="0 0 12 12"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        <polygon
          points="6,0.8 11.2,3.8 11.2,9.8 6,12.8 0.8,9.8 0.8,3.8"
          stroke={strokeColor}
          strokeWidth="1.1"
          fill={fillColor}
        />
      </svg>
    </button>
  );
};

export default HexNavIndicator;
