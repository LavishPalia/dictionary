import { addMonths, dayMonth, monthName } from '../dates';
import type { DayCoin } from '../../progress';
import { MonthSealArt } from '../end/SealArt';
import { useMonthSwipe } from './useMonthSwipe';

const WEEK = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
const STATUS: Record<DayCoin['kind'], string> = { blank: '', won: 'won', open: 'still open', 'latest-open': 'still open', today: 'today', future: 'opens later' };

function Ring({ share }: { share: number }) {
  const c = 2 * Math.PI * 19;
  return (
    <svg className="ring" viewBox="0 0 44 44" aria-hidden="true">
      <circle cx="22" cy="22" r="19" />
      <circle className="fill" cx="22" cy="22" r="19" strokeDasharray={`${c * Math.max(0.04, share)} ${c}`} />
    </svg>
  );
}

/** The month's coins (UI-DESIGN §3.2): gold stars for won days, parchment for open ones, today ringed. */
export function Calendar({ month, first, last, coins, won, total, stamp, reduced, onMonth, onDay }: {
  month: string; first: string; last: string; coins: DayCoin[]; won: number; total: number; stamp: string | null; reduced: boolean;
  onMonth: (m: string) => void; onDay: (c: DayCoin) => void;
}) {
  const offset = new Date(`${month}-01T00:00:00Z`).getUTCDay();
  const swipe = useMonthSwipe({ month, canPrev: month > first, canNext: month < last, reduced, onMonth: (step) => onMonth(addMonths(month, step)) });
  return (
    <>
      <div className="cal-head">
        <button type="button" className="ib" aria-label="Previous month" disabled={month <= first} onClick={() => swipe.go(-1)}>‹</button>
        <h2 aria-live="polite">{monthName(month)} {month.slice(0, 4)}</h2>
        <button type="button" className="ib" aria-label="Next month" disabled={month >= last} onClick={() => swipe.go(1)}>›</button>
        {total > 0 && <span className="cal-won">★ {won} of {total} won</span>}
      </div>
      <div className="cal-swipe">
      <div className="cal-grid" key={month} data-month={month} ref={swipe.grid} {...swipe.bind}>
        {WEEK.map((d, i) => <span key={i} className="cal-dow" aria-hidden="true">{d}</span>)}
        {Array.from({ length: offset }, (_, i) => <span key={`x${i}`} />)}
        {coins.map((c) => (c.kind === 'blank'
          ? <span key={c.date} className="coin blank" data-date={c.date} />
          : (
            <button type="button" key={c.date} data-date={c.date} data-kind={c.kind}
              className={`coin ${c.kind}${c.date === stamp ? ' stamp' : ''}`}
              aria-label={`${dayMonth(c.date)}, ${c.progress !== null ? 'in progress' : STATUS[c.kind]}`}
              onClick={() => onDay(c)}>
              {c.progress !== null && <Ring share={c.progress} />}
              {c.kind === 'won' ? <><b aria-hidden="true">★</b><small>{Number(c.date.slice(8))}</small></> : Number(c.date.slice(8))}
            </button>
          )))}
      </div>
      </div>
    </>
  );
}

/** The month seal row: the ring fills with the share of days won; a complete month shows the gold seal. */
export function MonthSeal({ month, won, total, sealed, days }: { month: string; won: number; total: number; sealed: boolean; days: number }) {
  const name = monthName(month), left = total - won, c = 2 * Math.PI * 21;
  return (
    <div className={`seal-row${sealed ? ' sealed' : ''}`}>
      {sealed
        ? <MonthSealArt month={name.slice(0, 3)} />
        : (
          <svg viewBox="0 0 52 52" width="52" height="52" aria-hidden="true">
            <circle cx="26" cy="26" r="21" className="seal-empty" /><circle cx="26" cy="26" r="21" className="seal-fill" strokeDasharray={`${c * (total ? won / total : 0)} ${c}`} />
          </svg>
        )}
      {sealed
        ? <p>The {name} seal is yours</p>
        : total === days
          ? <p>{left} {left === 1 ? 'day' : 'days'} to the {name} seal · Lost days stay open</p>
          : total > 0
            ? <p>The {name} seal needs every day · More puzzles are on the way</p>
            : <p>No daily puzzles in {name}</p>}
    </div>
  );
}
