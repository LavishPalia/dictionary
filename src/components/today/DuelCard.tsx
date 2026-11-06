'use client';

import { useEffect, useState } from 'react';
import { Card } from '@/components/ui';
import { duelAction, duelEntryVisible, duelLine, duelSubLine, todayDuel, type TodayDuel } from '@/duel/platform/web/entry';
import { OUTBOX_KEY, readOutbox } from '@/duel/net-rules';
import { webNet } from '@/duel/platform/web/net';
import { webPuzzles } from '@/duel/platform/web/puzzles';
import { webStorage } from '@/duel/platform/web/storage';
import { istToday } from '@/duel/progress';

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
    // Someone who finished a game offline may next open Panna, not the Duel.
    if (readOutbox(storage.get(OUTBOX_KEY)).length) void webNet(storage).flush();
    const onShow = (e: PageTransitionEvent) => { if (e.persisted) void read(); };
    const onVisible = () => { if (document.visibilityState === 'visible') void read(); };
    addEventListener('pageshow', onShow);
    document.addEventListener('visibilitychange', onVisible);
    return () => { live = false; removeEventListener('pageshow', onShow); document.removeEventListener('visibilitychange', onVisible); };
  }, []);
  return duel;
}

/** The first card on Today (UI-DESIGN §3.1): play, continue or replay today's duel against Professor Quill. */
export function DuelCard() {
  const d = useTodayDuel();
  if (!d) return null;
  const action = duelAction(d), sub = duelSubLine(d);
  return (
    <Card className="today-card today-duel" id="today-duel" role="region" aria-labelledby="today-duel-label today-duel-title">
      <div className="today-card-head">
        <span className="ui-label" id="today-duel-label">Panna Duel</span>
        {d.streak >= 2 && <span className="ui-label today-streak">{d.streak} days won in a row</span>}
      </div>
      <div className="today-duel-row">
        <span className="today-duel-tiles" aria-hidden="true">{'DUEL'.split('').map((l) => <span key={l}>{l}</span>)}</span>
        <div>
          <p className="today-big" id="today-duel-title">{duelLine(d)}</p>
          {sub && <p className="today-muted today-tight">{sub}</p>}
        </div>
      </div>
      {action && <a className="ui-btn ui-btn--primary ui-btn--full today-duel-btn" id="today-duel-btn" href={action.href}>{action.label}</a>}
    </Card>
  );
}
