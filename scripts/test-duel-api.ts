// The Duel's server on a real Postgres (PGlite): weeks, players, the score check and the leaderboard.
// Usage: npx tsx scripts/test-duel-api.ts   (needs no server, database or network)
import { randomBytes, randomUUID } from 'node:crypto';
import { ADJECTIVES, checkNameShape, nameKey, NOUNS } from '../src/duel/names';
import { maxActions } from '../src/duel/engine';
import { getBoard, getMe } from '../src/duel/server/board';
import { DbUnavailable, query, setDb } from '../src/duel/server/db';
import { submitGame } from '../src/duel/server/games';
import { BOT_NAMES, botsFor } from '../src/duel/server/housebots';
import { guard } from '../src/duel/server/http';
import { SCHEMA } from '../src/duel/server/schema';
import { isBlockedName, registerPlayer, renamePlayer } from '../src/duel/server/players';
import { addWeeks, creditWeek, weekEnds, weekOf } from '../src/duel/week';
import { loadPuzzle, playGame, reportOf } from './duel/play';
import { testDb } from './duel/test-db';

let failures = 0;
function check(label: string, ok: boolean, detail?: unknown) {
  if (ok) console.log(`✓ ${label}`);
  else { failures++; console.error(`✗ ${label}${detail !== undefined ? ` — ${JSON.stringify(detail)}` : ''}`); }
}

type TestDb = Awaited<ReturnType<typeof testDb>>;

const makeId = () => randomUUID();
const makeToken = () => randomBytes(32).toString('hex');
const post = (url: string, body: unknown, headers: Record<string, string> = {}, method = 'POST') =>
  new Request(`http://t${url}`, { method, headers, body: typeof body === 'string' ? body : JSON.stringify(body) });
const bearer = (id: string, token: string) => ({ authorization: `Bearer ${id}.${token}` });

