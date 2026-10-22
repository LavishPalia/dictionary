// Checks the review scheduler (src/lib/review.ts). Usage: npx tsx scripts/test-review.ts
import { answer, comesBackLabel, daysUntil, dueWords, MASTERED_BOX, newRecord, nextDue, questionKind, statusOf } from '../src/lib/review';

let failures = 0;
function check(label: string, ok: boolean, detail?: unknown) {
  if (ok) console.log(`✓ ${label}`);
  else { failures++; console.error(`✗ ${label}${detail !== undefined ? ` — ${JSON.stringify(detail)}` : ''}`); }
}

const DAY = 24 * 60 * 60 * 1000;
const now = new Date(2026, 9, 22, 21, 30).getTime(); // 9:30 pm, so "tomorrow" must not mean 24 hours later

const fresh = newRecord(now);
check('a new word is due immediately and counts as new', fresh.due_at === now && statusOf(fresh) === 'new');

let r = answer(fresh, true, now);
check('first right answer: box 1, back tomorrow', r.box === 1 && daysUntil(r, now) === 1 && comesBackLabel(daysUntil(r, now)) === 'tomorrow', r);
check('"tomorrow" is tomorrow morning, not 24 hours later', new Date(r.due_at).getHours() === 0 && r.due_at < now + DAY);
check('answered once: learning', statusOf(r) === 'learning');

const steps = [1, 3, 7, 16, 35];
r = fresh;
const seen: number[] = [];
for (let i = 0; i < 6; i++) { r = answer(r, true, now); seen.push(daysUntil(r, now)); }
check('right answers step through 1, 3, 7, 16, 35 days and stay at 35', seen.join() === [...steps, 35].join(), seen);
check(`box ${MASTERED_BOX}+ is mastered`, statusOf(r) === 'mastered');

const wrong = answer(r, false, now);
check('a wrong answer sends even a mastered word back to tomorrow', wrong.box === 1 && daysUntil(wrong, now) === 1 && statusOf(wrong) === 'learning', wrong);
check('right/wrong counts are kept', wrong.right === 6 && wrong.wrong === 1, wrong);

const records = {
  a: { ...newRecord(now - 3 * DAY) },
  b: answer(newRecord(now), true, now), // tomorrow
  c: { ...newRecord(now - DAY) },
};
check('due words: overdue first, future words excluded, unknown saved words due', dueWords(['b', 'a', 'c', 'd'], records, now).join() === 'd,a,c', dueWords(['b', 'a', 'c', 'd'], records, now));
check('a session is capped', dueWords(Array.from({ length: 30 }, (_, i) => `w${i}`), {}, now).length === 20);
const next = nextDue(['a', 'b'], records, now);
check('next review day and how many words then', next !== null && next.count === 1 && daysUntil({ ...records.b }, now) === 1, next);
check('nothing in the future → no next review', nextDue(['a'], records, now) === null);

check('new and shaky words get English → Hindi', questionKind(undefined, 7) === 'meaning' && questionKind(answer(fresh, true, now), 7) === 'meaning');
const later = answer(answer(fresh, true, now), true, now);
check('later boxes mix question directions', new Set([0, 1, 2].map((s) => questionKind(later, s))).size === 3);

if (failures) { console.error(`\n${failures} review check(s) failed.`); process.exit(1); }
console.log('\nReview scheduler checks passed.');
