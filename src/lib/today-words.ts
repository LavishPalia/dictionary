// The daily goal, "Today's words": every word saved or answered in Review today (the device's clock) counts once.
// Worked out from data Panna already keeps (saved_at on saved words, last_at on review records): no word log.
import { NEW_WORDS_PER_DAY } from './learn';
import type { ReviewRecords } from './review';

export const GOAL_MIN = 1, GOAL_MAX = 50;

export interface TodayWord {
  normalized: string;
  /** The saved entry's headword; a word reviewed but no longer saved shows its key (the lower-case headword). */
  word: string;
  /** When it was first met today (the earlier of its save and its review). */
  at: number;
}

interface SavedLike { normalized: string; headword: string; saved_at?: number }

const midnightOf = (now: number) => { const d = new Date(now); return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime(); };

/** Today's words in the order they were met. A word saved today and then unsaved drops out, unless reviewed today. */
export function todaysWords(saved: readonly SavedLike[], records: ReviewRecords, now: number): TodayWord[] {
  const from = midnightOf(now), until = from + 86_400_000;
  const today = (t: number | undefined): t is number => typeof t === 'number' && t >= from && t < until;
  const words = new Map<string, TodayWord>();
  for (const w of saved) if (today(w.saved_at)) words.set(w.normalized, { normalized: w.normalized, word: w.headword, at: w.saved_at });
  const headword = new Map(saved.map((w) => [w.normalized, w.headword]));
  for (const [key, r] of Object.entries(records)) {
    if (!today(r.last_at)) continue;
    const had = words.get(key);
    if (had) had.at = Math.min(had.at, r.last_at);
    else words.set(key, { normalized: key, word: headword.get(key) ?? key, at: r.last_at });
  }
  return [...words.values()].sort((a, b) => a.at - b.at);
}

/** A goal from 1 to 50 (rounded); anything else is the default. */
export function clampGoal(n: number): number {
  if (!Number.isFinite(n)) return NEW_WORDS_PER_DAY;
  return Math.max(GOAL_MIN, Math.min(GOAL_MAX, Math.round(n)));
}

/** The goal from a parsed panna_settings value: `dailyGoal` when it is a whole number in range, else the default (10). */
export function readGoal(settings: unknown): number {
  const g = settings && typeof settings === 'object' ? (settings as { dailyGoal?: unknown }).dailyGoal : undefined;
  return typeof g === 'number' && Number.isInteger(g) && g >= GOAL_MIN && g <= GOAL_MAX ? g : NEW_WORDS_PER_DAY;
}