async function testPlayers(db: TestDb) {
  await db.clear();
  // ── Registering ──
  const id = makeId(), token = makeToken();
  const first = await registerPlayer(post('/players', { id, token }));
  const made = await first.json();
  check('register gives a two-word name', first.status === 200 && /^[A-Z][a-z]+ [A-Z][a-z]+$/.test(made.name) && made.created === true, made);
  const again = await (await registerPlayer(post('/players', { id, token }))).json();
  check('registering again gives the same name and no new row', again.name === made.name && again.created === false
    && (await query<{ n: number }>('select count(*)::int as n from players'))[0].n === 1, again);
  check('the same id with another token is refused', (await registerPlayer(post('/players', { id, token: makeToken() }))).status === 409);
  check('a bad id is refused', (await registerPlayer(post('/players', { id: 'nope', token }))).status === 400);
  check('a bad token is refused', (await registerPlayer(post('/players', { id: makeId(), token: 'abc' }))).status === 400);
  check('a body that isn\'t JSON is refused', (await registerPlayer(post('/players', '{oops'))).status === 400);
  check('the token itself isn\'t stored', !(await query<{ token_hash: string }>('select token_hash from players'))[0].token_hash.includes(token));

  // ── Ten new players an hour from one address ──
  await db.clear();
  const ip = { 'x-forwarded-for': '10.0.0.1, 1.1.1.1' };
  const firstOfTen = { id: makeId(), token: makeToken() };
  await registerPlayer(post('/players', firstOfTen, ip));
  for (let i = 0; i < 9; i++) await registerPlayer(post('/players', { id: makeId(), token: makeToken() }, ip));
  check('the eleventh new player from an address waits', (await registerPlayer(post('/players', { id: makeId(), token: makeToken() }, ip))).status === 429);
  check('someone already registered is still fine from it', (await registerPlayer(post('/players', firstOfTen, ip))).status === 200);
  check('another address is unaffected', (await registerPlayer(post('/players', { id: makeId(), token: makeToken() }, { 'x-forwarded-for': '10.0.0.2' }))).status === 200);
  check('no address is stored as it is', !(await query<{ key: string }>('select key from rate_events')).some(r => r.key.includes('10.0.0')));

  // ── Renaming ──
  await db.clear();
  const a = { id: makeId(), token: makeToken() }, b = { id: makeId(), token: makeToken() };
  await registerPlayer(post('/players', a));
  await registerPlayer(post('/players', b));
  const rename = (who: typeof a, name: unknown) => renamePlayer(post('/players/me', { name }, bearer(who.id, who.token), 'PATCH'));
  const errorOf = async (r: Response) => (await r.json()).error;
  check('too short', await errorOf(await rename(a, 'ab')) === 'short');
  check('too long', await errorOf(await rename(a, 'x'.repeat(21))) === 'long');
  check('other characters', await errorOf(await rename(a, '<b>hi</b>')) === 'chars');
  check('Devanagari isn\'t allowed yet', await errorOf(await rename(a, 'पन्ना जी')) === 'chars');
  check('a swear word', await errorOf(await rename(a, 'fuck face')) === 'blocked');
  check('a swear word with letter swaps', await errorOf(await rename(a, 'f u c k 3r')) === 'blocked' && await errorOf(await rename(a, 'sh1t lord')) === 'blocked'
    && await errorOf(await rename(a, 'f4ck')) === 'blocked' && await errorOf(await rename(a, 's1ut queen')) === 'blocked');
  check('a word inside a longer one', isBlockedName('fuckface') && isBlockedName('bullshit'));
  const rudeNames = ['Thick Black Cock', 'BlackCock', 'Big D1ck', 'Sexy Boobs', 'p0rn king', 'Bigtits', 'Bhosdike', 'Teri Maa', 'Laude Lal'];
  check('rude names are caught', rudeNames.every(isBlockedName), rudeNames.filter(n => !isBlockedName(n)));
  const realNames = ['Kshitij Rao', 'Shital', 'Document', 'Tycoon', 'Spice Trader', 'Suspicious', 'Music Umbrella', 'Grand India', 'Analyst', 'Arsenal',
    'Peacock', 'Hancock', 'Cocktail Hour', 'Dickens', 'Hitchcock', 'Gandhi', 'Therapist', 'Sussex', 'Assam', 'Pakistan', 'Randhir', 'Chaudhary'];
  check('real names and words aren\'t caught', realNames.every(n => !isBlockedName(n)), realNames.filter(isBlockedName));
  check('a bot\'s name with letter swaps', isBlockedName('Profess0r Qui11'));
  check('a Hinglish swear word', await errorOf(await rename(a, 'Ch0otiya Chutiya')) === 'blocked');
  check('a bot\'s name, in any case or spacing', await errorOf(await rename(a, 'PROFESSOR  quill')) === 'blocked' && await errorOf(await rename(a, 'ProfessorQuill')) === 'blocked');
  await rename(b, 'Tea Lover');
  check('someone else\'s name, in other case and spacing', await errorOf(await rename(a, 'tea  LOVER')) === 'taken' && await errorOf(await rename(a, 'TeaLover')) === 'taken');
  const saved = await rename(a, '  Reading   Rahi ');
  check('a good name is saved, tidied', saved.status === 200 && (await saved.json()).name === 'Reading Rahi');
  check('renaming to your own name in other case is fine', (await rename(a, 'READING RAHI')).status === 200);
  for (let i = 0; i < 8; i++) await rename(a, `Name Number ${i}`);
  check('the eleventh rename in an hour waits', (await rename(a, 'One More')).status === 429);
  await db.query(`update rate_events set at = now() - interval '2 hours'`);
  check('an hour later it works again', (await rename(a, 'One More')).status === 200);

  // ── Who may rename ──
  const noAuth = await renamePlayer(post('/players/me', { name: 'Hello There' }, {}, 'PATCH'));
  const wrong = await renamePlayer(post('/players/me', { name: 'Hello There' }, bearer(a.id, makeToken()), 'PATCH'));
  const nobody = await renamePlayer(post('/players/me', { name: 'Hello There' }, bearer(makeId(), makeToken()), 'PATCH'));
  check('no token, a wrong one and an unknown player all get the same 401',
    noAuth.status === 401 && wrong.status === 401 && nobody.status === 401 && await noAuth.text() === await wrong.text());

  // ── Generated names ──
  let bad = '';
  const keys = new Set<string>();
  for (const x of ADJECTIVES) for (const y of NOUNS) {
    const name = `${x} ${y}`;
    keys.add(nameKey(name));
    if (checkNameShape(name) !== null || isBlockedName(name)) bad = name;
  }
  check('every generated name passes its own rules', bad === '', bad);
  check('the lists give thousands of different names', keys.size >= 3000, keys.size);
}

