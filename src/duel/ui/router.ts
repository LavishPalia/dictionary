// The Duel's own little router on top of the History API, so the same package can mount outside Next.
// M2 has one screen: /play/game/YYYY-MM-DD. Everything else lands on today's game.

export type Route = { screen: 'game'; date: string } | { redirect: string };

const IST_OFFSET_MS = (5 * 60 + 30) * 60 * 1000;

/** Today's date (YYYY-MM-DD) in India: the Duel's day starts at 00:00 IST. */
export function istToday(now: Date): string {
  return new Date(now.getTime() + IST_OFFSET_MS).toISOString().slice(0, 10);
}

/** A real calendar date, written YYYY-MM-DD (so 2026-02-30 is not one). */
function isDate(s: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

/** What a /play path shows. A future, malformed or unknown path goes to today's game. */
export function parsePath(path: string, today: string): Route {
  const toToday: Route = { redirect: `/play/game/${today}` };
  const m = /^\/play\/game\/([^/]+)\/?$/.exec(path);
  if (!m) return toToday;
  const date = m[1];
  if (!isDate(date) || date > today) return toToday;
  return { screen: 'game', date };
}
