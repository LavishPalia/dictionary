// The weekly leaderboard: real players and house bots together. Rows never carry a player id.
import { authenticate } from './auth';
import { query } from './db';
import { botsFor } from './housebots';
import { guard, json } from './http';
import { addWeeks, weekEnds, weekOf } from '../week';

const TOP = 100;
const BOARD_CACHE = 'public, s-maxage=30, stale-while-revalidate=300';

const realCount = async (week: string) => (await query<{ n: number }>(`select count(*)::int as n from weekly_totals where week = $1::text::date`, [week]))[0].n;

/** Above you: more points, or the same points reached earlier. On equal points a real player stays above a bot. */
export async function rankOf(points: number, updatedAt: string, week: string, now: Date): Promise<number> {
  const [row] = await query<{ n: number }>(
    `select count(*)::int as n from weekly_totals where week = $1::text::date and (points > $2::int or (points = $2::int and updated_at < $3::text::timestamptz))`,
    [week, points, updatedAt]);
  return row.n + botsFor(week, now).filter(b => b.points > points).length + 1;
}

export async function standing(playerId: string, week: string, now: Date) {
  const [row] = await query<{ points: number; games: number; updated_at: string }>(
    `select points, games, updated_at::text from weekly_totals where player_id = $1::uuid and week = $2::text::date`, [playerId, week]);
  if (!row) return { points: 0, games: 0, rank: null };
  return { points: row.points, games: row.games, rank: await rankOf(row.points, row.updated_at, week, now) };
}

/** `this` or `last` as a week key; null for anything else. */
function weekParam(req: Request, now: Date): string | null {
  const w = new URL(req.url).searchParams.get('week') ?? 'this';
  return w === 'this' ? weekOf(now) : w === 'last' ? addWeeks(weekOf(now), -1) : null;
}

/** GET /api/duel/leaderboard?week=this|last */
export const getBoard = (req: Request, now = new Date()) => guard(async () => {
  const week = weekParam(req, now);
  if (!week) return json({ error: 'bad_request' }, 400);
  const real = await query<{ name: string; points: number }>(
    `select p.name, t.points from weekly_totals t join players p on p.id = t.player_id
     where t.week = $1::text::date order by t.points desc, t.updated_at limit ${TOP}`, [week]);
  const bots = botsFor(week, now);
  // Sorting is stable and real players go first, so a bot on equal points sits below them.
  const rows = [...real.map(r => ({ name: r.name, points: r.points, bot: false })), ...bots.map(b => ({ name: b.name, points: b.points, bot: true }))]
    .sort((a, b) => b.points - a.points).slice(0, TOP).map((r, i) => ({ rank: i + 1, ...r }));
  const players = (await realCount(week)) + bots.length;
  return json({ week, endsAt: weekEnds(week).toISOString(), players, rows }, 200, { 'Cache-Control': BOARD_CACHE });
});

/** GET /api/duel/leaderboard/me?week=this|last */
export const getMe = (req: Request, now = new Date()) => guard(async () => {
  const me = await authenticate(req);
  if (!me) return json({ error: 'unauthorized' }, 401);
  const week = weekParam(req, now);
  if (!week) return json({ error: 'bad_request' }, 400);
  const mine = await standing(me.id, week, now);
  return json({ name: me.name, week, ...mine, of: (await realCount(week)) + botsFor(week, now).length });
});