async function newPlayer() {
  const who = { id: makeId(), token: makeToken() };
  const { name } = await (await registerPlayer(post('/players', who))).json();
  return { ...who, name: name as string };
}

const KEY = 'p0067.v1';
const NOW = new Date('2026-11-04T12:00:00Z'), TODAY = '2026-11-04'; // a Wednesday; its week is 2026-11-02
const send = (who: { id: string; token: string }, body: unknown, now = NOW) => submitGame(post('/games', body, bearer(who.id, who.token)), now);
const totals = async (who: { id: string }, week = '2026-11-02') =>
  (await query<{ points: number; games: number }>(`select points, games from weekly_totals where player_id = $1::uuid and week = $2::text::date`, [who.id, week]))[0] ?? { points: 0, games: 0 };

async function testGames(db: TestDb) {
  await db.clear();
  const p = loadPuzzle(KEY);
  const game = (seed: number, accuracy = 1) => reportOf(KEY, TODAY, seed, playGame(p, seed, accuracy), new Date(NOW.getTime() - 60_000));

  // ── An honest game ──
  const a = await newPlayer();
  const g1 = game(101), real = g1.claimedScore;
  const first = await (await send(a, g1)).json();
  check('an honest game counts, with the engine\'s score', first.status === 'ok' && first.score === real && first.weekTotal === real && first.week === '2026-11-02', first);
  check('a rank comes back', Number.isInteger(first.rank) && first.rank >= 1, first.rank);
  check('one game on the week', (await totals(a)).games === 1);

  // ── It counts once ──
  const again = await (await send(a, g1)).json();
  check('sent again: the same answer, nothing added', again.status === 'ok' && again.weekTotal === real && (await totals(a)).games === 1, again);
  const g2 = game(102);
  const both = await Promise.all([send(a, g2), send(a, g2)]);
  const bodies = await Promise.all(both.map(r => r.json()));
  check('two sends at once add it once', (await totals(a)).points === real + g2.claimedScore && (await totals(a)).games === 2 && bodies.every(b => b.status === 'ok'), bodies);
  check('one row each', (await query<{ n: number }>('select count(*)::int as n from games'))[0].n === 2);

  // ── Made-up and impossible games ──
  const b = await newPlayer();
  const rejectedAs = async (body: unknown) => { const r = await (await send(b, body)).json(); return r.status === 'rejected' ? r.reason : `not rejected: ${JSON.stringify(r)}`; };
  check('a made-up score is rejected', await rejectedAs({ ...game(201), claimedScore: game(201).claimedScore + 1 }) === 'mismatch');
  check('it adds nothing', (await totals(b)).points === 0);
  check('sent again it stays rejected', (await (await send(b, { ...game(201), claimedScore: game(201).claimedScore + 1 })).json()).reason === 'mismatch' && (await totals(b)).points === 0);
  const stored = (await query<{ actions: unknown; score: number }>(`select actions, score from games where player_id = $1::uuid`, [b.id]))[0];
  check('a rejected game keeps no moves, but the server\'s own score', stored.actions === null && stored.score === game(201).claimedScore);
  check('an unfinished game', await rejectedAs(reportOf(KEY, TODAY, 202, playGame(p, 202, 1, Math.random, 3), new Date(NOW.getTime() - 60_000))) === 'unfinished');
  check('an illegal move', await rejectedAs({ ...game(203), actions: [{ t: 'submit', place: [{ cell: 0, rackSlot: 0 }] }] }) === 'illegal');
  check('the test puzzle was never published', await rejectedAs({ ...game(204), puzzle: 'p0000.v1' }) === 'puzzle');
  check('nor the practice puzzle', await rejectedAs({ ...game(205), puzzle: 'p0001.v1' }) === 'puzzle');
  check('an unknown puzzle', await rejectedAs({ ...game(206), puzzle: 'p9999.v1' }) === 'puzzle');
  check('other rules', await rejectedAs({ ...game(207), rules: '0.abc' }) === 'rules');
  check('a daily from further ahead than a fast clock explains', await rejectedAs({ ...game(208), date: '2026-11-06' }) === 'future');
  check('a game under a minute', await rejectedAs(reportOf(KEY, TODAY, 209, playGame(p, 209), NOW, 0.5)) === 'too_fast');
  check('started after it finished', await rejectedAs({ ...game(210), startedAt: new Date(NOW.getTime() + 60_000).toISOString() }) === 'times');
  check('none of these added points', (await totals(b)).points === 0);
  // A phone a little fast at midnight has tomorrow's date: not lost, and not stored, so it can count later.
  const early = { ...game(211), date: '2026-11-05' };
  const tooEarly = await send(b, early);
  check('tomorrow\'s date waits rather than being refused', tooEarly.status === 429 && tooEarly.headers.get('retry-after') !== null, tooEarly.status);
  check('and counts once tomorrow comes', (await (await send(b, early, new Date('2026-11-04T18:31:00Z'))).json()).status === 'ok');

  // ── Honest things the first design would have refused ──
  await db.clear();
  const c = await newPlayer();
  const long = reportOf(KEY, TODAY, 301, playGame(p, 301), NOW, 600); // left half done for ten hours
  const inside = reportOf(KEY, TODAY, 302, playGame(p, 302), new Date(NOW.getTime() - 120 * 60_000));
  const ok1 = await (await send(c, long)).json(), ok2 = await (await send(c, inside)).json();
  check('a game played inside another\'s time span counts', ok1.status === 'ok' && ok2.status === 'ok', [ok1, ok2]);
  const fast = reportOf(KEY, TODAY, 303, playGame(p, 303), new Date(NOW.getTime() + 5 * 60_000));
  const okFast = await (await send(c, fast)).json();
  check('a clock five minutes fast still counts', okFast.status === 'ok', okFast);
  const row = (await query<{ finished_at: string }>(`select finished_at::text from games where seed = 303`))[0];
  check('and is timed at the server\'s now', Date.parse(row.finished_at) === NOW.getTime(), row);
  const slow = reportOf(KEY, TODAY, 304, playGame(p, 304), new Date(NOW.getTime() - 3 * 24 * 3600_000));
  check('a phone back online after days counts', (await (await send(c, slow)).json()).status === 'ok');

  // ── A week closing ──
  await db.clear();
  const d = await newPlayer();
  const sunday = new Date('2026-11-08T12:00:00Z');
  const late = (seed: number) => reportOf(KEY, '2026-11-08', seed, playGame(p, seed), sunday);
  const inGrace = await (await send(d, late(401), new Date('2026-11-09T18:29:00Z'))).json();
  check('finished Sunday, in by Monday 23:59 IST: last week', inGrace.week === '2026-11-02' && (await totals(d)).games === 1, inGrace);
  check('and this week\'s total isn\'t touched', inGrace.weekTotal === 0, inGrace.weekTotal);
  const afterGrace = await (await send(d, late(402), new Date('2026-11-09T18:30:00Z'))).json();
  check('finished Sunday, in on Tuesday: this week', afterGrace.week === '2026-11-09' && (await totals(d, '2026-11-09')).games === 1, afterGrace);

  // ── Crafted bodies get a clean no ──
  await db.clear();
  const e = await newPlayer();
  const good = game(501);
  const bad: [string, unknown][] = [
    ['a string cell', { ...good, actions: [{ t: 'submit', place: [{ cell: '12', rackSlot: 0 }] }] }],
    ['a __proto__ cell', { ...good, actions: [{ t: 'submit', place: [{ cell: '__proto__', rackSlot: 0 }] }] }],
    ['half a rack slot', { ...good, actions: [{ t: 'submit', place: [{ cell: 12, rackSlot: 1.5 }] }] }],
    ['actions that aren\'t a list', { ...good, actions: 'pass' }],
    ['too many actions', { ...good, actions: Array(601).fill({ t: 'pass' }) }],
    ['an unknown action', { ...good, actions: [{ t: 'win' }] }],
    ['a negative seed', { ...good, seed: -1 }],
    ['a huge seed', { ...good, seed: 2 ** 40 }],
    ['a fractional seed', { ...good, seed: 1.5 }],
    ['a date that doesn\'t exist', { ...good, date: '2026-02-30' }],
    ['a path as a puzzle', { ...good, puzzle: '../../package' }],
    ['no puzzle version', { ...good, puzzle: 'p0001' }],
    ['a year Postgres has no date for', { ...good, date: '0000-01-01' }],
    ['a nul in the rules', { ...good, rules: 'a\u0000b' }],
    ['a time before year 0', { ...good, startedAt: '-000100-01-01T00:00:00Z' }],
    ['a time past year 9999', { ...good, finishedAt: '+010000-01-01T00:00:00Z' }],
    ['a time that isn\'t one', { ...good, finishedAt: 'soon' }],
    ['not an object', [1, 2]],
    ['null', null],
  ];
  for (const [label, body] of bad) {
    const r = await send(e, body);
    check(`${label}: 400`, r.status === 400, r.status);
  }
  check('nothing stored from them', (await query<{ n: number }>('select count(*)::int as n from games'))[0].n === 0);
  check('over 32 KB is 413', (await send(e, { ...good, junk: 'x'.repeat(33_000) })).status === 413);
  check('no token is 401', (await submitGame(post('/games', good), NOW)).status === 401);
  const longest = JSON.stringify({ ...good, actions: Array(maxActions(p)).fill({ t: 'swap', rackSlots: [0, 1, 2, 3, 4] }) });
  check('the longest log a real game can have fits', Buffer.byteLength(longest) < 32 * 1024, Buffer.byteLength(longest));

  // ── Thirty games an hour ──
  await db.clear();
  const f = await newPlayer();
  const hourly = (seed: number) => reportOf(KEY, TODAY, seed, playGame(p, 1), new Date(NOW.getTime() - 60_000));
  const playedOne = playGame(p, 600);
  for (let i = 0; i < 30; i++) {
    await query(`insert into games (player_id, puzzle, seed, rules, date, score, quill_score, started_at, finished_at, received_at, week, status)
      values ($1::uuid, $2, $3::text::bigint, 'r', '2026-11-04', 1, 1, now(), now(), $4::text::timestamptz, '2026-11-02', 'ok')`, [f.id, KEY, String(10_000 + i), NOW.toISOString()]);
  }
  const limited = await send(f, reportOf(KEY, TODAY, 600, playedOne, new Date(NOW.getTime() - 60_000)));
  check('the thirty-first game in an hour waits, and says when to retry', limited.status === 429 && limited.headers.get('retry-after') !== null, limited.status);
  check('a game already known still answers then', (await send(f, { ...hourly(10_000) })).status === 200);
  const laterOn = await send(f, reportOf(KEY, TODAY, 600, playedOne, new Date(NOW.getTime() - 60_000)), new Date(NOW.getTime() + 3700_000));
  check('it goes through an hour later', laterOn.status === 200);
}

