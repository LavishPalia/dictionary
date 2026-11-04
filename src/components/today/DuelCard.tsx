'use client';

import { useEffect, useState } from 'react';
import { Card } from '@/components/ui';
import { duelEntryVisible, todayDuel, type TodayDuel } from '@/duel/platform/web/entry';
import { webPuzzles } from '@/duel/platform/web/puzzles';
import { webStorage } from '@/duel/platform/web/storage';
import { istToday } from '@/duel/progress';

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const dayMonth = (date: string) => `${Number(date.slice(8))} ${MONTHS[Number(date.slice(5, 7)) - 1]}`;

/** Whether Panna shows its way into the Duel (hidden on production until launch); false until known on the client. */
export function useDuelVisible(): boolean {
  const [visible, setVisible] = useState(false);
  useEffect(() => { setVisible(duelEntryVisible(webStorage())); }, []);
  return visible;
}

/** Today's duel, read again whenever the page shows (back from the game, or the app reopened after IST midnight). */
function useTodayDuel(): TodayDuel | null {
  const [duel, setDuel] = useState<TodayDuel | null>(null);
  useEffect(() => {
    let live = true;
    const storage = webStorage();
    if (!duelEntryVisible(storage)) return;
    const read = () => webPuzzles().schedule().then((s) => s, () => null)
      .then((s) => { if (live) setDuel(todayDuel(istToday(new Date()), s, storage)); });
    void read();
    const onShow = (e: PageTransitionEvent) => { if (e.persisted) void read(); };
    const onVisible = () => { if (document.visibilityState === 'visible') void read(); };
    addEventListener('pageshow', onShow);
    document.addEventListener('visibilitychange', onVisible);
    return () => { live = false; removeEventListener('pageshow', onShow); document.removeEventListener('visibilitychange', onVisible); };
  }, []);
  return duel;
}

function scoreLine(d: TodayDuel): string {
  switch (d.state) {
    case 'new': return !d.practice ? 'Today’s puzzle is ready' : d.next ? 'No new puzzle today' : 'Practice duel';
    case 'playing': return d.you > d.quill ? `You lead ${d.you} to ${d.quill}` : d.you < d.quill ? `Quill leads ${d.quill} to ${d.you}` : `Level at ${d.you}`;
    case 'won': return `Won ${d.you} to ${d.quill}${d.practice ? '' : ' ★'}`;
    case 'over': return d.you === d.quill ? `A tie at ${d.you}` : `Quill won ${d.quill} to ${d.you}`;
  }
}

function subLine(d: TodayDuel): string | null {
  if (d.state === 'new') return d.practice && d.next ? `${dayMonth(d.next)}’s duel is still open.` : 'A word duel against Professor Quill.';
  if (d.state === 'over' && !d.practice) return d.you === d.quill ? 'Replay to break the tie and earn today’s star.' : 'Replay to earn today’s star.';
  return null;
}

function actionOf(d: TodayDuel): { href: string; label: string } | null {
  const today = `/play/game/${d.date}`, next = d.next ? { href: `/play/game/${d.next}`, label: `Play ${dayMonth(d.next)}` } : null;
  switch (d.state) {
    case 'new': return next || { href: today, label: d.practice ? 'Play practice duel' : 'Play today’s duel' };
    case 'playing': return { href: today, label: 'Continue' };
    case 'won': return d.replaying ? { href: today, label: 'Continue replay' } : next;
    case 'over': return { href: today, label: 'Replay' };
  }
}

/** The first card on Today (UI-DESIGN §3.1): play, continue or replay today's duel against Professor Quill. */
export function DuelCard() {
  const d = useTodayDuel();
  if (!d) return null;
  const action = actionOf(d), sub = subLine(d);
  return (
    <Card className="today-card today-duel" id="today-duel" role="region" aria-labelledby="today-duel-label today-duel-title">
      <div className="today-card-head">
        <span className="ui-label" id="today-duel-label">Panna Duel</span>
        {d.streak >= 2 && <span className="ui-label today-streak">{d.streak} days won in a row</span>}
      </div>
      <div className="today-duel-row">
        <span className="today-duel-tiles" aria-hidden="true">{'DUEL'.split('').map((l) => <span key={l}>{l}</span>)}</span>
        <div>
          <p className="today-big" id="today-duel-title">{scoreLine(d)}</p>
          {sub && <p className="today-muted today-tight">{sub}</p>}
        </div>
      </div>
      {action && <a className="ui-btn ui-btn--primary ui-btn--full today-duel-btn" id="today-duel-btn" href={action.href}>{action.label}</a>}
    </Card>
  );
}
