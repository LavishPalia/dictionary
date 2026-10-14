'use client';

import React from 'react';

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
  return (
    <div
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
            onClick={() => onSelectLetter(letter, targetPage)}
            title={`Jump to letter ${letter} (Page ${targetPage})`}
            style={{
              all: 'unset',
              display: 'block',
              height: '22px',
              lineHeight: '22px',
              padding: '0 10px 0 8px',
              background: isActive ? '#7a2b22' : '#a8885a',
              color: isActive ? '#f1e4c4' : '#2a1e14',
              font: `${isActive ? '700' : '400'} 13px 'IM Fell English SC', serif`,
              borderRadius: '0 6px 6px 0',
              borderBottom: '1px solid #6e5532',
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
                e.currentTarget.style.background = '#ba9866';
                e.currentTarget.style.marginLeft = '-4px';
              }
            }}
            onMouseLeave={(e) => {
              if (!isActive) {
                e.currentTarget.style.background = '#a8885a';
                e.currentTarget.style.marginLeft = '0px';
              }
            }}
          >
            {letter}
          </button>
        );
      })}
    </div>
  );
};