async function testBoard(db: TestDb) {
  await db.clear();
  // ── House bots ──
  const week = '2026-11-02', mid = new Date('2026-11-05T06:00:00Z');
  check('the same moment gives the same bots', JSON.stringify(botsFor(week, mid)) === JSON.stringify(botsFor(week, mid)));
  check('8 bots, Quill and the mockup\'s two among them', BOT_NAMES.length === 8 && ['Professor Quill', 'Miss Marginalia', 'Old Owl Ink'].every(n => BOT_NAMES.includes(n)));
  const start = new Date('2026-11-01T18:30:00Z'), end = weekEnds(week);
  check('no points as the week starts', botsFor(week, start).every(b => b.points === 0), botsFor(week, start));
  let rising = true;
  for (let t = start.getTime(); t < end.getTime(); t += 3_600_000) {
    const now = botsFor(week, new Date(t)), next = botsFor(week, new Date(t + 3_600_000));
    if (now.some((b, i) => next[i].points < b.points)) rising = false;
  }
  check('a bot\'s points never fall during the week', rising);
  const final = botsFor(week, end);
  check('final after the week ends', JSON.stringify(final) === JSON.stringify(botsFor(week, new Date(end.getTime() + 9e9))));
  check('another week differs', JSON.stringify(final) !== JSON.stringify(botsFor('2026-11-09', weekEnds('2026-11-09'))));
  // One game a day at the median score of about 90.
  let wk = week, midTable = true;
  for (let i = 0; i < 52; i++, wk = addWeeks(wk, 1)) {
    const above = botsFor(wk, weekEnds(wk)).filter(b => b.points > 7 * 90).length;
    if (above < 2 || above > 6) midTable = false;
  }
  check('a one-game-a-day player lands mid-table every week of a year', midTable);

  // ── The board ──
  const NOW2 = new Date('2026-11-05T06:00:00Z');
  const ask = (w: string, now = NOW2) => getBoard(new Request(`http://t/leaderboard?week=${w}`), now);
  const empty = await ask('this');
  const emptyBody = await empty.json();
  check('an empty week still shows the bots', emptyBody.rows.length === 8 && emptyBody.rows.every((r: { bot: boolean }) => r.bot), emptyBody);
  check('the board may be cached by the CDN', empty.headers.get('cache-control') === 'public, s-maxage=30, stale-while-revalidate=300');
  check('a bad week is refused', (await ask('someday')).status === 400);

  const insertTotal = async (points: number, at: string, w = week) => {
    const who = await newPlayer();
    await query(`insert into weekly_totals (player_id, week, points, games, updated_at) values ($1::uuid, $2::text::date, $3::int, 1, $4::text::timestamptz)`, [who.id, w, points, at]);
    return who;
  };
  const early = await insertTotal(5000, '2026-11-04T01:00:00Z'), late = await insertTotal(5000, '2026-11-04T02:00:00Z');
  const low = await insertTotal(1, '2026-11-04T03:00:00Z');
  const res = await ask('this');
  const text = await res.clone().text(), body = await res.json();
  check('whoever got there first ranks higher', body.rows[0].name === early.name && body.rows[1].name === late.name, body.rows.slice(0, 2));
  check('bots are marked and mixed in', body.rows.filter((r: { bot: boolean }) => r.bot).length === 8 && body.rows[0].bot === false);
  check('ranks run 1, 2, 3…', body.rows.every((r: { rank: number }, i: number) => r.rank === i + 1));
  check('points only go down the list', body.rows.every((r: { points: number }, i: number) => i === 0 || body.rows[i - 1].points >= r.points));
  check('it counts players and bots', body.players === 11, body.players);
  check('no id or token leaves in the public list', ![early, late, low].some(w => text.includes(w.id) || text.includes(w.token)) && !/"(id|token|player_id)"/.test(text));

  // ── Your own row ──
  const me = (who: { id: string; token: string }, w = 'this', now = NOW2) =>
    getMe(new Request(`http://t/me?week=${w}`, { headers: bearer(who.id, who.token) }), now);
  const mine = await me(late);
  const myBody = await mine.json();
  check('your rank matches your row on the board', myBody.rank === 2 && myBody.points === 5000 && myBody.name === late.name, myBody);
  check('your row isn\'t cached', mine.headers.get('cache-control') === 'no-store');
  check('the count of players comes with it', myBody.of === 11, myBody.of);
  const lateRow = body.rows.find((r: { name: string }) => r.name === late.name);
  check('your tag finds your row, and no other', !!myBody.tag && lateRow.tag === myBody.tag && body.rows.filter((r: { tag?: string }) => r.tag === myBody.tag).length === 1, myBody.tag);
  check('bots carry no tag', body.rows.filter((r: { bot: boolean }) => r.bot).every((r: { tag?: string }) => r.tag === undefined));
  check('your tag changes from week to week', (await (await me(late, 'last')).json()).tag !== myBody.tag);
  const lowBody = await (await me(low)).json();
  check('rank counts bots above too', lowBody.rank === body.rows.find((r: { name: string }) => r.name === low.name).rank, lowBody);
  check('no token is 401', (await getMe(new Request('http://t/me'), NOW2)).status === 401);
  const fresh = await newPlayer();
  const none = await (await me(fresh)).json();
  check('no games this week: no rank', none.points === 0 && none.rank === null && none.games === 0, none);

  await db.clear();
  const many = await Promise.all(Array.from({ length: 150 }, (_, i) => insertTotal(10_000 - i, '2026-11-04T01:00:00Z')));
  const top = await (await ask('this')).json();
  check('the top 100 only', top.rows.length === 100 && top.players === 158, [top.rows.length, top.players]);
  const outside = await (await me(many[149])).json();
  check('outside the top 100 you still have a rank', outside.rank === 150, outside.rank);

  // ── Last week ──
  await db.clear();
  const old = await insertTotal(777, '2026-10-30T01:00:00Z', '2026-10-26');
  const lastBody = await (await ask('last')).json();
  check('Last week shows its final totals', lastBody.week === '2026-10-26' && lastBody.rows.some((r: { name: string; points: number }) => r.name === old.name && r.points === 777), lastBody);
  check('and the bots\' final totals', JSON.stringify(lastBody.rows.filter((r: { bot: boolean }) => r.bot).map((r: { points: number }) => r.points).sort())
    === JSON.stringify(botsFor('2026-10-26', weekEnds('2026-10-26')).map(b => b.points).sort()));
  const myLast = await (await me(old, 'last')).json();
  check('your last week', myLast.points === 777 && myLast.week === '2026-10-26' && Number.isInteger(myLast.rank), myLast);
}

