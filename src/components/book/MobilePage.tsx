'use client';

import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { BookPage } from '@/lib/types';
import { soundEngine } from '@/lib/audio';
import { PhonePageBody, type TurnControl } from './PhonePageBody';
import { PhoneLeafTurn } from './PhoneLeafTurn';
import type { Light } from '@/lib/lighting';
import type { LightVersion } from '@/lib/desk';

type TurnOpts = { quiet?: boolean };

interface MobilePageProps {
  page: BookPage | null;
  /** The pages either side (from the cache; null when not loaded yet): the leaf turns onto them. */
  prevPage?: BookPage | null;
  nextPage?: BookPage | null;
  highlightedWord?: string;
  isBookmarked?: boolean;
  /** Whether another page carries the ribbon (for the turn's copies). */
  isPageBookmarked?: (page: number) => boolean;
  onToggleBookmark?: () => void;
  onSelectWord?: (headword: string) => void;
  /** One page back or on. `quiet`: the turn already played its sound (at the leaf's midpoint). */
  onPrevPage: (opts?: TurnOpts) => void;
  onNextPage: (opts?: TurnOpts) => void;
  canPrev?: boolean;
  canNext?: boolean;
  /** How a one-page step looks: a leaf turning from the spine, a 120 ms cross-fade (reduced motion), or at once (Instant). */
  turn?: 'leaf' | 'fade' | 'instant';
  /** An arrow's leaf turn, in ms (a swipe's remaining part takes its share of it). */
  turnMs?: number;
  /** A leaf turn is under way (the lamp holds its light still meanwhile). */
  onTurning?: (on: boolean) => void;
  /** A page being fetched (slow connection): faint ink lines show over this one until it arrives. */
  loadingPage?: number | null;
  /** Tapping the page number opens the Go to panel. */
  onOpenGoTo?: () => void;
  /** The A–Z rail at the page's right edge: each letter's first page, and the jump it makes. */
  thumbIndex?: Record<string, number>;
  onSelectLetter?: (letter: string, page: number) => void;
  /** The lamp's light under the ink (Evening), in this version; none when the lamp isn't mounted. */
  lampVersion?: LightVersion | null;
  /** The light now, and the foot row's brass switch that flips it. */
  light?: Light;
  onToggleLamp?: () => void;
}

// A swipe turns the page past a quarter of the page's width, or as a quick flick.
const TURN_SHARE = 0.25;
const FLICK_SPEED = 0.5; // px per ms
const SLIDE_MS = 180;
// Past the first or last page the page moves (or lifts) a quarter as far as the finger.
const RESISTANCE = 0.25;
const FADE_MS = 120;
// A tap that moves further than this between down and up is a drag, not a tap.
const TAP_SLOP = 10;
// After the leaf lands, how long to wait for a page change before taking the turn as refused (nothing loading).
const REFUSED_MS = 400;

const easeInOut = (k: number) => (1 - Math.cos(Math.PI * k)) / 2;

/** A leaf turn on the stage. */
interface Turn {
  dir: 1 | -1;
  /** At either end of the book: the current page lifts a little over bare paper and falls back. */
  blocked: boolean;
  source: 'arrow' | 'swipe';
  /** The page the turn started from. */
  from: number;
  fromPage: BookPage;
  /** The neighbour's page as it was when the turn began (null: not loaded yet; it fills in if it arrives). */
  other: BookPage | null;
  start: number;
  end: number;
  /** 'drag': following the finger; 'run': animating; 'landed': waiting for the page to change. */
  phase: 'drag' | 'run' | 'landed';
  /** The turn will complete (an arrow, or a swipe let go far enough): only then does it make its sound. */
  committed: boolean;
  sounded: boolean;
  /** A swipe: what had focus inside the page as it began (inert takes focus away; it comes back when the turn ends). */
  focused: Element | null;
}

