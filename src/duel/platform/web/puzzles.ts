// M2 plays the practice puzzle on every date; M3/M4 swap this for the published schedule.
// (p0000 stays as the engine's test fixture; p0001 follows the board's border rules.)
import type { Puzzle } from '../../engine';
import type { PuzzleSource } from '../types';

export function webPuzzles(): PuzzleSource {
  return {
    async forDate() {
      const mod = await import('../../../../data/duel/puzzles/p0001.json');
      return (mod.default ?? mod) as unknown as Puzzle;
    },
  };
}
