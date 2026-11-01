// One-off: writes data/duel/puzzles/p0001.json, the practice puzzle M2 plays on every date, under the
// board rules the user set on 1 Nov: the first letter row and the first letter column are all letters,
// and every square in the top and left clue borders gives a clue. A border letter with no word the
// other way gets a one-letter answer (N = North), as in arrowword apps; it scores no word bonus.
// No "briefly" in clues: the answer's length already says it is short. Grid found with scratch/duel-ui/fill2.js.
// Usage: npx tsx scripts/duel/fixture-practice.ts
import { writeFileSync } from 'node:fs';
import { checkPuzzleShape } from '../../src/duel/engine/puzzle';
import type { Clue, Puzzle, Slot } from '../../src/duel/engine/types';

// The 9 x 7 letter area; the board adds a clue row on top and a clue column on the left.
const SOL = ['penalty', 'ox#nor#', 'to#tour', 'at##see', 'sit#e#v', 'scar#me', 'i#sober', 'u#twins', 'may#due'];
const GIVEN = [[2, 3], [5, 5], [8, 2]];
type ProtoClue = string | { k?: Clue['kind']; t?: string; img?: string; x?: string; full: string };
const CLUE: Record<string, ProtoClue> = {
  // across
  penalty: 'Spot kick', ox: { img: '1f402', full: 'Picture: a strong farm beast' }, nor: 'Neither’s partner', to: 'Towards',
  tour: 'Trip around', at: { t: 'LOOK __ ME', full: 'Fill the gap: Look _ _ me' }, see: 'Spot', sit: 'Take a seat', scar: 'Mark left by a wound',
  me: 'Not you', sober: 'Not drunk', twins: 'Two born together', may: 'Month after April', due: 'Owed',
  // down
  potassium: 'Mineral in bananas', exotic: 'From far away', tasty: 'Delicious', ant: { img: '1f41c', full: 'Picture: a tiny worker insect' },
  row: 'Line of seats', loose: 'Opposite of tight', bid: { img: '1f426', x: '−r', full: 'Picture maths: bird minus R' }, true: 'Opposite of false',
  menu: 'Food list', reverse: 'Go backwards',
};
// One-letter answers in the border, keyed by the letter cell (row, col in the letter area).
const ONE: Record<string, ProtoClue> = {
  '0,2': { k: 'abbr', full: 'North' },
  '0,6': { k: 'def', full: 'Sounds like “why”' },
  '6,0': { t: 'ME, MYSELF & _', full: 'Fill the gap: Me, myself and _' },
  '7,0': { k: 'def', full: 'Sounds like “you”' },
};

const ROWS = 10, COLS = 8;
const id = (r: number, c: number) => r * COLS + c;
const sol = (r: number, c: number) => (r < 1 || c < 1 || r >= ROWS || c >= COLS) ? null : (SOL[r - 1][c - 1] === '#' ? null : SOL[r - 1][c - 1]);

function clueOf(c: ProtoClue | undefined, what: string): Clue {
  if (c === undefined) throw new Error(`no clue for ${what}`);
  if (typeof c === 'string') return { kind: /^Opposite of/.test(c) ? 'rel' : 'def', text: c, full: c };
  if (c.img && c.x) return { kind: 'picmath', img: c.img, math: c.x, full: c.full };
  if (c.img) return { kind: 'pic', img: c.img, full: c.full };
  if (c.t) return { kind: 'gap', text: c.t, full: c.full };
  return { kind: c.k ?? 'def', text: c.full, full: c.full };
}

const solution: Record<number, string> = {};
const clueCells: number[] = [];
for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
  const ch = sol(r, c);
  if (ch) solution[id(r, c)] = ch.toUpperCase(); else clueCells.push(id(r, c));
}

const slots: Slot[] = [];
const push = (dir: 'a' | 'd', cells: [number, number][], clue: Clue) => {
  const [r0, c0] = cells[0];
  const word = cells.map(([r, c]) => sol(r, c)).join('');
  slots.push({ id: `${dir}:${r0}:${c0}`, dir, cells: cells.map(([r, c]) => id(r, c)), answer: word.toUpperCase(), clueCell: dir === 'a' ? id(r0, c0 - 1) : id(r0 - 1, c0), clue, sense: { en: clue.full, hi: '' } });
};
const word = (cells: [number, number][]) => push(cells[0][0] === cells.at(-1)![0] ? 'a' : 'd', cells, clueOf(CLUE[cells.map(([r, c]) => sol(r, c)).join('')], cells.map(([r, c]) => sol(r, c)).join('')));
for (let r = 1; r < ROWS; r++) { let c = 1; while (c < COLS) { if (!sol(r, c)) { c++; continue; } const s = c; while (c < COLS && sol(r, c)) c++; if (c - s >= 2) word(Array.from({ length: c - s }, (_, i) => [r, s + i] as [number, number])); } }
for (let c = 1; c < COLS; c++) { let r = 1; while (r < ROWS) { if (!sol(r, c)) { r++; continue; } const s = r; while (r < ROWS && sol(r, c)) r++; if (r - s >= 2) word(Array.from({ length: r - s }, (_, i) => [s + i, c] as [number, number])); } }
// The border's one-letter answers: a top-row letter with a clue square under it, a left-column letter with one beside it.
for (let c = 1; c < COLS; c++) if (sol(1, c) && !sol(2, c)) push('d', [[1, c]], clueOf(ONE[`0,${c - 1}`], `top ${c}`));
for (let r = 1; r < ROWS; r++) if (sol(r, 1) && !sol(r, 2)) push('a', [[r, 1]], clueOf(ONE[`${r - 1},0`], `left ${r}`));

const puzzle: Puzzle = { id: 'p0001', version: 1, rows: ROWS, cols: COLS, solution, clueCells, given: GIVEN.map(([r, c]) => id(r + 1, c + 1)), slots };
const problems = checkPuzzleShape(puzzle);
// The border rule (M3's checker will own it): letters fill the first row and column, and every border square clues something.
for (let c = 1; c < COLS; c++) if (!sol(1, c) || !slots.some(s => s.clueCell === id(0, c))) problems.push(`top border ${c} clues nothing`);
for (let r = 1; r < ROWS; r++) if (!sol(r, 1) || !slots.some(s => s.clueCell === id(r, 0))) problems.push(`left border ${r} clues nothing`);
if (problems.length) throw new Error(problems.join('\n'));
writeFileSync('data/duel/puzzles/p0001.json', JSON.stringify(puzzle, null, 1) + '\n');
console.log(`p0001: ${slots.length} slots, ${Object.keys(solution).length} letter cells, given ${puzzle.given.map(c => solution[c]).join('')}`);
