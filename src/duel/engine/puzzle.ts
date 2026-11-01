// Structural checks the engine relies on. Content rules (blocklist, clue fit) live in the pipeline.
import type { Puzzle } from './types';

/** Problems with a puzzle's shape; an empty list means the engine can play it. */
export function checkPuzzleShape(p: Puzzle): string[] {
  const problems: string[] = [];
  const size = p.rows * p.cols;
  const letterCells = Object.keys(p.solution).map(Number);
  const isLetter = new Set(letterCells);
  const inside = (c: number) => Number.isInteger(c) && c >= 0 && c < size;

  for (const c of letterCells) {
    if (!inside(c)) problems.push(`letter cell ${c} is outside the board`);
    if (!/^[A-Z]$/.test(p.solution[c])) problems.push(`letter cell ${c} holds "${p.solution[c]}", not A–Z`);
  }
  for (const c of p.clueCells) {
    if (!inside(c)) problems.push(`clue cell ${c} is outside the board`);
    if (isLetter.has(c)) problems.push(`clue cell ${c} is also a letter cell`);
  }

  const across = new Map<number, string>(), down = new Map<number, string>();
  for (const s of p.slots) {
    const letters = s.cells.map(c => p.solution[c] ?? '?').join('');
    if (letters !== s.answer) problems.push(`slot ${s.id}: answer ${s.answer} but cells spell ${letters}`);
    const seen = s.dir === 'a' ? across : down;
    for (const c of s.cells) {
      if (seen.has(c)) problems.push(`cell ${c} is in two ${s.dir === 'a' ? 'across' : 'down'} slots (${seen.get(c)}, ${s.id})`);
      seen.set(c, s.id);
    }
  }
  for (const c of letterCells) if (!across.has(c) && !down.has(c)) problems.push(`letter cell ${c} is not in any slot`);

  if (p.given.length < 2 || p.given.length > 3) problems.push(`${p.given.length} given letters; must be 2 or 3`);
  for (const c of p.given) if (!isLetter.has(c)) problems.push(`given cell ${c} is not a letter cell`);
  return problems;
}
