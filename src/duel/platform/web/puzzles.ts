// M2 plays the fixture puzzle on every date; M3/M4 swap this for the published schedule.
import type { Puzzle } from '../../engine';
import type { PuzzleSource } from '../types';

export function webPuzzles(): PuzzleSource {
  return {
    async forDate() {
      const mod = await import('../../../../data/duel/puzzles/p0000.json');
      return (mod.default ?? mod) as unknown as Puzzle;
    },
  };
}
