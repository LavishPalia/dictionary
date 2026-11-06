// A real game for tests and the live check: `accuracy` is the share of tiles a model player places right away.
import { readFileSync } from 'node:fs';
import { apply, botTurn, emptyCells, newGame, RULES_ID, type Action, type GameState, type Puzzle } from '../../src/duel/engine';

export const loadPuzzle = (key: string) => JSON.parse(readFileSync(`data/duel/puzzles/${key}.json`, 'utf8')) as Puzzle;

export function playGame(p: Puzzle, seed: number, accuracy = 1, rand: () => number = Math.random, stopAt = Infinity): { state: GameState; actions: Action[] } {
  let s = newGame(p, seed);
  const actions: Action[] = [];
  while (!s.over && actions.length < stopAt) {
    const used = new Set<number>(), place: { cell: number; rackSlot: number }[] = [];
    s.racks.you.forEach((l, rackSlot) => {
      if (l === null || rand() > accuracy) return;
      const cell = emptyCells(p, s).find(c => p.solution[c] === l && !used.has(c));
      if (cell !== undefined) { used.add(cell); place.push({ cell, rackSlot }); }
    });
    const a: Action = place.length ? { t: 'submit', place } : { t: 'pass' };
    actions.push(a);
    s = apply(p, s, a).state;
    while (!s.over && s.turn === 'quill') s = botTurn(p, s).state;
  }
  return { state: s, actions };
}

/** What the device reports for a finished game, with times `minutes` long ending at `end`. */
export function reportOf(puzzle: string, date: string, seed: number, played: { state: GameState; actions: Action[] }, end: Date, minutes = 5) {
  return {
    puzzle, date, seed, rules: RULES_ID, actions: played.actions,
    startedAt: new Date(end.getTime() - minutes * 60_000).toISOString(), finishedAt: end.toISOString(), claimedScore: played.state.scores.you,
  };
}
