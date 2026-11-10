'use client';

import React, { useLayoutEffect, useRef, useState } from 'react';
import { BookPage } from '@/lib/types';
import type { Light } from '@/lib/lighting';
import type { LightVersion } from '@/lib/desk';
import { InkLines } from './InkLines';
import { BookLightLayer } from './lamp/BookLightLayer';
import { PhonePageBody, type TurnControl } from './PhonePageBody';

// The light's pool lives in CSS variables on #mobile-page (bookLight.ts); light A's copy beneath reads them from the stage.
const POOL_VARS = ['--pool-x', '--pool-y', '--pool-rx', '--pool-ry'];

interface PhoneLeafTurnProps {
  /** 1: the current page turns over to the left. −1: the previous page swings in from the left. */
  dir: 1 | -1;
  /** The page lying beneath, and the turning leaf's page. null: plain paper with ink lines (not loaded yet). */
  under: BookPage | null;
  leaf: BookPage | null;
  /** The page beneath is bare paper (at either end of the book there is nothing to turn to). */
  blank?: boolean;
  /** The leaf's rotateY, in degrees: 0 lies flat on the page, −180 lies turned over to the left. */
  angle: number;
  /** The lamp's light, on the page beneath only; null when no lamp is mounted. */
  version: LightVersion | null;
  light: Light;
  highlightedWord?: string;
  thumbIndex?: Record<string, number>;
  isBookmarked: (page: number) => boolean;
  canTurn: (page: number, dir: 1 | -1) => boolean;
  /** The taller of the two faces, so the turning area can hold it. */
  onHeight?: (h: number) => void;
  /** A tap on the stage: the copy's control under it (an arrow, the page number, the switch), or null, and where it was. */
  onControl?: (c: TurnControl | null, x: number, y: number) => void;
}

/**
 * The phone's page turn: still copies over the live page (which is inert meanwhile). Beneath lies one page with the
 * lamp's light, painted once as the stage mounts; above it the leaf turns from the spine (its left edge), unlit, with a
 * shade that darkens it as it lifts and a shadow it casts on the page beneath. Only transform and opacity change per frame.
 */
export function PhoneLeafTurn({ dir, under, leaf, blank = false, angle, version, light, highlightedWord, thumbIndex, isBookmarked, canTurn,
  onHeight, onControl }: PhoneLeafTurnProps) {
  const underRef = useRef<HTMLDivElement>(null);
  const frontRef = useRef<HTMLDivElement>(null);
  // Light A's pool, copied from the live page once, as the stage mounts.
  const [pool, setPool] = useState<Record<string, string>>({});
  useLayoutEffect(() => {
    const live = document.getElementById('mobile-page');
    if (!live) return;
    setPool(Object.fromEntries(POOL_VARS.map((k) => [k, live.style.getPropertyValue(k)]).filter(([, v]) => v)));
  }, []);
  // The turning area holds the taller face (measured when a face's page changes, never per frame).
  const underKey = under?.page_number ?? (blank ? 'blank' : 'ink');
  const leafKey = leaf?.page_number ?? 'ink';
  useLayoutEffect(() => {
    const h = Math.max(underRef.current?.offsetHeight ?? 0, frontRef.current?.offsetHeight ?? 0);
    if (h) onHeight?.(h);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [underKey, leafKey]);

  const rad = (-angle * Math.PI) / 180;
  const lift = Math.max(0, Math.sin(rad)); // 0 flat, 1 standing up from the spine
  const over = angle > -90; // the leaf's front is toward the reader, over the page beneath
  const reach = Math.max(0, Math.cos(rad)); // how far across the page beneath the leaf's edge is

  const copy = (page: BookPage | null, lit: boolean, paper: 'ink' | 'blank') => page
    ? <PhonePageBody page={page} live={false} highlightedWord={highlightedWord} isBookmarked={isBookmarked(page.page_number)}
        lampVersion={lit ? version : null} light={light} thumbIndex={thumbIndex}
        canPrev={canTurn(page.page_number, -1)} canNext={canTurn(page.page_number, 1)} />
    : <Paper ink={paper === 'ink'} version={lit ? version : null} />;

  return (
    <div className="phone-turn-stage" data-dir={dir} aria-hidden="true" style={pool as React.CSSProperties}
      onClick={(e) => {
        const c = (e.target as Element).closest?.('[data-turn-control]')?.getAttribute('data-turn-control');
        onControl?.((c as TurnControl | undefined) ?? null, e.clientX, e.clientY);
      }}>
      {/* Plain paper has no height of its own: it fills the stage (as does a leaf of plain paper). */}
      <div ref={underRef} className="phone-turn-under" style={under ? undefined : { height: '100%' }}>{copy(under, true, blank ? 'blank' : 'ink')}</div>
      <div className="phone-turn-cast" style={{ transform: `scaleX(${over ? reach : 0})`, opacity: over ? lift : 0 }} />
      <div className="phone-turn-leaf" style={{ transform: `rotateY(${angle}deg)`, height: leaf ? undefined : '100%' }}>
        <div ref={frontRef} className="phone-turn-face phone-turn-front" style={leaf ? undefined : { height: '100%' }}>
          {copy(leaf, false, 'ink')}
          <div className="phone-turn-shade" style={{ opacity: lift * 0.85 }} />
        </div>
        <div className="phone-turn-face phone-turn-back">
          <div className="phone-turn-shade" style={{ opacity: lift * 0.6 }} />
        </div>
      </div>
    </div>
  );
}

/** Plain paper the size of the stage: ink lines while its page loads, or bare at either end of the book. */
function Paper({ ink, version }: { ink: boolean; version: LightVersion | null }) {
  return (
    <div className={`phone-turn-paper page-inset--phone${version ? ' book-lit' : ''}`}>
      {version && <BookLightLayer originX={0} version={version} />}
      {ink && <InkLines page={0} copy />}
    </div>
  );
}
