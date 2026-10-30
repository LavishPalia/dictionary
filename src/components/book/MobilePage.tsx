'use client';

import React, { useEffect, useRef, useState } from 'react';
import { BookPage } from '@/lib/types';
import { GuideWords } from './GuideWords';
import { PageColumn } from './PageColumn';
import { PronunciationFooter } from './PronunciationFooter';
import { InkLines } from './InkLines';
import { LetterRail } from './LetterRail';

interface MobilePageProps {
  page: BookPage | null;
  highlightedWord?: string;
  isBookmarked?: boolean;
  onToggleBookmark?: () => void;
  onSelectWord?: (headword: string) => void;
  onPrevPage: () => void;
  onNextPage: () => void;
  canPrev?: boolean;
  canNext?: boolean;
  /** Slide pages off and on after a swipe (off for reduced motion and Instant speed; the drag still follows). */
  animate?: boolean;
  /** A page being fetched (slow connection): faint ink lines show over this one until it arrives. */
  loadingPage?: number | null;
  /** Tapping the page number opens the Go to panel. */
  onOpenGoTo?: () => void;
  /** The A–Z rail at the page's right edge: each letter's first page, and the jump it makes. */
  thumbIndex?: Record<string, number>;
  onSelectLetter?: (letter: string, page: number) => void;
}

// A swipe turns the page past a quarter of the page's width, or as a quick flick.
const TURN_SHARE = 0.25;
const FLICK_SPEED = 0.5; // px per ms
const SLIDE_MS = 180;
// Past the first or last page the page moves a quarter as far as the finger.
const RESISTANCE = 0.25;

