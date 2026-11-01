// Checks the Duel engine (src/duel/engine). Usage: npx tsx scripts/test-duel-engine.ts
import { readFileSync } from 'node:fs';
import { checkInvariant, emptyCells, newGame } from '../src/duel/engine/game';
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

// ---------- new game ----------
{
  const g1 = newGame(p0, 123), g2 = newGame(p0, 123), g3 = newGame(p0, 124);
  check('same seed → same deal', JSON.stringify(g1) === JSON.stringify(g2));
  check('different seed → different deal', g1.racks.you.join() !== g3.racks.you.join() || g1.bag.join() !== g3.bag.join());
  check('racks hold 5 each, you move first, 0–0', g1.racks.you.length === 5 && g1.racks.quill.length === 5 && [...g1.racks.you, ...g1.racks.quill].every(l => l) && g1.turn === 'you' && g1.scores.you === 0 && g1.scores.quill === 0);
  check('given cells are pre-filled', p0.given.every(c => g1.filled[c]?.by === 'given' && g1.filled[c].letter === p0.solution[c]));
  check('only given cells are filled at start', Object.keys(g1.filled).length === 3);
  check('bag holds the rest: 52 − 3 given − 10 dealt = 39', g1.bag.length === 39, g1.bag.length);
  check('empty cells = 49', emptyCells(p0, g1).length === 49);
  check('invariant holds at start', checkInvariant(p0, g1) === null, checkInvariant(p0, g1));
  check('a broken bag breaks the invariant', checkInvariant(p0, { ...g1, bag: [...g1.bag.slice(1), 'Q'] }) !== null);
  check('state is plain JSON', JSON.stringify(JSON.parse(JSON.stringify(g1))) === JSON.stringify(g1));
  check('rules version 1, seed and puzzle recorded', g1.rulesVersion === 1 && g1.seed === 123 && g1.puzzleId === 'p0000' && g1.puzzleVersion === 1);
}

if (failures) { console.error(`\n${failures} failed`); process.exit(1); }
console.log('\nAll duel engine checks passed.');
