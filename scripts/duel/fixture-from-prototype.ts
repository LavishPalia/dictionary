// One-off: turns the puzzle in docs/crossword-duel/ui/game.html into data/duel/puzzles/p0000.json,
// the engine's first test fixture. Kept for reference. Usage: npx tsx scripts/duel/fixture-from-prototype.ts
import { writeFileSync } from 'node:fs';
import type { Clue, Puzzle, Slot } from '../../src/duel/engine/types';

// Copied from game.html (SOL, GIVEN, CLUE). SOL is the 9 x 7 letter area; the board adds a clue row on top and a clue column on the left.
const SOL = ['indulge', 'to#riot', 'stand#h', '#id##be', 'dome#or', '#night#', 'n#route', 'eta#boy', 'will#me'];
const GIVEN = [[2, 0], [4, 5], [8, 2]];
type ProtoClue = string | { t?: string; img?: string; x?: string; full: string };
const CLUE: Record<string, ProtoClue> = {
  indulge: 'Treat oneself', to: 'Towards', riot: 'Unruly mob', stand: 'Be upright', id: 'Identity, briefly', be: 'Exist', dome: 'Rounded roof', or: 'Either’s partner',
  night: 'Opposite of day', route: 'Way to go', eta: 'Arrival time, briefly', boy: { t: 'COW___', full: 'Fill the gap: COW _ _ _' }, will: 'Last testament', me: 'Not you',
  its: 'Of it', new: 'Opposite of old', notion: 'Idea', ti: 'So, la, __', admiral: 'Navy chief', urn: { img: '26b1', full: 'Picture: a tall vase for ashes' }, ego: 'Self-esteem',
  lid: 'Jar top', hub: 'Wheel centre', go: { img: '1f410', x: '−at', full: 'Picture maths: goat minus AT' }, bottom: 'Opposite of top', ether: 'Upper sky', eye: { img: '1f441', full: 'Picture: the organ of sight' },
};

const ROWS = 10, COLS = 8;
const id = (r: number, c: number) => r * COLS + c;
const sol = (r: number, c: number) => (r < 1 || c < 1 || r >= ROWS || c >= COLS) ? null : (SOL[r - 1][c - 1] === '#' ? null : SOL[r - 1][c - 1]);

function clueOf(word: string): Clue {
  const c = CLUE[word];
  if (c === undefined) throw new Error(`no clue for ${word}`);
  if (typeof c === 'string') return { kind: /^Opposite of/.test(c) ? 'rel' : /briefly$/.test(c) ? 'abbr' : 'def', text: c, full: c };
  if (c.img && c.x) return { kind: 'picmath', img: c.img, math: c.x, full: c.full };
  if (c.img) return { kind: 'pic', img: c.img, full: c.full };
  return { kind: 'gap', text: c.t, full: c.full };
}

const solution: Record<number, string> = {};
const clueCells: number[] = [];
for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
  const ch = sol(r, c);
  if (ch) solution[id(r, c)] = ch.toUpperCase(); else clueCells.push(id(r, c));
}

const slots: Slot[] = [];
const push = (dir: 'a' | 'd', cells: [number, number][]) => {
  const word = cells.map(([r, c]) => sol(r, c)).join('');
  const [r0, c0] = cells[0];
  const clue = clueOf(word);
  slots.push({ id: `${dir}:${r0}:${c0}`, dir, cells: cells.map(([r, c]) => id(r, c)), answer: word.toUpperCase(), clueCell: dir === 'a' ? id(r0, c0 - 1) : id(r0 - 1, c0), clue, sense: { en: clue.full, hi: '' } });
};
for (let r = 1; r < ROWS; r++) { let c = 1; while (c < COLS) { if (!sol(r, c)) { c++; continue; } const s = c; while (c < COLS && sol(r, c)) c++; if (c - s >= 2) push('a', Array.from({ length: c - s }, (_, i) => [r, s + i])); } }
for (let c = 1; c < COLS; c++) { let r = 1; while (r < ROWS) { if (!sol(r, c)) { r++; continue; } const s = r; while (r < ROWS && sol(r, c)) r++; if (r - s >= 2) push('d', Array.from({ length: r - s }, (_, i) => [s + i, c])); } }

const puzzle: Puzzle = { id: 'p0000', version: 1, rows: ROWS, cols: COLS, solution, clueCells, given: GIVEN.map(([r, c]) => id(r + 1, c + 1)), slots };
writeFileSync('data/duel/puzzles/p0000.json', JSON.stringify(puzzle, null, 1) + '\n');
console.log(`p0000: ${slots.length} slots, ${Object.keys(solution).length} letter cells, given ${puzzle.given.map(c => solution[c]).join('')}`);
