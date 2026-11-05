// The outbox and the device's player, against the real server code on a real Postgres (PGlite).
// Usage: npx tsx scripts/test-duel-outbox.ts
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { collectDuel, restoreDuel } from '../src/duel/backup';
import { OUTBOX_KEY, PLAYER_KEY, readOutbox, readPlayer, WEEK_KEY } from '../src/duel/net-rules';
import { webNet } from '../src/duel/platform/web/net';
import type { Storage } from '../src/duel/platform/types';
import { getBoard, getMe } from '../src/duel/server/board';
import { query, setDb } from '../src/duel/server/db';
import { submitGame } from '../src/duel/server/games';
import { registerPlayer, renamePlayer } from '../src/duel/server/players';
import { istToday } from '../src/duel/progress';
import { weekOf } from '../src/duel/week';
import { loadPuzzle, playGame, reportOf } from './duel/play';
import { testDb } from './duel/test-db';

let failures = 0;
function check(label: string, ok: boolean, detail?: unknown) {
  if (ok) console.log(`✓ ${label}`);
  else { failures++; console.error(`✗ ${label}${detail !== undefined ? ` — ${JSON.stringify(detail)}` : ''}`); }
}

function memory(): Storage & { map: Map<string, string> } {
  const map = new Map<string, string>();
  return {
    map,
    get: <T,>(k: string) => { const v = map.get(k); if (v === undefined) return null; try { return JSON.parse(v) as T; } catch { return null; } },
    has: (k) => map.has(k),
    set: (k, v) => { map.set(k, JSON.stringify(v)); },
    remove: (k) => { map.delete(k); },
  };
}

/** The real handlers behind fetch; `mode` can take the network away or make replies go missing. */
function server() {
  const log: string[] = [];
  const seeds: number[] = [];
  const s = {
    log, seeds, mode: 'up' as 'up' | 'down' | 'lose-reply' | number,
    fetch: (async (url: string, init: RequestInit = {}) => {
      const path = String(url), method = init.method ?? 'GET';
      log.push(`${method} ${path}`);
      if (s.mode === 'down') throw new TypeError('offline');
      if (typeof s.mode === 'number') return new Response('{}', { status: s.mode });
      if (path.endsWith('/games')) seeds.push((JSON.parse(init.body as string) as { seed: number }).seed);
      const req = new Request(`http://t${path}`, { method, headers: init.headers, body: init.body as string | undefined });
      const res = path.endsWith('/players') ? await registerPlayer(req)
        : path.endsWith('/players/me') ? await renamePlayer(req)
          : path.endsWith('/games') ? await submitGame(req)
            : path.includes('/leaderboard/me') ? await getMe(req)
              : await getBoard(req);
      if (s.mode === 'lose-reply' && path.endsWith('/games')) throw new TypeError('the reply was lost');
      return res;
    }) as typeof fetch,
  };
  return s;
}

const KEY = 'p0067.v1';
const p = loadPuzzle(KEY);
const today = istToday(new Date());
const game = (seed: number) => reportOf(KEY, today, seed, playGame(p, seed), new Date(Date.now() - 60_000));

