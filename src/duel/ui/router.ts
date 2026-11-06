// The Duel's own little router on top of the History API, so the same package can mount outside Next.
// /play is the game home, /play/game/YYYY-MM-DD plays a day, /play/settings, /play/how and /play/ranks are what they say.
// Everything else lands on today's game.

import { istToday } from '../progress';

export { istToday };

export type Route = { screen: 'home' } | { screen: 'settings' } | { screen: 'how' } | { screen: 'ranks' } | { screen: 'game'; date: string } | { redirect: string };

/** A real calendar date, written YYYY-MM-DD (so 2026-02-30 is not one). */
function isDate(s: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

/** What a /play path shows. A future, malformed or unknown path goes to today's game. */
export function parsePath(path: string, today: string): Route {
  const toToday: Route = { redirect: `/play/game/${today}` };
  if (/^\/play\/?$/.test(path)) return { screen: 'home' };
  if (/^\/play\/settings\/?$/.test(path)) return { screen: 'settings' };
  if (/^\/play\/how\/?$/.test(path)) return { screen: 'how' };
  if (/^\/play\/ranks\/?$/.test(path)) return { screen: 'ranks' };
  const m = /^\/play\/game\/([^/]+)\/?$/.exec(path);
  if (!m) return toToday;
  const date = m[1];
  if (!isDate(date) || date > today) return toToday;
  return { screen: 'game', date };
}

/** The address an offline visit asked for (the service worker's /play?to=…): a /play path on this site, or null. */
export function landingPath(search: string, origin: string): string | null {
  const to = new URLSearchParams(search).get('to');
  if (!to) return null;
  try {
    const u = new URL(to, origin);
    return u.origin === origin && /^\/play(\/|$)/.test(u.pathname) ? u.pathname + u.search : null;
  } catch { return null; }
}
