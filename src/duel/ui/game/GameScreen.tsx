import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { CellId } from '../../engine';
import type { Puzzle } from '../../engine';
import type { Platform } from '../../platform/types';
import type { GameController } from '../controller/controller';
import { Input } from '../fx/drag';
import type { FxLayer, Motion } from '../fx/layer';
import type { Stage } from '../fx/stage';
import { longDate, type Nav } from '../dates';
import { turnStats } from '../controller/selectors';
import { CoachLayer, LaterTip } from '../guide/CoachLayer';
import { GUIDE_KEY, nextTip, readGuide } from '../guide/tips';
import { ActionRow } from './ActionRow';
import { Board } from './Board';
import { ClueList } from './ClueList';
import { ClueZoom } from './ClueZoom';
import { EndScreen } from '../end/EndScreen';
import { HelpSheet } from './HelpSheet';
import { SwapSheet } from './SwapSheet';
import { WordConfirm } from './WordConfirm';
import { Rack } from './Rack';
import { ScoreBar } from './ScoreBar';
import { useSnapshot } from './useController';

const MAX_CELL = 42, MAX_BOOK_CELL = 54, MIN_CELL = 26, MAX_TILE = 56, TILE_GAP = 8;

/** The desktop book's size: the same as `@media` in styles/book.css. */
const BOOK = '(min-width: 1000px) and (min-height: 700px)';
function useBook(): boolean {
  const [book, setBook] = useState(() => matchMedia(BOOK).matches);
  useEffect(() => {
    const q = matchMedia(BOOK), on = () => setBook(q.matches);
    on();
    q.addEventListener('change', on);
    return () => q.removeEventListener('change', on);
  }, []);
  return book;
}

/** Sizes cells and tiles to the space left, like the prototype's fitBoard: on mount, resize and rotation. */
function useFit(root: React.RefObject<HTMLDivElement | null>, area: React.RefObject<HTMLDivElement | null>, p: Puzzle, stage: Stage, book: boolean) {
  useEffect(() => {
    const fit = () => {
      const r = root.current, a = area.current;
      if (!r || !a) return;
      const w = (book ? a.clientWidth : r.clientWidth) - 16, h = a.clientHeight - 8;
      const cell = Math.max(MIN_CELL, Math.min(book ? MAX_BOOK_CELL : MAX_CELL, Math.floor(Math.min(w / p.cols, h / p.rows))));
      const tileW = Math.min(MAX_TILE, Math.floor((r.clientWidth - 40 - 4 * TILE_GAP) / 5));
      r.style.setProperty('--cell', `${cell}px`);
      r.style.setProperty('--tileW', `${tileW}px`);
      r.style.setProperty('--tileH', `${Math.round(tileW * 1.04)}px`);
      requestAnimationFrame(() => stage.measure());
    };
    fit();
    const ro = new ResizeObserver(fit);
    if (area.current) ro.observe(area.current);
    if (root.current) ro.observe(root.current);
    addEventListener('orientationchange', fit);
    void document.fonts?.ready.then(() => stage.measure());
    return () => { ro.disconnect(); removeEventListener('orientationchange', fit); };
  }, [root, area, p, stage, book]);
}

