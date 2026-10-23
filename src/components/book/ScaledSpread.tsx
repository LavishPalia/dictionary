'use client';

import React, { useLayoutEffect, useRef, useState } from 'react';

// The spread is laid out at a fixed 1120 × 640 (its pages, 3D leaves and drag maths depend on it). The page-turn
// arrows reach 52px past its left edge and the letter tabs 106px past its right; the cover shows 14px above and below.
const SPREAD_W = 1120;
const SPREAD_H = 640;
const REACH_LEFT = 52;
const REACH_RIGHT = 106;
const REACH_Y = 14;
const FOOTPRINT_W = REACH_LEFT + SPREAD_W + REACH_RIGHT;
const GUTTER = 16;
// Below this the type would be too small to read; the page scrolls instead.
const MIN_SCALE = 0.6;

/** Fit a scale to the window: the whole footprint across, and the spread below where it starts. */
export function spreadScale(width: number, height: number, top: number): number {
  const across = (width - 2 * GUTTER) / FOOTPRINT_W;
  const down = (height - top - REACH_Y - GUTTER) / SPREAD_H;
  return Math.max(MIN_SCALE, Math.min(1, across, down));
}

/**
 * Shrinks the desktop spread to fit smaller windows (1024–1180px wide clipped it, short laptop screens cut off the
 * bottom) without reflowing it. The box reserves the scaled size, so nothing overflows sideways, and the spread is
 * placed so that its whole footprint — arrows and letter tabs included — is centred.
 */
export function ScaledSpread({ children }: { children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);

  useLayoutEffect(() => {
    const fit = () => {
      const box = ref.current;
      if (!box) return;
      const top = box.getBoundingClientRect().top + window.scrollY;
      setScale(spreadScale(window.innerWidth, window.innerHeight, top));
    };
    fit();
    window.addEventListener('resize', fit);
    return () => window.removeEventListener('resize', fit);
  }, []);

  return (
    <div
      ref={ref}
      id="book-scale"
      data-scale={scale.toFixed(3)}
      style={{ position: 'relative', width: FOOTPRINT_W * scale, height: SPREAD_H * scale, flexShrink: 0 }}
    >
      <div
        style={{
          position: 'absolute', top: 0, left: REACH_LEFT * scale, width: SPREAD_W, height: SPREAD_H,
          transform: `scale(${scale})`, transformOrigin: 'top left',
        }}
      >
        {children}
      </div>
    </div>
  );
}
