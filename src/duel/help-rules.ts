// Hint and Word balances, pure (product spec §9). The free allowance refills at 00:00 IST and doesn't stack;
// what you earn is yours until spent. Callers pass the day in; nothing here reads the clock or storage.

export const HELP_KEY = 'panna_duel_help';

export const HELP = { daily: { hint: 1, word: 1 }, winHint: 1, todayWord: 1, streakEvery: 7, streakHints: 3, reviewHint: 1 };

export type Gain = { hint: number; word: number };
export type Wallet = { day: string; free: Gain; earned: Gain };

const isCount = (n: unknown) => Number.isInteger(n) && (n as number) >= 0;
const isGain = (g: unknown): g is Gain => !!g && typeof g === 'object' && isCount((g as Gain).hint) && isCount((g as Gain).word);

/** The stored wallet on `today`: the free ones refilled on a new day, anything malformed starting afresh. */
export function readWallet(raw: unknown, today: string): Wallet {
  const w = raw as Wallet | null;
  const ok = !!w && typeof w === 'object' && typeof w.day === 'string' && isGain(w.free) && isGain(w.earned);
  return { day: today, free: ok && w.day === today ? { ...w.free } : { ...HELP.daily }, earned: ok ? { ...w.earned } : { hint: 0, word: 0 } };
}

export function balanceOf(w: Wallet): Gain {
  return { hint: w.free.hint + w.earned.hint, word: w.free.word + w.earned.word };
}

/** The wallet after spending one (the free ones first), or null when there are none. */
export function spendFrom(w: Wallet, kind: keyof Gain): Wallet | null {
  if (w.free[kind] > 0) return { ...w, free: { ...w.free, [kind]: w.free[kind] - 1 } };
  if (w.earned[kind] > 0) return { ...w, earned: { ...w.earned, [kind]: w.earned[kind] - 1 } };
  return null;
}

export function earnInto(w: Wallet, gain: Gain): Wallet {
  return { ...w, earned: { hint: w.earned.hint + gain.hint, word: w.earned.word + gain.word } };
}

/** What a finished game earns. A replay of a won day earns its Hint again, but no Word and no streak bonus. */
export function rewardsFor(o: { won: boolean; practice: boolean; date: string; today: string; alreadyWon: boolean; streakBefore: number; streakAfter: number }): Gain {
  if (!o.won || o.practice) return { hint: 0, word: 0 };
  const sevens = Math.floor(o.streakAfter / HELP.streakEvery) - Math.floor(o.streakBefore / HELP.streakEvery);
  return {
    hint: HELP.winHint + (o.alreadyWon ? 0 : Math.max(0, sevens) * HELP.streakHints),
    word: o.date === o.today && !o.alreadyWon ? HELP.todayWord : 0,
  };
}
