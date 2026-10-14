'use client';

/**
 * BookSpread — The main book view.
 *
 * Animation strategy:
 *   – At rest: DOM-rendered pages (sharp text, accessible, selectable).
 *   – During flip: a CSS 3D perspective container replaces the DOM view.
 *     PageFlipLeaf components animate the turning leaf using rotateY with
 *     backface-visibility so front/back faces switch at the spine.
 *   – During riffle: 5 cascaded PageFlipLeaf components with staggered delays.
 *
 * No Three.js / WebGL. Pure CSS 3D. Always renders.
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { BookPage } from '@/lib/types';
import { GuideWords } from './GuideWords';
import { PageColumn } from './PageColumn';
import { PronunciationFooter } from './PronunciationFooter';
import { ThumbIndex } from './ThumbIndex';
import { PageFace, PageFlipLeaf } from './PageFlipLeaf';
import { SilkRibbon } from './SilkRibbon';
import { soundEngine } from '@/lib/audio';

// ─────────────────────────────────────────────────────────────────────────────
//  Types
// ─────────────────────────────────────────────────────────────────────────────
interface BookSpreadProps {
  leftPage: BookPage | null;
  rightPage: BookPage | null;
  targetLeftPage?: BookPage | null;
  targetRightPage?: BookPage | null;
  highlightedWord?: string;
  activeLetter: string;
  thumbMap: Record<string, number>;
  isFlipping?: boolean;
  flipDirection?: 'forward' | 'backward';
  isRiffle?: boolean;
  jumpDistance?: number;
  flipDuration?: number;
  canPrev?: boolean;
  canNext?: boolean;
  isBookmarked?: boolean;
  onToggleBookmark?: () => void;
  onFlipComplete?: () => void;
  onInteractiveDragEnd?: (completed: boolean) => void;
  onSelectWord?: (headword: string) => void;
  onSelectLetter: (letter: string, pageNum: number) => void;
  onPrevPage: () => void;
  onNextPage: () => void;
}

// ─────────────────────────────────────────────────────────────────────────────
//  BookSpread
// ─────────────────────────────────────────────────────────────────────────────
export const BookSpread: React.FC<BookSpreadProps> = ({
  leftPage,
  rightPage,
  targetLeftPage = null,
  targetRightPage = null,
  highlightedWord,
  activeLetter,
  thumbMap,
  isFlipping = false,
  flipDirection = 'forward',
  isRiffle = false,
  jumpDistance = 1,
  flipDuration = 1000,
  canPrev = true,
  canNext = true,
  isBookmarked = false,
  onToggleBookmark,
  onFlipComplete = () => {},
  onSelectWord,
  onSelectLetter,
  onPrevPage,
  onNextPage,
}) => {
  // ── Riffle cascade leaf counter ──────────────────────────────────────────
  const NUM_RIFFLE_LEAVES = 5;
  const riffleCompletedRef = useRef(0);

  // Reset riffle counter each time a new flip begins
  useEffect(() => {
    if (isFlipping) {
      riffleCompletedRef.current = 0;
      // Play the riffle sweep sound immediately on big jumps
      if (isRiffle) {
        soundEngine.playRiffle(jumpDistance);
      }
    }
  }, [isFlipping, isRiffle, jumpDistance]);

  // ── Determine base-layer page state ─────────────────────────────────────
  // When flipping forward: right base immediately shows targetRight (revealed under turning leaf).
  // When flipping backward: left base immediately shows targetLeft.
  const baseLeft  = isFlipping && flipDirection === 'backward' ? targetLeftPage  : leftPage;
  const baseRight = isFlipping && flipDirection === 'forward'  ? targetRightPage : rightPage;

  // ── For single turn: decide which page the turning leaf carries ──────────
  // Forward: outgoing = rightPage, incoming = targetLeftPage
  // Backward: outgoing = leftPage, incoming = targetRightPage
  const singleOutgoing = flipDirection === 'forward' ? rightPage : leftPage;
  const singleIncoming = flipDirection === 'forward' ? targetLeftPage : targetRightPage;

  // ── Riffle leaf complete handler ─────────────────────────────────────────
  const handleRiffleLeafComplete = useCallback(() => {
    riffleCompletedRef.current += 1;
    if (riffleCompletedRef.current >= NUM_RIFFLE_LEAVES) {
      riffleCompletedRef.current = 0;
      onFlipComplete();
    }
  }, [onFlipComplete]);

  // ── Riffle stagger timing ────────────────────────────────────────────────
  const leafDuration = Math.max(450, Math.min(flipDuration * 0.75, 900));
  const stagger = 130; // ms between leaf liftoffs

  // ── Touch swipe navigation (tablets / touch laptops) ─────────────────────
  const touchStartXRef = useRef<number | null>(null);

  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartXRef.current = e.touches[0].clientX;
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (touchStartXRef.current === null || isFlipping) return;
    const deltaX = e.changedTouches[0].clientX - touchStartXRef.current;
    touchStartXRef.current = null;
    if (Math.abs(deltaX) > 48) {
      if (deltaX < 0 && canNext) {
        onNextPage();
      } else if (deltaX > 0 && canPrev) {
        onPrevPage();
      }
    }
  };

  return (
    <div
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
      style={{
        position: 'relative',
        width: '1120px',
        height: '640px',
        boxShadow: '0 30px 60px rgba(0,0,0,.6)',
        borderRadius: '3px',
        // CSS 3D perspective container — makes rotateY look truly 3D
        perspective: '2200px',
        perspectiveOrigin: '50% 42%',
      }}
    >
      {/* ================================================================
          BASE LAYER — the resting book spread (always visible underneath)
          ================================================================ */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          // During flip: visible underneath the turning leaf animation
          zIndex: 5,
        }}
      >
        {/* Vintage leather / cloth cover underlay */}
        <div
          style={{
            position: 'absolute',
            inset: '-14px -22px -14px -14px',
            background: '#5b1f19',
            borderRadius: '6px',
            boxShadow: 'inset 0 0 40px rgba(0,0,0,.5)',
            pointerEvents: 'none',
            zIndex: 1,
          }}
        />

        {/* LEFT BASE PAGE */}
        <div
          style={{
            position: 'absolute',
            top: 0, left: 0,
            width: '560px', height: '640px',
            zIndex: 2,
          }}
        >
          <PageFace page={baseLeft} isLeftPage={true} highlightedWord={highlightedWord} />
        </div>

        {/* RIGHT BASE PAGE */}
        <div
          style={{
            position: 'absolute',
            top: 0, right: 0,
            width: '560px', height: '640px',
            zIndex: 2,
          }}
        >
          <PageFace page={baseRight} isLeftPage={false} highlightedWord={highlightedWord} />
        </div>

        {/* Spine center-fold shadow */}
        <div
          style={{
            position: 'absolute',
            left: '545px', top: 0,
            width: '30px', height: '640px',
            background: 'linear-gradient(to right, transparent, rgba(60,35,10,.45) 50%, transparent)',
            pointerEvents: 'none',
            zIndex: 3,
          }}
        />
      </div>

      {/* ================================================================
          DOM OVERLAY — visible when at rest, for sharp selectable text
          ================================================================ */}
      {!isFlipping && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            zIndex: 15,
            pointerEvents: 'auto',
          }}
        >
          {/* LEFT PAGE (interactive, selectable text) */}
          <div
            style={{
              position: 'absolute',
              top: 0, left: 0,
              width: '560px', height: '640px',
              boxSizing: 'border-box',
              padding: '26px 38px',
              background: 'linear-gradient(to right, #efe3c0 0%, #ecdfba 85%, #d8c494 100%)',
              boxShadow: 'inset 0 0 70px rgba(120,80,30,.28)',
              display: 'flex',
              flexDirection: 'column',
            }}
          >
            {leftPage ? (
              <>
                <GuideWords
                  guideLeft={leftPage.guide_left}
                  pageNumber={leftPage.page_number}
                  guideRight={leftPage.guide_right}
                />
                <div style={{ display: 'flex', gap: '28px', flex: 1, minHeight: 0 }}>
                  <PageColumn entries={leftPage.column1} highlightedWord={highlightedWord} onSelectWord={onSelectWord} />
                  <div style={{ width: '1px', background: '#b9a57c', alignSelf: 'stretch' }} />
                  <PageColumn entries={leftPage.column2} highlightedWord={highlightedWord} onSelectWord={onSelectWord} />
                </div>
                <PronunciationFooter hints={leftPage.footer_hints} />
              </>
            ) : (
              <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', fontStyle: 'italic', color: '#8a7452' }}>
                [Endpapers]
              </div>
            )}
          </div>

          {/* RIGHT PAGE (interactive, selectable text) */}
          <div
            style={{
              position: 'absolute',
              top: 0, right: 0,
              width: '560px', height: '640px',
              boxSizing: 'border-box',
              padding: '26px 38px',
              background: 'linear-gradient(to left, #efe3c0 0%, #ecdfba 85%, #d8c494 100%)',
              boxShadow: 'inset 0 0 70px rgba(120,80,30,.28)',
              display: 'flex',
              flexDirection: 'column',
            }}
          >
            {rightPage ? (
              <>
                <GuideWords
                  guideLeft={rightPage.guide_left}
                  pageNumber={rightPage.page_number}
                  guideRight={rightPage.guide_right}
                />
                <div style={{ display: 'flex', gap: '28px', flex: 1, minHeight: 0 }}>
                  <PageColumn entries={rightPage.column1} highlightedWord={highlightedWord} onSelectWord={onSelectWord} />
                  <div style={{ width: '1px', background: '#b9a57c', alignSelf: 'stretch' }} />
                  <PageColumn entries={rightPage.column2} highlightedWord={highlightedWord} onSelectWord={onSelectWord} />
                </div>
                <PronunciationFooter hints={rightPage.footer_hints} />
              </>
            ) : (
              <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', fontStyle: 'italic', color: '#8a7452' }}>
                [End of Book]
              </div>
            )}
          </div>

          {/* Spine fold shadow */}
          <div
            style={{
              position: 'absolute',
              left: '545px', top: 0,
              width: '30px', height: '640px',
              background: 'linear-gradient(to right, transparent, rgba(60,35,10,.45) 50%, transparent)',
              pointerEvents: 'none',
            }}
          />

          {/* Bottom-right corner peel trigger */}
          {canNext && (
            <div
              onClick={onNextPage}
              title="Click page corner to turn forward"
              style={{
                position: 'absolute',
                right: 0,
                bottom: 0,
                width: '60px',
                height: '60px',
                cursor: 'pointer',
                zIndex: 22,
                background: 'linear-gradient(135deg, transparent 60%, rgba(120,80,30,0.18) 100%)',
                borderBottomRightRadius: '3px',
                transition: 'background 0.2s ease',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = 'linear-gradient(135deg, transparent 50%, rgba(120,80,30,0.32) 100%)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'linear-gradient(135deg, transparent 60%, rgba(120,80,30,0.18) 100%)';
              }}
            />
          )}

          {/* Bottom-left corner peel trigger */}
          {canPrev && (
            <div
              onClick={onPrevPage}
              title="Click page corner to turn back"
              style={{
                position: 'absolute',
                left: 0,
                bottom: 0,
                width: '60px',
                height: '60px',
                cursor: 'pointer',
                zIndex: 22,
                background: 'linear-gradient(225deg, transparent 60%, rgba(120,80,30,0.18) 100%)',
                borderBottomLeftRadius: '3px',
                transition: 'background 0.2s ease',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = 'linear-gradient(225deg, transparent 50%, rgba(120,80,30,0.32) 100%)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'linear-gradient(225deg, transparent 60%, rgba(120,80,30,0.18) 100%)';
              }}
            />
          )}
        </div>
      )}

      {/* Silk Ribbon Bookmark hanging from center spine */}
      <SilkRibbon
        isBookmarked={!!isBookmarked}
        onToggleBookmark={onToggleBookmark || (() => {})}
      />

      {/* ================================================================
          FLIP ANIMATION LAYER
          Mounted only while isFlipping=true.
          Pivots around the spine — right edge of left page / left edge of right page.
          ================================================================ */}
      {isFlipping && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            zIndex: 18,
            // inherit perspective from parent via preserve-3d
            transformStyle: 'preserve-3d',
            pointerEvents: 'none',
          }}
        >
          {isRiffle ? (
            /* ── CASCADING RIFFLE: 5 staggered ghost leaves ──────────── */
            <>
              {Array.from({ length: NUM_RIFFLE_LEAVES }, (_, k) => {
                const isFirst = k === 0;
                const isLast = k === NUM_RIFFLE_LEAVES - 1;
                return (
                  <PageFlipLeaf
                    key={k}
                    direction={flipDirection}
                    duration={leafDuration}
                    startDelay={k * stagger}
                    zIndexOffset={k}
                    // First and last carry real page content; middle ones are ghosts
                    showGhost={!isFirst && !isLast}
                    outgoingPage={
                      flipDirection === 'forward'
                        ? (isFirst ? rightPage : null)
                        : (isFirst ? leftPage : null)
                    }
                    incomingPage={
                      flipDirection === 'forward'
                        ? (isLast ? targetLeftPage : null)
                        : (isLast ? targetRightPage : null)
                    }
                    onMidpoint={() => {
                      if (isLast) soundEngine.playPageTurn();
                    }}
                    onComplete={handleRiffleLeafComplete}
                  />
                );
              })}
            </>
          ) : (
            /* ── SINGLE PAGE TURN ─────────────────────────────────────── */
            <PageFlipLeaf
              direction={flipDirection}
              duration={flipDuration}
              outgoingPage={singleOutgoing}
              incomingPage={singleIncoming}
              highlightedWord={highlightedWord}
              onMidpoint={() => soundEngine.playPageTurn()}
              onComplete={onFlipComplete}
            />
          )}
        </div>
      )}

      {/* ================================================================
          A-Z THUMB INDEX — persistent, stays mounted throughout page turns
          ================================================================ */}
      <ThumbIndex
        activeLetter={activeLetter}
        thumbMap={thumbMap}
        onSelectLetter={onSelectLetter}
      />

      {/* ================================================================
          NAVIGATION BUTTONS — symmetrically aligned & bounds aware
          ================================================================ */}
      <button
        onClick={onPrevPage}
        disabled={isFlipping || !canPrev}
        title={canPrev ? "Turn to previous spread (Left Arrow)" : "At beginning of book"}
        aria-label="Previous spread"
        style={{
          position: 'absolute',
          left: '-52px',
          top: '50%',
          transform: 'translateY(-50%)',
          width: '40px',
          height: '64px',
          background: canPrev && !isFlipping ? 'rgba(239, 227, 192, 0.92)' : 'rgba(239, 227, 192, 0.45)',
          border: '1px solid #8a7452',
          borderRadius: '5px 0 0 5px',
          color: '#2a1e14',
          fontSize: '24px',
          cursor: canPrev && !isFlipping ? 'pointer' : 'not-allowed',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          boxShadow: '-2px 2px 8px rgba(0,0,0,0.35)',
          transition: 'all 0.2s',
          zIndex: 28,
          opacity: canPrev && !isFlipping ? 1 : 0.35,
        }}
        onMouseEnter={(e) => {
          if (!isFlipping && canPrev) e.currentTarget.style.background = '#efe3c0';
        }}
        onMouseLeave={(e) => {
          if (!isFlipping && canPrev) e.currentTarget.style.background = 'rgba(239, 227, 192, 0.92)';
        }}
      >
        ‹
      </button>

      <button
        onClick={onNextPage}
        disabled={isFlipping || !canNext}
        title={canNext ? "Turn to next spread (Right Arrow)" : "At end of book"}
        aria-label="Next spread"
        style={{
          position: 'absolute',
          right: '-106px',
          top: '50%',
          transform: 'translateY(-50%)',
          width: '40px',
          height: '64px',
          background: canNext && !isFlipping ? 'rgba(239, 227, 192, 0.92)' : 'rgba(239, 227, 192, 0.45)',
          border: '1px solid #8a7452',
          borderRadius: '0 5px 5px 0',
          color: '#2a1e14',
          fontSize: '24px',
          cursor: canNext && !isFlipping ? 'pointer' : 'not-allowed',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          boxShadow: '2px 2px 8px rgba(0,0,0,0.35)',
          transition: 'all 0.2s',
          zIndex: 28,
          opacity: canNext && !isFlipping ? 1 : 0.35,
        }}
        onMouseEnter={(e) => {
          if (!isFlipping && canNext) e.currentTarget.style.background = '#efe3c0';
        }}
        onMouseLeave={(e) => {
          if (!isFlipping && canNext) e.currentTarget.style.background = 'rgba(239, 227, 192, 0.92)';
        }}
      >
        ›
      </button>
    </div>
  );
};