/** The game screen (UI-DESIGN §3.3 as changed by §0), phone first; desktop shows the same column, centred. */
export function GameScreen({ p, date, practice, ctl, stage, layer, motion, platform, nav, guide, tips }: {
  p: Puzzle; date: string; practice: boolean; ctl: GameController; stage: Stage; layer: FxLayer; motion: Motion; platform: Platform; nav: Nav; guide: boolean; tips: boolean;
}) {
  const snap = useSnapshot(ctl);
  // A game already finished when the screen opens shows its end at once, with no arrival.
  const finishedAtOpen = useRef(snap.state.over);
  if (!snap.state.over) finishedAtOpen.current = false;
  const [seen, setSeen] = useState(() => readGuide(platform.storage.get(GUIDE_KEY)));
  const [coach, setCoach] = useState(() => guide || (tips && !seen.coach));
  const endCoach = () => {
    const next = { ...seen, coach: true };
    setSeen(next);
    platform.storage.set(GUIDE_KEY, next);
    setCoach(false);
    const q = new URLSearchParams(location.search);
    if (q.has('guide')) { q.delete('guide'); history.replaceState(null, '', location.pathname + (q.size ? `?${q}` : '')); }
  };
  const logLength = snap.state.log.length;
  const tip = useMemo(() => (tips && !snap.state.over ? nextTip(new Set(seen.tips), { ...turnStats(p, snap.state), finished: 0 }) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [tips, p, logLength, seen.tips, snap.state.over]);
  const root = useRef<HTMLDivElement>(null);
  const area = useRef<HTMLDivElement>(null);
  const input = useRef<Input | null>(null);
  const book = useBook();
  useFit(root, area, p, stage, book);
  useEffect(() => {
    if (!root.current) return;
    const i = new Input(root.current, stage, layer, ctl, motion, platform);
    input.current = i;
    return () => { i.detach(); input.current = null; };
  }, [stage, layer, ctl, motion, platform]);
  const onCell = useCallback((c: CellId) => { if (input.current) input.current.tapCell(c); else ctl.tapCell(c); }, [ctl]);

  // The clue zoom stays until the next tap anywhere; a tap on a clue moves or closes it itself.
  const onPointerDown = (e: React.PointerEvent) => {
    const t = e.target as HTMLElement;
    if (!t.closest('.duel-cl')) ctl.closeZoom();
    // Word mode ends with a tap anywhere but a clue or the Word button (UI-DESIGN §3.3).
    if (ctl.snapshot().wordMode && !t.closest('.duel-clue, [data-act="word"]')) ctl.exitWordMode();
  };

  // While a sheet is open, everything behind it is out of reach (focus, taps, screen readers).
  const behind = snap.sheet !== null || coach || (snap.state.over && !snap.busy);
  return (
    // Browsers start audio only on a "user activation": on touch that is the finger lifting (pointerup), not
    // pointerdown, so the sound unlocks here (keys unlock in Input).
    <div className={`duel-game${snap.busy ? ' busy' : ''}`} ref={root} onPointerDownCapture={onPointerDown}
      onPointerUpCapture={() => platform.sound.unlock()}>
      <div className="duel-main" inert={behind}>
      <header className="duel-top">
        <a className="ib" href="/play" aria-label="Back to the game home" onClick={(e) => { e.preventDefault(); nav('/play'); }}>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="M15 5l-7 7 7 7" /></svg>
        </a>
        {practice
          ? <h1 className="ttl"><b>Practice duel</b><i>No daily puzzle for {longDate(date)}</i></h1>
          : <h1 className="ttl"><b>Daily Duel</b><i>{longDate(date)}</i></h1>}
        <a className="ib" href="/play/settings" aria-label="Settings" onClick={(e) => { e.preventDefault(); nav('/play/settings'); }}>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true"><circle cx="12" cy="12" r="3.2" /><path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3M5.3 5.3l2.1 2.1M16.6 16.6l2.1 2.1M5.3 18.7l2.1-2.1M16.6 7.4l2.1-2.1" /></svg>
        </a>
      </header>
      <ScoreBar snap={snap} stage={stage} />
      <div className="duel-boardarea" ref={area} onClick={(e) => { if (e.target === e.currentTarget) ctl.tapOutside(); }}>
        <Board p={p} snap={snap} ctl={ctl} stage={stage} onCell={onCell} />
      </div>
      {book && <ClueList p={p} snap={snap} ctl={ctl} />}
      <Rack snap={snap} ctl={ctl} stage={stage} />
      <ActionRow snap={snap} ctl={ctl} />
      {book && <p className="duel-keys">A–Z type into the answer · ⌫ take back · Tab next clue · Enter submit</p>}
      </div>
      {snap.zoom !== null && <ClueZoom p={p} cell={snap.zoom} stage={stage} />}
      {snap.sheet?.k === 'swap' && <SwapSheet snap={snap} ctl={ctl} motion={motion} />}
      {snap.sheet?.k === 'help' && <HelpSheet balance={snap.balance} want={snap.sheet.want} onClose={() => ctl.closeSheet()} />}
      {snap.sheet?.k === 'reveal' && <WordConfirm p={p} slot={snap.sheet.slot} ctl={ctl} />}
      {snap.state.over && !snap.busy && <EndScreen p={p} date={date} practice={practice} snap={snap} ctl={ctl} platform={platform} layer={layer} instant={finishedAtOpen.current} nav={nav} />}
      {coach && <CoachLayer onDone={endCoach} />}
      {tip && !coach && !snap.busy && (
        <LaterTip id={tip} onDismiss={() => { const next = { ...seen, tips: [...seen.tips, tip] }; setSeen(next); platform.storage.set(GUIDE_KEY, next); }} />
      )}
      <div className="duel-rotate" role="status">
        <p>Turn your phone upright to play.</p>
      </div>
    </div>
  );
}
