// Checks the Duel engine (src/duel/engine). Usage: npx tsx scripts/test-duel-engine.ts
import { readFileSync } from 'node:fs';
import { BOT, botTurn, countWeights } from '../src/duel/engine/bot';
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
  // C3: from 0, one right tile finishing TO (17 18) and two wrong tiles: −1 floors to 0 first, then +2 for the word
  const rC3 = apply(p0, arrange({ fill: [17], you: ['O', 'I', 'N'] }), { t: 'submit', place: [{ cell: 18, rackSlot: 0 }, { cell: 11, rackSlot: 1 }, { cell: 12, rackSlot: 2 }] });
  const steps = rC3.events.filter((e): e is Extract<GameEvent, { e: 'score' }> => e.e === 'score').map(e => `${e.from}→${e.to}`).join(' ');
  check('C3: the floor applies before word bonuses (0 → 0 → 2)', rC3.state.scores.you === 2 && steps === '0→0 0→2', steps);
  check('C: no score event goes below 0', [rB, rC, rC2].every(r => r.events.every(e => e.e !== 'score' || e.to >= 0)));

  // D: the T at 66 completes TI (66 74) and ETA (65 66 67) at once
  const sD = arrange({ fill: [65, 67, 74], you: ['T'] });
  const rD = apply(p0, sD, { t: 'submit', place: [{ cell: 66, rackSlot: 0 }] });
  check('D: both words pay, shortest first', words(rD.events).map(w => w.points).join() === '2,3', words(rD.events));
  check('D: 1 tile + 2 + 3 = 6 (the last tile in the rack is no empty hand)', rD.state.scores.you === 6 && !rD.events.some(e => e.e === 'emptyHand'), rD.state.scores);

  // D2: the end of the game: 3 tiles left in the rack, all 3 right → no empty hand (it needs a full rack of 5)
  const rD2 = apply(p0, arrange({ fill: allCellsBut([65, 66, 67]), you: ['E', 'T', 'A'] }), { t: 'submit', place: [{ cell: 65, rackSlot: 0 }, { cell: 66, rackSlot: 1 }, { cell: 67, rackSlot: 2 }] });
  check('D2: 3 of 3 right at the end: no empty hand', !rD2.events.some(e => e.e === 'emptyHand'), kinds(rD2.events));

  // D3: a one-letter answer gets no word bonus
  {
    const p1: Puzzle = JSON.parse(JSON.stringify(p0));
    p1.slots.push({ id: 'd:1:3', dir: 'd', cells: [11], answer: 'D', clueCell: 3, clue: { kind: 'abbr', text: 'Roman 500', full: 'Roman 500' }, sense: { en: 'Roman 500', hi: '' } });
    const rD3 = apply(p1, arrange({ you: ['D'] }), { t: 'submit', place: [{ cell: 11, rackSlot: 0 }] });
    check('D3: a one-letter answer pays only its tile', rD3.state.scores.you === 1 && !rD3.events.some(e => e.e === 'word'), kinds(rD3.events));
  }

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
  check('end: 10 + 2 + ITS 3 + NOTION 6 + INDULGE 7 = 28 (2 last tiles are no empty hand), a win', rEnd.state.scores.you === 28 && over.result === 'win', rEnd.state.scores);
  check('end: no moves after the game is over', throws(() => apply(p0, rEnd.state, { t: 'pass' })));
}

