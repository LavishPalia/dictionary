// The Duel's server on a real Postgres (PGlite): weeks, players, the score check and the leaderboard.
// Usage: npx tsx scripts/test-duel-api.ts   (needs no server, database or network)
import { randomBytes, randomUUID } from 'node:crypto';
import { ADJECTIVES, checkNameShape, nameKey, NOUNS } from '../src/duel/names';
import { DbUnavailable, query, setDb } from '../src/duel/server/db';
import { guard } from '../src/duel/server/http';
import { isBlockedName, registerPlayer, renamePlayer } from '../src/duel/server/players';
import { addWeeks, creditWeek, weekEnds, weekOf } from '../src/duel/server/week';
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
  check('a swear word with letter swaps', await errorOf(await rename(a, 'f u c k 3r')) === 'blocked' && await errorOf(await rename(a, 'sh1t lord')) === 'blocked');
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
  setDb(db);
  check('applying it again does nothing', (await query<{ n: number }>('select count(*)::int as n from weekly_totals'))[0].n === 0);

  await testPlayers(db);

  if (failures) { console.error(`\n${failures} failed`); process.exit(1); }
  console.log('\ntest:duel-api: all checks passed.');
}

void main().catch((e) => { console.error(e); process.exit(1); });
