// Board questions the screen asks: pure functions of the puzzle, the state and the pending tiles.
import { emptyCells, type CellId, type GameState, type Puzzle, type Slot, type SlotId } from '../../engine';
import type { Pending } from './types';

/** Empty, non-pending cells where a letter still in your hand belongs (the Hint glow). */
export function hintCells(p: Puzzle, s: GameState, pending: Pending[]): CellId[] {
  const used = new Set(pending.map(t => t.rackSlot)), taken = new Set(pending.map(t => t.cell));
  const inHand = new Set(s.racks.you.filter((l, i): l is string => l !== null && !used.has(i)));
  return emptyCells(p, s).filter(c => !taken.has(c) && inHand.has(p.solution[c]));
}

/** Answers Word can reveal: some cell still empty, not revealed already. */
export function wordCandidates(p: Puzzle, s: GameState): SlotId[] {
  return p.slots.filter(sl => !s.ghosts.includes(sl.id) && sl.cells.some(c => !s.filled[c])).map(sl => sl.id);
}

/** The answers through a letter cell, across first. */
export function slotsThrough(p: Puzzle, cell: CellId): Slot[] {
  return p.slots.filter(sl => sl.cells.includes(cell)).sort((a, b) => (a.dir === b.dir ? 0 : a.dir === 'a' ? -1 : 1));
}

/** The first cell of an answer with nothing settled and nothing pending in it. */
export function nextEmpty(p: Puzzle, s: GameState, pending: Pending[], slot: SlotId): CellId | null {
  const sl = p.slots.find(x => x.id === slot);
  if (!sl) return null;
  return sl.cells.find(c => !s.filled[c] && !pending.some(t => t.cell === c)) ?? null;
}
