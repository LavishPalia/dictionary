// A game from start to finish: the deal and the player's actions.
import { emptyCells, RACK_SIZE } from './board';
import { seedRng, shuffle } from './rng';
import type { GameState, Puzzle } from './types';

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
