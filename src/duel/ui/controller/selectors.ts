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

/** Replays your turns: each action with whether it played a right tile, and where it played wrong ones. */
function yourTurns(p: Puzzle, s: GameState): { action: GameState['log'][number]; right: boolean; wrong: CellId[] }[] {
  const out: { action: GameState['log'][number]; right: boolean; wrong: CellId[] }[] = [];
  let state = newGame(p, s.seed);
  for (const action of s.log) {
    const you = apply(p, state, action);
    const tiles = you.events.flatMap(e => (e.e === 'judged' ? e.tiles : []));
    out.push({ action, right: tiles.some(t => t.ok), wrong: tiles.filter(t => !t.ok).map(t => t.cell) });
    state = you.state;
    while (!state.over && state.turn === 'quill') state = botTurn(p, state).state;
  }
  return out;
}

/** What the later tips (src/duel/ui/guide/tips.ts) look at. A dry turn ended your turn with no right tile. */
export function turnStats(p: Puzzle, s: GameState): { wrongOrPass: number; dryTurns: number; passes: number } {
  const turns = yourTurns(p, s), ended = turns.filter(t => t.action.t === 'submit' || t.action.t === 'pass' || t.action.t === 'swap');
  const passes = ended.filter(t => t.action.t === 'pass').length;
  return { wrongOrPass: passes + turns.filter(t => t.wrong.length > 0).length, dryTurns: ended.filter(t => !t.right).length, passes };
}

/**
 * The end screen's word list (UI-DESIGN §3.4): words you revealed, made a wrong tile in, or left to Quill come first,
 * in that order. An answer used twice in a puzzle is listed once.
 */
export function wordReview(p: Puzzle, s: GameState): { worth: { slot: Slot; reason: WordReason }[]; rest: Slot[] } {
  const wrong = new Set(yourTurns(p, s).flatMap(t => t.wrong)), seen = new Set<string>();
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
