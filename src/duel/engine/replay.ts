// Rebuilding a game from its seed and the player's actions. Continue uses it on the device,
// and the server uses it to check a reported score.
import { botTurn } from './bot';
import { apply, newGame } from './game';
import type { Action, GameState, Puzzle } from './types';

/** Replays a game: each player action, then Quill's reply whenever the turn passes to him. */
export function replay(p: Puzzle, seed: number, actions: Action[]): GameState {
  let s = newGame(p, seed);
  actions.forEach((a, i) => {
    try {
      s = apply(p, s, a).state;
    } catch (e) {
      throw new Error(`illegal at ${i}: ${e instanceof Error ? e.message : String(e)}`);
    }
    if (!s.over && s.turn === 'quill') s = botTurn(p, s).state;
  });
  return s;
}

/**
 * A loose upper bound on one player's score in a puzzle: every non-given cell right,
 * every answer finished, and an Empty hand on every tile. Used by the server as a sanity cap.
 */
export function maxScore(p: Puzzle): number {
  const cells = Object.keys(p.solution).length - p.given.length;
  return cells + p.slots.reduce((n, s) => n + s.cells.length, 0) + 5 * cells;
}
