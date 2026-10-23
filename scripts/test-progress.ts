// Progress: saved words by status, the 30-day review calendar, and the best streak (src/lib/progress.ts).
// Usage: npx tsx scripts/test-progress.ts
import { bestStreak, calendar, progressOf } from '../src/lib/progress';
import { localDate } from '../src/lib/review';

let failures = 0;
function check(label: string, ok: boolean, detail?: unknown) {
  if (ok) console.log(`✓ ${label}`);
  else { failures++; console.error(`✗ ${label}${detail !== undefined ? ` — ${JSON.stringify(detail)}` : ''}`); }
}

const rec = (box: number, right: number, wrong = 0) => ({ box, due_at: 0, right, wrong });
const p = progressOf(['a', 'b', 'c', 'd', 'e'], { a: rec(4, 4), b: rec(5, 6), c: rec(2, 2), d: rec(1, 0, 1) });
check('saved words are counted as new, learning or mastered', p.total === 5 && p.mastered === 2 && p.learning === 2 && p.new === 1, p);
check('a word never reviewed is new, even with a record', progressOf(['x'], { x: rec(0, 0) }).new === 1);
check('records for words no longer saved are ignored', progressOf(['a'], { a: rec(4, 4), z: rec(4, 4) }).mastered === 1);

const now = new Date(2026, 9, 23, 9, 30).getTime();
const day = (offset: number) => localDate(new Date(2026, 9, 23 - offset, 12).getTime());
const cal = calendar([day(0), day(2), day(29), day(30), '2020-01-01'], now);
check('the calendar is the last 30 days, oldest first, ending today', cal.length === 30 && cal[29].date === day(0) && cal[0].date === day(29) && cal[29].today && !cal[28].today);
check('review days are marked; older days are left out', cal.filter((d) => d.reviewed).map((d) => d.date).join() === [day(29), day(2), day(0)].join());
check('every day appears once, in order', new Set(cal.map((d) => d.date)).size === 30 && cal.every((d, i) => i === 0 || d.date > cal[i - 1].date));
// Across a daylight-saving change (Europe/US style clocks), days must neither repeat nor go missing.
const march = calendar([], new Date(2026, 2, 31, 23, 30).getTime());
check('no day repeats or goes missing across a clock change', new Set(march.map((d) => d.date)).size === 30 && march[29].date === '2026-03-31');

check('best streak: the longest run of consecutive days', bestStreak(['2026-10-01', '2026-10-02', '2026-10-03', '2026-10-05', '2026-10-06']) === 3);
check('best streak across a month end', bestStreak(['2026-09-29', '2026-09-30', '2026-10-01']) === 3);
check('best streak ignores duplicates and order', bestStreak(['2026-10-03', '2026-10-02', '2026-10-02', '2026-10-01']) === 3);
check('no review days: no streak', bestStreak([]) === 0);

if (failures) { console.error(`\n${failures} progress check(s) failed.`); process.exit(1); }
console.log('Progress checks passed.');
