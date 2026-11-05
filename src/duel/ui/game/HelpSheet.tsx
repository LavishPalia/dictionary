import { useEffect, useState } from 'react';
import { Sheet } from './Sheet';

const IST_MS = (5 * 60 + 30) * 60 * 1000, DAY_MS = 24 * 60 * 60 * 1000;

/** Time until the next 00:00 IST, as "5 h 12 m". */
export function untilMidnightIst(now: number): string {
  const left = DAY_MS - ((now + IST_MS) % DAY_MS);
  const m = Math.ceil(left / 60000);
  return `${Math.floor(m / 60)} h ${m % 60} m`;
}

const TITLE = { hint: 'Out of hints', word: 'Out of words', none: 'Hints and words' };

/** Balances, the daily allowance and ways to earn more (UI-DESIGN §3.3); `want` is null from the home's chips. */
export function HelpSheet({ balance, want, onClose, closeLabel = 'Back to the game' }: {
  balance: { hint: number; word: number }; want: 'hint' | 'word' | null; onClose: () => void; closeLabel?: string;
}) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 30_000); return () => clearInterval(t); }, []);
  return (
    <Sheet onClose={onClose}>
      {(titleId) => (
        <>
          <div className="grab" aria-hidden="true" />
          <button type="button" className="x" aria-label="Close" onClick={onClose}>×</button>
          <h3 id={titleId}>{TITLE[want ?? 'none']}</h3>
          <div className="bal">
            <div>Hints <b>{balance.hint}</b></div>
            <div>Words <b>{balance.word}</b></div>
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
          <button type="button" className="bigbtn pri" data-close onClick={onClose}>{closeLabel}</button>
        </>
      )}
    </Sheet>
  );
}
