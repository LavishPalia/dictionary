import { useEffect, useState } from 'react';
import type { GameController } from '../controller/controller';
import type { Snapshot } from '../controller/types';
import { Sheet } from './Sheet';

const IST_MS = (5 * 60 + 30) * 60 * 1000, DAY_MS = 24 * 60 * 60 * 1000;

/** Time until the next 00:00 IST, as "5 h 12 m". */
export function untilMidnightIst(now: number): string {
  const left = DAY_MS - ((now + IST_MS) % DAY_MS);
  const m = Math.ceil(left / 60000);
  return `${Math.floor(m / 60)} h ${m % 60} m`;
}

/** Out of hints or words: balances, the daily allowance and ways to earn more (UI-DESIGN §3.3). */
export function HelpSheet({ snap, ctl }: { snap: Snapshot; ctl: GameController }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 30_000); return () => clearInterval(t); }, []);
  const want = snap.sheet && snap.sheet.k === 'help' ? snap.sheet.want : 'hint';
  return (
    <Sheet onClose={() => ctl.closeSheet()}>
      {(titleId) => (
        <>
          <div className="grab" aria-hidden="true" />
          <button type="button" className="x" aria-label="Close" onClick={() => ctl.closeSheet()}>×</button>
          <h3 id={titleId}>{want === 'hint' ? 'Out of hints' : 'Out of words'}</h3>
          <div className="bal">
            <div>Hints <b>{snap.balance.hint}</b></div>
            <div>Words <b>{snap.balance.word}</b></div>
          </div>
          <p className="lbl2">Free every day</p>
          <p className="free">1 Hint and 1 Word, fresh at midnight · in {untilMidnightIst(now)}</p>
          <p className="lbl2">Earn more</p>
          <ul className="earn">
            <li>Win any game <b>+1 Hint</b></li>
            <li>Win today’s daily <b>+1 Word</b></li>
            <li>Every 7-day streak <b>+3 Hints</b></li>
            <li>Finish a review session <b>+1 Hint</b></li>
          </ul>
          <button type="button" className="bigbtn sec" disabled>▶ Watch a short video · +1<span className="soon">Coming soon</span></button>
          <button type="button" className="bigbtn pri" data-close onClick={() => ctl.closeSheet()}>Back to the game</button>
        </>
      )}
    </Sheet>
  );
}
