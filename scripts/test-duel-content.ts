// Checks the Duel's puzzle pipeline and published content (scripts/duel, data/duel). Usage: npx tsx scripts/test-duel-content.ts
import { readFileSync } from 'node:fs';
import type { Puzzle, Slot } from '../src/duel/engine/types';
import { type CheckContext, checkPuzzle, defaultContext, picMath } from './duel/check';
import { textProblem } from './duel/lib/clue-rules';
import { CELL, FIT, fits, lines } from './duel/lib/fontwidth';
import { blocklist } from './duel/lib/db';
import { curated, LENGTHS, pictures, wordPool } from './duel/words';

let failures = 0;
function check(label: string, ok: boolean, detail?: unknown) {
  if (ok) console.log(`✓ ${label}`);
  else { failures++; console.error(`✗ ${label}${detail !== undefined ? ` — ${JSON.stringify(detail)}` : ''}`); }
}

// ---------- word pool, curated, pictures ----------
const pool = wordPool();
const poolWords = new Set(pool.map(w => w.word));
{
  const blocked = blocklist();
  const bad = pool.filter(w => !/^[a-z]+$/.test(w.word) || !LENGTHS.includes(w.len) || w.len !== w.word.length || blocked.has(w.word) || !w.sense.en.trim() || !w.sense.hi.trim());
  check('pool words are a–z, a board length, not blocked, with an en and hi sense', bad.length === 0, bad.slice(0, 5).map(w => w.word));
  check('pool has no duplicate words', poolWords.size === pool.length);
  check('pool is about 12k words', pool.length > 10000 && pool.length < 16000, pool.length);
  check('the family blocklist keeps PISS, SPANK, ANTHRAX, CIGARETTE out', ['piss', 'spank', 'anthrax', 'cigarette', 'snot', 'phallic'].every(w => !poolWords.has(w)));

  const cur = curated();
  check('curated has ≥ 180 entries', cur.length >= 180, cur.length);
  const curBad = cur.filter(c => !/^[a-z]{1,2}$/.test(c.answer) || !c.en.trim() || !c.hi.trim() || !c.clue.trim() || textProblem(c.answer, c.clue));
  check('every curated clue has en/hi and passes the text rules', curBad.length === 0, curBad.slice(0, 5).map(c => `${c.answer}: ${c.clue} (${textProblem(c.answer, c.clue)})`));
  const letters = new Set(cur.filter(c => c.answer.length === 1).map(c => c.answer));
  check('every letter A–Z has a curated one-letter clue', [...'abcdefghijklmnopqrstuvwxyz'].every(l => letters.has(l)), [...'abcdefghijklmnopqrstuvwxyz'].filter(l => !letters.has(l)));

  const pics = pictures();
  check('pictures have unique keys', new Set(pics.map(p => p.key)).size === pics.length);
  const notPool = pics.flatMap(p => p.words).filter(w => !poolWords.has(w));
  check('every picture word is in the pool', notPool.length === 0, notPool);
  const named = pics.flatMap(p => p.words.filter(w => textProblem(w, p.alt)).map(w => `${w}: ${p.alt}`));
  check('no picture alt names its word', named.length === 0, named);
}

// ---------- clue fit (Montserrat 700 capitals) ----------
const p0001 = JSON.parse(readFileSync('data/duel/puzzles/p0001.json', 'utf8')) as Puzzle;
const modeAt = (p: Puzzle, s: Slot) => (p.slots.filter(o => o.clueCell === s.clueCell).length === 2 ? 'two' : 'one');
{
  const misfit = p0001.slots.filter(s => s.clue.text && !fits(s.clue.text, modeAt(p0001, s))).map(s => `${s.answer}: ${s.clue.text} (${modeAt(p0001, s)})`);
  check('every text clue in p0001 fits its square', misfit.length === 0, misfit);
  check('"Mark left by a wound" fits a square alone', fits('Mark left by a wound', 'one'));
  check('"A large metal container used for serving tea" does not fit', !fits('A large metal container used for serving tea', 'one'));
  check('a word wider than the line gives null', lines('Supercalifragilistic', 8.6, 38) === null);
  check('"NUMERALS" is too wide for a border square (Montserrat is wide)', !fits('Numerals', 'one'));
  const x = 'Line of seats in a hall';
  check(`"${x}" fits alone but not as half of a two-clue square`, fits(x, 'one') && !fits(x, 'two'), lines(x, CELL * FIT.two.size, CELL - 2));
}

