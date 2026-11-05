// The leaderboard's weeks: a week is named by its Monday in IST. Nothing "resets"; a new week is a new key.
import { addDays, istToday } from '../progress';

const istStart = (date: string) => new Date(`${date}T00:00:00+05:30`);

export function weekOf(at: Date): string {
  const today = istToday(at);
  const day = new Date(`${today}T00:00:00Z`).getUTCDay(); // 0 = Sunday
  return addDays(today, -((day + 6) % 7));
}

export const addWeeks = (week: string, n: number) => addDays(week, 7 * n);

/** The moment a week is over: the next Monday, 00:00 IST. */
export const weekEnds = (week: string) => istStart(addWeeks(week, 1));

/**
 * The week a finished game counts for (product spec §15.4): the week it was finished, and a game that arrives late
 * still counts for last week until Tuesday 00:00 IST. After that, or from a clock in the future, the week of now.
 */
export function creditWeek(finishedAt: Date, now: Date): string {
  const week = weekOf(finishedAt > now ? now : finishedAt), thisWeek = weekOf(now);
  if (week === addWeeks(thisWeek, -1) && now < istStart(addDays(thisWeek, 1))) return week;
  return thisWeek;
}
