// The Duel's own little router on top of the History API, so the same package can mount outside Next.
// /play picks the day to play (DuelApp, from the schedule); /play/game/YYYY-MM-DD plays it. Everything else lands
// on today's game. (M4b puts the game home at /play.)

import { istToday } from '../progress';

export { istToday };

export type Route = { screen: 'play' } | { screen: 'game'; date: string } | { redirect: string };

/** A real calendar date, written YYYY-MM-DD (so 2026-02-30 is not one). */
function isDate(s: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

/** What a /play path shows. A future, malformed or unknown path goes to today's game. */
export function parsePath(path: string, today: string): Route {
  const toToday: Route = { redirect: `/play/game/${today}` };
  if (/^\/play\/?$/.test(path)) return { screen: 'play' };
  const m = /^\/play\/game\/([^/]+)\/?$/.exec(path);
  if (!m) return toToday;
  const date = m[1];
  if (!isDate(date) || date > today) return toToday;
  return { screen: 'game', date };
}
