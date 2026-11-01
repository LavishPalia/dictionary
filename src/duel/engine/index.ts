// The Duel engine's public surface. Pure TypeScript: no DOM, Node, React or Next.
export const RULES_VERSION = 1;
export * from './types';
export { checkPuzzleShape } from './puzzle';
export { checkInvariant, emptyCells, newGame } from './game';
