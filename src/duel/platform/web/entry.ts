// What Panna's way into the Duel (the Today card, the Play tab, the header item) reads about it. Panna imports this;
// the Duel never imports Panna.
import type { SavedGame } from '../../ui/controller/types';
import { gameKey, playDate, readResults, RESULTS_KEY, SEEN_KEY, streak, wonDays } from '../../progress';
import type { ClientSchedule, Storage } from '../types';

/** Flip at launch: until then production shows the way in only on devices that have opened /play. */
export const DUEL_LAUNCHED = false;
const PRODUCTION_HOST = 'panna-ashen.vercel.app';
/** The puzzle a date without a daily puzzle plays (src/duel/platform/web/puzzles.ts). */
const PRACTICE_KEY = 'p0001.v1';

export function entryVisible(o: { launched: boolean; vercelEnv: string | undefined; host: string; seen: boolean }): boolean {
  return o.launched || o.seen || (o.vercelEnv !== 'production' && o.host !== PRODUCTION_HOST);
}

/** In the browser only (it reads location and localStorage). */
export function duelEntryVisible(storage: Storage): boolean {
  // NEXT_PUBLIC_DUEL_ENV is Vercel's VERCEL_ENV, copied in at build time by next.config.mjs (the manifest reads the same).
  return entryVisible({ launched: DUEL_LAUNCHED, vercelEnv: process.env.NEXT_PUBLIC_DUEL_ENV, host: location.hostname, seen: storage.has(SEEN_KEY) });
}

export function markDuelSeen(storage: Storage) {
  if (!storage.has(SEEN_KEY)) storage.set(SEEN_KEY, true);
}

type Scores = { you: number; quill: number };
/** `next`: the day Play opens, when it isn't today (an open past daily). */
export type TodayDuel = { date: string; practice: boolean; streak: number; next: string | null } & (
  | { state: 'new' }
  | ({ state: 'playing' } & Scores)
  /** `replaying`: a fresh game of the won day is under way. */
  | ({ state: 'won'; replaying: boolean } & Scores)
  /** Finished without a win: a loss or a tie. */
  | ({ state: 'over' } & Scores));

const keyOf = (s: SavedGame) => `${s.puzzleId}.v${s.puzzleVersion}`;

/** Today's duel for the Today card. `schedule` is null when it couldn't be loaded: today's save is then trusted. */
export function todayDuel(today: string, schedule: ClientSchedule | null, storage: Storage): TodayDuel {
  const raw = storage.get<SavedGame>(gameKey(today));
  const key = schedule?.dates[today];
  const practice = schedule ? !key : raw?.puzzleId === PRACTICE_KEY.split('.')[0];
  const results = readResults(storage.get(RESULTS_KEY));
  const won = wonDays(results);
  const next = playDate(Object.keys(schedule?.dates ?? {}), won, today);
  const base = { date: today, practice, streak: streak(won, today), next: next === today ? null : next };

  // A save made for another puzzle or version (a practice game on a day that now has its daily, a republished fix)
  // starts fresh in the game too.
  const save = raw && typeof raw === 'object' && (!schedule || keyOf(raw) === (key ?? PRACTICE_KEY)) && raw.score
    && Number.isFinite(raw.score.you) && Number.isFinite(raw.score.quill) ? raw : null;
  const score = save?.score;

  const win = practice ? null : [...results].reverse().find(r => r.date === today && r.you > r.quill);
  if (win) return { ...base, state: 'won', you: win.you, quill: win.quill, replaying: !!save && !save.over };
  if (save && score && !save.over) return { ...base, state: 'playing', ...score };
  if (save && score) return score.you > score.quill ? { ...base, state: 'won', ...score, replaying: false } : { ...base, state: 'over', ...score };
  return { ...base, state: 'new' };
}
