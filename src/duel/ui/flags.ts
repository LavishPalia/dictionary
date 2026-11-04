// URL flags for tests, playtests and the perf gate. None of them changes the rules: a fixed seed only
// fixes the deal, which a player could get anyway by re-rolling (tech design §2.3).

export type Tier = 'normal' | 'lite';

export interface Flags {
  /** A fixed game seed (uint32). Also turns on the test hook, window.__duel. */
  seed?: number;
  /** Forces a quality tier instead of picking one from the device. */
  tier?: Tier;
  /** Records performance marks for scripts/duel/perf-phone.mjs. */
  perf: boolean;
  /** window.__duel is exposed (set when a seed is given). */
  test: boolean;
  /** Start a new deal of this day; taken off the address once used, so a reload doesn't restart. */
  fresh: boolean;
}

export function readFlags(search: string): Flags {
  const q = new URLSearchParams(search);
  const raw = q.get('seed');
  const n = raw !== null && /^\d+$/.test(raw) ? Number(raw) : NaN;
  const seed = Number.isInteger(n) && n >= 0 && n <= 0xffffffff ? n : undefined;
  const t = q.get('tier');
  return {
    seed,
    tier: t === 'normal' || t === 'lite' ? t : undefined,
    perf: q.get('perf') === '1',
    test: seed !== undefined,
    fresh: q.get('fresh') === '1',
  };
}
