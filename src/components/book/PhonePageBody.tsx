'use client';

import React from 'react';
import { BookPage } from '@/lib/types';
import { LETTERS, letterForPage } from '@/lib/letters';
import { GuideWords } from './GuideWords';
import { PageColumn } from './PageColumn';
import { PronunciationFooter } from './PronunciationFooter';
import { InkLines } from './InkLines';
import { LetterRail } from './LetterRail';
import { BookLightLayer } from './lamp/BookLightLayer';
import { PushSwitch, PushSwitchArt } from './lamp/PushSwitch';
import type { Light } from '@/lib/lighting';
import type { LightVersion } from '@/lib/desk';

/** What a tap on a copy's control asks for (read from `data-turn-control` by the turn's stage). */
export type TurnControl = 'prev' | 'next' | 'goto' | 'switch';

interface PhonePageBodyProps {
  page: BookPage;
  /** The real page (true), or a still copy for a page turn: aria-hidden, nothing focusable, controls drawn as plain art. */
  live: boolean;
  highlightedWord?: string;
  isBookmarked?: boolean;
  /** The lamp's light under the ink, in this version (none on a turning leaf). */
  lampVersion?: LightVersion | null;
  /** The light now, for the foot row's brass switch. */
  light?: Light;
  thumbIndex?: Record<string, number>;
  canPrev?: boolean;
  canNext?: boolean;
  // The live page only:
  cardRef?: React.Ref<HTMLDivElement>;
  prevRef?: React.Ref<HTMLButtonElement>;
  nextRef?: React.Ref<HTMLButtonElement>;
  /** While a leaf turns over it, the live page takes no input. */
  inert?: boolean;
  /** The swipe's offset (Instant and reduced motion: the page follows the finger), and whether it is sliding back. */
  offset?: number;
  sliding?: boolean;
  slideMs?: number;
  onToggleBookmark?: () => void;
  onSelectWord?: (headword: string) => void;
  onPrev?: () => void;
  onNext?: () => void;
  onOpenGoTo?: () => void;
  onSelectLetter?: (letter: string, page: number) => void;
  onToggleLamp?: () => void;
  loadingPage?: number | null;
}

const arrowStyle = (enabled: boolean): React.CSSProperties => ({
  height: '40px',
  minWidth: '40px',
  border: '1px solid var(--sepia)',
  background: 'transparent',
  borderRadius: '4px',
  font: '20px var(--font-fell)',
  color: 'var(--ink)',
  cursor: enabled ? 'pointer' : 'not-allowed',
  opacity: enabled ? 1 : 0.4,
});
// A copy's arrow is a span: it takes the live button's box (44 × 44 on phones, shell.css) and centres its glyph.
const copyArrow = (enabled: boolean): React.CSSProperties => ({
  ...arrowStyle(enabled), cursor: 'default', boxSizing: 'border-box', display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
  minWidth: '44px', height: '44px',
});

/**
 * One phone page: the page MobilePage shows (live), or a still copy of a page for the turn's stage. The live page's DOM
 * is exactly what MobilePage rendered before the turn existed (the page-unchanged baseline checks it).
 */
