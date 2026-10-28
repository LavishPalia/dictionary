// Checks the study-guide "next step" rules (src/lib/learn.ts). Usage: npx tsx scripts/test-learn.ts
import { nextStep, savedToday, NEW_WORDS_PER_DAY } from '../src/lib/learn';

let failures = 0;
function check(label: string, ok: boolean, detail?: unknown) {
  if (ok) console.log(`✓ ${label}`);
  else { failures++; console.error(`✗ ${label}${detail !== undefined ? ` — ${JSON.stringify(detail)}` : ''}`); }
}

const DAY = 24 * 60 * 60 * 1000;
const now = new Date(2026, 9, 24, 9, 0).getTime();
const yesterday = new Date(2026, 9, 23, 23, 59).getTime();
const words = (n: number, at?: number) => Array.from({ length: n }, (_, i) => ({ normalized: `w${at ?? 'x'}${i}`, saved_at: at }));

let s = nextStep({ saved: [], dueCount: 0, lastBackupAt: null, now });
check('no saved words: first-save', s.id === 'first-save' && s.count === undefined, s);

s = nextStep({ saved: words(1, now), dueCount: 312, lastBackupAt: null, now });
check('due words: review with the full count', s.id === 'review' && s.count === 312, s);

s = nextStep({ saved: words(25, yesterday), dueCount: 0, lastBackupAt: null, now });
check('25 words, never backed up: backup', s.id === 'backup', s);
s = nextStep({ saved: words(25, yesterday), dueCount: 0, lastBackupAt: now - 31 * DAY, now });
check('backup 31 days old: backup', s.id === 'backup', s);
s = nextStep({ saved: words(25, yesterday), dueCount: 0, lastBackupAt: now - 29 * DAY, now });
check('backup 29 days old: not backup', s.id !== 'backup', s);

s = nextStep({ saved: [...words(3, now), ...words(5, yesterday)], dueCount: 0, lastBackupAt: now, now });
check('3 saved today: add-words, 7 to go', s.id === 'add-words' && s.count === 7, s);
s = nextStep({ saved: words(10, now), dueCount: 0, lastBackupAt: now, now });
check('10 saved today: done-today', s.id === 'done-today', s);

check('saved 23:59 yesterday counts 0 today', savedToday(words(1, yesterday), now) === 0);
check('no saved_at counts 0', savedToday(words(1), now) === 0);
check('12 saved today: savedToday is 12, uncapped', savedToday(words(12, now), now) === 12 && NEW_WORDS_PER_DAY === 10);

if (failures) { console.error(`\n${failures} learn check(s) failed.`); process.exit(1); }
console.log('\nLearn checks passed.');
