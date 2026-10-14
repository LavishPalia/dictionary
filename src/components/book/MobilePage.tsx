'use client';

import React, { useRef } from 'react';
import { BookPage } from '@/lib/types';
import { GuideWords } from './GuideWords';
import { PageColumn } from './PageColumn';
import { PronunciationFooter } from './PronunciationFooter';

interface MobilePageProps {
  page: BookPage | null;
  highlightedWord?: string;
  isBookmarked?: boolean;
  onToggleBookmark?: () => void;
  onSelectWord?: (headword: string) => void;
  onPrevPage: () => void;
  onNextPage: () => void;
}

export const MobilePage: React.FC<MobilePageProps> = ({
  page,
  highlightedWord,
  isBookmarked = false,
  onToggleBookmark,
  onSelectWord,
  onPrevPage,
  onNextPage,
}) => {
  const touchStartXRef = useRef<number | null>(null);

  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartXRef.current = e.touches[0].clientX;
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (touchStartXRef.current === null) return;
    const deltaX = e.changedTouches[0].clientX - touchStartXRef.current;
    touchStartXRef.current = null;
    if (Math.abs(deltaX) > 40) {
      if (deltaX < 0) {
        onNextPage();
      } else {
        onPrevPage();
      }
    }
  };

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
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
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
        onClick={onToggleBookmark}
        title={isBookmarked ? 'Page bookmarked! Click to remove' : 'Click to bookmark this page'}
        style={{
          position: 'absolute',
          right: '28px',
          top: 0,
          width: '24px',
          height: isBookmarked ? '90px' : '60px',
          background: 'linear-gradient(to right, #6b1d16 0%, #8b2b22 45%, #591610 100%)',
          clipPath: 'polygon(0 0, 100% 0, 100% 100%, 50% 82%, 0 100%)',
          zIndex: 30,
          boxShadow: '0 3px 8px rgba(0,0,0,0.4)',
          cursor: 'pointer',
          transition: 'height 0.3s ease',
          display: 'flex',
          alignItems: 'flex-end',
          justifyContent: 'center',
          paddingBottom: '16px',
        }}
      >
        {isBookmarked && (
          <span style={{ color: '#e0bd68', fontSize: '13px', lineHeight: 1 }}>★</span>
        )}
      </div>

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
