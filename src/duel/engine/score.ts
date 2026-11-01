// Judging one batch of placed tiles, for either player, in the order the screen plays it
// (UI-DESIGN §0): Empty hand first, then every tile at once, then each finished word, shortest first.
import { emptyCells, RACK_SIZE } from './board';
import type { CellId, GameEvent, GameState, Puzzle, Who } from './types';

export type Placed = { cell: CellId; letter: string; rackSlot: number };

const other = (who: Who): Who => (who === 'you' ? 'quill' : 'you');

/** Adds points, never letting the score fall below 0, and records the step. */
function addScore(s: GameState, who: Who, points: number, events: GameEvent[]) {
  const from = s.scores[who];
  const to = Math.max(0, from + points);
  s.scores[who] = to;
  events.push({ e: 'score', who, from, to });
}

/** Fills the rack's gaps from the front of the bag, in slot order. */
export function refill(s: GameState, who: Who): GameEvent {
  const rack = s.racks[who];
  const rackSlots: number[] = [], letters: string[] = [];
  for (let i = 0; i < RACK_SIZE; i++) {
    if (rack[i] == null && s.bag.length) {
      rack[i] = s.bag.shift()!;
      rackSlots.push(i); letters.push(rack[i]!);
    }
  }
  return { e: 'refill', who, rackSlots, letters };
}

/**
 * Ends the turn: game over when the board is full, otherwise the other player moves. A player with an
 * empty rack gets no turn (round 3), so near the end the one still holding tiles keeps moving until the
 * board is full. Both racks can't be empty while a cell is: the bag + racks hold every empty cell's letter,
 * and a rack only runs dry once the bag has.
 */
export function endTurn(p: Puzzle, s: GameState, who: Who, events: GameEvent[]) {
  if (emptyCells(p, s).length === 0) {
    s.over = true;
    const { you, quill } = s.scores;
    events.push({ e: 'gameOver', scores: { ...s.scores }, result: you > quill ? 'win' : you < quill ? 'loss' : 'tie' });
  } else {
    const next = other(who);
    s.turn = s.racks[next].some(l => l !== null) ? next : who;
    events.push({ e: 'turn', who: s.turn });
  }
}

/**
 * Judges tiles that `who` placed this turn (their letters still sit in the rack), scores them,
 * refills the rack and ends the turn. Mutates `s`.
 */
export function resolvePlacement(p: Puzzle, s: GameState, who: Who, tiles: Placed[]): GameEvent[] {
  const events: GameEvent[] = [];
  const rack = s.racks[who];
  const judged = tiles.map(t => ({ ...t, ok: p.solution[t.cell] === t.letter }));
  const right = judged.filter(t => t.ok), wrong = judged.filter(t => !t.ok);

  // Empty hand is a full rack of 5 played right in one turn, not the last few tiles of the game.
  if (wrong.length === 0 && tiles.length === RACK_SIZE) {
    events.push({ e: 'emptyHand', who, points: 5 });
    addScore(s, who, 5, events);
  }

  for (const t of right) { s.filled[t.cell] = { by: who, letter: t.letter }; rack[t.rackSlot] = null; }
  events.push({ e: 'judged', who, tiles: judged.map(({ cell, letter, ok, rackSlot }) => ({ cell, letter, ok, rackSlot })) });
  addScore(s, who, right.length - wrong.length, events);
  if (wrong.length) events.push({ e: 'returned', who, rackSlots: wrong.map(t => t.rackSlot) });

  const placedNow = new Set(right.map(t => t.cell));
  const finished = p.slots
    // A one-letter answer (a border clue like "Roman 500" = D) is a clue, not a word: no bonus.
    .filter(sl => sl.cells.length >= 2 && sl.cells.some(c => placedNow.has(c)) && sl.cells.every(c => s.filled[c]))
    .sort((a, b) => a.cells.length - b.cells.length || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  for (const sl of finished) {
    events.push({ e: 'word', who, slot: sl.id, points: sl.cells.length });
    addScore(s, who, sl.cells.length, events);
  }

  events.push(refill(s, who));
  endTurn(p, s, who, events);
  return events;
}
