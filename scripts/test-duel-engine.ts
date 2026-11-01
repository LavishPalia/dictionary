// Checks the Duel engine (src/duel/engine). Usage: npx tsx scripts/test-duel-engine.ts
import { readFileSync } from 'node:fs';
import { apply, checkInvariant, emptyCells, newGame } from '../src/duel/engine/game';
import { checkPuzzleShape } from '../src/duel/engine/puzzle';
import { nextInt, nextU32, seedRng } from '../src/duel/engine/rng';
import type { CellId, GameEvent, GameState, Puzzle } from '../src/duel/engine/types';

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

// ---------- helpers for hand-built positions ----------
/** A position on p0: `fill` cells settled as yours, your rack exactly `you`, Quill's rack `quill` (or the next letters), the rest in the bag. */
function arrange(opts: { fill?: CellId[]; you: string[]; quill?: string[]; scores?: { you: number; quill: number }; seed?: number }): GameState {
  const s = newGame(p0, opts.seed ?? 1);
  for (const c of opts.fill ?? []) s.filled[c] = { by: 'you', letter: p0.solution[c] };
  const pool = emptyCells(p0, s).map(c => p0.solution[c]);
  const take = (l: string) => { const i = pool.indexOf(l); if (i < 0) throw new Error(`arrange: no ${l} left`); pool.splice(i, 1); return l; };
  const pad = (ls: string[]) => [...ls, ...Array(5 - ls.length).fill(null)] as (string | null)[];
  s.racks.you = pad(opts.you.map(take));
  s.racks.quill = pad(opts.quill ? opts.quill.map(take) : pool.splice(0, Math.min(5, pool.length)));
  s.bag = pool;
  if (opts.scores) s.scores = { ...opts.scores };
  return s;
}
const allCellsBut = (keep: CellId[]) => Object.keys(p0.solution).map(Number).filter(c => !p0.given.includes(c) && !keep.includes(c));
const kinds = (ev: GameEvent[]) => ev.map(e => e.e).join(',');
const words = (ev: GameEvent[]) => ev.filter((e): e is Extract<GameEvent, { e: 'word' }> => e.e === 'word');
function throws(fn: () => unknown) { try { fn(); return false; } catch { return true; } }

