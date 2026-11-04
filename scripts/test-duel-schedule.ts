// The web puzzle source (src/duel/platform/web/puzzles.ts): the schedule picks each date's puzzle, an unscheduled
// date plays the practice puzzle, and a failed request is an error, never a practice game.
// Usage: npx tsx scripts/test-duel-schedule.ts
import { readFileSync } from 'node:fs';
import { webPuzzles } from '../src/duel/platform/web/puzzles';

let failures = 0;
function check(label: string, ok: boolean, detail?: unknown) {
  if (ok) console.log(`✓ ${label}`);
  else { failures++; console.error(`✗ ${label}${detail !== undefined ? ` — ${JSON.stringify(detail)}` : ''}`); }
}

const P0 = readFileSync('data/duel/puzzles/p0000.json', 'utf8');
const SCHEDULE = { dates: { '2026-11-01': 'p0000.v1' }, files: { 'p0000.v1': 'p0000.v1.abcd1234.json' } };

/** A fake fetch serving the given bodies by path; a function body may throw (a network error). */
function fakeFetch(routes: Record<string, unknown>) {
  const seen: string[] = [];
  const fn = (async (url: string) => {
    seen.push(url);
    const body = routes[url];
    if (typeof body === 'function') return body();
    if (body === undefined) return new Response('not found', { status: 404 });
    if (typeof body === 'number') return new Response('', { status: body });
    return new Response(typeof body === 'string' ? body : JSON.stringify(body), { status: 200 });
  }) as unknown as typeof fetch;
  return { fn, seen };
}
const rejects = (p: Promise<unknown>) => p.then(() => false, () => true);

async function main() {
  {
    const f = fakeFetch({ '/duel/schedule.json': { dates: {}, files: {} } });
    const d = await webPuzzles(f.fn).forDate('2026-11-04');
    check('empty schedule → practice p0001', d.practice && d.puzzle.id === 'p0001');
  }
  {
    const f = fakeFetch({ '/duel/schedule.json': SCHEDULE, '/duel/p/p0000.v1.abcd1234.json': P0 });
    const src = webPuzzles(f.fn);
    const d = await src.forDate('2026-11-01');
    check('scheduled date → its puzzle', !d.practice && d.puzzle.id === 'p0000', d.puzzle.id);
    check('fetched the hashed file', f.seen.includes('/duel/p/p0000.v1.abcd1234.json'), f.seen);
    const u = await src.forDate('2026-11-02');
    check('unscheduled date beside it → practice', u.practice && u.puzzle.id === 'p0001');
    await src.schedule();
    check('schedule fetched once', f.seen.filter(u => u === '/duel/schedule.json').length === 1, f.seen);
  }
  {
    const f = fakeFetch({ '/duel/schedule.json': () => { throw new TypeError('Failed to fetch'); } });
    check('network error → rejects, no practice', await rejects(webPuzzles(f.fn).forDate('2026-11-04')));
  }
  {
    const f = fakeFetch({ '/duel/schedule.json': 500 });
    check('schedule 500 → rejects', await rejects(webPuzzles(f.fn).forDate('2026-11-04')));
  }
  {
    const f = fakeFetch({ '/duel/schedule.json': { dates: [], files: {} } });
    check('schedule of the wrong shape → rejects', await rejects(webPuzzles(f.fn).forDate('2026-11-04')));
  }
  {
    const f = fakeFetch({ '/duel/schedule.json': { dates: { '2026-11-01': 'p0000.v2' }, files: { 'p0000.v2': 'x.json' } }, '/duel/p/x.json': P0 });
    check("a file whose id/version isn't the key → rejects", await rejects(webPuzzles(f.fn).forDate('2026-11-01')));
  }
  {
    const f = fakeFetch({ '/duel/schedule.json': SCHEDULE, '/duel/p/p0000.v1.abcd1234.json': { id: 'p0000', version: 1 } });
    check('a broken puzzle file → rejects', await rejects(webPuzzles(f.fn).forDate('2026-11-01')));
  }
  {
    let n = 0;
    const f = fakeFetch({ '/duel/schedule.json': () => (++n === 1 ? new Response('', { status: 503 }) : new Response(JSON.stringify(SCHEDULE))) });
    const src = webPuzzles(f.fn);
    const first = await rejects(src.schedule());
    check('a failed schedule is retried next time', first && (await src.schedule()).dates['2026-11-01'] === 'p0000.v1');
  }

  if (failures) { console.error(`\n${failures} failed`); process.exit(1); }
  console.log('\nAll duel schedule checks passed.');
}
void main();
