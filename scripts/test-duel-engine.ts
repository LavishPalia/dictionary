// Checks the Duel engine (src/duel/engine). Usage: npx tsx scripts/test-duel-engine.ts
import { nextInt, nextU32, seedRng } from '../src/duel/engine/rng';

let failures = 0;
function check(label: string, ok: boolean, detail?: unknown) {
  if (ok) console.log(`✓ ${label}`);
  else { failures++; console.error(`✗ ${label}${detail !== undefined ? ` — ${JSON.stringify(detail)}` : ''}`); }
}

// ---------- rng ----------
{
  const a = seedRng(42, 0), b = seedRng(42, 0), c = seedRng(42, 1);
  const seqA = [0, 1, 2, 3, 4].map(() => nextU32(a)), seqB = [0, 1, 2, 3, 4].map(() => nextU32(b)), seqC = [0, 1, 2, 3, 4].map(() => nextU32(c));
  check('same seed + stream → same sequence', seqA.join() === seqB.join(), seqA);
  check('different stream → different sequence', seqA.join() !== seqC.join());
  check('outputs are uint32', seqA.every(n => Number.isInteger(n) && n >= 0 && n < 2 ** 32), seqA);
  check('state survives JSON', (() => { const s = seedRng(7, 0); nextU32(s); const t = JSON.parse(JSON.stringify(s)); return nextU32(s) === nextU32(t); })());
  const counts = [0, 0, 0, 0, 0, 0]; const r = seedRng(1, 0);
  for (let i = 0; i < 60000; i++) counts[nextInt(r, 6)]++;
  check('nextInt roughly uniform', counts.every(n => n > 9400 && n < 10600), counts);
}

if (failures) { console.error(`\n${failures} failed`); process.exit(1); }
console.log('\nAll duel engine checks passed.');
