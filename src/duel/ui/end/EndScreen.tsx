import { useCallback, useEffect, useRef, useState } from 'react';
import type { Puzzle } from '../../engine';
import type { ClientSchedule, Platform } from '../../platform/types';
import { dayHref } from '../../platform/web/entry';
import { gameKey, istToday, readResults, RESULTS_KEY, streak, wonDays } from '../../progress';
import type { GameController } from '../controller/controller';
import type { Snapshot } from '../controller/types';
import { dayMonth, type Nav } from '../dates';
import type { FxLayer } from '../fx/layer';
import { useNet } from '../ranks/WeekCard';
import { weekOf } from '../../week';
import { endCopy } from './copy';
import { SealArt } from './SealArt';
import { WordList } from './WordList';

/** The most recent scheduled day up to today that isn't won, other than this one. */
const COUNT_MS = 750, STAMP_MS = 300;

function nextOpen(scheduled: string[], won: Set<string>, today: string, date: string): string | null {
  return scheduled.filter(d => d <= today && d !== date && !won.has(d)).sort().pop() ?? null;
}

/** A score counting up as the screen arrives, on its own so the rest of the screen doesn't render each frame. */
function CountUp({ to, run }: { to: number; run: boolean }) {
  const [shown, setShown] = useState(run ? 0 : to);
  useEffect(() => {
    if (!run) { setShown(to); return; }
    const t0 = performance.now();
    let frame = requestAnimationFrame(function step(now) {
      const t = Math.min(1, (now - t0) / COUNT_MS);
      setShown(Math.round(to * (1 - Math.pow(1 - t, 3))));
      if (t < 1) frame = requestAnimationFrame(step);
    });
    return () => cancelAnimationFrame(frame);
  }, [to, run]);
  return <>{shown}</>;
}

