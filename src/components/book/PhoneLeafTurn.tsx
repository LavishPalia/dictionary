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
  /** The leaf's rotateY, in degrees, when it renders: 0 lies flat on the page, −180 lies turned over to the left. */
  angle: number;
  /** Set to this stage's draw(angle): it moves the leaf, its shade and its shadow without a React render. */
  drawRef?: React.MutableRefObject<((angle: number) => void) | null>;
  /** The lamp's light, on the page beneath only; null when no lamp is mounted. */
  version: LightVersion | null;
  light: Light;
  highlightedWord?: string;
  thumbIndex?: Record<string, number>;
  isBookmarked: (page: number) => boolean;
  canTurn: (page: number, dir: 1 | -1) => boolean;
  /** The taller of the two faces, so the turning area can hold it. */
  onHeight?: (h: number) => void;
  /** A finger or pointer down on the stage: the copy's control under it (an arrow, the page number, the switch), or null.
   *  MobilePage acts on it as it lifts, wherever that is (the stage may be gone by then). */
  onTapStart?: (c: TurnControl | null, x: number, y: number, pointerId: number) => void;
  /** A click on the stage whose pointerup wasn't seen (MobilePage swallows those it acted on). */
  onControl?: (c: TurnControl | null, x: number, y: number, by: 'pointerup' | 'click') => void;
}

/**
 * The phone's page turn: still copies over the live page (which is inert meanwhile). Beneath lies one page with the
 * lamp's light, painted once as the stage mounts; above it the leaf turns from the spine (its left edge), unlit, with a
 * shade that darkens it as it lifts and a shadow it casts on the page beneath. Only transform and opacity change per frame.
 */
/** The styles that change with the angle (transforms and opacities only). */
function faces(angle: number) {
  const rad = (-angle * Math.PI) / 180;
  const lift = Math.max(0, Math.sin(rad)); // 0 flat, 1 standing up from the spine
  const over = angle > -90; // the leaf's front is toward the reader, over the page beneath
  const reach = Math.max(0, Math.cos(rad)); // how far across the page beneath the leaf's edge is
  return { leaf: `rotateY(${angle}deg)`, cast: `scaleX(${over ? reach : 0})`, castOpacity: String(over ? lift : 0),
    front: String(lift * 0.85), back: String(lift * 0.6) };
}

export function PhoneLeafTurn({ dir, under, leaf, blank = false, angle, drawRef, version, light, highlightedWord, thumbIndex, isBookmarked, canTurn,
  onHeight, onTapStart, onControl }: PhoneLeafTurnProps) {
  const leafRef = useRef<HTMLDivElement>(null);
  const castRef = useRef<HTMLDivElement>(null);
  const frontShadeRef = useRef<HTMLDivElement>(null);
  const backShadeRef = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    if (!drawRef) return;
    drawRef.current = (a: number) => {
      const f = faces(a);
      if (leafRef.current) leafRef.current.style.transform = f.leaf;
      if (castRef.current) { castRef.current.style.transform = f.cast; castRef.current.style.opacity = f.castOpacity; }
      if (frontShadeRef.current) frontShadeRef.current.style.opacity = f.front;
      if (backShadeRef.current) backShadeRef.current.style.opacity = f.back;
    };
    return () => { drawRef.current = null; };
  }, [drawRef]);

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

  const f = faces(angle);

  const copy = (page: BookPage | null, lit: boolean, paper: 'ink' | 'blank') => page
    ? <PhonePageBody page={page} live={false} highlightedWord={highlightedWord} isBookmarked={isBookmarked(page.page_number)}
        lampVersion={lit ? version : null} light={light} thumbIndex={thumbIndex}
        canPrev={canTurn(page.page_number, -1)} canNext={canTurn(page.page_number, 1)} />
    : <Paper ink={paper === 'ink'} version={lit ? version : null} />;

  return (
    <div className="phone-turn-stage" data-dir={dir} aria-hidden="true" style={pool as React.CSSProperties}
      onPointerDown={(e) => {
        if (e.isPrimary) onTapStart?.(still(e.target), e.clientX, e.clientY, e.pointerId);
      }}
      // A click the pointerup didn't already act on (MobilePage swallows those): a tap whose pointerup was lost.
      onClick={(e) => {
        onControl?.(still(e.target), e.clientX, e.clientY, 'click');
      }}>
      {/* Plain paper has no height of its own: it fills the stage (as does a leaf of plain paper). */}
      <div ref={underRef} className="phone-turn-under" style={under ? undefined : { height: '100%' }}>{copy(under, true, blank ? 'blank' : 'ink')}</div>
      <div ref={castRef} className="phone-turn-cast" style={{ transform: f.cast, opacity: f.castOpacity }} />
      <div ref={leafRef} className="phone-turn-leaf" style={{ transform: f.leaf, height: leaf ? undefined : '100%' }}>
        <div ref={frontRef} className="phone-turn-face phone-turn-front" style={leaf ? undefined : { height: '100%' }}>
          {copy(leaf, false, 'ink')}
          <div ref={frontShadeRef} className="phone-turn-shade" style={{ opacity: f.front }} />
        </div>
        <div className="phone-turn-face phone-turn-back">
          <div ref={backShadeRef} className="phone-turn-shade" style={{ opacity: f.back }} />
        </div>
      </div>
    </div>
  );
}

/** The control of the still page beneath at a tap's target, if any. The leaf's own controls sweep across the page as it
 *  turns, so a tap there means what was at that spot before the turn (MobilePage keeps those places). */
function still(target: EventTarget): TurnControl | null {
  const el = target instanceof Element ? target : null;
  if (!el || el.closest('.phone-turn-leaf')) return null;
  return (el.closest('[data-turn-control]')?.getAttribute('data-turn-control') as TurnControl | null | undefined) ?? null;
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
