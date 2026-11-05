// POST /api/duel/games: a finished game comes in, is replayed, and counts once.
// A game's identity is (player, puzzle, seed): seeds are 32 random bits per deal, so a retry, or the same deal
// finished on a second device after a backup was restored, can't count twice.
import { authenticate } from './auth';
import { standing } from './board';
import { checkGame, readReport, type ReportedGame, type RejectReason } from './check';
import { query } from './db';
import { guard, json, readJson } from './http';
import { sweepEvents } from './rate';
import { creditWeek, weekOf } from '../week';

const MAX_BODY = 32 * 1024;
const GAMES_PER_HOUR = 30;

const INSERT = `
  with g as (
    insert into games (player_id, puzzle, seed, rules, date, actions, score, quill_score, started_at, finished_at, received_at, week, status, reject_reason)
    values ($1::uuid, $2, $3::text::bigint, $4, $5::text::date, $6::text::jsonb, $7::int, $8::int, $9::text::timestamptz, $10::text::timestamptz, $11::text::timestamptz, $12::text::date, $13, $14)
    on conflict (player_id, puzzle, seed) do nothing
    returning score, status
  ), t as (
    insert into weekly_totals (player_id, week, points, games, updated_at)
    select $1::uuid, $12::text::date, score, 1, $11::text::timestamptz from g where status = 'ok'
    on conflict (player_id, week) do update
      set points = weekly_totals.points + excluded.points, games = weekly_totals.games + 1, updated_at = excluded.updated_at
    returning points
  )
  select (select count(*)::int from g) as inserted, (select count(*)::int from t) as counted`;

interface Stored { status: string; reject_reason: RejectReason | null; score: number; quill_score: number; week: string }

async function storedGame(playerId: string, g: ReportedGame): Promise<Stored | undefined> {
  const [row] = await query<Stored>(
    `select status, reject_reason, score, quill_score, week::text from games where player_id = $1::uuid and puzzle = $2 and seed = $3::text::bigint`,
    [playerId, g.puzzle, String(g.seed)]);
  return row;
}

async function answer(playerId: string, s: Stored, now: Date): Promise<Response> {
  const thisWeek = await standing(playerId, weekOf(now), now);
  return json({
    status: s.status, ...(s.reject_reason ? { reason: s.reject_reason } : {}), score: s.score, quillScore: s.quill_score,
    week: s.week, weekTotal: thisWeek.points, rank: thisWeek.rank,
  });
}

/** Now and then: the moves of old games (the score row stays) and spent rate rows. */
async function tidyUp() {
  await query(`update games set actions = null where actions is not null and received_at < now() - interval '30 days'`);
  await sweepEvents();
}

export const submitGame = (req: Request, now = new Date()) => guard(async () => {
  const me = await authenticate(req);
  if (!me) return json({ error: 'unauthorized' }, 401);
  const read = await readJson(req, MAX_BODY);
  if ('reply' in read) return read.reply;
  const game = readReport(read.body);
  if (!game) return json({ error: 'bad_request' }, 400);

  const known = await storedGame(me.id, game);
  if (known) return answer(me.id, known, now);

  const [{ n }] = await query<{ n: number }>(
    `select count(*)::int as n from games where player_id = $1::uuid and received_at > $2::text::timestamptz - interval '1 hour'`, [me.id, now.toISOString()]);
  if (n >= GAMES_PER_HOUR) return json({ error: 'too_many' }, 429, { 'Retry-After': '600' }); // it stays in the outbox

  const result = checkGame(game, now);
  const finished = new Date(Math.min(Date.parse(game.finishedAt), now.getTime())); // a fast clock counts as now
  const week = creditWeek(finished, now);
  const status = result.reason ? 'rejected' : 'ok';
  await query(INSERT, [
    me.id, game.puzzle, String(game.seed), game.rules, game.date, result.reason ? null : JSON.stringify(game.actions), result.score, result.quillScore,
    new Date(Date.parse(game.startedAt)).toISOString(), finished.toISOString(), now.toISOString(), week, status, result.reason,
  ]);
  if (Math.random() < 0.01) await tidyUp();
  // Read back, so two sends at once give the same answer whichever of them got in.
  return answer(me.id, (await storedGame(me.id, game))!, now);
});