async function main() {
  const db = await testDb();
  setDb(db);
  await query('select count(*) from players');
  const rows = async () => (await query<{ n: number }>('select count(*)::int as n from games'))[0].n;
  const total = async () => (await query<{ s: number }>('select coalesce(sum(points), 0)::int as s from weekly_totals'))[0].s;
  const unsent = (st: Storage) => readOutbox(st.get(OUTBOX_KEY));

  // ── First game ──
  let st = memory(), srv = server(), net = webNet(st, srv.fetch);
  check('no player until there is a score to send', net.player() === null);
  await net.flush();
  check('flushing nothing makes no player and no request', net.player() === null && srv.log.length === 0, srv.log);
  const g1 = game(1);
  net.enqueue(g1);
  await net.flush();
  check('the first game makes and registers a player', !!net.player()?.name, net.player());
  check('the game was sent and left the queue', unsent(st).length === 0 && await rows() === 1);
  check('the week is remembered', net.week()?.points === g1.claimedScore && Number.isInteger(net.week()?.rank), net.week());
  check('it reads as sent', net.statusOf(KEY, 1) === 'sent');

  // ── Offline ──
  await db.clear();
  st = memory(); srv = server(); srv.mode = 'down'; net = webNet(st, srv.fetch);
  const g2 = game(2);
  net.enqueue(g2);
  await net.flush();
  check('offline: the game stays queued, nothing thrown', unsent(st).length === 1 && net.statusOf(KEY, 2) === 'waiting');
  const offlineId = readPlayer(st.get(PLAYER_KEY))?.id;
  await net.flush();
  check('a failed registration keeps the same identity', !!offlineId && readPlayer(st.get(PLAYER_KEY))?.id === offlineId);
  srv.mode = 'up';
  await net.flush();
  check('back online: it is sent, under that identity', unsent(st).length === 0 && await rows() === 1 && net.player()?.id === offlineId);

  // ── A reply lost after the server stored it ──
  await db.clear();
  st = memory(); srv = server(); net = webNet(st, srv.fetch);
  const g3 = game(3);
  srv.mode = 'lose-reply';
  net.enqueue(g3);
  await net.flush();
  check('reply lost: the game stays queued', unsent(st).length === 1);
  check('the server did store it', await rows() === 1);
  srv.mode = 'up';
  await net.flush();
  check('sent again it counts once', unsent(st).length === 0 && await rows() === 1 && await total() === g3.claimedScore && net.week()?.points === g3.claimedScore, await total());

  // ── What keeps a game, and what lets it go ──
  for (const status of [503, 429, 500]) {
    await db.clear();
    st = memory(); srv = server(); net = webNet(st, srv.fetch);
    net.enqueue(game(4));
    await net.flush();
    srv.mode = status;
    net.enqueue(game(5));
    await net.flush();
    check(`${status}: kept for later`, unsent(st).length === 1);
  }
  await db.clear();
  st = memory(); srv = server(); net = webNet(st, srv.fetch);
  srv.mode = 'down';
  const honest = game(7);
  net.enqueue({ ...game(6), claimedScore: 99999 });
  net.enqueue({ ...game(8), date: 'not a date' });
  net.enqueue(honest);
  srv.mode = 'up';
  await net.flush();
  check('a refused game and a malformed one leave the queue and the honest one still goes', unsent(st).length === 0 && await total() === honest.claimedScore, await total());
  check('the refused one reads as not counted', net.statusOf(KEY, 6) === 'rejected' && net.statusOf(KEY, 8) === 'rejected');

  // ── Oldest first ──
  await db.clear();
  st = memory(); srv = server(); srv.mode = 'down'; net = webNet(st, srv.fetch);
  net.enqueue(game(9)); net.enqueue(game(10));
  srv.mode = 'up';
  await net.flush();
  check('both sent, oldest first', srv.seeds.join() === '9,10', srv.seeds);

  // ── The same game queued twice ──
  await db.clear();
  st = memory(); srv = server(); srv.mode = 'down'; net = webNet(st, srv.fetch);
  const g11 = game(11);
  net.enqueue(g11); net.enqueue(g11);
  check('queued twice, held once', unsent(st).length === 1);

  // ── Two flushes at once ──
  await db.clear();
  st = memory(); srv = server(); net = webNet(st, srv.fetch);
  srv.mode = 'down';
  net.enqueue(game(12));
  srv.mode = 'up';
  srv.log.length = 0;
  await Promise.all([net.flush(), net.flush()]);
  check('two flushes at once send it once', srv.log.filter(l => l.endsWith('/games')).length === 1, srv.log);

  // ── The server has forgotten the player, or the id belongs to someone else ──
  await db.clear();
  st = memory(); srv = server(); net = webNet(st, srv.fetch);
  net.enqueue(game(13));
  await net.flush();
  const known = net.player()!;
  await db.clear();
  net.enqueue(game(14));
  await net.flush();
  check('a forgotten player registers again with the same identity', net.player()?.id === known.id && unsent(st).length === 0 && await rows() === 1);
  const other = memory();
  other.set(PLAYER_KEY, { id: known.id, token: 'a'.repeat(64), name: null });
  const otherNet = webNet(other, srv.fetch);
  otherNet.enqueue(game(15));
  await otherNet.flush();
  check('an id someone else holds means a new identity, and the game still goes', otherNet.player()?.id !== known.id && !!otherNet.player()?.name && unsent(other).length === 0);

  // ── The token no longer matches: 401, register says 409, so a new identity ──
  await db.clear();
  const stale = memory();
  const held = { id: '33333333-3333-4333-8333-333333333333', token: 'c'.repeat(64) };
  await registerPlayer(new Request('http://t/players', { method: 'POST', body: JSON.stringify(held) }));
  stale.set(PLAYER_KEY, { id: held.id, token: 'd'.repeat(64), name: 'Old Name' });
  const staleNet = webNet(stale, srv.fetch);
  staleNet.enqueue(game(17));
  await staleNet.flush();
  check('401 then 409: a new identity, and the game still goes', staleNet.player()?.id !== held.id && staleNet.player()?.name !== 'Old Name' && unsent(stale).length === 0 && await rows() === 1);

  // ── The board's copy, and the CDN ──
  await db.clear();
  st = memory(); srv = server(); net = webNet(st, srv.fetch);
  check('no copy on the device yet', net.lastBoard('this') === null);
  await net.board('this');
  check('the copy is kept', net.lastBoard('this')?.rows.length === 8);
  net.enqueue(game(18));
  await net.flush();
  srv.log.length = 0;
  await net.board('this');
  check('normally the CDN may answer', srv.log.some(l => /week=this$/.test(l)), srv.log);
  await net.rename('Fresh Name');
  srv.log.length = 0;
  await net.board('this');
  check('just after a rename it asks past the CDN', srv.log.some(l => /week=this&t=\d+$/.test(l)), srv.log);
  const oldWeek = memory();
  const lastWeeksBoard = { week: '2020-01-06', endsAt: '', players: 0, rows: [] };
  oldWeek.set('panna_duel_board', { this: lastWeeksBoard });
  check('a copy from another week isn\'t this week\'s', webNet(oldWeek, srv.fetch).lastBoard('this') === null);
  const asked: string[] = [];
  const staleCdn = (async (url: string) => {
    asked.push(String(url));
    return new Response(JSON.stringify(asked.length === 1 ? lastWeeksBoard : { week: weekOf(new Date()), endsAt: '', players: 8, rows: [] }));
  }) as unknown as typeof fetch;
  const afterMidnight = await webNet(memory(), staleCdn).board('this');
  check('a CDN copy from last week is asked for again', afterMidnight.data?.week === weekOf(new Date()) && asked.length === 2 && /&t=/.test(asked[1]), asked);

  // ── Damage ──
  st = memory(); srv = server();
  st.map.set(OUTBOX_KEY, '{oops');
  st.map.set(PLAYER_KEY, '"nonsense"');
  st.map.set(WEEK_KEY, '[1]');
  net = webNet(st, srv.fetch);
  await net.flush();
  check('a damaged queue, player and week are ignored', net.player() === null && net.week() === null && net.unsent().length === 0);

  // ── Board, name and week ──
  await db.clear();
  st = memory(); srv = server(); net = webNet(st, srv.fetch);
  check('no player: me is empty', await net.me('this') === null);
  net.enqueue(game(16));
  await net.flush();
  const first = await net.board('this');
  check('the board arrives fresh', first.stale === false && first.data!.rows.length === 9, first);
  srv.mode = 'down';
  const cached = await net.board('this');
  check('offline: the last copy, marked stale', cached.stale === true && cached.data?.rows.length === 9);
  check('offline: me is empty and nothing throws', await net.me('this') === null);
  check('offline: a rename says so', (await net.rename('Tea Lover') as { error?: string }).error === 'offline');
  srv.mode = 'up';
  check('a rename goes through', (await net.rename('Tea Lover')).ok && net.player()?.name === 'Tea Lover');
  check('a bad rename says why', (await net.rename('x') as { error?: string }).error === 'short');
  await query(`update players set name = 'Other Name', name_key = 'othername' where id = $1::uuid`, [net.player()!.id]);
  await net.me('this');
  check('a name changed on another device comes through', net.player()?.name === 'Other Name');

  const lastWeek = memory();
  lastWeek.set(WEEK_KEY, { week: '2020-01-06', points: 5, rank: 1, day: '2020-01-06', dayRank: 1, seen: null });
  check('last week\'s total doesn\'t read as this week\'s', webNet(lastWeek, srv.fetch).week() === null);

  // ── The first rank of the day ──
  st = memory();
  st.set(PLAYER_KEY, { id: '00000000-0000-4000-8000-000000000000', token: 'a'.repeat(64), name: 'Tea Lover' });
  st.set(WEEK_KEY, { week: '2026-11-02', points: 100, rank: 20, day: '2026-11-03', dayRank: 25, seen: { rank: 20, points: 100 } });
  let rank = 15;
  const fakeMe = (async () => new Response(JSON.stringify({ name: 'Tea Lover', week: '2026-11-02', points: 200, games: 2, rank, of: 9 }))) as unknown as typeof fetch;
  const dayNet = webNet(st, fakeMe, () => new Date('2026-11-04T06:00:00Z'));
  await dayNet.me('this');
  check('a new day starts from yesterday\'s last rank', dayNet.week()?.dayRank === 20 && dayNet.week()?.rank === 15, dayNet.week());
  rank = 12;
  await dayNet.me('this');
  check('and keeps that start all day', dayNet.week()?.dayRank === 20 && dayNet.week()?.rank === 12, dayNet.week());
  check('what the Ranks screen last showed is kept', dayNet.week()?.seen?.rank === 20);
  dayNet.markSeen(12, 200);
  check('and can be moved on', dayNet.week()?.seen?.rank === 12);

  // ── One backup on two devices: one player ──
  await db.clear();
  srv = server();
  const phoneA = memory();
  const netA = webNet(phoneA, srv.fetch);
  const dealA = game(50), shared = game(60);
  netA.enqueue(dealA);
  await netA.flush();
  // A backup made now, with a game already sent still listed, as an old file might have.
  const file = collectDuel(Object.fromEntries(phoneA.map));
  file[OUTBOX_KEY] = [dealA];
  const phoneB = memory();
  for (const [k, v] of Object.entries(restoreDuel({}, file, 'replace')!.set)) phoneB.set(k, v);
  const netB = webNet(phoneB, srv.fetch);
  check('the restored phone is the same player', netB.player()?.id === netA.player()?.id && netB.player()?.name === netA.player()?.name);
  await netB.flush();
  check('a game in an old backup that was already sent isn\'t recounted', await total() === dealA.claimedScore && await rows() === 1 && netB.unsent().length === 0, await total());
  const dealB = game(61);
  netB.enqueue(dealB);
  await netB.flush();
  await netA.me('this');
  check('both devices\' games add up on one row', await total() === dealA.claimedScore + dealB.claimedScore && netA.week()?.points === await total(), netA.week());
  check('one row on the board for the two of them', (await query<{ n: number }>('select count(*)::int as n from weekly_totals'))[0].n === 1);
  netA.enqueue(shared);
  netB.enqueue(shared);
  await Promise.all([netA.flush(), netB.flush()]);
  check('the same deal finished on both counts once', await total() === dealA.claimedScore + dealB.claimedScore + shared.claimedScore && netA.unsent().length === 0 && netB.unsent().length === 0, await total());
  await netA.rename('Tea Lover');
  await netB.me('this');
  check('a new name reaches the other device', netB.player()?.name === 'Tea Lover');

  // ── Restoring over a different player ──
  const phoneC = memory();
  const netC = webNet(phoneC, srv.fetch);
  srv.mode = 'down';
  const unsentOnC = game(70);
  netC.enqueue(unsentOnC);
  await netC.flush();
  srv.mode = 'up';
  const before = await total();
  const restored = restoreDuel(Object.fromEntries([...phoneC.map].map(([k, v]) => [k, JSON.parse(v)])), file, 'merge')!;
  for (const k of restored.remove) phoneC.remove(k);
  for (const [k, v] of Object.entries(restored.set)) phoneC.set(k, v);
  const netC2 = webNet(phoneC, srv.fetch);
  await netC2.flush();
  check('a score unsent on the phone goes out as the backup\'s player', netC2.player()?.id === netA.player()?.id && await total() === before + unsentOnC.claimedScore && netC2.unsent().length === 0, await total());

  // ── The service worker keeps out ──
  const worker = { self: { addEventListener() {}, location: { origin: 'http://t' } } as unknown, URL, found: null as null | ((u: URL) => string | null) };
  runInNewContext(`${readFileSync('public/sw.js', 'utf8')}\nfound = cacheFor;`, worker);
  const cacheFor = worker.found!;
  check('the service worker keeps no copy of the Duel\'s replies', cacheFor(new URL('http://t/api/duel/leaderboard/me?week=this')) === null && cacheFor(new URL('http://t/api/duel/leaderboard')) === null);
  check('and still keeps the dictionary\'s', cacheFor(new URL('http://t/api/word/camel')) !== null);

  if (failures) { console.error(`\n${failures} failed`); process.exit(1); }
  console.log('\ntest:duel-outbox: all checks passed.');
}

void main().catch((e) => { console.error(e); process.exit(1); });