export const MobilePage: React.FC<MobilePageProps> = ({
  page,
  highlightedWord,
  isBookmarked = false,
  onToggleBookmark,
  onSelectWord,
  onPrevPage,
  onNextPage,
  canPrev = true,
  canNext = true,
  animate = true,
  loadingPage = null,
  onOpenGoTo,
  thumbIndex,
  onSelectLetter,
}) => {
  // The page follows the finger sideways; vertical moves are left to the browser (touch-action: pan-y).
  const cardRef = useRef<HTMLDivElement>(null);
  const touchRef = useRef<{ x: number; y: number; t: number; axis: 'x' | 'y' | null } | null>(null);
  const [offset, setOffset] = useState(0);
  const [sliding, setSliding] = useState(false);
  // After a turn, the page that arrives slides in from this side (+1 right, -1 left).
  const enterFromRef = useRef(0);
  const turnTimerRef = useRef<number | null>(null);

  const width = () => cardRef.current?.offsetWidth ?? 390;
  const slideTo = (x: number, then?: () => void) => {
    setSliding(true);
    setOffset(x);
    window.setTimeout(() => { setSliding(false); then?.(); }, SLIDE_MS);
  };

  const handleTouchStart = (e: React.TouchEvent) => {
    if (e.touches.length !== 1) return;
    // A new touch while the last turn's page is still arriving: the reader is moving on, so skip its slide-in
    // rather than ignore the touch.
    if (enterFromRef.current) {
      enterFromRef.current = 0;
      if (turnTimerRef.current) window.clearTimeout(turnTimerRef.current);
      setSliding(false);
      setOffset(0);
    }
    touchRef.current = { x: e.touches[0].clientX, y: e.touches[0].clientY, t: performance.now(), axis: null };
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    const start = touchRef.current;
    if (!start) return;
    const dx = e.touches[0].clientX - start.x;
    const dy = e.touches[0].clientY - start.y;
    if (!start.axis) {
      if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return;
      start.axis = Math.abs(dx) > Math.abs(dy) ? 'x' : 'y';
    }
    if (start.axis !== 'x') return;
    const blocked = (dx < 0 && !canNext) || (dx > 0 && !canPrev);
    setOffset(blocked ? dx * RESISTANCE : dx);
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    const start = touchRef.current;
    touchRef.current = null;
    if (!start || start.axis !== 'x') return;
    const dx = e.changedTouches[0].clientX - start.x;
    const speed = Math.abs(dx) / Math.max(1, performance.now() - start.t);
    const turning = Math.abs(dx) > width() * TURN_SHARE || (speed > FLICK_SPEED && Math.abs(dx) > 24);
    const next = dx < 0;
    if (!turning || (next ? !canNext : !canPrev)) {
      slideTo(0);
      return;
    }
    const turn = () => {
      // The new page enters from the side the reader is moving towards.
      enterFromRef.current = next ? 1 : -1;
      if (next) onNextPage(); else onPrevPage();
      // If the page does not change (still loading, or refused), bring this one back.
      turnTimerRef.current = window.setTimeout(() => { enterFromRef.current = 0; slideTo(0); }, 1500);
    };
    if (animate) slideTo((next ? -1 : 1) * width(), turn);
    else { setOffset(0); turn(); }
  };

  // A new page after a swipe: start it off-screen on the far side, then slide it in.
  const pageNumber = page?.page_number;
  useEffect(() => {
    const from = enterFromRef.current;
    if (!from) return;
    enterFromRef.current = 0;
    if (turnTimerRef.current) window.clearTimeout(turnTimerRef.current);
    if (!animate) { setOffset(0); return; }
    setSliding(false);
    setOffset(from * width());
    const frame = requestAnimationFrame(() => requestAnimationFrame(() => slideTo(0)));
    return () => cancelAnimationFrame(frame);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pageNumber]);

  useEffect(() => () => { if (turnTimerRef.current) window.clearTimeout(turnTimerRef.current); }, []);

  if (!page) {
    return (
      <div
        style={{
          width: '100%',
          maxWidth: '390px',
          minHeight: '620px',
          background: 'var(--parch-2)',
          padding: '24px',
          display: 'flex',
          alignItems: 'center',
          flexDirection: 'column',
          justifyContent: 'center',
          gap: '16px',
          fontStyle: 'italic',
        }}
      >
        Page not available
        {/* A way out that isn't search: offline, a letter's first page may never have been opened here. */}
        <button type="button" id="page-number-btn" className="page-number-btn page-number-btn--missing"
          aria-haspopup="dialog" onClick={onOpenGoTo}>
          Go to another page
        </button>
      </div>
    );
  }

  // Combine both columns for mobile flow
  const allEntries = [...page.column1, ...page.column2];
  // The page's right edge is one column, 2px in and 24px wide: the ribbon hangs at its top and the A–Z rail runs
  // below it (from just under the ribbon's tip, so the rail moves down when the ribbon lengthens). The guide words
  // and entries keep 32px clear of it on the right, so the ribbon never covers the right guide word.
  const ribbonHeight = isBookmarked ? 90 : 60;

  return (
    <div
      ref={cardRef}
      id="mobile-page"
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      onTouchCancel={() => { touchRef.current = null; slideTo(0); }}
      style={{
        width: '100%',
        maxWidth: '390px',
        touchAction: 'pan-y',
        transform: offset ? `translateX(${offset}px)` : undefined,
        transition: sliding ? `transform ${SLIDE_MS}ms ease-out` : 'none',
        background: 'var(--parch-2)',
        display: 'flex',
        flexDirection: 'column',
        position: 'relative',
        boxShadow: '0 20px 40px rgba(0,0,0,0.5), inset 0 0 60px color-mix(in srgb, var(--page-shade) 30%, transparent)',
        borderRadius: '4px',
        overflow: 'hidden',
        // Read by .letter-rail in goto.css.
        '--rail-top': `${ribbonHeight + 6}px`,
      } as React.CSSProperties}
    >
      {/* Hanging silk bookmark ribbon */}
      <button
        type="button"
        id="mobile-ribbon"
        className="book-control"
        onClick={onToggleBookmark}
        aria-pressed={isBookmarked}
        aria-label={isBookmarked ? 'Ribbon: this page is marked. Remove the ribbon' : 'Mark this page with the ribbon'}
        title={isBookmarked ? 'Page bookmarked! Click to remove' : 'Click to bookmark this page'}
        style={{
          border: 0, margin: 0,
          position: 'absolute',
          right: '2px',
          top: 0,
          width: '24px',
          height: `${ribbonHeight}px`,
          background: 'linear-gradient(to right, var(--ribbon-dark) 0%, var(--ribbon-light) 45%, var(--ribbon-deep) 100%)',
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
          <span aria-hidden="true" style={{ color: 'var(--ribbon-star)', fontSize: '13px', lineHeight: 1 }}>★</span>
        )}
      </button>

      {/* Page content */}
      <div style={{ flex: 1, padding: '18px 32px 12px 24px' }}>
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
      {thumbIndex && onSelectLetter && <LetterRail thumbIndex={thumbIndex} currentPage={page.page_number} onSelectLetter={onSelectLetter} />}

      {/* Bottom navigation bar */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '8px 16px',
          height: '56px',
          borderTop: '1px solid var(--sepia)',
          background: 'var(--page-foot)',
        }}
      >
        <button
          onClick={onPrevPage}
          disabled={!canPrev}
          style={{
            height: '40px',
            minWidth: '40px',
            border: '1px solid var(--sepia)',
            background: 'transparent',
            borderRadius: '4px',
            font: '20px var(--font-fell)',
            color: 'var(--ink)',
            cursor: canPrev ? 'pointer' : 'not-allowed',
            opacity: canPrev ? 1 : 0.4,
          }}
          aria-label="Previous page"
        >
          ←
        </button>

        <button type="button" id="page-number-btn" className="page-number-btn page-number-btn--phone"
          aria-label={`Page ${page.page_number.toLocaleString('en-IN')}. Go to another page`} aria-haspopup="dialog"
          onClick={onOpenGoTo}>
          {/* Shows "p. 16 ▾": the "p." and "▾" come from CSS, so the label ("Page 16. …") contains all the text (axe). */}
          {page.page_number.toLocaleString('en-IN')}
        </button>

        <button
          onClick={onNextPage}
          disabled={!canNext}
          style={{
            height: '40px',
            minWidth: '40px',
            border: '1px solid var(--sepia)',
            background: 'transparent',
            borderRadius: '4px',
            font: '20px var(--font-fell)',
            color: 'var(--ink)',
            cursor: canNext ? 'pointer' : 'not-allowed',
            opacity: canNext ? 1 : 0.4,
          }}
          aria-label="Next page"
        >
          →
        </button>
      </div>
      {loadingPage !== null && <InkLines page={loadingPage} />}
    </div>
  );
};
