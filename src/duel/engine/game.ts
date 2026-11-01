// A game from start to finish: the deal and the player's actions.
import { checkInvariant, emptyCells, RACK_SIZE } from './board';
import { seedRng, shuffle } from './rng';
import { resolvePlacement } from './score';
import type { Action, GameEvent, GameState, Puzzle } from './types';

export { checkInvariant, emptyCells } from './board';

/** Deals a new game: bag = the letters of every non-given cell, shuffled; you draw 5, then Quill. */
export function newGame(p: Puzzle, seed: number): GameState {
  const filled: GameState['filled'] = {};
  for (const c of p.given) filled[c] = { by: 'given', letter: p.solution[c] };
  const rng = { bag: seedRng(seed, 0), bot: seedRng(seed, 1) };
  const s: GameState = {
    rulesVersion: 1, puzzleId: p.id, puzzleVersion: p.version, seed,
    filled, bag: [], racks: { you: [], quill: [] }, scores: { you: 0, quill: 0 },
    turn: 'you', over: false, passStreak: 0, ghosts: [], lastQuill: [], log: [], rng,
  };
  s.bag = emptyCells(p, s).map(c => p.solution[c]);
  shuffle(rng.bag, s.bag);
  s.racks.you = s.bag.splice(0, RACK_SIZE);
  s.racks.quill = s.bag.splice(0, RACK_SIZE);
  return s;
}

const illegal = (why: string): never => { throw new Error(`illegal: ${why}`); };

/** Applies one of the player's actions to a copy of the state. Throws on an illegal action. */
export function apply(p: Puzzle, state: GameState, a: Action): { state: GameState; events: GameEvent[] } {
  if (state.over) illegal('the game is over');
  if (state.turn !== 'you') illegal('it is not your turn');
  const s: GameState = JSON.parse(JSON.stringify(state));
  s.log.push(a);
  let events: GameEvent[];

  switch (a.t) {
    case 'submit': {
      if (!a.place.length) illegal('nothing placed');
      const cells = new Set<number>(), slots = new Set<number>();
      for (const { cell, rackSlot } of a.place) {
        if (!Number.isInteger(rackSlot) || rackSlot < 0 || rackSlot >= RACK_SIZE) illegal(`rack slot ${rackSlot}`);
        if (s.racks.you[rackSlot] == null) illegal(`rack slot ${rackSlot} is empty`);
        if (slots.has(rackSlot)) illegal(`rack slot ${rackSlot} used twice`);
        if (p.solution[cell] === undefined) illegal(`cell ${cell} is not a letter cell`);
        if (s.filled[cell]) illegal(`cell ${cell} is already filled`);
        if (cells.has(cell)) illegal(`cell ${cell} used twice`);
        cells.add(cell); slots.add(rackSlot);
      }
      s.passStreak = 0;
      s.lastQuill = [];
      events = resolvePlacement(p, s, 'you', a.place.map(({ cell, rackSlot }) => ({ cell, rackSlot, letter: s.racks.you[rackSlot]! })));
      break;
    }
    default:
      return illegal(`unknown action ${(a as Action).t}`);
  }

  const broken = checkInvariant(p, s);
  if (broken) throw new Error(`engine bug: ${broken}`);
  return { state: s, events };
}
