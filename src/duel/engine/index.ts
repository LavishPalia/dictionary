// The Duel engine's public surface. Pure TypeScript: no DOM, Node, React or Next.
export * from './types';
export { checkPuzzleShape } from './puzzle';
export { apply, checkInvariant, emptyCells, newGame } from './game';
export { BOT, botTurn } from './bot';
export { maxActions, maxScore, replay, RULES_ID, RULES_VERSION } from './replay';
