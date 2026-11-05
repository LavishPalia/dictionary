// The live check: the real routes on a preview deployment, with the real Neon driver behind them.
// Registers a throwaway player and plays a real game. Refuses production, so test rows never reach the real board.
// Usage: npm run duel:smoke -- https://<preview-url>
import { randomBytes, randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { istToday } from '../../src/duel/progress';
import { loadPuzzle, playGame, reportOf } from './play';

const base = (process.argv[2] ?? '').replace(/\/$/, '');
if (!/^https?:\/\//.test(base)) { console.error('Usage: npm run duel:smoke -- https://<preview-url>'); process.exit(2); }
if (new URL(base).hostname === 'panna-ashen.vercel.app') { console.error('Not on production: this writes test rows.'); process.exit(2); }

let failures = 0;
function check(label: string, ok: boolean, detail?: unknown) {
  if (ok) console.log(`✓ ${label}`);
  else { failures++; console.error(`✗ ${label}${detail !== undefined ? ` — ${JSON.stringify(detail)}` : ''}`); }
}

const today = istToday(new Date());
const schedule = JSON.parse(readFileSync('data/duel/schedule.json', 'utf8')) as Record<string, string>;
const key = schedule[today] ?? 'p0067.v1';
const p = loadPuzzle(key);
const me = { id: randomUUID(), token: randomBytes(32).toString('hex') };
const auth = { Authorization: `Bearer ${me.id}.${me.token}` };
const send = (path: string, body: unknown, method = 'POST', headers: Record<string, string> = auth) =>
  fetch(`${base}/api/duel/${path}`, { method, headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body) });

async function main() {
  const reg = await send('players', me, 'POST', {});
  if (reg.status === 401 || reg.status === 403 || (reg.headers.get('content-type') ?? '').includes('text/html')) {
    console.error(`Vercel's login wall answered (${reg.status}). Check this on the preview in a browser instead.`);
    process.exit(3);
  }
  const { name } = await reg.json() as { name: string };
  check('a new player is registered', reg.status === 200 && !!name, reg.status);

  const seed = randomBytes(4).readUInt32LE(0);
  const game = reportOf(key, today, seed, playGame(p, seed), new Date(Date.now() - 60_000));
  const first = await (await send('games', game)).json() as { status: string; score: number; weekTotal: number; rank: number };
  check('a real game is accepted', first.status === 'ok' && first.score === game.claimedScore && first.weekTotal === game.claimedScore, first);
  const again = await (await send('games', game)).json() as { status: string; weekTotal: number };
  check('sent again it counts once', again.status === 'ok' && again.weekTotal === game.claimedScore, again);

  const seed2 = randomBytes(4).readUInt32LE(0);
  const fake = { ...reportOf(key, today, seed2, playGame(p, seed2), new Date(Date.now() - 60_000)), claimedScore: 9999 };
  const refused = await (await send('games', fake)).json() as { status: string; reason: string; weekTotal: number };
  check('a made-up score is refused', refused.status === 'rejected' && refused.reason === 'mismatch' && refused.weekTotal === game.claimedScore, refused);

  const board = await fetch(`${base}/api/duel/leaderboard?week=this`);
  const rows = (await board.json() as { rows: { name: string; points: number; bot: boolean }[] }).rows;
  check('the board has the bots', rows.filter(r => r.bot).length === 8, rows.length);
  check('the board may be cached', (board.headers.get('cache-control') ?? '').length > 0, board.headers.get('cache-control'));

  const mine = await (await fetch(`${base}/api/duel/leaderboard/me?week=this`, { headers: auth })).json() as { name: string; points: number; rank: number };
  check('your own row is right', mine.name === name && mine.points === game.claimedScore && Number.isInteger(mine.rank), mine);

  const renamed = await (await send('players/me', { name: `Smoke ${seed.toString(36).slice(0, 8)}` }, 'PATCH')).json() as { name?: string };
  check('the word lists reached the server (a rename works)', !!renamed.name, renamed);
  const blocked = await (await send('players/me', { name: 'fuck face' }, 'PATCH')).json() as { error?: string };
  check('a rude name is refused', blocked.error === 'blocked', blocked);

  if (failures) { console.error(`\n${failures} failed`); process.exit(1); }
  console.log('\nThe live check passed.');
}

void main().catch((e) => { console.error(e instanceof Error ? e.message : 'failed'); process.exit(1); });