/** The end of a game (UI-DESIGN §3.4). The footer works from the first frame, so a racing player isn't held up. */
export function EndScreen({ p, date, practice, snap, ctl, platform, layer, instant, nav }: {
  p: Puzzle; date: string; practice: boolean; snap: Snapshot; ctl: GameController; platform: Platform; layer: FxLayer; instant: boolean; nav: Nav;
}) {
  const { you, quill } = snap.state.scores;
  const today = istToday(new Date()), isToday = date === today;
  const won = wonDays(readResults(platform.storage.get(RESULTS_KEY)));
  const copy = endCopy({ you, quill, practice, isToday, starred: won.has(date) });
  const [arriving, setArriving] = useState(!instant);
  const counting = arriving && !platform.reducedMotion();
  const [schedule, setSchedule] = useState<ClientSchedule | null>(null);
  const next = schedule && nextOpen(Object.keys(schedule.dates), won, today, date);
  const [toast, setToast] = useState<string | null>(null);
  const seal = useRef<HTMLDivElement>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const say = useCallback((text: string) => {
    setToast(text);
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 2600);
  }, []);
  useEffect(() => () => clearTimeout(toastTimer.current), []);

  // It covers the whole screen, so reading starts here.
  useEffect(() => { document.getElementById('duel-end-title')?.focus({ preventScroll: true }); }, []);

  useEffect(() => {
    let live = true;
    void platform.puzzles.schedule().then((s) => { if (live) setSchedule(s); }, () => {});
    return () => { live = false; };
  }, [platform]);

  useEffect(() => {
    if (instant) return;
    const t = setTimeout(() => setArriving(false), 2000);
    // The seal lands, and only then the rest: the thud, then a win's chime and paper.
    const landed = setTimeout(() => {
      if (copy.kind === 'loss') return;
      platform.sound.play('thud');
      if (copy.kind !== 'win') return;
      platform.sound.play('chime');
      platform.haptics.celebrate();
      const r = seal.current?.getBoundingClientRect();
      if (r) layer.confetti({ x: r.left + r.width / 2, y: r.top + r.height / 2 });
    }, platform.reducedMotion() ? 0 : STAMP_MS);
    return () => { clearTimeout(t); clearTimeout(landed); };
    // Once, as the screen arrives.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const goNext = () => nav(next ? dayHref(next, schedule, platform.storage) : '/play');
  const nextLabel = next ? `${dayMonth(next)} · not yet won` : 'Pick a day on the calendar';
  const replay = () => ctl.newGame();
  const flame = streak(won, today);
  const rewards = snap.rewards;
  const dayWon = won.has(date);

  // This week: the server's total once it has answered; until then, the last known total plus what's waiting.
  useNet(platform.net);
  const [flushed, setFlushed] = useState(false);
  useEffect(() => {
    let live = true;
    setFlushed(false);
    void platform.net.flush().then(() => platform.net.me('this')).then(() => { if (live) setFlushed(true); });
    return () => { live = false; };
  }, [platform, snap.state.seed]);
  const week = platform.net.week();
  const sending = platform.net.statusOf(`${p.id}.v${p.version}`, snap.state.seed);
  const waiting = platform.net.unsent().reduce((n, g) => n + g.claimedScore, 0);
  const weekPoints = (week?.points ?? 0) + waiting;
  const credit = platform.net.creditOf(`${p.id}.v${p.version}`, snap.state.seed);
  // Counted for last week, this week's total says nothing about it: the card shows what the game itself brought.
  const lastWeek = Boolean(credit && credit !== weekOf(new Date()));
  const weekLine = sending === 'rejected' ? 'This game couldn’t be counted'
    : sending === 'unsaved' ? 'Your phone is full, so this score may not be kept'
    : lastWeek ? 'counted for last week'
    : sending === 'waiting' ? (flushed ? 'will count when you’re online' : 'counting…')
      : `this week${week?.rank ? ` · #${week.rank}` : ''}`;

  return (
    <div className={`duel-page duel-end ${copy.kind}${arriving ? ' arriving' : ''}`} role="dialog" aria-modal="false" aria-labelledby="duel-end-title"
      onPointerDown={() => setArriving(false)}>
      <header className="duel-top">
        <a className="ib" href="/play" aria-label="Close" onClick={(e) => { e.preventDefault(); nav('/play'); }}>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg>
        </a>
        <div className="ttl"><b>{practice ? 'Practice duel' : 'Daily Duel'}</b><i>{dayMonth(date)}</i></div>
        <span className="ib" aria-hidden="true" />
      </header>

      <div className="end-hero">
        <div className="end-seal" ref={seal} aria-hidden="true"><SealArt kind={copy.kind} /></div>
        <h2 id="duel-end-title" tabIndex={-1}>{copy.title}</h2>
        <p>{copy.line}</p>
        <p className="end-score" aria-label={`You ${you}, Professor Quill ${quill}`}>
          <b className={you >= quill ? 'lead' : ''}><CountUp to={you} run={counting} /></b> <span>to</span> <b className={`q${quill >= you ? ' lead' : ''}`}><CountUp to={quill} run={counting} /></b>
        </p>
      </div>

      {!practice && (
        <div className="end-stats three">
          <div className="page-card stat" data-stat="day">
            <span className={`stat-coin${dayWon ? ' won' : ''}`} aria-hidden="true">{dayWon ? '★' : Number(date.slice(8))}</span>
            <small>{dayWon ? `${isToday ? 'Today' : dayMonth(date)} won` : 'star still open'}</small>
          </div>
          <div className="page-card stat" data-stat="streak">
            <b>{flame}</b>
            <small>{flame === 1 ? 'day in a row' : 'days in a row'}{!dayWon && isToday && flame > 0 ? ' · safe till midnight' : ''}</small>
          </div>
          <div className="page-card stat" data-stat="week">
            <b>{(lastWeek ? you : weekPoints).toLocaleString('en-IN')}</b>
            <small>{weekLine}</small>
          </div>
        </div>
      )}

      {rewards && (rewards.hint > 0 || rewards.word > 0) && (
        <div className="end-rewards" data-rewards>
          {rewards.hint > 0 && <span className="reward">+{rewards.hint} {rewards.hint === 1 ? 'Hint' : 'Hints'}</span>}
          {rewards.word > 0 && <span className="reward">+{rewards.word} Word</span>}
        </div>
      )}

      <WordList p={p} state={snap.state} panna={platform.panna} say={say} />
      <a className="page-link" href="/play/how" onClick={(e) => { e.preventDefault(); nav('/play/how'); }}>How scoring works</a>

      {toast && <div className="page-toast" role="status">{toast}</div>}

      <footer className="end-foot">
        {copy.kind === 'win' && !practice
          ? <button type="button" className="bigbtn pri" data-end="next" onClick={goNext}>Next puzzle<small>{nextLabel}</small></button>
          : <button type="button" className="bigbtn pri" data-end="replay" onClick={replay}>{copy.kind === 'win' ? 'Play again' : 'Replay'}<small>{copy.kind === 'tie' ? 'Break the tie' : 'Same puzzle, fresh tiles'}</small></button>}
        <div className="end-foot2">
          {copy.kind !== 'win' && !practice && <button type="button" data-end="next" onClick={goNext}>Next ›</button>}
          <button type="button" data-end="calendar" onClick={() => nav('/play')}>Calendar</button>
          {!practice && <button type="button" data-end="ranks" onClick={() => nav('/play/ranks')}>Ranks</button>}
        </div>
      </footer>
    </div>
  );
}