// ---------- pass, swap, reveal, hint ----------
{
  const s = newGame(p0, 9);
  const rP = apply(p0, s, { t: 'pass' });
  check('pass ends the turn, streak 1', rP.state.turn === 'quill' && rP.state.passStreak === 1 && kinds(rP.events) === 'passed,turn', kinds(rP.events));
  check('pass is logged and changes no score', rP.state.log.at(-1)?.t === 'pass' && rP.state.scores.you === 0);

  const rS = apply(p0, s, { t: 'swap', rackSlots: [0, 1] });
  check('swap keeps the invariant and ends the turn', checkInvariant(p0, rS.state) === null && rS.state.turn === 'quill');
  check('swap events: swapped, passed, turn', kinds(rS.events) === 'swapped,passed,turn', kinds(rS.events));
  check('swap is reproducible', JSON.stringify(apply(p0, s, { t: 'swap', rackSlots: [0, 1] }).state) === JSON.stringify(rS.state));
  check('swap draws new tiles before the old ones go back', rS.state.racks.you[0] === s.bag[0] && rS.state.racks.you[1] === s.bag[1]);
  check('swap leaves the other slots alone', rS.state.racks.you.slice(2).join() === s.racks.you.slice(2).join());
  check('swap counts as a pass for the streak', rS.state.passStreak === 1);

  // 11 empty cells: INDULGE (9–15) + 17 18 20 21 → you 5, Quill 5, bag 1
  const low = arrange({ fill: allCellsBut([9, 10, 11, 12, 13, 14, 15, 17, 18, 20, 21]), you: ['I', 'N', 'D', 'U', 'L'], quill: ['G', 'E', 'T', 'O', 'R'] });
  check('low-bag position: bag holds 1, invariant holds', low.bag.length === 1 && checkInvariant(p0, low) === null, low.bag);
  check('swapping more tiles than the bag holds is illegal', throws(() => apply(p0, low, { t: 'swap', rackSlots: [0, 1] })));
  check('swapping as many as the bag holds is fine', apply(p0, low, { t: 'swap', rackSlots: [0] }).state.bag.length === 1);
  check('swap of 0 tiles is illegal', throws(() => apply(p0, s, { t: 'swap', rackSlots: [] })));
  check('swap of the same slot twice is illegal', throws(() => apply(p0, s, { t: 'swap', rackSlots: [2, 2] })));
  check('swap of an empty slot is illegal', throws(() => apply(p0, arrange({ fill: [65, 67, 74], you: ['T'] }), { t: 'swap', rackSlots: [1] })));

  const slot0 = p0.slots[0].id;
  const rR = apply(p0, s, { t: 'reveal', slot: slot0 });
  check('reveal adds ghosts and keeps your turn', rR.state.ghosts.join() === slot0 && rR.state.turn === 'you');
  check('reveal reports the slot’s empty cells', rR.events.length === 1 && rR.events[0].e === 'ghosts' && rR.events[0].cells.join() === p0.slots[0].cells.join());
  check('revealing the same slot twice is illegal', throws(() => apply(p0, rR.state, { t: 'reveal', slot: slot0 })));
  check('revealing an unknown slot is illegal', throws(() => apply(p0, s, { t: 'reveal', slot: 'a:99:99' })));
  const full = apply(p0, arrange({ fill: [65, 67, 74], you: ['T'] }), { t: 'submit', place: [{ cell: 66, rackSlot: 0 }] }).state;
  check('revealing a finished slot is illegal', throws(() => apply(p0, { ...full, turn: 'you' }, { t: 'reveal', slot: 'a:8:1' })));

  const rH = apply(p0, s, { t: 'hint' });
  check('hint keeps your turn and is logged', rH.state.turn === 'you' && rH.state.log.at(-1)?.t === 'hint' && rH.events.length === 0);
  check('a second hint in the same turn is illegal', throws(() => apply(p0, rH.state, { t: 'hint' })));
  check('a hint is fine again next turn', (() => { const next = botTurn(p0, apply(p0, rH.state, { t: 'pass' }).state).state; return apply(p0, next, { t: 'hint' }).state.log.at(-1)?.t === 'hint'; })());
  check('a reveal between two hints does not reset the turn', throws(() => apply(p0, apply(p0, rH.state, { t: 'reveal', slot: slot0 }).state, { t: 'hint' })));

  let x = s;
  for (let i = 0; i < 100; i++) { x = apply(p0, x, { t: 'pass' }).state; x = { ...x, turn: 'you' }; }
  check('100 passes in a row stay legal', x.passStreak === 100);
  check('a submit resets the pass streak', apply(p0, x, { t: 'submit', place: [{ cell: p0.slots[0].cells[0], rackSlot: 0 }] }).state.passStreak === 0);
}

