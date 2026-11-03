// The Duel's root: its own router on the History API, so the package can also mount outside Next.
import { useEffect, useMemo, useState } from 'react';
import type { Puzzle } from '../engine';
import type { Platform } from '../platform/types';
import { GameController } from './controller/controller';
import { readFlags } from './flags';
import { WebDirector } from './fx/director';
import { FxLayer, type Motion } from './fx/layer';
import { setPerf } from './fx/perf';
import { Stage } from './fx/stage';
import { pickTier } from './fx/tier';
import { GameScreen } from './game/GameScreen';
import { playDate, readResults, RESULTS_KEY, wonDays } from '../progress';
import { istToday, parsePath, type Route } from './router';
import './styles/game.css';

declare global {
  interface Window { __duel?: { snapshot: () => unknown; puzzle: Puzzle; trace: string[] } }
}

function Game({ date, platform }: { date: string; platform: Platform }) {
  const [game, setGame] = useState<{ p: Puzzle; practice: boolean; ctl: GameController; stage: Stage; layer: FxLayer; motion: Motion } | null>(null);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const flags = useMemo(() => readFlags(location.search), []);

  useEffect(() => {
    let live = true;
    setPerf(flags.perf);
    const motion: Motion = { reduced: platform.reducedMotion(), tier: flags.tier ?? pickTier(navigator as Navigator & { deviceMemory?: number }) };
    const layer = new FxLayer(motion);
    // No controller is built until the puzzle loads, so a failed load leaves the saved game as it was.
    void platform.puzzles.forDate(date).then(({ puzzle: p, practice }) => {
      if (!live) return;
      const stage = new Stage();
      const trace: string[] = [];
      const director = new WebDirector(p, stage, layer, platform, motion, flags.test ? trace : undefined);
      const ctl = new GameController(p, date, platform, director, { seed: flags.seed, practice });
      if (flags.test) window.__duel = { snapshot: ctl.snapshot, puzzle: p, trace };
      setGame({ p, practice, ctl, stage, layer, motion });
    }, () => { if (live) setFailed(true); });
    return () => { live = false; layer.destroy(); };
  }, [date, platform, flags, attempt]);

  if (failed) {
    return (
      <div className="duel-load-error" role="alert">
        <p>Couldn’t load this puzzle. Check your connection.</p>
        <button type="button" className="bigbtn pri" onClick={() => { setFailed(false); setAttempt(n => n + 1); }}>Try again</button>
        <a href={platform.exitHref}>Back to Panna</a>
      </div>
    );
  }
  if (!game) return <div className="duel-game" aria-busy="true" />;
  return <GameScreen p={game.p} date={date} practice={game.practice} ctl={game.ctl} stage={game.stage} layer={game.layer} motion={game.motion} platform={platform} />;
}

/** /play: today, or the most recent open day (product spec §6.2). Without a schedule, today. */
async function dayToPlay(platform: Platform, today: string): Promise<string> {
  try {
    const { dates } = await platform.puzzles.schedule();
    return playDate(Object.keys(dates), wonDays(readResults(platform.storage.get(RESULTS_KEY))), today);
  } catch { return today; }
}

export default function DuelApp({ platform }: { basePath: string; platform: Platform }) {
  const [route, setRoute] = useState<Route | null>(null);

  useEffect(() => {
    let live = true;
    const read = () => {
      const today = istToday(new Date());
      const r = parsePath(location.pathname, today);
      if ('redirect' in r) { history.replaceState(null, '', r.redirect + location.search); return read(); }
      if (r.screen === 'play') {
        setRoute(null);
        void dayToPlay(platform, today).then((date) => {
          const now = parsePath(location.pathname, today);
          if (!live || !('screen' in now) || now.screen !== 'play') return; // Back was pressed meanwhile
          history.replaceState(null, '', `/play/game/${date}${location.search}`);
          read();
        });
        return;
      }
      setRoute(r);
    };
    read();
    addEventListener('popstate', read);
    return () => { live = false; removeEventListener('popstate', read); };
  }, [platform]);

  return (
    <main className="duel">
      {route && 'date' in route && <Game key={route.date} date={route.date} platform={platform} />}
    </main>
  );
}
