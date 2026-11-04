// What Panna's way into the Duel (the Today card, the Play tab, the header item) reads about it. Panna imports this;
// the Duel never imports Panna.
import { RULES_ID } from '../../engine';
import type { SavedGame } from '../../ui/controller/types';
import { earnInto, HELP, HELP_KEY, readWallet } from '../../help-rules';
import { gameKey, istToday, playDate, readResults, RESULTS_KEY, SEEN_KEY, streak, wonDays } from '../../progress';
import type { ClientSchedule, Storage } from '../types';

/** Launched 5 Nov 2026. While false, production shows the way in only on devices that have opened /play. */
export const DUEL_LAUNCHED = true;
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

/** A finished review session in Panna earns a Hint (product spec §9). */
export function earnReviewHint(storage: Storage, now = new Date()) {
  storage.set(HELP_KEY, earnInto(readWallet(storage.get(HELP_KEY), istToday(now)), { hint: HELP.reviewHint, word: 0 }));
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

/**
 * A stored game the game itself would restore: same rules and same puzzle. A save for another puzzle or version
 * (a practice game on a day that now has its daily, a republished fix) or under other rules (Quill retuned) starts
 * fresh. With `key` null the puzzle isn't known (the schedule couldn't be loaded), so it is trusted.
 */
export function matchingSave(raw: unknown, key: string | null): SavedGame | null {
  const s = raw as SavedGame | null;
  return s && typeof s === 'object' && s.rules === RULES_ID && (key === null || keyOf(s) === key) && s.score
    && Number.isFinite(s.score.you) && Number.isFinite(s.score.quill) ? s : null;
}

/** Today's duel for the Today card. `schedule` is null when it couldn't be loaded: today's save is then trusted. */
export function todayDuel(today: string, schedule: ClientSchedule | null, storage: Storage): TodayDuel {
  const raw = storage.get<SavedGame>(gameKey(today));
  const key = schedule?.dates[today];
  const practice = schedule ? !key : raw?.puzzleId === PRACTICE_KEY.split('.')[0];
  const results = readResults(storage.get(RESULTS_KEY));
  const won = wonDays(results);
  const next = playDate(Object.keys(schedule?.dates ?? {}), won, today);
  const base = { date: today, practice, streak: streak(won, today), next: next === today ? null : next };

  const save = matchingSave(raw, schedule ? key ?? PRACTICE_KEY : null);
  const score = save?.score;

  const win = practice ? null : [...results].reverse().find(r => r.date === today && r.you > r.quill);
  if (win) return { ...base, state: 'won', you: win.you, quill: win.quill, replaying: !!save && !save.over };
  if (save && score && !save.over) return { ...base, state: 'playing', ...score };
  if (save && score) return score.you > score.quill ? { ...base, state: 'won', ...score, replaying: false } : { ...base, state: 'over', ...score };
  return { ...base, state: 'new' };
}

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
export const dayMonth = (date: string) => `${Number(date.slice(8))} ${MONTHS[Number(date.slice(5, 7)) - 1]}`;

/** The headline of a TodayDuel, on the Today card and the game home. */
export function duelLine(d: TodayDuel): string {
  switch (d.state) {
    case 'new': return !d.practice ? 'Today’s puzzle is ready' : d.next ? 'No new puzzle today' : 'Practice duel';
    case 'playing': return d.you > d.quill ? `You lead ${d.you} to ${d.quill}` : d.you < d.quill ? `Quill leads ${d.quill} to ${d.you}` : `Level at ${d.you}`;
    case 'won': return `Won ${d.you} to ${d.quill}${d.practice ? '' : ' ★'}`;
    case 'over': return d.you === d.quill ? `A tie at ${d.you}` : `Quill won ${d.quill} to ${d.you}`;
  }
}

export function duelSubLine(d: TodayDuel): string | null {
  if (d.state === 'new') return d.practice && d.next ? `${dayMonth(d.next)}’s duel is still open.` : 'A word duel against Professor Quill.';
  if (d.state === 'over' && !d.practice) return d.you === d.quill ? 'Replay to break the tie and earn today’s star.' : 'Replay to earn today’s star.';
  return null;
}

/** The one button: `?fresh=1` asks the game for a new deal (a finished game's save would reopen its end screen). */
export function duelAction(d: TodayDuel): { href: string; label: string } | null {
  const today = `/play/game/${d.date}`, next = d.next ? { href: `/play/game/${d.next}`, label: `Play ${dayMonth(d.next)}` } : null;
  switch (d.state) {
    case 'new': return next || { href: today, label: d.practice ? 'Play practice duel' : 'Play today’s duel' };
    case 'playing': return { href: today, label: 'Continue' };
    case 'won': return d.replaying ? { href: today, label: 'Continue replay' } : next;
    case 'over': return { href: `${today}?fresh=1`, label: 'Replay' };
  }
}
