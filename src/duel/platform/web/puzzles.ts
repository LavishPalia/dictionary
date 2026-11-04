// Puzzles on the web: the build's schedule (public/duel/schedule.json) says which published puzzle each date plays.
// A date with no puzzle plays the practice puzzle p0001 (p0000 stays as the engine's test fixture).
// A failed request is an error, never a practice game: that would replace a saved daily game.
import { checkPuzzleShape, type Puzzle } from '../../engine';
import type { ClientSchedule, DatedPuzzle, PuzzleSource } from '../types';

const SCHEDULE_URL = '/duel/schedule.json';
const SCHEDULE_TTL_MS = 60_000;

const isMap = (v: unknown): v is Record<string, string> =>
  !!v && typeof v === 'object' && !Array.isArray(v) && Object.values(v).every(x => typeof x === 'string');

async function practice(): Promise<Puzzle> {
  const mod = await import('../../../../data/duel/puzzles/p0001.json');
  return (mod.default ?? mod) as unknown as Puzzle;
}

/** The puzzle a key ("p0002.v1") names, checked so a stale or broken file can't start a game. */
function checked(p: Puzzle, key: string): Puzzle {
  let problems: string[];
  try { problems = checkPuzzleShape(p); } catch { problems = ['unreadable']; }
  if (problems.length || `${p.id}.v${p.version}` !== key) throw new Error(`puzzle ${key} is not valid`);
  return p;
}

export function webPuzzles(fetchFn: typeof fetch = (...a) => fetch(...a)): PuzzleSource {
  let cached: { at: number; s: Promise<ClientSchedule> } | null = null;

  async function load(): Promise<ClientSchedule> {
    const res = await fetchFn(SCHEDULE_URL, { cache: 'no-cache' });
    if (!res.ok) throw new Error(`schedule: HTTP ${res.status}`);
    const s = await res.json() as ClientSchedule;
    if (!s || !isMap(s.dates) || !isMap(s.files)) throw new Error('schedule: wrong shape');
    return s;
  }

  function schedule(): Promise<ClientSchedule> {
    if (!cached || Date.now() - cached.at > SCHEDULE_TTL_MS) {
      const s = load();
      cached = { at: Date.now(), s };
      s.catch(() => { if (cached?.s === s) cached = null; }); // a failure is retried next time
    }
    return cached.s;
  }

  return {
    schedule,
    async forDate(date) {
      const { dates, files } = await schedule();
      const key = dates[date];
      if (!key) return { puzzle: await practice(), practice: true };
      if (!files[key]) throw new Error(`schedule: no file for ${key}`);
      const res = await fetchFn(`/duel/p/${files[key]}`);
      if (!res.ok) throw new Error(`puzzle ${key}: HTTP ${res.status}`);
      return { puzzle: checked(await res.json() as Puzzle, key), practice: false };
    },
  };
}
