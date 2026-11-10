// Checks the daily goal's counting (src/lib/today-words.ts): which words count today, once each, in what order,
// across midnight; and the goal number's reading and limits. Usage: npx tsx scripts/test-today-words.ts
import { clampGoal, GOAL_MAX, GOAL_MIN, readGoal, todaysWords } from '../src/lib/today-words';
import type { ReviewRecords } from '../src/lib/review';

let checks = 0, failures = 0;
function check(label: string, ok: boolean, detail?: unknown) {
  checks++;
  if (ok) console.log(`✓ ${label}`);
  else { failures++; console.error(`✗ ${label}${detail !== undefined ? ` — ${JSON.stringify(detail)}` : ''}`); }
}

const at = (day: number, h: number, m = 0) => new Date(2026, 10, day, h, m).getTime();
const NOW = at(8, 15);
const saved = (headword: string, saved_at?: number) => ({ normalized: headword.toLowerCase(), headword, saved_at });
const rec = (last_at?: number) => ({ box: 1, due_at: NOW + 86400000, right: 1, wrong: 0, last_at });

const none = todaysWords([], {}, NOW);
check('nothing saved or reviewed: no words', none.length === 0);

const words = todaysWords(
  [saved('Abandon', at(8, 9)), saved('Serendipity', at(7, 23, 59)), saved('Rigour', at(8, 11)), saved('Old'), saved('Both', at(8, 14))],
  { gone: rec(at(8, 10)), rigour: rec(at(8, 8)), serendipity: rec(at(7, 20)), both: rec(at(8, 12)), never: rec() } as ReviewRecords,
  NOW,
);
const keys = words.map((w) => w.normalized);
check('a word saved today counts', keys.includes('abandon'));
check('a word reviewed today counts', keys.includes('gone'));
check('saved yesterday at 23:59 and reviewed yesterday: not today', !keys.includes('serendipity'));
check('a word saved with no time does not count', !keys.includes('old'));
check('a review record with no last answer does not count', !keys.includes('never'));
check('saved and reviewed today: counted once', keys.filter((k) => k === 'both').length === 1 && keys.filter((k) => k === 'rigour').length === 1);
check('the time is the earlier of the two', words.find((w) => w.normalized === 'rigour')?.at === at(8, 8) && words.find((w) => w.normalized === 'both')?.at === at(8, 12));
check('in the order they were met', JSON.stringify(keys) === JSON.stringify(['rigour', 'abandon', 'gone', 'both']), keys);
check('a saved word shows its headword', words.find((w) => w.normalized === 'abandon')?.word === 'Abandon');
check('a reviewed but unsaved word shows its key', words.find((w) => w.normalized === 'gone')?.word === 'gone');

// Across midnight: the same data, a minute after midnight.
const after = todaysWords([saved('Abandon', at(8, 23, 59))], { gone: rec(at(8, 23, 30)) } as ReviewRecords, at(9, 0, 1));
check('after midnight, yesterday\'s words drop out', after.length === 0, after);
const before = todaysWords([saved('Abandon', at(8, 23, 59))], {}, at(8, 23, 59, ));
check('a minute before midnight, the word still counts', before.length === 1);
// Saved today and then unsaved: no longer in the saved list, so it counts only if reviewed today.
check('a word unsaved again (not reviewed) drops out', todaysWords([], {}, NOW).length === 0);
check('a word unsaved again but reviewed today stays', todaysWords([], { kept: rec(at(8, 9)) } as ReviewRecords, NOW).length === 1);

// The goal number.
check('range constants 1–50', GOAL_MIN === 1 && GOAL_MAX === 50);
check('no goal stored: 10', readGoal({}) === 10 && readGoal(null) === 10 && readGoal('junk') === 10);
check('a stored goal reads back', readGoal({ dailyGoal: 20 }) === 20 && readGoal({ dailyGoal: 1 }) === 1 && readGoal({ dailyGoal: 50 }) === 50);
check('out of range or not a whole number: 10', [0, 51, -3, 7.5, '12', NaN, null].every((g) => readGoal({ dailyGoal: g }) === 10));
check('clampGoal keeps 1–50 and rounds', clampGoal(0) === 1 && clampGoal(51) === 50 && clampGoal(7.6) === 8 && clampGoal(12) === 12 && clampGoal(NaN) === 10);

console.log(`\nToday's words: ${checks - failures}/${checks} checks passed.`);
if (failures) process.exit(1);