// ---------- the checker ----------
{
  check('p0001 passes the full checker', checkPuzzle(p0001).length === 0, checkPuzzle(p0001));
  const C = p0001.cols;
  const slot = (answer: string) => p0001.slots.findIndex(s => s.answer === answer);
  const fails = (label: string, rule: RegExp, mutate: (p: Puzzle) => void, ctx?: Partial<CheckContext>) => {
    const p = JSON.parse(JSON.stringify(p0001)) as Puzzle;
    mutate(p);
    const problems = checkPuzzle(p, { ...defaultContext(), ...ctx });
    check(`checker rejects ${label}`, problems.some(m => rule.test(m)), problems.slice(0, 4));
  };
  const toLetter = (p: Puzzle, cell: number) => { p.solution[cell] = 'A'; p.clueCells = p.clueCells.filter(c => c !== cell); };
  const toClue = (p: Puzzle, cell: number) => { delete p.solution[cell]; p.clueCells.push(cell); };
  const setClue = (answer: string, text: string) => (p: Puzzle) => { const s = p.slots[slot(answer)]; s.clue = { kind: 'def', text, full: text }; };
  const innerTwo = p0001.slots.find(s => s.clueCell > 2 * C && s.clueCell % C > 0 && p0001.slots.filter(o => o.clueCell === s.clueCell).length === 2)!;

  fails('a top-border square turned into a letter', /top border \(0,3\)/, p => toLetter(p, 3));
  fails('a first-row letter turned into a clue square', /first letter row \(1,4\)/, p => toClue(p, 1 * C + 4));
  fails('a border clue removed', /top border \(0,2\) clues ""/, p => { p.slots = p.slots.filter(s => s.clueCell !== 2); });
  fails('an inner clue square that clues nothing', /clues "", needs "ad"/, p => { p.slots = p.slots.filter(s => s.clueCell !== innerTwo.clueCell); });
  fails('a third slot on one clue square', /clues "aad"/, p => { p.slots.push({ ...innerTwo, id: 'a:9:9' }); });
  fails('an 8-letter across', /8 letters/, p => { p.slots[slot('OVERLAP')].answer = 'OVERLAPS'; });
  fails('a duplicate answer', /appears twice/, p => { p.slots[slot('TEE')].answer = 'BED'; });
  fails('a blocked answer', /blocked word/, () => {}, { blocked: new Set(['tee']) });
  fails('a non-Panna answer', /not a Panna word/, () => {}, { words: new Set([...defaultContext().words].filter(w => w !== 'tee')) });
  check('the containment rule catches TOUR in "Tourist trip" (Review Focus 1)', textProblem('tour', 'Tourist trip') !== null);
  check('the containment rule catches NORTH in "North"', textProblem('north', 'North') !== null);
  check('N may be clued "North" (whole-word rule for short answers)', textProblem('n', 'North') === null);
  fails('a clue that contains its answer', /contains the answer SLED/, p => { p.slots[slot('SLED')].clue = { kind: 'def', text: 'Sledding ride', full: 'Sledding ride' }; });
  fails('a two-letter answer as a whole word in its clue', /contains the answer NO/, setClue('NO', 'No way'));
  fails('"briefly" in a clue', /briefly/, setClue('BED', 'Spot, briefly'));
  fails('a clue too long for its square', /doesn't fit its square/, setClue('ORCHESTRA', 'A large group of people who play music together'));
  fails('a clue that fits alone but not in a two-clue square (Review Focus 5)', /half a two-clue square/, p => { const s = p.slots.find(o => o.id === innerTwo.id)!; s.clue = { kind: 'def', text: 'Line of seats in a hall', full: 'Line of seats in a hall' }; });
  fails('two given letters in one answer', /share an answer/, p => { p.given = [1 * C + 1, 1 * C + 3, p.given[2]]; });
  fails('one given letter', /1 given letters/, p => { p.given = [p.given[0]]; });
  fails('a picture key with no SVG (Review Focus 4)', /zzzz has no SVG/, p => { p.slots[slot('SLED')].clue.img = 'zzzz'; });
  fails('wrong picture maths', /doesn't make per/, p => { p.slots[slot('PER')].clue.math = '+s'; });
  fails('an empty Hindi sense', /sense needs both en and hi/, p => { p.slots[slot('BED')].sense.hi = ''; });
  check('picture maths: bird −r = bid, pear + s = pears', picMath('bird', '−r') === 'bid' && picMath('pear', '+s') === 'pears' && picMath('pear', '−z') === null);
}

if (failures) { console.error(`\n${failures} check(s) failed`); process.exit(1); }
console.log('\nall duel content checks passed');
