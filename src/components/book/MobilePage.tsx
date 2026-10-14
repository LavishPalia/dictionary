'use client';

import React from 'react';
import { BookPage } from '@/lib/types';
import { GuideWords } from './GuideWords';
import { PageColumn } from './PageColumn';
import { PronunciationFooter } from './PronunciationFooter';

interface MobilePageProps {
  page: BookPage | null;
  highlightedWord?: string;
  onSelectWord?: (headword: string) => void;
  onPrevPage: () => void;
  onNextPage: () => void;
}

export const MobilePage: React.FC<MobilePageProps> = ({
  page,
  highlightedWord,
  onSelectWord,
  onPrevPage,
  onNextPage,
}) => {
  if (!page) {
    return (
      <div
        style={{
          width: '100%',
          maxWidth: '390px',
          minHeight: '620px',
          background: '#ecdfba',
          padding: '24px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontStyle: 'italic',
        }}
      >
        Page not available
      </div>
    );
  }

  // Combine both columns for mobile flow
  const allEntries = [...page.column1, ...page.column2];

  return (
    <div
      style={{
        width: '100%',
        maxWidth: '390px',
        background: '#ecdfba',
        display: 'flex',
        flexDirection: 'column',
        position: 'relative',
        boxShadow: '0 20px 40px rgba(0,0,0,0.5), inset 0 0 60px rgba(120,80,30,0.3)',
        borderRadius: '4px',
        overflow: 'hidden',
      }}
    >
      {/* Hanging silk bookmark ribbon */}
      <div
        style={{
          position: 'absolute',
          right: '28px',
          top: 0,
          width: '22px',
          height: '60px',
          background: '#7a2b22',
          clipPath: 'polygon(0 0, 100% 0, 100% 100%, 50% 82%, 0 100%)',
          zIndex: 30,
          boxShadow: '0 2px 5px rgba(0,0,0,0.3)',
        }}
      />

      {/* Page content */}
      <div style={{ flex: 1, padding: '18px 24px 12px' }}>
        <GuideWords
          guideLeft={page.guide_left}
          pageNumber={page.page_number}
          guideRight={page.guide_right}
        />

        <div style={{ minHeight: '440px' }}>
          <PageColumn
            entries={allEntries}
            highlightedWord={highlightedWord}
            onSelectWord={onSelectWord}
          />
        </div>

        <PronunciationFooter hints={page.footer_hints} />
      </div>

      {/* Bottom navigation bar */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '8px 16px',
          height: '56px',
          borderTop: '1px solid #8a7452',
          background: '#efe3c0',
        }}
      >
        <button
          onClick={onPrevPage}
          style={{
            height: '40px',
            minWidth: '40px',
            border: '1px solid #8a7452',
            background: 'transparent',
            borderRadius: '4px',
            font: '20px "IM Fell English", serif',
            color: '#2a1e14',
            cursor: 'pointer',
          }}
          aria-label="Previous page"
        >
          ←
        </button>

        <span className="guide-word" style={{ fontSize: '13px' }}>
          p. {page.page_number}
        </span>

        <button
          onClick={onNextPage}
          style={{
            height: '40px',
            minWidth: '40px',
            border: '1px solid #8a7452',
            background: 'transparent',
            borderRadius: '4px',
            font: '20px "IM Fell English", serif',
            color: '#2a1e14',
            cursor: 'pointer',
          }}
          aria-label="Next page"
        >
          →
        </button>
      </div>
    </div>
  );
};
