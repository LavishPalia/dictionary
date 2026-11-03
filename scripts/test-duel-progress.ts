// The Duel's progress rules (src/duel/progress.ts): IST days, won days, the streak and the day Play opens.
// Usage: npx tsx scripts/test-duel-progress.ts
import { addDays, istToday, playDate, readResults, streak, wonDays, type DuelResult } from '../src/duel/progress';

let failures = 0;
function check(label: string, ok: boolean, detail?: unknown) {
  if (ok) console.log(`✓ ${label}`);
  else { failures++; console.error(`✗ ${label}${detail !== undefined ? ` — ${JSON.stringify(detail)}` : ''}`); }
}

const r = (date: string, you: number, quill: number): DuelResult => ({ date, puzzle: 'p0002.v1', you, quill, at: `${date}T10:00:00Z` });
const won = (...dates: string[]) => new Set(dates);

// ── Dates ──
check('IST day before 18:30 UTC', istToday(new Date('2026-11-03T18:29:00Z')) === '2026-11-03');
check('IST day after 18:30 UTC', istToday(new Date('2026-11-03T18:31:00Z')) === '2026-11-04');
check('addDays back over February', addDays('2026-03-01', -1) === '2026-02-28');
check('addDays over the year', addDays('2026-12-31', 1) === '2027-01-01');

// ── Results ──
check('no results stored', readResults(null).length === 0 && readResults('x').length === 0);
check('malformed rows dropped', readResults([{ date: 'bad' }, { ...r('2026-11-01', 5, 3), date: '1 Nov' }, 7, null]).length === 0);
check('a valid row survives', readResults([r('2026-11-01', 5, 3)]).length === 1);
check('a non-finite score is dropped', readResults([{ ...r('2026-11-01', 5, 3), you: 'x' }]).length === 0);

// ── Won days ──
const w = wonDays([r('2026-11-01', 40, 41), r('2026-11-02', 41, 41), r('2026-11-03', 30, 41), r('2026-11-03', 50, 41)]);
check('a loss and a tie are not wins', !w.has('2026-11-01') && !w.has('2026-11-02'));
check('a later win of a lost day is', w.has('2026-11-03'));

// ── Streak ──
const three = won('2026-11-02', '2026-11-03', '2026-11-04');
check('streak ending today', streak(three, '2026-11-04') === 3);
check('streak still shows while today is open', streak(three, '2026-11-05') === 3);
check('streak gone after a missed day', streak(three, '2026-11-06') === 0);
check('a gap breaks it', streak(won('2026-11-02', '2026-11-04'), '2026-11-04') === 1);
check('across a month end', streak(won('2026-10-30', '2026-10-31', '2026-11-01'), '2026-11-01') === 3);
check('no wins', streak(won(), '2026-11-04') === 0);

// ── Which day Play opens ──
const sched = ['2026-11-01', '2026-11-02', '2026-11-03', '2026-11-04', '2026-11-05'];
check('today scheduled and open → today', playDate(sched, won(), '2026-11-04') === '2026-11-04');
check('today won → latest open past day', playDate(sched, won('2026-11-04', '2026-11-03'), '2026-11-04') === '2026-11-02');
check('everything won → today', playDate(sched, won(...sched), '2026-11-05') === '2026-11-05');
check('today unscheduled → latest open scheduled past day',
  playDate(['2026-11-01', '2026-11-02', '2026-11-03'], won('2026-11-03'), '2026-11-06') === '2026-11-02');
check('empty schedule → today', playDate([], won(), '2026-11-04') === '2026-11-04');
check('a future day is never picked', playDate(['2026-11-10'], won(), '2026-11-04') === '2026-11-04');
check('schedule order does not matter', playDate(['2026-11-02', '2026-11-01'], won(), '2026-11-06') === '2026-11-02');

if (failures) { console.error(`\n${failures} failed`); process.exit(1); }
console.log('\nAll duel progress checks passed.');
