// The Duel's root: its own router on the History API, so the package can also mount outside Next.
import { useEffect, useMemo, useState } from 'react';
import type { Puzzle } from '../engine';
import type { Platform } from '../platform/types';
import { GameController } from './controller/controller';
import { NullDirector } from './controller/null-director';
import { readFlags } from './flags';
import { Stage } from './fx/stage';
import { GameScreen } from './game/GameScreen';
import { istToday, parsePath, type Route } from './router';
import './styles/game.css';

declare global {
  interface Window { __duel?: { snapshot: () => unknown; puzzle: Puzzle; trace: string[] } }
}

function Game({ date, platform }: { date: string; platform: Platform }) {
  const [game, setGame] = useState<{ p: Puzzle; ctl: GameController; stage: Stage } | null>(null);
  const flags = useMemo(() => readFlags(location.search), []);

  useEffect(() => {
    let live = true;
    void platform.puzzles.forDate(date).then((p) => {
      if (!live) return;
      const stage = new Stage();
      const ctl = new GameController(p, date, platform, new NullDirector(), { seed: flags.seed });
      if (flags.test) window.__duel = { snapshot: ctl.snapshot, puzzle: p, trace: [] };
      setGame({ p, ctl, stage });
    });
    return () => { live = false; };
  }, [date, platform, flags]);

  if (!game) return <div className="duel-game" aria-busy="true" />;
  return <GameScreen p={game.p} date={date} ctl={game.ctl} stage={game.stage} platform={platform} />;
}

export default function DuelApp({ platform }: { basePath: string; platform: Platform }) {
  const [route, setRoute] = useState<Route | null>(null);

  useEffect(() => {
    const read = () => {
      const r = parsePath(location.pathname, istToday(new Date()));
      if ('redirect' in r) { history.replaceState(null, '', r.redirect + location.search); return read(); }
      setRoute(r);
    };
    read();
    addEventListener('popstate', read);
    return () => removeEventListener('popstate', read);
  }, []);

  return (
    <main className="duel">
      {route && !('redirect' in route) && <Game key={route.date} date={route.date} platform={platform} />}
    </main>
  );
}
