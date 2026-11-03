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

/** Today's duel, read again when the page comes back from the game (Back can restore it from the cache). */
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
    addEventListener('pageshow', onShow);
    return () => { live = false; removeEventListener('pageshow', onShow); };
  }, []);
  return duel;
}

function scoreLine(d: TodayDuel): string {
  switch (d.state) {
    case 'new': return d.practice ? 'Practice duel' : 'Today’s puzzle is ready';
    case 'playing': return d.you > d.quill ? `You lead ${d.you} to ${d.quill}` : d.you < d.quill ? `Quill leads ${d.quill} to ${d.you}` : `Level at ${d.you}`;
    case 'won': return `Won ${d.you} to ${d.quill}${d.practice ? '' : ' ★'}`;
    case 'lost': return `Quill won ${d.quill} to ${d.you}`;
  }
}

/** The first card on Today (UI-DESIGN §3.1): play, continue or replay today's duel against Professor Quill. */
export function DuelCard() {
  const d = useTodayDuel();
  if (!d) return null;
  const today = `/play/game/${d.date}`;
  const action = d.state === 'new' ? { href: today, label: d.practice ? 'Play practice duel' : 'Play today’s duel' }
    : d.state === 'playing' ? { href: today, label: 'Continue' }
    : d.state === 'lost' ? { href: today, label: 'Replay' }
    : d.next ? { href: `/play/game/${d.next}`, label: `Play ${dayMonth(d.next)}` } : null;
  return (
    <Card className="today-card today-duel" id="today-duel" aria-labelledby="today-duel-title">
      <div className="today-card-head">
        <span className="ui-label">Panna Duel</span>
        {d.streak >= 2 && <span className="ui-label today-streak">{d.streak} days won in a row</span>}
      </div>
      <div className="today-duel-row">
        <span className="today-duel-tiles" aria-hidden="true">{'DUEL'.split('').map((l) => <span key={l}>{l}</span>)}</span>
        <div>
          <p className="today-big" id="today-duel-title">{scoreLine(d)}</p>
          {d.state === 'lost' && !d.practice && <p className="today-muted today-tight">Replay to earn today’s star.</p>}
          {d.state === 'new' && <p className="today-muted today-tight">A word duel against Professor Quill.</p>}
        </div>
      </div>
      {action && <a className="ui-btn ui-btn--primary ui-btn--full today-duel-btn" id="today-duel-btn" href={action.href}>{action.label}</a>}
    </Card>
  );
}
