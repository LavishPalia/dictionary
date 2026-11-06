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
  /** Show the coached first game again. A fixed seed (a test) otherwise skips the guide's tips. */
  guide: boolean;
  /** The lab's trial scoring speed. */
  pace?: number;
  ramp?: number;
}

function speedFlag(raw: string | null): number | undefined {
  const n = raw === null ? NaN : Number(raw);
  return n >= 0.2 && n <= 1.5 ? n : undefined;
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
    guide: q.get('guide') === '1',
    pace: speedFlag(q.get('pace')),
    ramp: speedFlag(q.get('ramp')),
  };
}
