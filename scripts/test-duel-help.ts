// Hint and Word balances (product spec §9): the daily allowance, spending, earning and old or broken storage.
// Usage: npx tsx scripts/test-duel-help.ts
import { balanceOf, earnInto, HELP, HELP_KEY, readWallet, rewardsFor, spendFrom } from '../src/duel/help-rules';
import { webHelp } from '../src/duel/platform/web/help';
import { earnReviewHint } from '../src/duel/platform/web/entry';
import type { Storage } from '../src/duel/platform/types';

let failures = 0;
function check(label: string, ok: boolean, detail?: unknown) {
  if (ok) console.log(`✓ ${label}`);
  else { failures++; console.error(`✗ ${label}${detail !== undefined ? ` — ${JSON.stringify(detail)}` : ''}`); }
}
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

function memory(): Storage & { mem: Map<string, string> } {
  const mem = new Map<string, string>();
  return {
    mem,
    get<T>(k: string): T | null { const v = mem.get(k); if (v === undefined) return null; try { return JSON.parse(v) as T; } catch { return null; } },
    has(k: string) { return mem.has(k); },
    set(k: string, v: unknown) { mem.set(k, JSON.stringify(v)); },
    remove(k: string) { mem.delete(k); },
  };
}

const D1 = '2026-11-05', D2 = '2026-11-06';

check('the numbers match the spec', same(HELP, { daily: { hint: 1, word: 1 }, winHint: 1, todayWord: 1, streakEvery: 7, streakHints: 3, reviewHint: 1 }), HELP);

// The wallet
check('a fresh wallet holds 1 Hint and 1 Word', same(balanceOf(readWallet(null, D1)), { hint: 1, word: 1 }));
{
  const w = earnInto(readWallet(null, D1), { hint: 2, word: 0 });
  check('earning adds to the balance', same(balanceOf(w), { hint: 3, word: 1 }));
  const s = spendFrom(w, 'hint')!;
  check('spending takes the free one first', s.free.hint === 0 && s.earned.hint === 2, s);
  const s2 = spendFrom(s, 'hint')!;
  check('then the earned ones', s2.free.hint === 0 && s2.earned.hint === 1, s2);
  const next = readWallet(s2, D2);
  check('the next day refills the free ones and keeps the earned', same(balanceOf(next), { hint: 2, word: 1 }) && next.day === D2, next);
  const fresh = readWallet(readWallet(null, D1), D2);
  check('the free ones do not stack', same(balanceOf(fresh), { hint: 1, word: 1 }), fresh);
  check('the same day keeps what was spent', same(balanceOf(readWallet(s2, D1)), { hint: 1, word: 1 }), readWallet(s2, D1));
}
check('spending with nothing left fails', spendFrom({ day: D1, free: { hint: 0, word: 0 }, earned: { hint: 0, word: 0 } }, 'word') === null);

// Old and broken storage (Review Focus 5)
check("the old stub's {hint,word} → a fresh wallet", same(balanceOf(readWallet({ hint: 0, word: 0 }, D1)), { hint: 1, word: 1 }));
for (const bad of ['x', 7, [], { day: D1 }, { day: D1, free: { hint: -1, word: 0 }, earned: { hint: 0, word: 0 } }, { day: D1, free: { hint: 1, word: 1 }, earned: { hint: 1.5, word: 0 } }]) {
  check(`broken storage ${JSON.stringify(bad)} → a fresh wallet`, same(balanceOf(readWallet(bad, D1)), { hint: 1, word: 1 }));
}

// The wallet on storage, with the day turning over while the app is open (Review Focus 1)
{
  const st = memory();
  let today = D1;
  const h = webHelp(st, () => today);
  check('wallet: spends', h.spend('hint') && same(h.balance(), { hint: 0, word: 1 }));
  check('wallet: refuses at zero', !h.spend('hint'));
  h.earn({ hint: 1, word: 0 });
  check('wallet: earned is usable at once', same(h.balance(), { hint: 1, word: 1 }));
  today = D2;
  check('wallet: refills at IST midnight without a reload', same(h.balance(), { hint: 2, word: 1 }), h.balance());
  st.mem.set(HELP_KEY, '{not json');
  check('wallet: unreadable JSON → a fresh wallet', same(h.balance(), { hint: 1, word: 1 }));
  check('wallet: spending from it works', h.spend('word') && same(h.balance(), { hint: 1, word: 0 }));
}

// Earning a finished game
const base = { won: true, practice: false, date: D1, today: D1, alreadyWon: false, streakBefore: 0, streakAfter: 1 };
check("winning today's daily: +1 Hint +1 Word", same(rewardsFor(base), { hint: 1, word: 1 }));
check('winning a past day: +1 Hint', same(rewardsFor({ ...base, date: '2026-11-01' }), { hint: 1, word: 0 }));
check('replaying a won day: +1 Hint only', same(rewardsFor({ ...base, alreadyWon: true, streakBefore: 7, streakAfter: 7 }), { hint: 1, word: 0 }));
check('a win that reaches a 7-day streak: +3 Hints more', same(rewardsFor({ ...base, streakBefore: 6, streakAfter: 7 }), { hint: 4, word: 1 }));
check('a past-day win that jumps a streak past 7 still pays', same(rewardsFor({ ...base, date: '2026-11-01', streakBefore: 6, streakAfter: 9 }), { hint: 4, word: 0 }));
check('a loss earns nothing', same(rewardsFor({ ...base, won: false }), { hint: 0, word: 0 }));
check('a practice win earns nothing', same(rewardsFor({ ...base, practice: true }), { hint: 0, word: 0 }));

// Panna's review session
{
  const st = memory();
  earnReviewHint(st, new Date('2026-11-05T12:00:00Z'));
  check('a finished review session: +1 Hint', same(balanceOf(readWallet(st.get(HELP_KEY), D1)), { hint: 2, word: 1 }));
}

if (failures) { console.error(`\n${failures} failed`); process.exit(1); }
console.log('\nAll duel help checks passed.');
