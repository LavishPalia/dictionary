// The Duel's board rules (the user, 2 Nov: "match Crossword Master"), shared by the practice fixture and M3's checker.
// - Row 0 and column 0 are clue squares (the corner is blank); the first letter row and letter column are all letters.
// - Every border square clues one answer: the top row points down, the left column points across.
// - A clue square inside the grid holds two clues, across (top half, ▶) and down (bottom half, ▼).
//   In the last column it can only point down, and in the last row only across, so there it holds one.
// - No two inner clue squares sit side by side or one above the other.
// - So every letter is in one across and one down answer; one-letter answers (DAY = D) can sit anywhere.
import type { Puzzle } from '../../src/duel/engine/types';

export const INNER_CLUES = { min: 5, max: 9 };

export function boardProblems(p: Puzzle): string[] {
  const problems: string[] = [];
  const { rows: R, cols: C } = p;
  const id = (r: number, c: number) => r * C + c;
  const isClue = (r: number, c: number) => p.solution[id(r, c)] === undefined;
  const at = new Map<number, Puzzle['slots']>();
  for (const s of p.slots) at.set(s.clueCell, [...(at.get(s.clueCell) ?? []), s]);
  const dirs = (r: number, c: number) => (at.get(id(r, c)) ?? []).map(s => s.dir).sort().join('');

  for (let c = 0; c < C; c++) if (!isClue(0, c)) problems.push(`top border (0,${c}) is a letter`);
  for (let r = 0; r < R; r++) if (!isClue(r, 0)) problems.push(`left border (${r},0) is a letter`);
  for (let c = 1; c < C; c++) if (isClue(1, c)) problems.push(`first letter row (1,${c}) is a clue square`);
  for (let r = 1; r < R; r++) if (isClue(r, 1)) problems.push(`first letter column (${r},1) is a clue square`);
  if (at.has(0)) problems.push('the corner (0,0) clues something');
  for (let c = 1; c < C; c++) if (dirs(0, c) !== 'd') problems.push(`top border (0,${c}) clues "${dirs(0, c)}", not one down answer`);
  for (let r = 1; r < R; r++) if (dirs(r, 0) !== 'a') problems.push(`left border (${r},0) clues "${dirs(r, 0)}", not one across answer`);

  let inner = 0;
  for (let r = 1; r < R; r++) for (let c = 1; c < C; c++) {
    if (!isClue(r, c)) continue;
    inner++;
    const want = r === R - 1 && c === C - 1 ? '' : c === C - 1 ? 'd' : r === R - 1 ? 'a' : 'ad';
    if (want === '') problems.push(`inner clue square (${r},${c}) is in the corner and can clue nothing`);
    else if (dirs(r, c) !== want) problems.push(`inner clue square (${r},${c}) clues "${dirs(r, c)}", needs "${want}"`);
    if (c + 1 < C && isClue(r, c + 1)) problems.push(`inner clue squares (${r},${c}) and (${r},${c + 1}) sit side by side`);
    if (r + 1 < R && isClue(r + 1, c)) problems.push(`inner clue squares (${r},${c}) and (${r + 1},${c}) sit one above the other`);
  }
  if (inner < INNER_CLUES.min || inner > INNER_CLUES.max) problems.push(`${inner} inner clue squares; want ${INNER_CLUES.min}–${INNER_CLUES.max}`);

  // Every slot starts right of / below its clue square and runs to the next clue square or the edge.
  for (const s of p.slots) {
    const [r0, c0] = [Math.floor(s.clueCell / C), s.clueCell % C];
    const [dr, dc] = s.dir === 'a' ? [0, 1] : [1, 0];
    const run: number[] = [];
    for (let r = r0 + dr, c = c0 + dc; r < R && c < C && !isClue(r, c); r += dr, c += dc) run.push(id(r, c));
    if (run.join() !== s.cells.join()) problems.push(`slot ${s.id} doesn't run from its clue square to the next one`);
  }
  const across = new Set(p.slots.filter(s => s.dir === 'a').flatMap(s => s.cells));
  const down = new Set(p.slots.filter(s => s.dir === 'd').flatMap(s => s.cells));
  for (const c of Object.keys(p.solution).map(Number)) {
    if (!across.has(c)) problems.push(`letter cell ${c} is in no across answer`);
    if (!down.has(c)) problems.push(`letter cell ${c} is in no down answer`);
  }
  return problems;
}
