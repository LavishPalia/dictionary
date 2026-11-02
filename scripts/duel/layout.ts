// Crossword Master-shaped layouts (board-rules.ts): a 9 × 7 letter area under a clue row and beside a clue column,
// with one inner clue square in each letter row from the 2nd to the 8th, never in the column of the one above.
// Coordinates here are letter-area (r 0–8, c 0–6); the board adds 1 to both.
import type { CellId, Puzzle, Slot, SlotId } from '../../src/duel/engine/types';

export const LR = 9, LC = 7;
export const ROWS = LR + 1, COLS = LC + 1;
/** true = an inner clue square. */
export type Pattern = boolean[][];
export interface LSlot { dir: 'a' | 'd'; cells: [number, number][] }

/** A random pattern, or null when the board rules can't be met with this draw. */
export function randomPattern(rng: () => number): Pattern | null {
  const P: Pattern = [...Array(LR)].map(() => Array<boolean>(LC).fill(false));
  let prev = -1;
  for (let r = 1; r <= 7; r++) {
    const choices = [1, 2, 3, 4, 5, 6].filter(c => c !== prev);
    const c = choices[Math.floor(rng() * choices.length)];
    P[r][c] = true;
    prev = c;
  }
  return P;
}

/** Every slot: each clue square (border or inner) clues the run to its right and the run below it. */
export function slotsOf(P: Pattern): LSlot[] {
  const isClue = (r: number, c: number) => r < 0 || c < 0 || P[r][c];
  const out: LSlot[] = [];
  for (let r = -1; r < LR; r++) for (let c = -1; c < LC; c++) {
    if (!isClue(r, c) || (r < 0 && c < 0)) continue;
    if (r >= 0) { // the top border row only points down
      const cells: [number, number][] = [];
      for (let k = c + 1; k < LC && !P[r][k]; k++) cells.push([r, k]);
      if (cells.length) out.push({ dir: 'a', cells });
    }
    if (c >= 0) { // the left border column only points across
      const cells: [number, number][] = [];
      for (let k = r + 1; k < LR && !P[k][c]; k++) cells.push([k, c]);
      if (cells.length) out.push({ dir: 'd', cells });
    }
  }
  return out;
}

export const cellId = (r: number, c: number): CellId => (r + 1) * COLS + (c + 1);
export const slotId = (s: LSlot): SlotId => `${s.dir}:${s.cells[0][0] + 1}:${s.cells[0][1] + 1}`;
/** The board cell of the square that clues this slot. */
export const clueCellOf = (s: LSlot): CellId => (s.dir === 'a' ? cellId(s.cells[0][0], s.cells[0][1] - 1) : cellId(s.cells[0][0] - 1, s.cells[0][1]));
/** A full puzzle from a pattern and a filled grid ('#' = clue square); `clue` gives each slot its clue and sense. */
export function toPuzzle(P: Pattern, grid: string[][], clue: (s: LSlot, answer: string) => Pick<Slot, 'clue' | 'sense'>, meta: { id: string; version: number; given: CellId[] }): Puzzle {
  const solution: Record<CellId, string> = {};
  grid.forEach((row, r) => row.forEach((ch, c) => { if (!P[r][c]) solution[cellId(r, c)] = ch.toUpperCase(); }));
  const slots: Slot[] = slotsOf(P).map(s => {
    const answer = s.cells.map(([r, c]) => grid[r][c]).join('').toUpperCase();
    return { id: slotId(s), dir: s.dir, cells: s.cells.map(([r, c]) => cellId(r, c)), answer, clueCell: clueCellOf(s), ...clue(s, answer) };
  });
  return { id: meta.id, version: meta.version, rows: ROWS, cols: COLS, solution, clueCells: clueCellsOf(P), given: meta.given, slots };
}

export function clueCellsOf(P: Pattern): CellId[] {
  const out: CellId[] = [];
  for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) if (r === 0 || c === 0 || P[r - 1][c - 1]) out.push(r * COLS + c);
  return out;
}
