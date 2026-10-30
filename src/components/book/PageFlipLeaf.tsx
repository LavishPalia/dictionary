'use client';

/**
 * PageFlipLeaf — A single animated page-turning leaf using CSS 3D perspective.
 *
 * Geometry:
 *   Forward flip (right page → left):
 *     Leaf sits at left=560px, pivots at its LEFT edge (the spine).
 *     rotateY: 0° → -180°.
 *     Front shows outgoing right page; back shows incoming left page.
 *
 *   Backward flip (left page → right):
 *     Leaf sits at left=0px, pivots at its RIGHT edge (the spine).
 *     rotateY: 0° → +180°.
 *     Front shows outgoing left page; back shows incoming right page.
 *
 * Parent container must set: perspective + transform-style: preserve-3d.
 */

import React, { useEffect, useRef, useState, CSSProperties } from 'react';
import { BookPage } from '@/lib/types';
import { GuideWords } from './GuideWords';
import { PageColumn } from './PageColumn';
import { PronunciationFooter } from './PronunciationFooter';

const PAGE_W = 560;
const PAGE_H = 640;

// ─────────────────────────────────────────────────────────────────────────────
//  Shared page face — renders real HTML dictionary content
// ─────────────────────────────────────────────────────────────────────────────
interface PageFaceProps {
  page: BookPage | null;
  isLeftPage: boolean;
  highlightedWord?: string;
  style?: CSSProperties;
}

