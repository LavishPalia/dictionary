// Checks the study-guide "next step" rules (src/lib/learn.ts). Usage: npx tsx scripts/test-learn.ts
import { nextStep, savedToday, NEW_WORDS_PER_DAY } from '../src/lib/learn';
import { NEXT_STEP_TEXT } from '../src/lib/learn-content';

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

// Next-step copy: singular and plural in both languages, and the Save button's real label.
let t = NEXT_STEP_TEXT.review(1, 1);
check('1 due: singular in English and Hindi', t.en === 'Review your 1 due word (about 1 minute).' && t.hi === 'Review में आपका 1 शब्द तैयार है (लगभग 1 मिनट)।', t);
t = NEXT_STEP_TEXT.review(12, 2);
check('12 due: plural in English and Hindi', t.en === 'Review your 12 due words (about 2 minutes).' && t.hi === 'Review में आपके 12 शब्द तैयार हैं (लगभग 2 मिनट)।', t);
t = NEXT_STEP_TEXT['add-words'](1);
check('1 word left today: "1 more", not "up to 1"', t.en === 'Add 1 more new word today.' && t.hi === 'आज 1 और नया शब्द जोड़ें।', t);
t = NEXT_STEP_TEXT['add-words'](7);
check('7 words left today: "up to 7"', t.en === 'Add up to 7 new words today.' && t.hi === 'आज 7 तक नए शब्द जोड़ें।', t);
t = NEXT_STEP_TEXT['first-save']();
check('first save names the "Save word" button', t.en.includes('tap Save word.') && t.hi.includes('Save word छुएँ'), t);

if (failures) { console.error(`\n${failures} learn check(s) failed.`); process.exit(1); }
console.log('\nLearn checks passed.');