async function main() {
  // ── Weeks ──
  check('Sunday 23:59 IST is in the old week', weekOf(new Date('2026-11-08T18:29:00Z')) === '2026-11-02');
  check('Monday 00:00 IST starts the new week', weekOf(new Date('2026-11-08T18:30:00Z')) === '2026-11-09');
  check('a week ends at the next Monday 00:00 IST', weekEnds('2026-11-02').toISOString() === '2026-11-08T18:30:00.000Z');
  check('addWeeks goes back over a month', addWeeks('2026-11-02', -1) === '2026-10-26');
  const sunday = new Date('2026-11-08T12:00:00Z');
  check('finished Sunday, received Monday 23:59 IST: last week', creditWeek(sunday, new Date('2026-11-09T18:29:00Z')) === '2026-11-02');
  check('finished Sunday, received Tuesday 00:00 IST: this week', creditWeek(sunday, new Date('2026-11-09T18:30:00Z')) === '2026-11-09');
  check('finished three weeks ago: this week', creditWeek(new Date('2026-10-14T12:00:00Z'), new Date('2026-11-04T12:00:00Z')) === '2026-11-02');
  check('finished in the future: the week of now', creditWeek(new Date('2026-11-20T12:00:00Z'), new Date('2026-11-04T12:00:00Z')) === '2026-11-02');

  // ── No database ──
  delete process.env.DATABASE_URL;
  setDb(null);
  let threw: unknown = null;
  try { await query('select 1'); } catch (e) { threw = e; }
  check('no database: query says unavailable', threw instanceof DbUnavailable);
  const down = await guard(async () => { await query('select 1'); return new Response('no'); });
  check('no database: guard answers 503, not stored', down.status === 503 && down.headers.get('cache-control') === 'no-store', down.status);

  // ── The schema sets itself up ──
  const db = await testDb();
  setDb(db);
  const rows = await query<{ n: number }>('select count(*)::int as n from players');
  check('the schema applied itself on an empty database', rows[0].n === 0);
  for (const statement of SCHEMA) await db.query(statement);
  check('applying it again does nothing', (await query<{ n: number }>('select count(*)::int as n from weekly_totals'))[0].n === 0);
  // Two first requests at once: the loser finds the table already made, and that isn't an error.
  const racing = { ready: false, query: async (text: string, params: unknown[] = []) => {
    if (/^create /.test(text)) throw Object.assign(new Error('already exists'), { code: '42P07' });
    if (text === 'select 7 from nowhere') { if (!racing.ready) { racing.ready = true; throw Object.assign(new Error('no table'), { code: '42P01' }); } return [{ ok: 1 }]; }
    return db.query(text, params);
  } };
  setDb(racing);
  check('losing the race to make the tables is fine', (await query<{ ok: number }>('select 7 from nowhere'))[0].ok === 1);
  setDb(db);

  await testPlayers(db);
  await testGames(db);
  await testBoard(db);

  if (failures) { console.error(`\n${failures} failed`); process.exit(1); }
  console.log('\ntest:duel-api: all checks passed.');
}

void main().catch((e) => { console.error(e); process.exit(1); });
