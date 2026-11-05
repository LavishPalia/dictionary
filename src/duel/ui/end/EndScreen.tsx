import { useCallback, useEffect, useRef, useState } from 'react';
import type { Puzzle } from '../../engine';
import type { ClientSchedule, Platform } from '../../platform/types';
import { dayHref } from '../../platform/web/entry';
import { gameKey, istToday, readResults, RESULTS_KEY, streak, wonDays } from '../../progress';
import type { GameController } from '../controller/controller';
import type { Snapshot } from '../controller/types';
import { dayMonth, type Nav } from '../dates';
import type { FxLayer } from '../fx/layer';
import { endCopy } from './copy';
import { WordList } from './WordList';

/** The most recent scheduled day up to today that isn't won, other than this one. */
function nextOpen(scheduled: string[], won: Set<string>, today: string, date: string): string | null {
  return scheduled.filter(d => d <= today && d !== date && !won.has(d)).sort().pop() ?? null;
}

/** The end of a game (UI-DESIGN §3.4). The footer works from the first frame, so a racing player isn't held up. */
export function EndScreen({ p, date, practice, snap, ctl, platform, layer, instant, nav }: {
  p: Puzzle; date: string; practice: boolean; snap: Snapshot; ctl: GameController; platform: Platform; layer: FxLayer; instant: boolean; nav: Nav;
}) {
  const { you, quill } = snap.state.scores;
  const today = istToday(new Date()), isToday = date === today;
  const copy = endCopy({ you, quill, practice, isToday });
  const won = wonDays(readResults(platform.storage.get(RESULTS_KEY)));
  const [arriving, setArriving] = useState(!instant);
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

  useEffect(() => {
    let live = true;
    void platform.puzzles.schedule().then((s) => { if (live) setSchedule(s); }, () => {});
    return () => { live = false; };
  }, [platform]);

  useEffect(() => {
    if (instant) return;
    const t = setTimeout(() => setArriving(false), 2000);
    if (copy.kind === 'win') {
      platform.haptics.celebrate();
      const r = seal.current?.getBoundingClientRect();
      if (r) layer.confetti({ x: r.left + r.width / 2, y: r.top + r.height / 2 });
    }
    return () => clearTimeout(t);
    // Once, as the screen arrives.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const goNext = () => nav(next ? dayHref(next, schedule, platform.storage) : '/play');
  const nextLabel = next ? `${dayMonth(next)} · not yet won` : 'Pick a day on the calendar';
  const replay = () => ctl.newGame();
  const flame = streak(won, today);
  const rewards = snap.rewards;
  const dayWon = won.has(date);

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
        <div className="end-seal" ref={seal} aria-hidden="true" />
        <h2 id="duel-end-title">{copy.title}</h2>
        <p>{copy.line}</p>
        <p className="end-score" aria-label={`You ${you}, Professor Quill ${quill}`}>
          <b className={you >= quill ? 'lead' : ''}>{you}</b> <span>to</span> <b className={`q${quill >= you ? ' lead' : ''}`}>{quill}</b>
        </p>
      </div>

      {!practice && (
        <div className="end-stats">
          <div className="page-card stat" data-stat="day">
            <span className={`stat-coin${dayWon ? ' won' : ''}`} aria-hidden="true">{dayWon ? '★' : Number(date.slice(8))}</span>
            <small>{dayWon ? `${isToday ? 'Today' : dayMonth(date)} won` : 'star still open'}</small>
          </div>
          <div className="page-card stat" data-stat="streak">
            <b>{flame}</b>
            <small>{flame === 1 ? 'day in a row' : 'days in a row'}{!dayWon && isToday && flame > 0 ? ' · safe till midnight' : ''}</small>
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
        </div>
      </footer>
    </div>
  );
}
