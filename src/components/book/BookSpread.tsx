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

  return (
    <div
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
              background: 'linear-gradient(to right, #e6d5ae 0%, #ecdfba 12%, #efe3c0 100%)',
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
              background: 'linear-gradient(to left, #e6d5ae 0%, #ecdfba 12%, #efe3c0 100%)',
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

          {/* A-Z Thumb Index */}
          <ThumbIndex
            activeLetter={activeLetter}
            thumbMap={thumbMap}
            onSelectLetter={onSelectLetter}
          />
        </div>
      )}

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
                        : (isLast ? leftPage : null)
                    }
                    incomingPage={
                      flipDirection === 'forward'
                        ? (isLast ? targetLeftPage : null)
                        : (isFirst ? targetRightPage : null)
                    }
                    onMidpoint={() => soundEngine.playPageTurn()}
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
          NAVIGATION BUTTONS
          ================================================================ */}
      <button
        onClick={onPrevPage}
        disabled={isFlipping}
        title="Turn to previous spread (Left Arrow)"
        aria-label="Previous spread"
        style={{
          position: 'absolute',
          left: '-44px',
          top: '50%',
          transform: 'translateY(-50%)',
          width: '36px', height: '60px',
          background: 'rgba(239, 227, 192, 0.85)',
          border: '1px solid #8a7452',
          borderRadius: '4px 0 0 4px',
          color: '#2a1e14',
          fontSize: '22px',
          cursor: isFlipping ? 'not-allowed' : 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          boxShadow: '-2px 2px 8px rgba(0,0,0,0.3)',
          transition: 'all 0.2s',
          zIndex: 25,
          opacity: isFlipping ? 0.45 : 1,
        }}
        onMouseEnter={(e) => { if (!isFlipping) e.currentTarget.style.background = '#efe3c0'; }}
        onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(239, 227, 192, 0.85)'; }}
      >
        ‹
      </button>

      <button
        onClick={onNextPage}
        disabled={isFlipping}
        title="Turn to next spread (Right Arrow)"
        aria-label="Next spread"
        style={{
          position: 'absolute',
          right: '-74px',
          top: '90%',
          transform: 'translateY(-50%)',
          width: '36px', height: '40px',
          background: 'rgba(239, 227, 192, 0.85)',
          border: '1px solid #8a7452',
          borderRadius: '0 4px 4px 0',
          color: '#2a1e14',
          fontSize: '22px',
          cursor: isFlipping ? 'not-allowed' : 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          boxShadow: '2px 2px 8px rgba(0,0,0,0.3)',
          transition: 'all 0.2s',
          zIndex: 25,
          opacity: isFlipping ? 0.45 : 1,
        }}
        onMouseEnter={(e) => { if (!isFlipping) e.currentTarget.style.background = '#efe3c0'; }}
        onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(239, 227, 192, 0.85)'; }}
      >
        ›
      </button>
    </div>
  );
};

