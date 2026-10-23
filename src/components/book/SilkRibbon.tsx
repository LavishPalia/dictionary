'use client';

import React from 'react';

interface SilkRibbonProps {
  isBookmarked: boolean;
  onToggleBookmark: () => void;
}

export const SilkRibbon: React.FC<SilkRibbonProps> = ({
  isBookmarked,
  onToggleBookmark,
}) => {
  return (
    <button
      type="button"
      id="silk-ribbon"
      className="book-control"
      onClick={onToggleBookmark}
      aria-pressed={isBookmarked}
      aria-label={isBookmarked ? 'Ribbon: these pages are marked. Remove the ribbon' : 'Mark these pages with the ribbon'}
      title={isBookmarked ? 'Page bookmarked! Click to remove bookmark ribbon' : 'Click to place silk bookmark ribbon on this spread'}
      style={{
        border: 0, padding: 0, margin: 0, display: 'block',
        position: 'absolute',
        top: '-12px',
        left: '549px',
        width: '24px',
        height: isBookmarked ? '360px' : '96px',
        background: 'linear-gradient(to right, #6b1d16 0%, #8b2b22 45%, #591610 100%)',
        clipPath: 'polygon(0 0, 100% 0, 100% 100%, 50% 88%, 0 100%)',
        boxShadow: '3px 4px 12px rgba(0,0,0,0.5)',
        cursor: 'pointer',
        zIndex: 30,
        transition: 'height 0.45s cubic-bezier(0.34, 1.56, 0.64, 1), transform 0.2s ease',
        transformOrigin: 'top center',
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.transform = 'scale(1.04) rotate(1deg)';
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.transform = 'scale(1) rotate(0deg)';
      }}
    >
      {/* Golden embroidered edge border line */}
      <div
        style={{
          position: 'absolute',
          top: 0,
          left: '2px',
          right: '2px',
          bottom: '16px',
          borderLeft: '1px solid rgba(201, 162, 74, 0.45)',
          borderRight: '1px solid rgba(201, 162, 74, 0.45)',
          pointerEvents: 'none',
        }}
      />

      {/* Gold star seal when bookmarked */}
      {isBookmarked && (
        <div
          style={{
            position: 'absolute',
            bottom: '42px',
            left: '50%',
            transform: 'translateX(-50%)',
            color: '#e0bd68',
            fontSize: '14px',
            textShadow: '0 1px 2px rgba(0,0,0,0.8)',
            userSelect: 'none',
          }}
        >
          ★
        </div>
      )}
    </button>
  );
};
