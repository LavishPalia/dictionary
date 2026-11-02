// One-off: writes data/duel/puzzles/p0001.json, the practice puzzle /play plays on every date until M4.
// Its shape follows Crossword Master (the user, 2 Nov; the rules are in board-rules.ts): split clue squares
// inside the grid (across ▶ on top, down ▼ below), every letter crossed both ways, one-letter answers anywhere.
// No "briefly" in clues: the answer's length already says it is short. Grid found with scratch/duel-ui/fill-cm.js.
// Senses come from Panna's entry for the word (so the end screen matches the clue); other answers carry their own.
// Usage: npx tsx scripts/duel/fixture-practice.ts
import Database from 'better-sqlite3';
import { writeFileSync } from 'node:fs';
import { checkPuzzleShape } from '../../src/duel/engine/puzzle';
import type { Clue, Puzzle, Sense, Slot } from '../../src/duel/engine/types';
import { boardProblems } from './board-rules';

// The 9 x 7 letter area; the board adds a clue row on top and a clue column on the left. # = clue square.
const SOL = ['overlap', 'r#guise', 'cm#stir', 'hasten#', 'e#peril', 'sled#no', 'tee#bed', 'radar#g', 'anymore'];
const GIVEN = [[1, 5], [4, 4], [7, 1]]; // S of GUISE/ASININE, R of PERIL/LITER, A of RADAR/LEAN
type ProtoClue = string | { k?: Clue['kind']; t?: string; img?: string; x?: string; full: string; hi?: string };
// Keyed by answer, or by slot id where an answer repeats (R).
const CLUE: Record<string, ProtoClue> = {
  // across
  overlap: 'Partly cover', guise: 'False look', cm: { k: 'abbr', full: '100th of a metre', hi: 'सेंटीमीटर' }, stir: 'Mix with a spoon',
  hasten: 'Hurry', e: { k: 'abbr', full: 'East', hi: 'पूर्व' }, peril: 'Grave danger', sled: { img: '1f6f7', full: 'Picture: a ride over snow' },
  no: { k: 'def', full: 'Not yes', hi: 'नहीं' }, tee: 'Golf ball peg', bed: 'Place to sleep', radar: 'Radio tracking system',
  g: { k: 'abbr', full: 'Gram', hi: 'ग्राम' }, anymore: { t: 'I DON’T CRY __', full: 'Fill the gap: I don’t cry ___' },
  'a:2:1': { k: 'def', full: 'Sounds like “are”', hi: 'आर (अक्षर)' },
  // down
  orchestra: 'Concert hall players', v: { k: 'abbr', full: 'Five, in Roman numerals', hi: 'पाँच (रोमन अंक)' },
  ma: { k: 'def', full: 'Mum', hi: 'माँ' }, lean: 'Tilt', eg: { k: 'abbr', full: 'For example', hi: 'उदाहरण के लिए' }, speedy: 'Quick',
  rusted: 'Like old iron', am: { k: 'abbr', full: 'Before noon', hi: 'सुबह (दोपहर से पहले)' }, liter: 'Metric volume unit',
  bro: 'Buddy', asinine: 'Very silly', per: { img: '1f350', x: '−a', full: 'Picture maths: pear minus A' }, lodge: 'Gate cabin',
  'd:9:6': { k: 'def', full: 'Letter after Q', hi: 'आर (अक्षर)' },
};
// Answers clued from their Panna sense; the rest (letters, abbreviations, MA, NO) carry the clue as their sense.
const PANNA = new Set(['overlap', 'guise', 'stir', 'hasten', 'peril', 'sled', 'tee', 'bed', 'radar', 'anymore', 'orchestra', 'lean', 'speedy', 'rusted', 'liter', 'bro', 'asinine', 'per', 'lodge']);

const ROWS = 10, COLS = 8;
const id = (r: number, c: number) => r * COLS + c;
const sol = (r: number, c: number) => (r < 1 || c < 1 || r >= ROWS || c >= COLS) ? null : (SOL[r - 1][c - 1] === '#' ? null : SOL[r - 1][c - 1]);

