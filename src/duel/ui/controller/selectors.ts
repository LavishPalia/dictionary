// Board questions the screen asks: pure functions of the puzzle, the state and the pending tiles.
import { apply, botTurn, emptyCells, newGame, type CellId, type GameState, type Puzzle, type Slot, type SlotId } from '../../engine';
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

export type WordReason = 'revealed' | 'wrong' | 'quill';

/** The cells you played a wrong tile in, found by replaying the game. */
function wrongCells(p: Puzzle, s: GameState): Set<CellId> {
  const out = new Set<CellId>();
  let state = newGame(p, s.seed);
  for (const a of s.log) {
    const you = apply(p, state, a);
    for (const e of you.events) if (e.e === 'judged') for (const t of e.tiles) if (!t.ok) out.add(t.cell);
    state = you.state;
    while (!state.over && state.turn === 'quill') state = botTurn(p, state).state;
  }
  return out;
}

/**
 * The end screen's word list (UI-DESIGN §3.4): words you revealed, made a wrong tile in, or left to Quill come first,
 * in that order. An answer used twice in a puzzle is listed once.
 */
export function wordReview(p: Puzzle, s: GameState): { worth: { slot: Slot; reason: WordReason }[]; rest: Slot[] } {
  const wrong = wrongCells(p, s), seen = new Set<string>();
  const reasonOf = (sl: Slot): WordReason | null => {
    if (s.ghosts.includes(sl.id)) return 'revealed';
    if (sl.cells.some(c => wrong.has(c))) return 'wrong';
    return sl.cells.some(c => s.filled[c]?.by === 'quill') && !sl.cells.some(c => s.filled[c]?.by === 'you') ? 'quill' : null;
  };
  const worth: { slot: Slot; reason: WordReason }[] = [], rest: Slot[] = [];
  for (const slot of p.slots) {
    if (seen.has(slot.answer)) continue;
    seen.add(slot.answer);
    const reason = reasonOf(slot);
    if (reason) worth.push({ slot, reason }); else rest.push(slot);
  }
  const order: WordReason[] = ['revealed', 'wrong', 'quill'];
  worth.sort((a, b) => order.indexOf(a.reason) - order.indexOf(b.reason));
  return { worth, rest };
}