// ---------- submit ----------
{
  // A: ETA (65 66 67) completed from empty, plus I (9) and N (10): the whole rack, all correct.
  const sA = arrange({ you: ['E', 'T', 'A', 'I', 'N'] });
  check('A: invariant holds in the arranged position', checkInvariant(p0, sA) === null, checkInvariant(p0, sA));
  const rA = apply(p0, sA, { t: 'submit', place: [{ cell: 65, rackSlot: 0 }, { cell: 66, rackSlot: 1 }, { cell: 67, rackSlot: 2 }, { cell: 9, rackSlot: 3 }, { cell: 10, rackSlot: 4 }] });
  check('A: empty hand first, then judged, then the word', kinds(rA.events).startsWith('emptyHand,score,judged,score,word,score'), kinds(rA.events));
  check('A: 5 correct + ETA 3 + empty hand 5 = 13', rA.state.scores.you === 13, rA.state.scores);
  check('A: the input state is not changed', sA.scores.you === 0 && !sA.filled[65]);
  // G: after A
  const refill = rA.events.find(e => e.e === 'refill') as Extract<GameEvent, { e: 'refill' }>;
  check('G: turn passes to quill, streak reset, invariant holds', rA.state.turn === 'quill' && rA.state.passStreak === 0 && checkInvariant(p0, rA.state) === null);
  check('G: refill lists the 5 refilled slots', refill?.rackSlots.join() === '0,1,2,3,4' && refill.letters.length === 5 && rA.state.racks.you.every(l => l), refill);
  check('G: the action is logged', rA.state.log.length === 1 && rA.state.log[0].t === 'submit');
  check('G: events end with the turn going to quill', rA.events.at(-1)?.e === 'turn');

  // B: a single wrong tile at 0 stays 0 and goes back to its own slot
  const sB = arrange({ you: ['I', 'N', 'D', 'U', 'L'] });
  const rB = apply(p0, sB, { t: 'submit', place: [{ cell: 10, rackSlot: 0 }] });
  check('B: 0 − 1 stays 0', rB.state.scores.you === 0, rB.state.scores);
  check('B: the wrong tile returns to its own rack slot', rB.state.racks.you[0] === 'I' && rB.events.some(e => e.e === 'returned' && e.rackSlots.join() === '0'));
  check('B: no empty hand', !rB.events.some(e => e.e === 'emptyHand'));
  check('B: the cell stays empty', !rB.state.filled[10]);
  check('B: nothing to refill, but the refill event is there', rB.events.some(e => e.e === 'refill' && e.rackSlots.length === 0));

  // C: one right, one wrong at 0 → net 0; no score step ever negative
  const rC = apply(p0, sB, { t: 'submit', place: [{ cell: 9, rackSlot: 0 }, { cell: 11, rackSlot: 1 }] });
  check('C: +1 −1 from 0 is 0', rC.state.scores.you === 0);
  const rC2 = apply(p0, arrange({ you: ['I', 'N', 'D', 'U', 'L'], scores: { you: 1, quill: 0 } }), { t: 'submit', place: [{ cell: 9, rackSlot: 0 }, { cell: 11, rackSlot: 1 }, { cell: 12, rackSlot: 2 }] });
  check('C: 1 + 1 − 2 = 0, not negative', rC2.state.scores.you === 0, rC2.state.scores);
  check('C: no score event goes below 0', [rB, rC, rC2].every(r => r.events.every(e => e.e !== 'score' || e.to >= 0)));

  // D: the T at 66 completes TI (66 74) and ETA (65 66 67) at once
  const sD = arrange({ fill: [65, 67, 74], you: ['T'] });
  const rD = apply(p0, sD, { t: 'submit', place: [{ cell: 66, rackSlot: 0 }] });
  check('D: both words pay, shortest first', words(rD.events).map(w => w.points).join() === '2,3', words(rD.events));
  check('D: 1 tile + 2 + 3 + empty hand 5 = 11', rD.state.scores.you === 11, rD.state.scores);

  // E: whole rack, one wrong → no empty hand
  const rE = apply(p0, sB, { t: 'submit', place: [{ cell: 9, rackSlot: 0 }, { cell: 10, rackSlot: 1 }, { cell: 11, rackSlot: 2 }, { cell: 12, rackSlot: 3 }, { cell: 14, rackSlot: 4 }] });
  check('E: no empty hand with a wrong tile', !rE.events.some(e => e.e === 'emptyHand') && rE.state.scores.you === 3, rE.state.scores);

  // F: illegal submits
  check('F: on a given cell', throws(() => apply(p0, sB, { t: 'submit', place: [{ cell: 25, rackSlot: 0 }] })));
  check('F: when it is Quill’s turn', throws(() => apply(p0, { ...sB, turn: 'quill' }, { t: 'submit', place: [{ cell: 9, rackSlot: 0 }] })));
  check('F: with nothing placed', throws(() => apply(p0, sB, { t: 'submit', place: [] })));
  check('F: the same rack slot twice', throws(() => apply(p0, sB, { t: 'submit', place: [{ cell: 9, rackSlot: 0 }, { cell: 10, rackSlot: 0 }] })));
  check('F: the same cell twice', throws(() => apply(p0, sB, { t: 'submit', place: [{ cell: 9, rackSlot: 0 }, { cell: 9, rackSlot: 1 }] })));
  check('F: an empty rack slot', throws(() => apply(p0, sD, { t: 'submit', place: [{ cell: 66, rackSlot: 3 }] })));
  check('F: a rack slot out of range', throws(() => apply(p0, sB, { t: 'submit', place: [{ cell: 9, rackSlot: 5 }] })));
  check('F: a clue cell', throws(() => apply(p0, sB, { t: 'submit', place: [{ cell: 0, rackSlot: 0 }] })));

  // the last cells: game over
  const sEnd = arrange({ fill: allCellsBut([9, 10]), you: ['I', 'N'], quill: [], scores: { you: 10, quill: 20 } });
  const rEnd = apply(p0, sEnd, { t: 'submit', place: [{ cell: 9, rackSlot: 0 }, { cell: 10, rackSlot: 1 }] });
  const over = rEnd.events.at(-1) as Extract<GameEvent, { e: 'gameOver' }>;
  check('end: filling the last cell ends the game', rEnd.state.over && over?.e === 'gameOver' && !rEnd.events.some(e => e.e === 'turn'), kinds(rEnd.events));
  check('end: 10 + 2 + ITS 3 + NOTION 6 + INDULGE 7 + empty hand 5 = 33, a win', rEnd.state.scores.you === 33 && over.result === 'win', rEnd.state.scores);
  check('end: no moves after the game is over', throws(() => apply(p0, rEnd.state, { t: 'pass' })));
}

if (failures) { console.error(`\n${failures} failed`); process.exit(1); }
console.log('\nAll duel engine checks passed.');