// ---------- Professor Quill ----------
{
  const placedOf = (ev: GameEvent[]) => (ev.find(e => e.e === 'botPlaced') as Extract<GameEvent, { e: 'botPlaced' }>).tiles;
  const judgedOf = (ev: GameEvent[]) => (ev.find(e => e.e === 'judged') as Extract<GameEvent, { e: 'judged' }>).tiles;
  const s = apply(p0, newGame(p0, 11), { t: 'pass' }).state;
  const b = botTurn(p0, s);
  const n = placedOf(b.events).length;
  check('quill places 1–5 tiles', n >= 1 && n <= 5, n);
  check('quill turn is deterministic', JSON.stringify(botTurn(p0, s)) === JSON.stringify(b));
  check('turn returns to you, invariant holds', b.state.turn === 'you' && checkInvariant(p0, b.state) === null);
  check('lastQuill = his correct cells', b.state.lastQuill.length === judgedOf(b.events).filter(t => t.ok).length && b.state.lastQuill.every(c => b.state.filled[c]?.by === 'quill'));
  check('his turn is not logged', b.state.log.length === s.log.length);
  check('his turn keeps your pass streak (the remark shows once per streak)', b.state.passStreak === 1);
  check('events: botPlaced then judged', kinds(b.events).startsWith('botPlaced,') && kinds(b.events).includes('judged'), kinds(b.events));
  check('the input state is not changed', JSON.stringify(s) === JSON.stringify(apply(p0, newGame(p0, 11), { t: 'pass' }).state));

  // Over many openings: never 0 tiles, never wrong, mostly few tiles and seldom 5
  let tiles = 0, wrongs = 0, zero = 0, fives = 0, ones = 0;
  for (let seed = 1; seed <= 400; seed++) {
    const st = apply(p0, newGame(p0, seed), { t: 'pass' }).state;
    const t = judgedOf(botTurn(p0, st).events);
    tiles += t.length; wrongs += t.filter(x => !x.ok).length;
    if (t.length === 0) zero++; if (t.length === 5) fives++; if (t.length === 1) ones++;
  }
  check('400 openings: never 0 tiles, never a wrong tile', zero === 0 && wrongs === 0, { zero, wrongs });
  check('400 openings: 5 tiles seldom (< 5 %), 1 tile most often (> 50 %)', fives < 20 && ones > 200, { fives, ones });

  // The count weights blend from few tiles to mostly 5
  check('count weights: 1 is likeliest at the start, 5 at the end', (() => { const a = countWeights(0), z = countWeights(1); return a[0] === Math.max(...a) && z[4] === Math.max(...z) && z[4] / z.reduce((x, y) => x + y) > 0.5; })());
  check('count weights: 5 has a chance mid-game', countWeights(0.6)[4] > 0);

  // Near the end with a full rack he mostly plays all 5, and Empty hand (+5) is his too
  let all5 = 0, emptyHands = 0;
  const keep = Object.keys(p0.solution).map(Number).filter(c => !p0.given.includes(c)).slice(-8);
  for (let seed = 1; seed <= 100; seed++) {
    const st = { ...arrange({ fill: allCellsBut(keep), you: [], quill: keep.slice(0, 5).map(c => p0.solution[c]), seed }), turn: 'quill' as const };
    st.racks.you = [...st.bag.splice(0, 3), null, null];
    const r = botTurn(p0, st);
    if (placedOf(r.events).length === 5) all5++;
    if (r.events.some(e => e.e === 'emptyHand' && e.who === 'quill')) emptyHands++;
  }
  check('near the end (8 cells left) he plays all 5 in most turns (> 50 of 100)', all5 > 50, all5);
  check('…and every one of those is an Empty hand (+5)', emptyHands === all5, { all5, emptyHands });

  // He aims about 65 % of the time: T at 66 completes TI and ETA, the best cell for any count
  let finished = 0;
  for (let seed = 1; seed <= 400; seed++) {
    const st = { ...arrange({ fill: [65, 67, 74], you: ['I', 'N', 'D', 'U', 'L'], quill: ['T', 'O', 'R', 'H', 'E'], seed }), turn: 'quill' as const };
    if (judgedOf(botTurn(p0, st).events).some(t => t.cell === 66 && t.ok)) finished++;
  }
  check('he takes the scoring cell in about 65 % + chance of turns (240–340 of 400)', finished >= 240 && finished <= 340, finished);
  const aimOnly = (() => { const keepAim = BOT.aimChance; BOT.aimChance = 1; try {
    let n = 0;
    for (let seed = 1; seed <= 100; seed++) {
      const st = { ...arrange({ fill: [65, 67, 74], you: ['I', 'N', 'D', 'U', 'L'], quill: ['T', 'O', 'R', 'H', 'E'], seed }), turn: 'quill' as const };
      if (judgedOf(botTurn(p0, st).events).some(t => t.cell === 66)) n++;
    }
    return n;
  } finally { BOT.aimChance = keepAim; } })();
  check('an aimed turn always takes the scoring cell (100 of 100)', aimOnly === 100, aimOnly);

  // The end: one empty cell, its letter in his rack
  for (let seed = 1; seed <= 30; seed++) {
    const end = { ...arrange({ fill: allCellsBut([9]), you: [], quill: ['I'], seed }), turn: 'quill' as const };
    const r = botTurn(p0, end);
    if (placedOf(r.events).length !== 1 || !judgedOf(r.events).every(t => t.ok) || !r.state.over) {
      check(`one empty cell left (seed ${seed}): exactly 1 right tile and the game ends`, false, kinds(r.events));
      break;
    }
    if (seed === 30) check('one empty cell left: exactly 1 right tile and the game ends (30 seeds)', true);
  }

  // No tiles at all: he gets no turn
  const bare = { ...arrange({ fill: allCellsBut([9, 10]), you: ['I', 'N'], quill: [] }), turn: 'quill' as const };
  check('botTurn with an empty rack is illegal (endTurn never gives him one)', throws(() => botTurn(p0, bare)));
  const rSkip = apply(p0, { ...bare, turn: 'you' }, { t: 'submit', place: [{ cell: 9, rackSlot: 0 }] });
  check('your turn ends and his rack is empty: you move again', rSkip.state.turn === 'you' && !rSkip.state.over && (rSkip.events.at(-1) as Extract<GameEvent, { e: 'turn' }>).who === 'you', kinds(rSkip.events));
  const rSkipPass = apply(p0, { ...bare, turn: 'you' }, { t: 'pass' });
  check('…the same after a pass', rSkipPass.state.turn === 'you');

  // Your rack runs dry: Quill keeps moving until the board is full
  const dry = { ...arrange({ fill: allCellsBut([9, 10, 11, 12, 13, 14]), you: ['I'], quill: ['N', 'D', 'U', 'L', 'G'] }), turn: 'you' as const };
  const rDry = apply(p0, dry, { t: 'submit', place: [{ cell: 9, rackSlot: 0 }] });
  check('your last tile played: the turn goes to Quill', rDry.state.turn === 'quill' && rDry.state.racks.you.every(l => l === null), rDry.state.racks.you);
  let q = rDry.state, quillTurns = 0;
  while (!q.over && q.turn === 'quill' && quillTurns < 20) { q = botTurn(p0, q).state; quillTurns++; }
  check('…and he plays turn after turn until the board is full', q.over && emptyCells(p0, q).length === 0 && quillTurns >= 1, { quillTurns, over: q.over, turn: q.turn });
  const multi = (() => { for (let seed = 1; seed <= 50; seed++) {
    let st: GameState = apply(p0, { ...dry, rng: newGame(p0, seed).rng }, { t: 'submit', place: [{ cell: 9, rackSlot: 0 }] }).state, n = 0;
    while (!st.over && st.turn === 'quill') { st = botTurn(p0, st).state; n++; }
    if (n >= 2) return { seed, n, over: st.over };
  } return null; })();
  check('…sometimes over several turns in a row, each one his', multi !== null && multi.over, multi);

  check('botTurn on your turn is illegal', throws(() => botTurn(p0, newGame(p0, 1))));
}

if (failures) { console.error(`\n${failures} failed`); process.exit(1); }
console.log('\nAll duel engine checks passed.');
