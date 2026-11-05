// The Duel's server on a real Postgres (PGlite): weeks, players, the score check and the leaderboard.
// Usage: npx tsx scripts/test-duel-api.ts   (needs no server, database or network)
import { DbUnavailable, query, setDb } from '../src/duel/server/db';
import { guard } from '../src/duel/server/http';
import { addWeeks, creditWeek, weekEnds, weekOf } from '../src/duel/server/week';
import { testDb } from './duel/test-db';

let failures = 0;
function check(label: string, ok: boolean, detail?: unknown) {
  if (ok) console.log(`✓ ${label}`);
  else { failures++; console.error(`✗ ${label}${detail !== undefined ? ` — ${JSON.stringify(detail)}` : ''}`); }
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

  if (failures) { console.error(`\n${failures} failed`); process.exit(1); }
  console.log('\ntest:duel-api: all checks passed.');
}

void main().catch((e) => { console.error(e); process.exit(1); });