export const PageFace: React.FC<PageFaceProps> = ({
  page,
  isLeftPage,
  highlightedWord,
  style,
}) => {
  const bg = isLeftPage
    ? 'linear-gradient(to right, var(--parch) 0%, var(--parch-2) 85%, var(--page-gutter) 100%)'
    : 'linear-gradient(to left, var(--parch) 0%, var(--parch-2) 85%, var(--page-gutter) 100%)';

  return (
    <div
      className="page-inset"
      style={{
        position: 'absolute',
        inset: 0,
        boxSizing: 'border-box',
        padding: '26px 38px',
        background: bg,
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        ...style,
      }}
    >
      {page ? (
        <>
          <GuideWords
            guideLeft={page.guide_left}
            pageNumber={page.page_number}
            guideRight={page.guide_right}
          />
          <div style={{ display: 'flex', gap: '28px', flex: 1, minHeight: 0 }}>
            <PageColumn
              entries={page.column1}
              highlightedWord={highlightedWord}
            />
            <div
              style={{
                width: '1px',
                background: 'var(--rule)',
                alignSelf: 'stretch',
                flexShrink: 0,
              }}
            />
            <PageColumn
              entries={page.column2}
              highlightedWord={highlightedWord}
            />
          </div>
          <PronunciationFooter hints={page.footer_hints} />
        </>
      ) : (
        <div
          style={{
            flex: 1,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontStyle: 'italic',
            color: 'var(--page-muted)',
            fontSize: '15px',
          }}
        >
          {isLeftPage ? '[Endpapers]' : '[End of Book]'}
        </div>
      )}
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
//  Ghost paper sheet for mid-riffle frames (no real text needed)
// ─────────────────────────────────────────────────────────────────────────────
const GhostPage: React.FC<{ isLeftPage: boolean }> = ({ isLeftPage }) => {
  const bg = isLeftPage
    ? 'linear-gradient(to right, var(--parch) 0%, var(--parch-2) 85%, var(--page-gutter) 100%)'
    : 'linear-gradient(to left, var(--parch) 0%, var(--parch-2) 85%, var(--page-gutter) 100%)';
  return (
    <div
      className="page-inset--back"
      style={{
        position: 'absolute',
        inset: 0,
        background: bg,
        display: 'flex',
        flexDirection: 'column',
        gap: 7,
        padding: '30px 40px',
        boxSizing: 'border-box',
        overflow: 'hidden',
      }}
    >
      {Array.from({ length: 24 }, (_, i) => (
        <div
          key={i}
          style={{
            height: 7,
            borderRadius: 2,
            background: `rgba(100,70,30,${0.06 + (i % 4) * 0.03})`,
            width: `${55 + ((i * 17) % 40)}%`,
          }}
        />
      ))}
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
//  Easing: slow lift → smooth glide → soft landing
// ─────────────────────────────────────────────────────────────────────────────
function easeInOutCubic(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

// ─────────────────────────────────────────────────────────────────────────────
//  PageFlipLeaf — the animated page leaf
// ─────────────────────────────────────────────────────────────────────────────
export interface PageFlipLeafProps {
  /** The page turning away — shown on the front face as the leaf lifts */
  outgoingPage: BookPage | null;
  /** The page revealed after the flip — shown on the back face */
  incomingPage: BookPage | null;
  /** Render ghost (simplified) page instead of real content — for mid-riffle leaves */
  showGhost?: boolean;
  direction: 'forward' | 'backward';
  /** Duration of this individual leaf animation in ms */
  duration: number;
  /** Stagger delay before animation starts in ms */
  startDelay?: number;
  highlightedWord?: string;
  /** z-index additive offset — successive riffle leaves sit above each other */
  zIndexOffset?: number;
  /** Called when leaf animation finishes */
  onComplete?: () => void;
  /** Called when the leaf passes ~50% (the spine crossing) — fire sounds here */
  onMidpoint?: () => void;
}

export const PageFlipLeaf: React.FC<PageFlipLeafProps> = ({
  outgoingPage,
  incomingPage,
  showGhost = false,
  direction,
  duration,
  startDelay = 0,
  highlightedWord,
  zIndexOffset = 0,
  onComplete,
  onMidpoint,
}) => {
  const [rotation, setRotation] = useState(0);
  const [shadowOpacity, setShadowOpacity] = useState(0);
  const rafRef = useRef<number | null>(null);
  const startTimeRef = useRef<number | null>(null);
  const midpointFiredRef = useRef(false);
  const completedRef = useRef(false);

  const isForward = direction === 'forward';
  const targetAngle = isForward ? -180 : 180;

  useEffect(() => {
    let delayTimer: ReturnType<typeof setTimeout>;

    const runAnimation = () => {
      const tick = (now: number) => {
        if (!startTimeRef.current) startTimeRef.current = now;
        const elapsed = now - startTimeRef.current;
        const raw = Math.min(1, elapsed / duration);
        const p = easeInOutCubic(raw);

        setRotation(p * targetAngle);
        setShadowOpacity(Math.sin(p * Math.PI) * 0.5);

        // Sound / midpoint callback
        if (raw >= 0.44 && !midpointFiredRef.current) {
          midpointFiredRef.current = true;
          onMidpoint?.();
        }

        if (raw < 1) {
          rafRef.current = requestAnimationFrame(tick);
        } else {
          setRotation(targetAngle);
          setShadowOpacity(0);
          if (!completedRef.current) {
            completedRef.current = true;
            onComplete?.();
          }
        }
      };
      rafRef.current = requestAnimationFrame(tick);
    };

    if (startDelay > 0) {
      delayTimer = setTimeout(runAnimation, startDelay);
    } else {
      runAnimation();
    }

    return () => {
      clearTimeout(delayTimer);
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Run once on mount only

  // Forward flip: leaf is the RIGHT page — sits at left=560, pivots at left edge (spine)
  // Backward flip: leaf is the LEFT page — sits at left=0, pivots at right edge (spine)
  const leafLeft = isForward ? PAGE_W : 0;
  const transformOrigin = isForward ? 'left center' : 'right center';

  // Front face content direction
  const frontIsLeft = !isForward; // forward→front is right page; backward→front is left page
  const backIsLeft = isForward;   // forward→back becomes left page; backward→back becomes right page

  // Spine-side inner shadow grows when page is mid-air
  const spineShadow = isForward
    ? `inset 8px 0 28px rgba(40,20,5,${shadowOpacity * 0.7})`
    : `inset -8px 0 28px rgba(40,20,5,${shadowOpacity * 0.7})`;

  return (
    <div
      style={{
        position: 'absolute',
        top: 0,
        left: leafLeft,
        width: PAGE_W,
        height: PAGE_H,
        transformOrigin,
        transform: `rotateY(${rotation}deg)`,
        transformStyle: 'preserve-3d',
        zIndex: 20 + zIndexOffset,
        willChange: 'transform',
        pointerEvents: 'none',
      }}
    >
      {/* ── FRONT FACE: page being turned away ──────────────────────── */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          backfaceVisibility: 'hidden',
          WebkitBackfaceVisibility: 'hidden',
          boxShadow: spineShadow,
        }}
      >
        {showGhost
          ? <GhostPage isLeftPage={frontIsLeft} />
          : <PageFace page={outgoingPage} isLeftPage={frontIsLeft} highlightedWord={highlightedWord} />
        }
        {/* Atmospheric darkening overlay as page tilts through space */}
        <div
          style={{
            position: 'absolute',
            inset: 0,
            background: `rgba(15,8,0,${shadowOpacity * 0.18})`,
            pointerEvents: 'none',
          }}
        />
      </div>

      {/* ── BACK FACE: page revealed after full flip ─────────────────── */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          transform: 'rotateY(180deg)',
          backfaceVisibility: 'hidden',
          WebkitBackfaceVisibility: 'hidden',
          boxShadow: spineShadow,
        }}
      >
        {showGhost
          ? <GhostPage isLeftPage={backIsLeft} />
          : <PageFace page={incomingPage} isLeftPage={backIsLeft} highlightedWord={highlightedWord} />
        }
        <div
          style={{
            position: 'absolute',
            inset: 0,
            background: `rgba(15,8,0,${shadowOpacity * 0.18})`,
            pointerEvents: 'none',
          }}
        />
      </div>
    </div>
  );
};
