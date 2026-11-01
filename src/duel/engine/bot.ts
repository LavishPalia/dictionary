// Professor Quill. He knows the answers and plays by chance: how many tiles, which cells
// (leaning towards finishing words), and now and then a wrong one. All his dice come from the
// game's bot stream, so the same game always plays out the same way.
import { checkInvariant, emptyCells } from './board';
import { nextFloat, nextInt } from './rng';
import { endTurn, resolvePlacement, type Placed } from './score';
import type { CellId, GameEvent, GameState, Puzzle } from './types';

export const BOT = {
  /** How many tiles he tries to play, picked uniformly from this list. Never 0. */
  counts: [1, 2, 2, 3, 3, 4],
  /** The chance that a pick lands on a wrong cell. */
  wrongChance: 0.17,
  /** Extra weight for a cell that is the last (or second-last) gap in an answer. */
  finishBonus: { last: 3, secondLast: 1 },
};

/** Plays Quill's whole turn on a copy of the state. */
export function botTurn(p: Puzzle, state: GameState): { state: GameState; events: GameEvent[] } {
  if (state.over) throw new Error('illegal: the game is over');
  if (state.turn !== 'quill') throw new Error('illegal: it is not Quill’s turn');
  const s: GameState = JSON.parse(JSON.stringify(state));
  const rng = s.rng.bot;
  const rack = s.racks.quill;
  const empty = emptyCells(p, s);
  const inRack = rack.filter(l => l !== null).length;

  let events: GameEvent[];
  if (inRack === 0) {
    // Only possible near the end, when every remaining letter sits in your rack.
    events = [{ e: 'passed', who: 'quill', streak: 0 }];
    endTurn(p, s, 'quill', events);
  } else {
    const want = Math.min(BOT.counts[nextInt(rng, BOT.counts.length)], inRack, empty.length);
    const usedCells = new Set<CellId>(), usedSlots = new Set<number>();
    const gapsLeft = (c: CellId) => p.slots.filter(sl => sl.cells.includes(c)).map(sl => sl.cells.filter(x => !s.filled[x] && !usedCells.has(x)).length);
    const picks: Placed[] = [];

    for (let k = 0; k < want; k++) {
      let best: Placed | null = null, bestValue = -1;
      for (let i = 0; i < rack.length; i++) {
        const letter = rack[i];
        if (letter == null || usedSlots.has(i)) continue;
        for (const c of empty) {
          if (usedCells.has(c) || p.solution[c] !== letter) continue;
          let v = nextFloat(rng);
          for (const left of gapsLeft(c)) v += left === 1 ? BOT.finishBonus.last : left === 2 ? BOT.finishBonus.secondLast : 0;
          if (v > bestValue) { bestValue = v; best = { cell: c, letter, rackSlot: i }; }
        }
      }
      if (!best) break;
      if (nextFloat(rng) < BOT.wrongChance) {
        const wrongCells = empty.filter(c => !usedCells.has(c) && p.solution[c] !== best!.letter);
        if (wrongCells.length) best = { ...best, cell: wrongCells[nextInt(rng, wrongCells.length)] };
      }
      picks.push(best);
      usedCells.add(best.cell); usedSlots.add(best.rackSlot);
    }

    events = [{ e: 'botPlaced', tiles: picks.map(t => ({ ...t })) }];
    events.push(...resolvePlacement(p, s, 'quill', picks));
    s.lastQuill = picks.filter(t => p.solution[t.cell] === t.letter).map(t => t.cell);
  }

  const broken = checkInvariant(p, s);
  if (broken) throw new Error(`engine bug: ${broken}`);
  return { state: s, events };
}
