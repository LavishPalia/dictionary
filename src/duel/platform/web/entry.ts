// What Panna's way into the Duel (the Today card, the Play tab, the header item) reads about it. Panna imports this;
// the Duel never imports Panna.
import type { SavedGame } from '../../ui/controller/types';
import { gameKey, playDate, readResults, RESULTS_KEY, SEEN_KEY, streak, wonDays } from '../../progress';
import type { ClientSchedule, Storage } from '../types';

/** Flip at launch: until then production shows the way in only on devices that have opened /play. */
export const DUEL_LAUNCHED = false;
const PRODUCTION_HOST = 'panna-ashen.vercel.app';
/** The puzzle a date without a daily puzzle plays (src/duel/platform/web/puzzles.ts). */
const PRACTICE_ID = 'p0001';

export function entryVisible(o: { launched: boolean; vercelEnv: string | undefined; host: string; seen: boolean }): boolean {
  return o.launched || o.seen || (o.vercelEnv !== 'production' && o.host !== PRODUCTION_HOST);
}

/** In the browser only (it reads location and localStorage). */
export function duelEntryVisible(storage: Storage): boolean {
  return entryVisible({ launched: DUEL_LAUNCHED, vercelEnv: process.env.NEXT_PUBLIC_VERCEL_ENV, host: location.hostname, seen: storage.has(SEEN_KEY) });
}

export function markDuelSeen(storage: Storage) {
  if (!storage.has(SEEN_KEY)) storage.set(SEEN_KEY, true);
}

type Scores = { you: number; quill: number };
export type TodayDuel = { date: string; practice: boolean; streak: number } & (
  | { state: 'new' }
  | ({ state: 'playing' } & Scores)
  /** `next`: the day Play opens now, when it isn't today. */
  | ({ state: 'won'; next: string | null } & Scores)
  | ({ state: 'lost' } & Scores));

/** Today's duel for the Today card. `schedule` is null when it couldn't be loaded: today's save is then trusted. */
export function todayDuel(today: string, schedule: ClientSchedule | null, storage: Storage): TodayDuel {
  const key = schedule?.dates[today];
  const practice = schedule ? !key : storage.get<SavedGame>(gameKey(today))?.puzzleId === PRACTICE_ID;
  const results = readResults(storage.get(RESULTS_KEY));
  const won = wonDays(results);
  const base = { date: today, practice, streak: streak(won, today) };

  // A save made for another puzzle (a practice game on a day that now has its daily) starts fresh in the game too.
  const raw = storage.get<SavedGame>(gameKey(today));
  const expected = schedule ? (key ? key.split('.')[0] : PRACTICE_ID) : raw?.puzzleId;
  const save = raw && typeof raw === 'object' && raw.puzzleId === expected && raw.score
    && Number.isFinite(raw.score.you) && Number.isFinite(raw.score.quill) ? raw : null;

  if (save && !save.over) return { ...base, state: 'playing', ...save.score! };
  const win = practice ? null : [...results].reverse().find(r => r.date === today && r.you > r.quill);
  if (win || (practice && save && save.score!.you > save.score!.quill)) {
    const next = playDate(Object.keys(schedule?.dates ?? {}), won, today);
    return { ...base, state: 'won', you: win ? win.you : save!.score!.you, quill: win ? win.quill : save!.score!.quill, next: next === today ? null : next };
  }
  if (save) return { ...base, state: 'lost', ...save.score! };
  return { ...base, state: 'new' };
}