export const MobilePage: React.FC<MobilePageProps> = ({
  page,
  prevPage = null,
  nextPage = null,
  highlightedWord,
  isBookmarked = false,
  isPageBookmarked,
  onToggleBookmark,
  onSelectWord,
  onPrevPage,
  onNextPage,
  canPrev = true,
  canNext = true,
  turn: mode = 'leaf',
  turnMs = 500,
  onTurning,
  loadingPage = null,
  onOpenGoTo,
  thumbIndex,
  onSelectLetter,
  lampVersion = null,
  light = 'day',
  onToggleLamp,
}) => {
  // The page follows the finger sideways; vertical moves are left to the browser (touch-action: pan-y).
  const cardRef = useRef<HTMLDivElement>(null);
  const prevRef = useRef<HTMLButtonElement>(null);
  const nextRef = useRef<HTMLButtonElement>(null);
  const touchRef = useRef<{ x: number; y: number; t: number; axis: 'x' | 'y' | null } | null>(null);
  // Instant and reduced motion: the page itself follows the finger (as before the leaf turn).
  const [offset, setOffset] = useState(0);
  const [sliding, setSliding] = useState(false);

  // ── The leaf turn ──
  const [turn, setTurn] = useState<Turn | null>(null);
  const turnRef = useRef<Turn | null>(null);
  // The leaf's angle lives outside React state: each frame draws the stage directly (drawRef), so nothing re-renders.
  const angleRef = useRef(0);
  const drawRef = useRef<((a: number) => void) | null>(null);
  const rafRef = useRef(0);
  const [minHeight, setMinHeight] = useState<number | null>(null);
  // One arrow tap during a turn is kept for after it; the page number's tap waits for the stage to go.
  const queuedRef = useRef<1 | -1 | null>(null);
  const queueUsedRef = useRef(false);
  const gotoRef = useRef(false);
  // Where the page's controls were as the turn began (the stage's taps fall back to them).
  const controlsRef = useRef<{ c: TurnControl; r: DOMRect }[]>([]);
  // The arrow to focus once the turn's page is in (a swipe leaves focus alone).
  const focusRef = useRef<1 | -1 | null>(null);
  const landedAtRef = useRef(0);
  const landTimerRef = useRef(0);
  // A tap the stage acted on as the finger lifted: the browser's own click that follows is swallowed.
  const swallowRef = useRef<{ x: number; y: number; until: number } | null>(null);
  const pageRef = useRef(page);
  pageRef.current = page;
  const loadingRef = useRef(loadingPage);
  loadingRef.current = loadingPage;
  // A touch that began while a leaf was turning is ignored to its end.
  const ignoreTouchRef = useRef(false);
  // The fading copy (reduced motion), keyed so a second fade restarts it.
  const [fade, setFade] = useState<{ page: BookPage; key: number } | null>(null);
  const fadeTimerRef = useRef(0);
  const fadeRef = useRef<HTMLDivElement>(null);
  // Animated from script: under reduced motion, motion.css cuts every CSS animation and transition to nothing.
  useLayoutEffect(() => {
    fadeRef.current?.animate([{ opacity: 1 }, { opacity: 0 }], { duration: FADE_MS, fill: 'forwards' });
  }, [fade?.key]);

  const width = () => cardRef.current?.offsetWidth ?? 390;
  const slideTo = (x: number, then?: () => void) => {
    setSliding(true);
    setOffset(x);
    window.setTimeout(() => { setSliding(false); then?.(); }, SLIDE_MS);
  };

  const canTurn = useCallback((n: number, dir: 1 | -1) => (n === page?.page_number ? (dir > 0 ? canNext : canPrev) : true),
    [page?.page_number, canNext, canPrev]);
  const bookmarkedOf = useCallback((n: number) => (n === page?.page_number ? isBookmarked : Boolean(isPageBookmarked?.(n))),
    [page?.page_number, isBookmarked, isPageBookmarked]);

  /** Moves the leaf; a committed turn's sound plays once, as the leaf crosses −90° (its midpoint). */
  const setAngle = (a: number) => {
    const t = turnRef.current;
    if (t && t.committed && !t.sounded && (angleRef.current > -90) !== (a > -90)) sound(t);
    angleRef.current = a;
    drawRef.current?.(a);
  };
  const sound = (t: Turn) => { t.sounded = true; soundEngine.playPageTurn(); };

  const run = (to: number, ms: number, done: () => void) => {
    cancelAnimationFrame(rafRef.current);
    const from = angleRef.current, t0 = performance.now();
    if (ms <= 0 || from === to) { setAngle(to); done(); return; }
    const step = (now: number) => {
      const k = Math.min(1, (now - t0) / ms);
      setAngle(from + (to - from) * easeInOut(k));
      if (k < 1) rafRef.current = requestAnimationFrame(step);
      else { rafRef.current = 0; done(); }
    };
    rafRef.current = requestAnimationFrame(step);
  };

  /** The stage goes, the live page comes back. */
  const finish = () => {
    cancelAnimationFrame(rafRef.current);
    rafRef.current = 0;
    window.clearTimeout(landTimerRef.current);
    turnRef.current = null;
    setTurn(null);
    setMinHeight(null);
    angleRef.current = 0;
  };

  /** The leaf has landed: the page changes now, quietly (its sound played at the midpoint). */
  const land = () => {
    const t = turnRef.current;
    if (!t) return;
    t.phase = 'landed';
    landedAtRef.current = performance.now();
    // A jump (search, Go to) moved the book while the leaf turned: don't step on from there.
    if (pageRef.current?.page_number !== t.from) { finish(); return; }
    if (t.dir > 0) onNextPage({ quiet: true }); else onPrevPage({ quiet: true });
    // If the page never changes (the turn was refused and nothing is loading), let the stage go.
    const check = () => {
      if (turnRef.current !== t) return;
      if (performance.now() - landedAtRef.current >= REFUSED_MS && loadingRef.current === null) { finish(); return; }
      landTimerRef.current = window.setTimeout(check, 100);
    };
    landTimerRef.current = window.setTimeout(check, 100);
  };

  const begin = (dir: 1 | -1, source: Turn['source']): Turn | null => {
    if (!page || turnRef.current) return null;
    const blocked = dir > 0 ? !canNext : !canPrev;
    if (blocked && source === 'arrow') return null;
    const t: Turn = {
      dir, blocked, source, from: page.page_number, fromPage: page, other: blocked ? null : (dir > 0 ? nextPage : prevPage),
      start: blocked || dir > 0 ? 0 : -180, end: blocked ? 0 : dir > 0 ? -180 : 0, phase: source === 'swipe' ? 'drag' : 'run',
      committed: source === 'arrow', sounded: false,
      focused: source === 'swipe' && cardRef.current?.contains(document.activeElement) ? document.activeElement : null,
    };
    // The neighbour must be the page next to this one (the cache may still hold an older one).
    if (t.other && t.other.page_number !== t.from + dir) t.other = null;
    turnRef.current = t;
    const card = cardRef.current;
    controlsRef.current = ([['next', nextRef.current], ['prev', prevRef.current], ['goto', card?.querySelector('#page-number-btn')],
      ['switch', card?.querySelector('#book-switch')]] as [TurnControl, Element | null | undefined][])
      .flatMap(([c, el]) => (el ? [{ c, r: el.getBoundingClientRect() }] : []));
    queueUsedRef.current = false;
    focusRef.current = null;
    angleRef.current = t.start;
    setTurn(t);
    return t;
  };

  const turnByArrow = (dir: 1 | -1) => {
    if (turnRef.current) { queue(dir); return; }
    if (mode !== 'leaf') {
      if (mode === 'fade' && page) startFade(page);
      if (dir > 0) onNextPage(); else onPrevPage();
      return;
    }
    const t = begin(dir, 'arrow');
    if (!t) return;
    focusRef.current = dir;
    run(t.end, turnMs, land);
  };

  const queue = (dir: 1 | -1) => {
    if (queueUsedRef.current) return; // one tap is kept; more are dropped
    queueUsedRef.current = true;
    queuedRef.current = dir;
  };

  // A tap on the stage. The leaf moves away under a quick second tap, so where no copy's control is under the finger, the
  // tap goes to the live page's control at that spot (inert, under the stage), where the reader last saw it.
  const onControl = (hit: TurnControl | null, x: number, y: number, by: 'pointerup' | 'click') => {
    // Acted on as the finger lifted: the click the browser sends after it is not a second tap.
    if (by === 'pointerup') swallowRef.current = { x, y, until: performance.now() + 800 };
    const c = hit ?? controlsRef.current.find(({ r }) => x >= r.left && x <= r.right && y >= r.top && y <= r.bottom)?.c ?? null;
    // The turn may have ended while the finger was down: then the tap acts as it would have on the page.
    const during = turnRef.current !== null;
    if (c === 'next') { if (during) queue(1); else turnByArrow(1); }
    else if (c === 'prev') { if (during) queue(-1); else turnByArrow(-1); }
    else if (c === 'goto') { if (during) gotoRef.current = true; else onOpenGoTo?.(); }
    else if (c === 'switch') onToggleLamp?.();
  };

  // A tap that went down on the stage is acted on as it lifts (not at the click that comes later), if it moved under
  // TAP_SLOP. The lift is heard on the window, so a stage that went away meanwhile doesn't lose it.
  const tapRef = useRef<{ id: number; x: number; y: number; c: TurnControl | null } | null>(null);
  const onTapStart = (c: TurnControl | null, x: number, y: number, id: number) => { tapRef.current = { id, x, y, c }; };
  const controlRef = useRef(onControl);
  controlRef.current = onControl;
  useEffect(() => {
    const up = (e: PointerEvent) => {
      const d = tapRef.current;
      if (!d || d.id !== e.pointerId) return;
      tapRef.current = null;
      if (Math.hypot(e.clientX - d.x, e.clientY - d.y) <= TAP_SLOP) controlRef.current(d.c, d.x, d.y, 'pointerup');
    };
    const cancel = (e: PointerEvent) => { if (tapRef.current?.id === e.pointerId) tapRef.current = null; };
    window.addEventListener('pointerup', up, true);
    window.addEventListener('pointercancel', cancel, true);
    return () => { window.removeEventListener('pointerup', up, true); window.removeEventListener('pointercancel', cancel, true); };
  }, []);

  const startFade = (from: BookPage) => {
    window.clearTimeout(fadeTimerRef.current);
    setFade({ page: from, key: performance.now() });
    fadeTimerRef.current = window.setTimeout(() => setFade(null), FADE_MS);
  };

  // The turn's page is in (or the page went away): the stage goes. Before paint, so the copy and the page never both show.
  const pageNumber = page?.page_number ?? null;
  useLayoutEffect(() => {
    const t = turnRef.current;
    if (!t) return;
    if (pageNumber === null || (t.phase === 'landed' && pageNumber !== t.from)) finish();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pageNumber]);

  // After the stage goes: the pressed arrow takes focus, then a queued tap turns again, or Go to opens.
  const busy = turn !== null;
  const lastTurnRef = useRef<Turn | null>(null);
  if (turn) lastTurnRef.current = turn;
  useEffect(() => {
    onTurning?.(busy);
    if (busy) return;
    const queued = queuedRef.current, focus = focusRef.current, ended = lastTurnRef.current;
    queuedRef.current = null;
    focusRef.current = null;
    lastTurnRef.current = null;
    // A swipe leaves focus where it was: inert took it from the page, so it goes back (to the same control if it is still
    // there, else to the page's first control).
    if (ended?.focused && document.activeElement === document.body) {
      const card = cardRef.current;
      const back = ended.focused.isConnected && card?.contains(ended.focused) ? ended.focused
        : card?.querySelector('button:not([disabled]), [href], [tabindex]:not([tabindex="-1"])');
      (back as HTMLElement | null | undefined)?.focus({ preventScroll: true });
    }
    if (gotoRef.current) { gotoRef.current = false; onOpenGoTo?.(); return; }
    if (queued) { turnByArrow(queued); return; }
    if (focus) (focus > 0 ? nextRef : prevRef).current?.focus({ preventScroll: true });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [busy]);

  useEffect(() => () => {
    cancelAnimationFrame(rafRef.current);
    window.clearTimeout(fadeTimerRef.current);
    window.clearTimeout(landTimerRef.current);
    onTurning?.(false);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // The click that follows a tap the stage already acted on (on pointerup) must not act again, on whatever is there now.
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      const w = swallowRef.current;
      if (!w) return;
      if (performance.now() > w.until) { swallowRef.current = null; return; }
      if (Math.hypot(e.clientX - w.x, e.clientY - w.y) > 24) return;
      swallowRef.current = null;
      e.preventDefault();
      e.stopPropagation();
    };
    window.addEventListener('click', onClick, true);
    return () => window.removeEventListener('click', onClick, true);
  }, []);

  // The live page's arrows: stable handlers, so the memoised page doesn't re-render for them.
  const arrowRef = useRef(turnByArrow);
  arrowRef.current = turnByArrow;
  const onPrev = useCallback(() => arrowRef.current(-1), []);
  const onNext = useCallback(() => arrowRef.current(1), []);

  // ── Swipes ──
  /** A drag in progress goes back flat (no page change, no sound). */
  const fallBack = (t: Turn) => {
    t.phase = 'run';
    run(t.start, (turnMs * Math.abs(t.start - angleRef.current)) / 180, finish);
  };
  const handleTouchStart = (e: React.TouchEvent) => {
    const t = turnRef.current;
    // A touch during a turn is ignored until every finger is up; a second finger during a drag drops the drag.
    if (t) { if (t.phase === 'drag') fallBack(t); ignoreTouchRef.current = true; touchRef.current = null; return; }
    ignoreTouchRef.current = false;
    if (e.touches.length !== 1) { touchRef.current = null; return; }
    touchRef.current = { x: e.touches[0].clientX, y: e.touches[0].clientY, t: performance.now(), axis: null };
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    const start = touchRef.current;
    if (!start || ignoreTouchRef.current) return;
    const dx = e.touches[0].clientX - start.x;
    const dy = e.touches[0].clientY - start.y;
    if (!start.axis) {
      if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return;
      start.axis = Math.abs(dx) > Math.abs(dy) ? 'x' : 'y';
      if (start.axis === 'x' && mode === 'leaf' && !begin(dx < 0 ? 1 : -1, 'swipe')) { touchRef.current = null; return; }
    }
    if (start.axis !== 'x') return;
    if (mode !== 'leaf') {
      const blocked = (dx < 0 && !canNext) || (dx > 0 && !canPrev);
      setOffset(blocked ? dx * RESISTANCE : dx);
      return;
    }
    const t = turnRef.current;
    if (!t || t.phase !== 'drag') return;
    const deg = (dx / width()) * 180;
    // The leaf follows the finger; at either end the current page lifts a quarter as far, whichever way the finger goes.
    if (t.blocked) setAngle(-Math.min(180, Math.abs(deg)) * RESISTANCE);
    else if (t.dir > 0) setAngle(Math.max(-180, Math.min(0, deg)));
    else setAngle(Math.max(-180, Math.min(0, -180 + deg)));
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    const start = touchRef.current;
    touchRef.current = null;
    if (ignoreTouchRef.current) {
      const t = turnRef.current;
      if (t?.phase === 'drag') fallBack(t);
      if (e.touches.length === 0) ignoreTouchRef.current = false;
      return;
    }
    if (!start || start.axis !== 'x') return;
    const dx = e.changedTouches[0].clientX - start.x;
    const speed = Math.abs(dx) / Math.max(1, performance.now() - start.t);
    const far = Math.abs(dx) > width() * TURN_SHARE || (speed > FLICK_SPEED && Math.abs(dx) > 24);
    const next = dx < 0;
    if (mode === 'leaf') {
      const t = turnRef.current;
      if (!t || t.phase !== 'drag') return;
      const go = far && !t.blocked && (t.dir > 0 ? dx < 0 : dx > 0);
      const to = go ? t.end : t.start;
      t.phase = 'run';
      // Committed: its sound plays as the leaf crosses its midpoint, or now if the finger took it past already.
      if (go) { t.committed = true; if ((t.start > -90) !== (angleRef.current > -90)) sound(t); }
      run(to, (turnMs * Math.abs(to - angleRef.current)) / 180, go ? land : finish);
      return;
    }
    if (!far || (next ? !canNext : !canPrev)) {
      slideTo(0);
      return;
    }
    setOffset(0);
    if (mode === 'fade' && page) startFade(page);
    if (next) onNextPage(); else onPrevPage();
  };

  const handleTouchCancel = () => {
    touchRef.current = null;
    ignoreTouchRef.current = false;
    const t = turnRef.current;
    if (t && t.phase === 'drag') { fallBack(t); return; }
    if (mode !== 'leaf') slideTo(0);
  };

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

  // The stage's two faces. Forward: the current page turns away over the next one. Back: the previous page swings in over
  // the current one. A neighbour that arrives mid-turn fills in; once landed, the page beneath is the one that arrived.
  let stage: React.ReactNode = null;
  if (turn) {
    const want = turn.from + turn.dir;
    const arrived = (p: BookPage | null) => (p && p.page_number === want ? p : null);
    const neighbour = turn.blocked ? null : turn.other ?? arrived(turn.dir > 0 ? nextPage : prevPage) ?? arrived(page);
    stage = (
      <PhoneLeafTurn
        dir={turn.dir}
        under={turn.blocked ? null : turn.dir < 0 ? turn.fromPage : neighbour}
        leaf={turn.blocked || turn.dir > 0 ? turn.fromPage : neighbour}
        blank={turn.blocked}
        angle={angleRef.current}
        drawRef={drawRef}
        version={lampVersion}
        light={light}
        highlightedWord={highlightedWord}
        thumbIndex={thumbIndex && onSelectLetter ? thumbIndex : undefined}
        isBookmarked={bookmarkedOf}
        canTurn={canTurn}
        onHeight={setMinHeight}
        onTapStart={onTapStart}
        onControl={onControl}
      />
    );
  }

  return (
    // The turning area: no box of its own at rest (it is exactly the page), and as tall as the taller page while a leaf turns.
    <div
      className="phone-turn"
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      onTouchCancel={handleTouchCancel}
      style={{ width: '100%', maxWidth: '390px', minHeight: turn && minHeight ? `${minHeight}px` : undefined }}
    >
      <PhonePageBody
        page={page}
        live
        cardRef={cardRef}
        prevRef={prevRef}
        nextRef={nextRef}
        inert={turn !== null}
        offset={offset}
        sliding={sliding}
        slideMs={SLIDE_MS}
        highlightedWord={highlightedWord}
        isBookmarked={isBookmarked}
        lampVersion={lampVersion}
        light={light}
        thumbIndex={thumbIndex}
        canPrev={canPrev}
        canNext={canNext}
        onToggleBookmark={onToggleBookmark}
        onSelectWord={onSelectWord}
        onPrev={onPrev}
        onNext={onNext}
        onOpenGoTo={onOpenGoTo}
        onSelectLetter={onSelectLetter}
        onToggleLamp={onToggleLamp}
        loadingPage={loadingPage}
      />
      {stage}
      {/* While a leaf waits on a slow page, the live page (and its own loading status) is inert: say it from here. */}
      <p className="ui-visually-hidden" id="phone-turn-status" role="status" aria-live="polite">
        {turn && loadingPage !== null ? `Loading page ${loadingPage}…` : ''}
      </p>
      {fade && (
        <div key={fade.key} ref={fadeRef} className="phone-turn-fade" aria-hidden="true">
          <PhonePageBody page={fade.page} live={false} highlightedWord={highlightedWord} isBookmarked={bookmarkedOf(fade.page.page_number)}
            lampVersion={lampVersion} light={light} thumbIndex={thumbIndex && onSelectLetter ? thumbIndex : undefined}
            canPrev={canTurn(fade.page.page_number, -1)} canNext={canTurn(fade.page.page_number, 1)} />
        </div>
      )}
    </div>
  );
};
