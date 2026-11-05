import { useEffect, useState } from 'react';
import type { DuelNet } from '../../platform/types';
import type { Nav } from '../dates';
import { climbedToday, pointsWord } from './copy';

/** Re-renders when anything the server told us changes. */
export function useNet(net: DuelNet) {
  const [, setTick] = useState(0);
  useEffect(() => net.subscribe(() => setTick(n => n + 1)), [net]);
}

/** The home's way to the ranks (UI-DESIGN §3.2): your place this week, and how long is left. */
export function WeekCard({ net, nav }: { net: DuelNet; nav: Nav }) {
  useNet(net);
  useEffect(() => { void net.me('this'); }, [net]);
  const week = net.week(), waiting = net.unsent().length;
  const playing = !!week && week.points > 0;
  const climbed = week ? climbedToday(week.dayRank, week.rank) : null;
  return (
    <a className="page-card week-card" id="duel-week-card" href="/play/ranks" onClick={(e) => { e.preventDefault(); nav('/play/ranks'); }}>
      <span className="week-badge" aria-hidden="true">{playing && week.rank !== null ? `#${week.rank}` : '♛'}</span>
      <span className="week-text">
        <b>{playing ? `This week · ${pointsWord(week.points)}` : 'This week’s ranks'}</b>
        <small>
          {waiting > 0 ? `${waiting} ${waiting === 1 ? 'game' : 'games'} will count when you’re online`
            : playing ? `${climbed ? `${climbed} · ` : ''}resets Monday at midnight` : 'Finish a game to join'}
        </small>
      </span>
      <i aria-hidden="true">›</i>
    </a>
  );
}
