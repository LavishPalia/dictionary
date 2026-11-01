// The Duel UI's logic that runs without a browser: the router, URL flags, tiers and the game controller.
// Usage: npx tsx scripts/test-duel-controller.ts
import { istToday, parsePath } from '../src/duel/ui/router';
import { readFlags } from '../src/duel/ui/flags';

let failures = 0;
function check(label: string, ok: boolean, detail?: unknown) {
  if (ok) console.log(`✓ ${label}`);
  else { failures++; console.error(`✗ ${label}${detail !== undefined ? ` — ${JSON.stringify(detail)}` : ''}`); }
}

async function main() {
  // ── Router ──
  check('IST today rolls over at 18:30 UTC', istToday(new Date('2026-11-01T18:29:59Z')) === '2026-11-01' && istToday(new Date('2026-11-01T18:30:00Z')) === '2026-11-02');
  check('/play → today', (parsePath('/play', '2026-11-01') as any).redirect === '/play/game/2026-11-01');
  check('/play/ → today', (parsePath('/play/', '2026-11-01') as any).redirect === '/play/game/2026-11-01');
  check('a past date opens', (parsePath('/play/game/2026-10-28', '2026-11-01') as any).date === '2026-10-28');
  check('today opens', (parsePath('/play/game/2026-11-01', '2026-11-01') as any).date === '2026-11-01');
  for (const bad of ['/play/game/2026-11-02', '/play/game/banana', '/play/game/2026-02-30', '/play/ranks'])
    check(`${bad} → today`, (parsePath(bad, '2026-11-01') as any).redirect === '/play/game/2026-11-01');

  // ── Flags ──
  check('seed flag', readFlags('?seed=7').seed === 7 && readFlags('?seed=7').test && !readFlags('').test);
  check('bad seed ignored', readFlags('?seed=-1').seed === undefined && readFlags('?seed=4294967296').seed === undefined && readFlags('?seed=1.5').seed === undefined);
  check('tier and perf flags', readFlags('?tier=lite&perf=1').tier === 'lite' && readFlags('?perf=1').perf && readFlags('?tier=fast').tier === undefined);

  if (failures) { console.error(`\n${failures} failed`); process.exit(1); }
  console.log('\nAll duel controller checks passed.');
}
main().catch((e) => { console.error(e); process.exit(1); });
