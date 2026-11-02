// The full puzzle checker (product spec §8.1, tech design §5.2): the engine's shape check, the board rules,
// and the content rules. A puzzle that fails is dropped, never hand-patched.
import { existsSync, readFileSync } from 'node:fs';
import { checkPuzzleShape } from '../../src/duel/engine/puzzle';
import type { Puzzle } from '../../src/duel/engine/types';
import { boardProblems } from './board-rules';
import { textProblem } from './lib/clue-rules';
import { blocklist, dictionary } from './lib/db';
import { fits } from './lib/fontwidth';
import { curated, pictures } from './words';

export interface CheckContext {
  /** Allowed answers: every a–z Panna headword plus the curated answers. */
  words: Set<string>;
  blocked: Set<string>;
  /** Picture key → the words it can clue. */
  pictures: Map<string, string[]>;
  picDir: string;
}

let ctx: CheckContext | undefined;
export function defaultContext(): CheckContext {
  if (ctx) return ctx;
  const panna = (dictionary().prepare('select normalized from entries').all() as { normalized: string }[]).map(r => r.normalized).filter(w => /^[a-z]+$/.test(w));
  return (ctx = {
    words: new Set([...panna, ...curated().map(c => c.answer)]),
    blocked: blocklist(),
    pictures: new Map(pictures().map(p => [p.key, p.words])),
    picDir: 'public/duel/pics',
  });
}

/** Applies picture maths: "+s" appends a letter, "−r" removes the first r. Null if the maths is malformed or impossible. */
export function picMath(word: string, math: string): string | null {
  const m = /^([+−])([a-z])$/i.exec(math);
  if (!m) return null;
  const l = m[2].toLowerCase();
  if (m[1] === '+') return word + l;
  const i = word.indexOf(l);
  return i < 0 ? null : word.slice(0, i) + word.slice(i + 1);
}

const LETTER_ROWS = 9, LETTER_COLS = 7;

/** Every problem with the puzzle; an empty list means it can be published. */
export function checkPuzzle(p: Puzzle, c: CheckContext = defaultContext()): string[] {
  const problems = [...checkPuzzleShape(p)];
  if (p.rows !== LETTER_ROWS + 1 || p.cols !== LETTER_COLS + 1) problems.push(`board is ${p.rows} × ${p.cols}, not ${LETTER_ROWS + 1} × ${LETTER_COLS + 1}`);
  else problems.push(...boardProblems(p));

  const seen = new Map<string, string>();
  for (const s of p.slots) {
    const word = s.answer.toLowerCase(), at = `${s.id} ${s.answer}`;
    const okLength = (s.answer.length >= 1 && s.answer.length <= 7) || (s.dir === 'd' && s.answer.length === 9);
    if (!okLength) problems.push(`${at}: ${s.answer.length} letters; answers are 1–7 letters, or a 9-letter down`);
    if (word.length > 1) {
      if (seen.has(word)) problems.push(`${at}: answer appears twice (also ${seen.get(word)})`);
      seen.set(word, s.id);
    }
    if (!/^[a-z]+$/.test(word) || !c.words.has(word)) problems.push(`${at}: not a Panna word or a curated answer`);
    if (c.blocked.has(word)) problems.push(`${at}: blocked word`);

    const clue = s.clue;
    if (!clue.full?.trim()) problems.push(`${at}: clue has no full text`);
    for (const t of [clue.text, clue.full]) {
      const why = t ? textProblem(word, t) : null;
      if (why) problems.push(`${at}: clue "${t}" ${why}`);
    }
    if (clue.kind === 'pic' || clue.kind === 'picmath') {
      if (!clue.img) problems.push(`${at}: picture clue without a picture key`);
      else {
        if (!existsSync(`${c.picDir}/${clue.img}.svg`)) problems.push(`${at}: picture ${clue.img} has no SVG in ${c.picDir}`);
        const picWords = c.pictures.get(clue.img);
        if (!picWords) problems.push(`${at}: picture ${clue.img} is not in pictures.json`);
        else if (clue.kind === 'pic' && !picWords.includes(word)) problems.push(`${at}: picture ${clue.img} shows ${picWords.join('/')}, not ${word}`);
        else if (clue.kind === 'picmath' && !picWords.some(w => picMath(w, clue.math ?? '') === word)) problems.push(`${at}: picture maths ${picWords[0]} ${clue.math} doesn't make ${word}`);
      }
    } else if (!clue.text?.trim()) problems.push(`${at}: ${clue.kind} clue without text`);
    else {
      const mode = p.slots.filter(o => o.clueCell === s.clueCell).length === 2 ? 'two' : 'one';
      if (!fits(clue.text, mode)) problems.push(`${at}: clue "${clue.text}" doesn't fit ${mode === 'two' ? 'half a two-clue square' : 'its square'}`);
    }
    if (!s.sense?.en?.trim() || !s.sense?.hi?.trim()) problems.push(`${at}: sense needs both en and hi`);
  }

  for (const a of p.given) for (const b of p.given) {
    if (a < b && p.slots.some(s => s.cells.includes(a) && s.cells.includes(b))) problems.push(`given letters ${a} and ${b} share an answer`);
  }
  return problems;
}

/** Reads a puzzle file and checks it. */
export function checkFile(file: string, c?: CheckContext): string[] {
  return checkPuzzle(JSON.parse(readFileSync(file, 'utf8')) as Puzzle, c);
}
