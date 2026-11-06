// The Duel's root: its own router on the History API, so the package can also mount outside Next.
import { useEffect, useMemo, useState } from 'react';
import type { Puzzle } from '../engine';
import type { Platform } from '../platform/types';
import { NotSaved } from '../platform/web/puzzles';
import { GameController } from './controller/controller';
import { readFlags } from './flags';
import { WebDirector } from './fx/director';
import { FxLayer, type Motion } from './fx/layer';
import { setPerf } from './fx/perf';
import { Stage } from './fx/stage';
import { pickTier } from './fx/tier';
import { GameScreen } from './game/GameScreen';
import { gameKey } from '../progress';
import { Home } from './home/Home';
import { HowToPlay } from './how/HowToPlay';
import { Ranks } from './ranks/Ranks';
import { Settings } from './settings/Settings';
import { istToday, landingPath, parsePath, type Route } from './router';
import './styles/game.css';
import './styles/home.css';
import './styles/end.css';
import './styles/guide.css';
import './styles/book.css';
import './styles/ranks.css';

declare global {
  interface Window { __duel?: { snapshot: () => unknown; puzzle: Puzzle; trace: string[]; platform: Platform } }
}

function Game({ date, platform }: { date: string; platform: Platform }) {
  const [game, setGame] = useState<{ p: Puzzle; practice: boolean; ctl: GameController; stage: Stage; layer: FxLayer; motion: Motion } | null>(null);
  const [failed, setFailed] = useState<'load' | 'not-saved' | null>(null);
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
      // The guide is shown on a game in play, so a finished one makes way for a new deal; one under way is kept.
      if (flags.guide && platform.storage.get<{ over?: boolean }>(gameKey(date))?.over) platform.storage.remove(gameKey(date));
      if (flags.fresh) {
        platform.storage.remove(gameKey(date));
        const q = new URLSearchParams(location.search);
        q.delete('fresh');
        history.replaceState(null, '', location.pathname + (q.size ? `?${q}` : ''));
      }
      const ctl = new GameController(p, date, platform, director, { seed: flags.seed, practice });
      if (flags.test) window.__duel = { snapshot: ctl.snapshot, puzzle: p, trace, platform };
      setGame({ p, practice, ctl, stage, layer, motion });
    }, (e) => { if (live) setFailed(e instanceof NotSaved ? 'not-saved' : 'load'); });
    return () => { live = false; layer.destroy(); };
  }, [date, platform, flags, attempt]);

  if (failed) {
    return (
      <div className="duel-load-error" role="alert">
        <p>{failed === 'not-saved' ? 'This day isn’t saved on this phone yet. Connect once and it will be.' : 'Couldn’t load this puzzle. Check your connection.'}</p>
        <button type="button" className="bigbtn pri" onClick={() => { setFailed(null); setAttempt(n => n + 1); }}>Try again</button>
        <a href={platform.exitHref}>Back to Panna</a>
      </div>
    );
  }
  if (!game) return <div className="duel-game" aria-busy="true" />;
  return <GameScreen p={game.p} date={date} practice={game.practice} ctl={game.ctl} stage={game.stage} layer={game.layer} motion={game.motion} platform={platform} nav={nav} guide={flags.guide} tips={!flags.test || flags.guide} />;
}

let moves = 0;

/** Moves within the Duel; the address's test flags stay on it. */
function nav(path: string) {
  const u = new URL(path, location.href);
  new URLSearchParams(location.search).forEach((v, k) => { if (k !== 'fresh' && k !== 'guide' && !u.searchParams.has(k)) u.searchParams.set(k, v); });
  history.pushState(null, '', u.pathname + u.search);
  moves++;
  dispatchEvent(new PopStateEvent('popstate'));
}

/** Back to the screen you came from; an address opened directly has none, so the home. */
function back() {
  if (moves > 0) { moves--; history.back(); } else nav('/play');
}

export default function DuelApp({ platform }: { basePath: string; platform: Platform }) {
  const [route, setRoute] = useState<Route | null>(null);

  // Unsent scores go on opening, when the connection returns, and when the app comes back into view.
  useEffect(() => {
    const flush = () => { void platform.net.flush(); };
    const onVisible = () => { if (document.visibilityState === 'visible') flush(); };
    flush();
    addEventListener('online', flush);
    addEventListener('focus', flush);
    document.addEventListener('visibilitychange', onVisible);
    return () => { removeEventListener('online', flush); removeEventListener('focus', flush); document.removeEventListener('visibilitychange', onVisible); };
  }, [platform]);

  // A moment after opening, and when the connection returns: what a game needs to start with no connection.
  useEffect(() => {
    const prepare = () => { void platform.prepareOffline(istToday(new Date())); };
    const t = setTimeout(prepare, 1500);
    addEventListener('online', prepare);
    return () => { clearTimeout(t); removeEventListener('online', prepare); };
  }, [platform]);

  useEffect(() => {
    const to = landingPath(location.search, location.origin);
    if (to) history.replaceState(null, '', to);
    const read = () => {
      const r = parsePath(location.pathname, istToday(new Date()));
      if ('redirect' in r) { history.replaceState(null, '', r.redirect + location.search); return read(); }
      setRoute(r);
    };
    read();
    addEventListener('popstate', read);
    return () => removeEventListener('popstate', read);
  }, [platform]);

  return (
    // Browsers start audio only on a "user activation": on touch that is the finger lifting (pointerup), not
    // pointerdown, so the sound unlocks here, for every screen (keys unlock in Input).
    <main className="duel" onPointerUpCapture={() => platform.sound.unlock()}>
      {!route && <div className="duel-game" aria-busy="true" />}
      {route && 'date' in route && <Game key={route.date} date={route.date} platform={platform} />}
      {route && 'screen' in route && route.screen === 'home' && <Home platform={platform} nav={nav} />}
      {route && 'screen' in route && route.screen === 'settings' && <Settings platform={platform} nav={nav} back={back} />}
      {route && 'screen' in route && route.screen === 'how' && <HowToPlay nav={nav} back={back} />}
      {route && 'screen' in route && route.screen === 'ranks' && <Ranks platform={platform} nav={nav} back={back} />}
    </main>
  );
}