function clueOf(c: ProtoClue | undefined, what: string): Clue {
  if (c === undefined) throw new Error(`no clue for ${what}`);
  if (typeof c === 'string') return { kind: /^Opposite of/.test(c) ? 'rel' : 'def', text: c, full: c };
  if (c.img && c.x) return { kind: 'picmath', img: c.img, math: c.x, full: c.full };
  if (c.img) return { kind: 'pic', img: c.img, full: c.full };
  if (c.t) return { kind: 'gap', text: c.t, full: c.full };
  return { kind: c.k ?? 'def', text: c.full, full: c.full };
}

const db = new Database('data/dictionary.db', { readonly: true });
function senseOf(word: string, key: string): Sense {
  if (PANNA.has(word)) {
    const row = db.prepare('select rowid, definition_en, meaning_hi from entries where normalized = ?').get(word) as { rowid: number; definition_en: string; meaning_hi: string } | undefined;
    if (!row) throw new Error(`${word} is not a Panna word`);
    return { en: row.definition_en, hi: row.meaning_hi, entryId: row.rowid };
  }
  const c = CLUE[key] ?? CLUE[word];
  if (typeof c === 'string' || !c?.hi) throw new Error(`no Hindi sense for ${word}`);
  return { en: c.full, hi: c.hi };
}

const solution: Record<number, string> = {};
const clueCells: number[] = [];
for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
  const ch = sol(r, c);
  if (ch) solution[id(r, c)] = ch.toUpperCase(); else clueCells.push(id(r, c));
}

// Every clue square clues the run to its right (across) and the run below it (down), where there is one.
const slots: Slot[] = [];
for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
  if (sol(r, c) || (r === 0 && c === 0)) continue;
  for (const [dir, dr, dc] of [['a', 0, 1], ['d', 1, 0]] as const) {
    if ((dir === 'a' && r === 0) || (dir === 'd' && c === 0)) continue; // border squares point into the grid only
    const cells: [number, number][] = [];
    for (let rr = r + dr, cc = c + dc; sol(rr, cc); rr += dr, cc += dc) cells.push([rr, cc]);
    if (!cells.length) continue;
    const word = cells.map(([rr, cc]) => sol(rr, cc)).join('');
    const slotId = `${dir}:${cells[0][0]}:${cells[0][1]}`;
    const key = slotId in CLUE ? slotId : word;
    slots.push({ id: slotId, dir, cells: cells.map(([rr, cc]) => id(rr, cc)), answer: word.toUpperCase(), clueCell: id(r, c), clue: clueOf(CLUE[key], `${slotId} ${word}`), sense: senseOf(word, key) });
  }
}

const puzzle: Puzzle = { id: 'p0001', version: 1, rows: ROWS, cols: COLS, solution, clueCells, given: GIVEN.map(([r, c]) => id(r + 1, c + 1)), slots };
const problems = [...checkPuzzleShape(puzzle), ...boardProblems(puzzle)];
for (const [r, c] of GIVEN) for (const [r2, c2] of GIVEN) if (r * 7 + c < r2 * 7 + c2 && slots.some(s => s.cells.includes(id(r + 1, c + 1)) && s.cells.includes(id(r2 + 1, c2 + 1)))) problems.push(`given (${r},${c}) and (${r2},${c2}) share an answer`);
const unused = Object.keys(CLUE).filter(k => !slots.some(s => s.id === k || s.answer.toLowerCase() === k));
if (unused.length) problems.push(`clues for no answer: ${unused.join(', ')}`);
if (problems.length) throw new Error(problems.join('\n'));
writeFileSync('data/duel/puzzles/p0001.json', JSON.stringify(puzzle, null, 1) + '\n');
console.log(`p0001: ${slots.length} slots, ${Object.keys(solution).length} letter cells, ${clueCells.length - 17} inner clue squares, given ${puzzle.given.map(c => solution[c]).join('')}`);
