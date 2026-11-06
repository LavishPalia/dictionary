// The lab's made-up turn: on a real puzzle, one move that finishes this many words. For display only: nothing here
// goes through the engine, and nothing is saved or sent.
import type { CellId, GameEvent, GameState, Puzzle, Slot } from '../../engine';
import { newGame } from '../../engine';

const RACK = 5;

/** Picks up to `n` answers sharing no cell, from short to long, spread across what the puzzle has. */
function pickSlots(p: Puzzle, n: number): Slot[] {
  const slots = p.slots.filter(s => s.cells.some(c => !p.given.includes(c))).sort((a, b) => a.cells.length - b.cells.length || (a.id < b.id ? -1 : 1));
  const picked: Slot[] = [], used = new Set<CellId>();
  const step = Math.max(1, Math.floor(slots.length / n));
  for (let pass = 0; pass < 2 && picked.length < n; pass++) {
    for (let i = pass ? 0 : Math.floor(step / 2); i < slots.length && picked.length < n; i += pass ? 1 : step) {
      const s = slots[i];
      if (picked.includes(s) || s.cells.some(c => used.has(c))) continue;
      picked.push(s);
      s.cells.forEach(c => used.add(c));
    }
  }
  return picked;
}

export function labTurn(p: Puzzle, words: number, emptyHand: boolean): { state: GameState; events: GameEvent[] } {
  const state = newGame(p, 7);
  const slots = pickSlots(p, words);
  const tileAt = slots.map(s => [...s.cells].reverse().find(c => !p.given.includes(c))!);
  const free = Object.keys(p.solution).map(Number).filter(c => !p.given.includes(c));
  const spare = free.filter(c => !slots.some(s => s.cells.includes(c)));
  // A full hand needs 5 tiles, so a turn with fewer words adds tiles that finish nothing visible.
  const tiles = emptyHand ? [...tileAt, ...spare.slice(0, Math.max(0, RACK - tileAt.length))] : tileAt;

  const fill = (c: CellId) => { state.filled[c] = { by: 'you', letter: p.solution[c] }; };
  // The rest of those answers is on the board already, and so is about half of the others.
  for (const s of slots) for (const c of s.cells) if (!tiles.includes(c)) fill(c);
  spare.forEach((c, i) => { if (i % 2 === 0 && !tiles.includes(c)) fill(c); });

  const judged = tiles.map((cell, rackSlot) => ({ cell, letter: p.solution[cell], ok: true, rackSlot }));
  state.racks.you = judged.map(t => t.letter);
  let score = 12;
  state.scores = { you: score, quill: 9 };
  const events: GameEvent[] = [];
  if (emptyHand) { score += 5; events.push({ e: 'emptyHand', who: 'you', points: 5 }); }
  events.push({ e: 'judged', who: 'you', tiles: judged });
  score += judged.length;
  for (const s of [...slots].sort((a, b) => a.cells.length - b.cells.length || (a.id < b.id ? -1 : 1))) {
    score += s.cells.length;
    events.push({ e: 'word', who: 'you', slot: s.id, points: s.cells.length });
  }
  return { state, events };
}
