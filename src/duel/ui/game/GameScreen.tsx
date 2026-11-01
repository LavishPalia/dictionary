import { useEffect, useRef } from 'react';
import type { Puzzle } from '../../engine';
import type { Platform } from '../../platform/types';
import type { GameController } from '../controller/controller';
import type { Stage } from '../fx/stage';
import { ActionRow } from './ActionRow';
import { Board } from './Board';
import { ClueZoom } from './ClueZoom';
import { GameOver } from './GameOver';
import { Rack } from './Rack';
import { ScoreBar } from './ScoreBar';
import { useSnapshot } from './useController';

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
function longDate(date: string): string {
  const d = new Date(`${date}T00:00:00Z`);
  return `${DAYS[d.getUTCDay()]}, ${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`;
}

const MAX_CELL = 42, MIN_CELL = 30, MAX_TILE = 56, TILE_GAP = 8;

/** Sizes cells and tiles to the space left, like the prototype's fitBoard: on mount, resize and rotation. */
function useFit(root: React.RefObject<HTMLDivElement | null>, area: React.RefObject<HTMLDivElement | null>, p: Puzzle, stage: Stage) {
  useEffect(() => {
    const fit = () => {
      const r = root.current, a = area.current;
      if (!r || !a) return;
      const w = r.clientWidth - 16, h = a.clientHeight - 8;
      const cell = Math.max(MIN_CELL, Math.min(MAX_CELL, Math.floor(Math.min(w / p.cols, h / p.rows))));
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
  }, [root, area, p, stage]);
}

/** The game screen (UI-DESIGN §3.3 as changed by §0), phone first; desktop shows the same column, centred. */
export function GameScreen({ p, date, ctl, stage, platform }: { p: Puzzle; date: string; ctl: GameController; stage: Stage; platform: Platform }) {
  const snap = useSnapshot(ctl);
  const root = useRef<HTMLDivElement>(null);
  const area = useRef<HTMLDivElement>(null);
  useFit(root, area, p, stage);

  // The clue zoom stays until the next tap anywhere; a tap on a clue moves or closes it itself.
  const onPointerDown = (e: React.PointerEvent) => {
    platform.sound.unlock();
    if (!(e.target as HTMLElement).closest('.duel-cl')) ctl.closeZoom();
  };

  return (
    <div className={`duel-game${snap.busy ? ' busy' : ''}`} ref={root} onPointerDownCapture={onPointerDown}>
      <header className="duel-top">
        <a className="ib" href={platform.exitHref} aria-label="Back to Panna">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="M15 5l-7 7 7 7" /></svg>
        </a>
        <h1 className="ttl"><b>Daily Duel</b><i>{longDate(date)}</i></h1>
        <button type="button" className="ib" aria-label="Settings (coming soon)" disabled>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true"><circle cx="12" cy="12" r="3.2" /><path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3M5.3 5.3l2.1 2.1M16.6 16.6l2.1 2.1M5.3 18.7l2.1-2.1M16.6 7.4l2.1-2.1" /></svg>
        </button>
      </header>
      <ScoreBar snap={snap} stage={stage} />
      <div className="duel-boardarea" ref={area} onClick={(e) => { if (e.target === e.currentTarget) ctl.tapOutside(); }}>
        <Board p={p} snap={snap} ctl={ctl} stage={stage} />
      </div>
      <Rack snap={snap} ctl={ctl} stage={stage} />
      <ActionRow snap={snap} ctl={ctl} />
      {snap.zoom !== null && <ClueZoom p={p} cell={snap.zoom} stage={stage} />}
      {snap.state.over && !snap.busy && <GameOver snap={snap} ctl={ctl} />}
    </div>
  );
}
