'use client';

import React, { useRef } from 'react';

interface ThumbIndexProps {
  activeLetter: string;
  thumbMap: Record<string, number>;
  onSelectLetter: (letter: string, pageNum: number) => void;
}

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');

export const ThumbIndex: React.FC<ThumbIndexProps> = ({
  activeLetter,
  thumbMap,
  onSelectLetter,
}) => {
  // One tab stop for the whole index (the current letter); ↑ ↓ (and Home / End) move between letters, Enter jumps.
  const refs = useRef<Array<HTMLButtonElement | null>>([]);
  const current = Math.max(0, ALPHABET.findIndex((l) => l === activeLetter.toUpperCase()));
  const onKeyDown = (event: React.KeyboardEvent, index: number) => {
    const next = event.key === 'ArrowDown' ? index + 1 : event.key === 'ArrowUp' ? index - 1
      : event.key === 'Home' ? 0 : event.key === 'End' ? ALPHABET.length - 1 : null;
    if (next === null) return;
    event.preventDefault();
    refs.current[(next + ALPHABET.length) % ALPHABET.length]?.focus();
  };
  return (
    <nav
      aria-label="Letters"
      style={{
        position: 'absolute',
        right: '-54px',
        top: '40px',
        width: '56px',
        display: 'flex',
        flexDirection: 'column',
        zIndex: 20,
        userSelect: 'none',
      }}
    >
      {ALPHABET.map((letter) => {
        const isActive = letter.toUpperCase() === activeLetter.toUpperCase();
        const targetPage = thumbMap[letter] || 1;

        return (
          <button
            key={letter}
            ref={(el) => { refs.current[ALPHABET.indexOf(letter)] = el; }}
            type="button"
            className="thumb-tab"
            tabIndex={ALPHABET.indexOf(letter) === current ? 0 : -1}
            aria-current={isActive ? 'true' : undefined}
            aria-label={`Letter ${letter}, page ${targetPage}`}
            onKeyDown={(e) => onKeyDown(e, ALPHABET.indexOf(letter))}
            onClick={() => onSelectLetter(letter, targetPage)}
            title={`Jump to letter ${letter} (Page ${targetPage})`}
            style={{
              all: 'unset',
              display: 'block',
              height: '22px',
              lineHeight: '22px',
              padding: '0 10px 0 8px',
              background: isActive ? 'var(--color-tab-active-bg)' : 'var(--color-tab-bg)',
              color: isActive ? 'var(--color-tab-active-text)' : 'var(--ink)',
              font: `${isActive ? '700' : '400'} 13px var(--font-fell-sc)`,
              borderRadius: '0 6px 6px 0',
              borderBottom: '1px solid var(--color-tab-border)',
              marginLeft: isActive ? '-8px' : '0px',
              cursor: 'pointer',
              textAlign: 'left',
              boxShadow: isActive
                ? '-2px 2px 6px rgba(0,0,0,0.35)'
                : '1px 1px 3px rgba(0,0,0,0.15)',
              transition: 'all 0.15s ease',
            }}
            onMouseEnter={(e) => {
              if (!isActive) {
                e.currentTarget.style.background = 'var(--color-tab-hover)';
                e.currentTarget.style.marginLeft = '-4px';
              }
            }}
            onMouseLeave={(e) => {
              if (!isActive) {
                e.currentTarget.style.background = 'var(--color-tab-bg)';
                e.currentTarget.style.marginLeft = '0px';
              }
            }}
          >
            {letter}
          </button>
        );
      })}
    </nav>
  );
};
