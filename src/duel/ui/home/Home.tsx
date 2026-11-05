import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Puzzle } from '../../engine';
import type { Platform, ClientSchedule } from '../../platform/types';
import { dayHref, duelAction, duelLine, duelSubLine, matchingSave, todayDuel } from '../../platform/web/entry';
import { bestFor, calendarMonth, gameKey, istToday, monthRange, readResults, RESULTS_KEY, streak, wonDays, type DayCoin } from '../../progress';
import { addMonths, dayMonth, longDate, monthName, type Nav } from '../dates';
import { readFlags } from '../flags';
import { HelpSheet } from '../game/HelpSheet';
import { LaterTip } from '../guide/CoachLayer';
import { GUIDE_KEY, nextTip, readGuide } from '../guide/tips';
import { Sheet } from '../game/Sheet';
import { Calendar, MonthSeal } from './Calendar';
import { DaySheet } from './DaySheet';

const SEEN_KEY = 'panna_duel_home';
type Seen = { seals: string[]; stamped: string | null };
function readSeen(raw: unknown): Seen {
  const s = raw as Seen | null;
  return { seals: Array.isArray(s?.seals) ? s.seals.filter(x => typeof x === 'string') : [], stamped: typeof s?.stamped === 'string' ? s.stamped : null };
}

function MiniBoard({ p }: { p: Puzzle }) {
  const clue = new Set(p.clueCells), given = new Set(p.given);
  return (
    <div className="mini" style={{ gridTemplateColumns: `repeat(${p.cols}, 1fr)` }} aria-hidden="true">
      {Array.from({ length: p.rows * p.cols }, (_, i) => <i key={i} className={clue.has(i) ? 'c' : given.has(i) ? 'g' : ''} />)}
    </div>
  );
}

const Flame = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 2c1 4 6 6 6 12a6 6 0 0 1-12 0c0-3 2-4 2.500-7 1.500 1 2 2.500 2 4 1.500-2 2-5 1.500-9z" /></svg>
);

