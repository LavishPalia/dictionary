// Checks the Duel engine (src/duel/engine). Usage: npx tsx scripts/test-duel-engine.ts
import { readFileSync } from 'node:fs';
import { checkPuzzleShape } from '../src/duel/engine/puzzle';
import { nextInt, nextU32, seedRng } from '../src/duel/engine/rng';
import type { Puzzle } from '../src/duel/engine/types';

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

// ---------- puzzle ----------
const p0 = JSON.parse(readFileSync('data/duel/puzzles/p0000.json', 'utf8')) as Puzzle;
{
  check('fixture is shape-valid', checkPuzzleShape(p0).length === 0, checkPuzzleShape(p0));
  check('fixture has 27 slots incl. INDULGE across', p0.slots.length === 27 && p0.slots.some(s => s.answer === 'INDULGE' && s.dir === 'a'), p0.slots.length);
  check('fixture gives exactly 3 letters', p0.given.length === 3);
  check('fixture is 10 rows x 8 cols', p0.rows === 10 && p0.cols === 8);
  const broken = { ...p0, given: [p0.given[0]] };
  check('one given letter is rejected', checkPuzzleShape(broken).some(m => /given/.test(m)), checkPuzzleShape(broken));
  const orphan = { ...p0, slots: p0.slots.filter(s => s.answer !== 'INDULGE') };
  check('a letter cell outside every slot is rejected', checkPuzzleShape(orphan).some(m => /not in any slot/.test(m)), checkPuzzleShape(orphan));
  const badAnswer = { ...p0, slots: p0.slots.map(s => s.answer === 'INDULGE' ? { ...s, answer: 'INDULGX' } : s) };
  check('an answer that disagrees with the solution is rejected', checkPuzzleShape(badAnswer).some(m => /INDULGX/.test(m)));
  const twoAcross = { ...p0, slots: [...p0.slots, { ...p0.slots.find(s => s.answer === 'INDULGE')!, id: 'a:dup' }] };
  check('a cell in two across slots is rejected', checkPuzzleShape(twoAcross).some(m => /across/.test(m)));
  const overlap = { ...p0, clueCells: [...p0.clueCells, p0.slots[0].cells[0]] };
  check('a clue cell that is also a letter cell is rejected', checkPuzzleShape(overlap).some(m => /clue cell/.test(m)));
}

if (failures) { console.error(`\n${failures} failed`); process.exit(1); }
console.log('\nAll duel engine checks passed.');
