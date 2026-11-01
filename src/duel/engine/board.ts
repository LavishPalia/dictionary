// Board helpers shared by the player's moves and Quill's.
import type { CellId, GameState, Puzzle } from './types';

export const RACK_SIZE = 5;

/** Letter cells with nothing settled in them, in CellId order. */
export function emptyCells(p: Puzzle, s: GameState): CellId[] {
  return Object.keys(p.solution).map(Number).filter(c => !s.filled[c]).sort((a, b) => a - b);
}

/**
 * The bag plus both racks must hold exactly the letters of the empty cells.
 * Because of it, every rack tile always has a cell where it belongs. Returns a problem or null.
 */
export function checkInvariant(p: Puzzle, s: GameState): string | null {
  const count = (letters: string[]) => letters.reduce<Record<string, number>>((m, l) => (m[l] = (m[l] ?? 0) + 1, m), {});
  const held = count([...s.bag, ...s.racks.you, ...s.racks.quill].filter((l): l is string => l !== null));
  const needed = count(emptyCells(p, s).map(c => p.solution[c]));
  for (const l of new Set([...Object.keys(held), ...Object.keys(needed)])) {
    if ((held[l] ?? 0) !== (needed[l] ?? 0)) return `letter ${l}: bag + racks hold ${held[l] ?? 0}, empty cells need ${needed[l] ?? 0}`;
  }
  return null;
}