/** The game home (UI-DESIGN §3.2): today's duel, the month calendar, and the way to help and settings. */
export function Home({ platform, nav }: { platform: Platform; nav: Nav }) {
  const { storage, puzzles } = platform;
  const [schedule, setSchedule] = useState<ClientSchedule | null>(null);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [, setTick] = useState(0);
  const today = istToday(new Date());
  const [month, setMonth] = useState(today.slice(0, 7));
  const [sheet, setSheet] = useState<null | { k: 'help' } | { k: 'seal'; month: string } | { k: 'day'; date: string; playing: boolean }>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [mini, setMini] = useState<Puzzle | null>(null);
  const [stamp, setStamp] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    void puzzles.schedule().then((s) => { if (live) { setSchedule(s); setFailed(false); } }, () => { if (live) setFailed(true); });
    return () => { live = false; };
  }, [puzzles, attempt]);

  // The IST day can turn over while the app is open: read today again when it shows, and each minute.
  useEffect(() => {
    const bump = () => setTick(n => n + 1);
    const t = setInterval(bump, 60_000);
    document.addEventListener('visibilitychange', bump);
    addEventListener('focus', bump);
    return () => { clearInterval(t); document.removeEventListener('visibilitychange', bump); removeEventListener('focus', bump); };
  }, []);

  const toastTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const say = useCallback((text: string) => {
    setToast(text);
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 2600);
  }, []);
  useEffect(() => () => clearTimeout(toastTimer.current), []);

  const results = readResults(storage.get(RESULTS_KEY));
  const scheduled = useMemo(() => Object.keys(schedule?.dates ?? {}), [schedule]);
  const inProgress = (date: string) => {
    const key = schedule?.dates[date];
    const save = key ? matchingSave(storage.get(gameKey(date)), key) : null;
    return save && !save.over ? save.progress ?? 0 : null;
  };

  // A newly won day stamps its star, and a newly finished month plays its seal, once.
  useEffect(() => {
    if (!schedule) return;
    const seen = readSeen(storage.get(SEEN_KEY)), wins = results.filter(r => r.you > r.quill);
    const latest = wins[wins.length - 1];
    if (latest && latest.at !== seen.stamped) {
      setStamp(latest.date);
      seen.stamped = latest.at;
    }
    const { first, last } = monthRange(Object.keys(schedule.dates), istToday(new Date()));
    for (let m = first; m <= last; m = addMonths(m, 1)) {
      if (!seen.seals.includes(m) && calendarMonth(m, Object.keys(schedule.dates), results, () => null, istToday(new Date())).sealed) {
        seen.seals.push(m);
        setSheet({ k: 'seal', month: m });
      }
    }
    storage.set(SEEN_KEY, seen);
    // Once per visit to the home.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [schedule]);

  const duel = schedule ? todayDuel(today, schedule, storage) : null;
  const heroDay = duel?.next ?? today;
  useEffect(() => {
    if (!schedule) return;
    let live = true;
    void puzzles.forDate(heroDay).then(({ puzzle }) => { if (live) setMini(puzzle); }, () => {});
    return () => { live = false; };
  }, [schedule, heroDay, puzzles]);

  // One time, after the first finished game (UI-DESIGN §3.6). A fixed seed (a test) leaves the guide out.
  const [guide, setGuide] = useState(() => readGuide(storage.get(GUIDE_KEY)));
  const showCalendarTip = !readFlags(location.search).test && nextTip(new Set(guide.tips.concat('hint', 'word', 'swap')), { wrongOrPass: 0, dryTurns: 0, passes: 0, finished: results.length }) === 'calendar';
  const dismissTip = () => { const next = { ...guide, tips: [...guide.tips, 'calendar' as const] }; setGuide(next); storage.set(GUIDE_KEY, next); };

  const balance = platform.help.balance();
  const range = monthRange(scheduled, today);
  const cal = calendarMonth(month, scheduled, results, inProgress, today);
  const flame = streak(wonDays(results), today);

  const open = (date: string, fresh = false) => nav(`/play/game/${date}${fresh ? '?fresh=1' : ''}`);
  const onDay = (c: DayCoin) => {
    if (c.kind === 'future') { say(`This puzzle opens on ${dayMonth(c.date)}.`); return; }
    if (c.progress !== null) { setSheet({ k: 'day', date: c.date, playing: true }); return; }
    if (c.kind === 'won') { setSheet({ k: 'day', date: c.date, playing: false }); return; }
    nav(dayHref(c.date, schedule, storage));
  };

  const action = duel ? duelAction(duel) : null;
  const sub = duel ? duelSubLine(duel) : null;
  const heroShare = duel?.state === 'playing' ? inProgress(today) : null;

  return (
    <div className="duel-page duel-home">
      <header className="duel-top">
        <a className="ib" href={platform.exitHref} aria-label="Back to Panna">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="M15 5l-7 7 7 7" /></svg>
        </a>
        <h1 className="ttl"><b>Panna Duel</b></h1>
        <div className="home-chips">
          <button type="button" className="chip" data-chip="hint" onClick={() => setSheet({ k: 'help' })}>Hint <b>{balance.hint}</b></button>
          <button type="button" className="chip" data-chip="word" onClick={() => setSheet({ k: 'help' })}>Word <b>{balance.word}</b></button>
          <a className="ib" href="/play/settings" aria-label="Settings" onClick={(e) => { e.preventDefault(); nav('/play/settings'); }}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true"><circle cx="12" cy="12" r="3.2" /><path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3M5.3 5.3l2.1 2.1M16.6 16.6l2.1 2.1M5.3 18.7l2.1-2.1M16.6 7.4l2.1-2.1" /></svg>
          </a>
        </div>
      </header>

      {failed && (
        <div className="duel-load-error" role="alert">
          <p>Couldn’t load the puzzles. Check your connection.</p>
          <button type="button" className="bigbtn pri" onClick={() => { setFailed(false); setAttempt(n => n + 1); }}>Try again</button>
          <a href={platform.exitHref}>Back to Panna</a>
        </div>
      )}

      {duel && (
        <>
          <section className="page-card hero" id="duel-hero" aria-labelledby="duel-hero-line">
            {mini && <MiniBoard p={mini} />}
            <div className="hero-text">
              <p className="hero-date">{longDate(today)}</p>
              <p className="hero-line" id="duel-hero-line">{duelLine(duel)}</p>
              {sub && <p className="hero-sub">{sub}</p>}
              {heroShare !== null && <p className="hero-sub">{Math.round(heroShare * 100)}% of the board filled</p>}
              {flame > 0 && <p className="hero-flame"><Flame /> {flame} {flame === 1 ? 'day' : 'days'} won in a row</p>}
            </div>
            {action && (
              <a className="bigbtn pri" id="duel-hero-btn" href={action.href} onClick={(e) => { e.preventDefault(); nav(action.href); }}>{action.label}</a>
            )}
          </section>

          <section className="page-card cal" aria-label="Calendar">
            <Calendar month={month} first={range.first} last={range.last} coins={cal.coins} won={cal.won} total={cal.total} stamp={stamp} onMonth={setMonth} onDay={onDay} />
            <MonthSeal month={month} won={cal.won} total={cal.total} sealed={cal.sealed} days={cal.coins.length} />
          </section>

          <a className="page-link" href="/play/how" onClick={(e) => { e.preventDefault(); nav('/play/how'); }}>How to play</a>
        </>
      )}

      {toast && <div className="page-toast" role="status">{toast}</div>}
      {duel && !sheet && showCalendarTip && <LaterTip id="calendar" onDismiss={dismissTip} />}

      {sheet?.k === 'help' && <HelpSheet balance={balance} want={null} closeLabel="Close" onClose={() => setSheet(null)} />}
      {sheet?.k === 'day' && (
        <DaySheet date={sheet.date} playing={sheet.playing} best={bestFor(results, sheet.date)} onClose={() => setSheet(null)}
          onChoose={(how) => open(sheet.date, how === 'fresh')} />
      )}
      {sheet?.k === 'seal' && (
        <Sheet kind="confirm" onClose={() => setSheet(null)}>
          {(titleId) => (
            <div className="seal-moment">
              <svg className="seal-flip" viewBox="0 0 52 52" width="112" height="112" aria-hidden="true">
                <circle cx="26" cy="26" r="23" className="seal-gold" /><text x="26" y="31" textAnchor="middle">{monthName(sheet.month).slice(0, 3)}</text>
              </svg>
              <h3 id={titleId}>The {monthName(sheet.month)} seal</h3>
              <p>Every day of {monthName(sheet.month)} won. It’s yours to keep.</p>
              <button type="button" className="bigbtn pri" onClick={() => setSheet(null)}>Lovely</button>
            </div>
          )}
        </Sheet>
      )}
    </div>
  );
}
