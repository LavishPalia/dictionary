// The Duel's progress rules (src/duel/progress.ts): IST days, won days, the streak and the day Play opens.
// Usage: npx tsx scripts/test-duel-progress.ts
import { entryVisible, todayDuel } from '../src/duel/platform/web/entry';
import type { Storage } from '../src/duel/platform/types';
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

// ── The way in: who sees it before launch ──
const vis = (o: Partial<Parameters<typeof entryVisible>[0]>) => entryVisible({ launched: false, vercelEnv: undefined, host: 'localhost', seen: false, ...o });
check('production: hidden', !vis({ vercelEnv: 'production', host: 'panna-ashen.vercel.app' }));
check('production, opened /play once: shown', vis({ vercelEnv: 'production', host: 'panna-ashen.vercel.app', seen: true }));
check('a preview deploy: shown', vis({ vercelEnv: 'preview', host: 'panna-git-x.vercel.app' }));
check('the production host without the env: hidden', !vis({ host: 'panna-ashen.vercel.app' }));
check('localhost: shown', vis({}));
check('launched: shown', vis({ vercelEnv: 'production', host: 'panna-ashen.vercel.app', launched: true }));

// ── The Today card's state ──
function mem(entries: Record<string, unknown> = {}): Storage {
  const m = new Map(Object.entries(entries).map(([k, v]) => [k, JSON.stringify(v)]));
  return {
    get: <T>(k: string) => (m.has(k) ? JSON.parse(m.get(k)!) as T : null),
    has: (k) => m.has(k), set: (k, v) => { m.set(k, JSON.stringify(v)); }, remove: (k) => { m.delete(k); },
  };
}
const T = '2026-11-04';
const SCHED = { dates: { '2026-11-02': 'p0002.v1', '2026-11-03': 'p0003.v1', [T]: 'p0004.v1' }, files: {} };
const save = (puzzleId: string, you: number, quill: number, over = false) => ({ puzzleId, puzzleVersion: 1, seed: 1, log: [], startedAt: '', score: { you, quill }, over });
const G = `panna_duel_game:${T}`;
let td = todayDuel(T, SCHED, mem());
check('card: no save → new, a daily', td.state === 'new' && !td.practice);
td = todayDuel(T, SCHED, mem({ [G]: save('p0004', 24, 19) }));
check('card: a game under way → playing 24 to 19', td.state === 'playing' && td.you === 24 && td.quill === 19, td);
td = todayDuel(T, SCHED, mem({ [G]: save('p0004', 55, 41, true), panna_duel_results: [r(T, 55, 41), r('2026-11-03', 50, 40)] }));
check('card: won today → won, next is the latest open day', td.state === 'won' && td.you === 55 && td.next === '2026-11-02', td);
check('card: the streak counts today and yesterday', td.streak === 2, td.streak);
td = todayDuel(T, SCHED, mem({ [G]: save('p0004', 38, 41, true), panna_duel_results: [r(T, 38, 41)] }));
check('card: lost → over 38 to 41', td.state === 'over' && td.you === 38 && td.quill === 41, td);
td = todayDuel(T, SCHED, mem({ [G]: save('p0004', 40, 40, true) }));
check('card: a tie is over, not won', td.state === 'over' && td.you === 40, td);
td = todayDuel(T, SCHED, mem({ [G]: save('p0004', 3, 2), panna_duel_results: [r(T, 55, 41)] }));
check('card: replaying a won day keeps the win', td.state === 'won' && td.you === 55 && td.replaying, td);
td = todayDuel(T, SCHED, mem({ [G]: save('p0004', 50, 40, true) }));
check('card: a won save without its result row still counts as won', td.state === 'won' && td.you === 50, td);
td = todayDuel(T, { ...SCHED, dates: { ...SCHED.dates, [T]: 'p0004.v2' } }, mem({ [G]: save('p0004', 24, 19) }));
check('card: a save of an older version → new', td.state === 'new', td);
td = todayDuel('2026-11-05', SCHED, mem({ panna_duel_results: [r('2026-11-03', 50, 40)] }));
check('card: no puzzle today but an open past daily → next is that day', td.state === 'new' && td.practice && td.next === '2026-11-04', td);
td = todayDuel(T, SCHED, mem({ [G]: save('p0001', 24, 19) }));
check("card: a practice save on a day that now has its daily → new", td.state === 'new' && !td.practice, td);
td = todayDuel(T, { dates: {}, files: {} }, mem());
check('card: today unscheduled → practice', td.state === 'new' && td.practice);
td = todayDuel(T, { dates: {}, files: {} }, mem({ [G]: save('p0001', 30, 20, true) }));
check('card: a won practice game → won, no next', td.state === 'won' && td.practice && td.next === null, td);
td = todayDuel(T, null, mem({ [G]: save('p0004', 24, 19) }));
check("card: schedule unknown → today's save is trusted", td.state === 'playing' && !td.practice, td);
td = todayDuel(T, SCHED, mem({ [G]: { junk: true } }));
check('card: a broken save → new', td.state === 'new');

if (failures) { console.error(`\n${failures} failed`); process.exit(1); }
console.log('\nAll duel progress checks passed.');