export const PhonePageBody = React.memo(function PhonePageBody({
  page, live, highlightedWord, isBookmarked = false, lampVersion = null, light = 'day', thumbIndex, canPrev = true, canNext = true,
  cardRef, prevRef, nextRef, inert, offset = 0, sliding = false, slideMs = 0,
  onToggleBookmark, onSelectWord, onPrev, onNext, onOpenGoTo, onSelectLetter, onToggleLamp, loadingPage = null,
}: PhonePageBodyProps) {
  // Combine both columns for mobile flow
  const allEntries = [...page.column1, ...page.column2];
  // The page's right edge is one column, 2px in and 24px wide: the ribbon hangs at its top and the A–Z rail runs
  // below it (from just under the ribbon's tip, so the rail moves down when the ribbon lengthens). The guide words
  // and entries keep 32px clear of it on the right, so the ribbon never covers the right guide word.
  const ribbonHeight = isBookmarked ? 90 : 60;
  const ribbonStyle: React.CSSProperties = {
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
  };
  const star = isBookmarked && (
    <span aria-hidden="true" style={{ color: 'var(--ribbon-star)', fontSize: '13px', lineHeight: 1 }}>★</span>
  );
  const pageLabel = page.page_number.toLocaleString('en-IN');

  return (
    <div
      ref={live ? cardRef : undefined}
      id={live ? 'mobile-page' : undefined}
      className={`${lampVersion ? 'page-inset--phone book-lit' : 'page-inset--phone'}${live ? '' : ' phone-page-copy'}`}
      aria-hidden={live ? undefined : true}
      inert={live && inert ? true : undefined}
      style={{
        width: '100%',
        maxWidth: '390px',
        touchAction: live ? 'pan-y' : undefined,
        // While a leaf turns the stage's copies are the page the reader sees: the live page stays in layout but is not painted.
        visibility: live && inert ? 'hidden' : undefined,
        transform: live && offset ? `translateX(${offset}px)` : undefined,
        transition: live ? (sliding ? `transform ${slideMs}ms ease-out` : 'none') : undefined,
        background: 'var(--parch-2)',
        display: 'flex',
        flexDirection: 'column',
        position: 'relative',
        borderRadius: '4px',
        overflow: 'hidden',
        // Read by .letter-rail in goto.css.
        '--rail-top': `${ribbonHeight + 6}px`,
      } as React.CSSProperties}
    >
      {/* The lamp's light: under everything on the page (book-lamp.css), and it moves with the page in a swipe. */}
      {lampVersion && <BookLightLayer originX={0} version={lampVersion} />}
      {/* Hanging silk bookmark ribbon */}
      {live ? (
        <button
          type="button"
          id="mobile-ribbon"
          className="book-control"
          onClick={onToggleBookmark}
          aria-pressed={isBookmarked}
          aria-label={isBookmarked ? 'Ribbon: this page is marked. Remove the ribbon' : 'Mark this page with the ribbon'}
          title={isBookmarked ? 'Page bookmarked! Click to remove' : 'Click to bookmark this page'}
          style={ribbonStyle}
        >
          {star}
        </button>
      ) : (
        <span style={{ ...ribbonStyle, cursor: 'default' }}>{star}</span>
      )}

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
            onSelectWord={live ? onSelectWord : undefined}
          />
        </div>

        <PronunciationFooter hints={page.footer_hints} />
      </div>
      {thumbIndex && (live
        ? onSelectLetter && <LetterRail thumbIndex={thumbIndex} currentPage={page.page_number} onSelectLetter={onSelectLetter} />
        : <RailArt thumbIndex={thumbIndex} currentPage={page.page_number} />)}

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
        {live ? (
          <button
            ref={prevRef}
            onClick={() => onPrev?.()}
            disabled={!canPrev}
            style={arrowStyle(canPrev)}
            aria-label="Previous page"
          >
            ←
          </button>
        ) : <span data-turn-control="prev" style={copyArrow(canPrev)}>←</span>}

        {/* Matches the switch on the other side of the page number, so the number stays centred. */}
        <span className="book-switch-spacer" aria-hidden="true" />

        {live ? (
          <button type="button" id="page-number-btn" className="page-number-btn page-number-btn--phone"
            aria-label={`Page ${pageLabel}. Go to another page`} aria-haspopup="dialog"
            onClick={onOpenGoTo}>
            {/* Shows "p. 16 ▾": the "p." and "▾" come from CSS, so the label ("Page 16. …") contains all the text (axe). */}
            {pageLabel}
          </button>
        ) : <span className="page-number-btn page-number-btn--phone page-number-copy" data-turn-control="goto">{pageLabel}</span>}

        {live
          ? <PushSwitch light={light} onToggle={() => onToggleLamp?.()} />
          : <span className="book-switch-copy" data-turn-control="switch"><PushSwitchArt light={light} /></span>}

        {live ? (
          <button
            ref={nextRef}
            onClick={() => onNext?.()}
            disabled={!canNext}
            style={arrowStyle(canNext)}
            aria-label="Next page"
          >
            →
          </button>
        ) : <span data-turn-control="next" style={copyArrow(canNext)}>→</span>}
      </div>
      {live && loadingPage !== null && <InkLines page={loadingPage} />}
    </div>
  );
});

/** The A–Z rail as it looks, for a copy: the letters only, no drag and no id. */
function RailArt({ thumbIndex, currentPage }: { thumbIndex: Record<string, number>; currentPage: number }) {
  const current = letterForPage(currentPage, thumbIndex);
  return (
    <div className="letter-rail" aria-hidden="true">
      {LETTERS.map((l) => (
        <span key={l} className="letter-rail-letter" data-current={l === current ? 'true' : undefined}
          data-missing={thumbIndex[l] === undefined ? 'true' : undefined}>
          {l}
        </span>
      ))}
    </div>
  );
}
