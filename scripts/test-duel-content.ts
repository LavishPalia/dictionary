// Checks the Duel's puzzle pipeline and published content (scripts/duel, data/duel). Usage: npx tsx scripts/test-duel-content.ts
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { nextU32, seedRng } from '../src/duel/engine/rng';
import type { Puzzle, Slot } from '../src/duel/engine/types';
import { boardProblems } from './duel/board-rules';
import { fill, indexWords } from './duel/fill';
import { randomPattern, slotsOf, toPuzzle } from './duel/layout';
import { type CheckContext, checkPuzzle, defaultContext, picMath } from './duel/check';
import { acceptClue, type BankClue, loadBank, readBankFile, ruleClues } from './duel/clues';
import { textProblem } from './duel/lib/clue-rules';
import { blocklist, dictionary } from './duel/lib/db';
import { CELL, FIT, fits, lines } from './duel/lib/fontwidth';
import { runShorten, type ShortenCall } from './duel/shorten';
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

// ---------- the clue bank ----------
const rules = ruleClues();
{
  const sense = { en: 'x', hi: 'x' };
  const clue = (word: string, text: string): BankClue => ({ word, kind: 'def', text, full: text, sense, by: 'gemini' });
  check('acceptClue rejects TOUR / "Tourist trip"', acceptClue('tour', clue('tour', 'Tourist trip')) !== null);
  check('acceptClue rejects ANT / "Ants\' home"', acceptClue('ant', clue('ant', "Ants' home")) !== null);
  check('acceptClue rejects ANTS / "Ant colony" (a form of the answer)', acceptClue('ants', clue('ants', 'Ant colony')) !== null);
  check('acceptClue rejects "Spot, briefly"', acceptClue('dot', clue('dot', 'Spot, briefly')) !== null);
  check('acceptClue rejects a clue too long for a square', acceptClue('urn', clue('urn', 'A large metal container used for serving tea')) !== null);
  check('acceptClue accepts SCAR / "Mark left by a wound"', acceptClue('scar', clue('scar', 'Mark left by a wound')) === null);

  check('rule-built clues for COLD include "Opposite of hot"', rules.some(c => c.word === 'cold' && c.text === 'Opposite of hot'));
  const wnOpp = new Set((dictionary().prepare(`select e.normalized || '|' || t.normalized k from related r join entries e on e.id = r.entry_id
    join entries t on t.id = r.related_id where r.kind = 'opposite' and r.source = 'wordnet'`).all() as { k: string }[]).map(r => r.k));
  const geminiOpp = rules.filter(c => c.text?.startsWith('Opposite of ') && !wnOpp.has(`${c.word}|${c.text.slice(12)}`));
  check('no rule-built opposite comes from Gemini data', geminiOpp.length === 0, geminiOpp.slice(0, 3).map(c => `${c.word}: ${c.text}`));
  const bid = rules.find(c => c.word === 'bid' && c.kind === 'picmath');
  check('picture maths makes BID from BIRD minus R', bid?.math === '−r' && bid.img === '1f426', bid);
  const ruleBad = rules.filter(c => acceptClue(c.word, c));
  check('every rule-built clue passes acceptClue', ruleBad.length === 0, ruleBad.slice(0, 3));
  check('every pool word with a curated answer gets its curated clue', curated().every(c => !poolWords.has(c.answer) || rules.some(r => r.word === c.answer && r.text === c.clue)));
}
// ---------- layout and fill ----------
const seeded = (seed: number) => { const s = seedRng(seed, 0); return () => nextU32(s) / 2 ** 32; };
const dummy = () => ({ clue: { kind: 'def' as const, text: 'X', full: 'X' }, sense: { en: 'x', hi: 'x' } });
{
  const bad: string[] = [];
  for (let seed = 1; seed <= 20; seed++) {
    const P = randomPattern(seeded(seed))!;
    const grid = P.map(row => row.map(isClue => (isClue ? '#' : 'a')));
    const problems = boardProblems(toPuzzle(P, grid, dummy, { id: 't', version: 0, given: [] }));
    if (problems.length) bad.push(`seed ${seed}: ${problems[0]}`);
  }
  check('20 random patterns all meet the board rules', bad.length === 0, bad);

  // p0001's own layout and words: the fill must find p0001's grid.
  const P = [...Array(9)].map((_, r) => [...Array(7)].map((_, c) => p0001.solution[(r + 1) * 8 + c + 1] === undefined));
  const own = new Map<number, string[]>();
  for (const s of p0001.slots) { const w = s.answer.toLowerCase(); own.set(w.length, [...new Set([...(own.get(w.length) ?? []), w])]); }
  const g = fill(P, slotsOf(P), indexWords(own), Date.now() + 10000, seeded(1));
  const want = [...Array(9)].map((_, r) => [...Array(7)].map((_, c) => p0001.solution[(r + 1) * 8 + c + 1]?.toLowerCase() ?? '#').join(''));
  check('fill with only p0001\'s words finds p0001\'s grid', g?.map(r => r.join('')).join() === want.join(), g?.map(r => r.join('')));

  const words = new Map<number, string[]>();
  for (const w of pool) words.set(w.len, [...(words.get(w.len) ?? []), w.word]);
  const index = indexWords(words);
  const run = (seed: number) => { const rng = seeded(seed); for (let i = 0; i < 50; i++) { const P = randomPattern(rng)!; const g = fill(P, slotsOf(P), index, Date.now() + 15000, rng); if (g) return { P, g }; } return null; };
  const a = run(3), b = run(3);
  check('the same seed fills the same grid', !!a && a.g.map(r => r.join('')).join() === b?.g.map(r => r.join('')).join());
  if (a) {
    const answers = slotsOf(a.P).map(s => s.cells.map(([r, c]) => a.g[r][c]).join(''));
    const long = answers.filter(w => w.length > 1);
    check('every filled word is a pool word', answers.every(w => poolWords.has(w)), answers.filter(w => !poolWords.has(w)));
    check('no word of 2+ letters repeats', new Set(long).size === long.length);
  }
}

async function fakeGeminiChecks() {
  // Gemini, faked: a clue for the wrong sense is dropped (Review Focus 2); a clue naming the answer is stored as rejected.
  const dir = mkdtempSync(join(tmpdir(), 'duel-bank-'));
  const file = join(dir, 'bank.jsonl'), log = join(dir, 'log.jsonl');
  const words = ['urn', 'tour', 'scar'].map(w => pool.find(p => p.word === w)!).filter(Boolean);
  let asked: string[] = [];
  const call: ShortenCall = async batch => {
    asked = batch.map(b => b.word);
    return { model: 'fake', items: [
      { word: 'urn', def: 'Ashes vase', gap: null, fits: false },
      { word: 'tour', def: 'Tourist trip', gap: 'On _ in Europe', fits: true },
      { word: 'scar', def: 'Mark left by a wound', gap: 'A _ on his cheek', fits: true },
    ] };
  };
  await runShorten({ call, words, file, logFile: log });
  const bank = loadBank(file, pool);
  check('fake Gemini: URN (fits: false) gets no def clue', !(bank.get('urn') ?? []).some(c => c.by === 'gemini'));
  const lines = readBankFile(file);
  check('fake Gemini: the TOUR clue naming its answer is stored as rejected', lines.some(l => l.word === 'tour' && 'rejected' in l));
  check('fake Gemini: TOUR keeps its gap clue', (bank.get('tour') ?? []).some(c => c.kind === 'gap' && c.text === 'ON __ IN EUROPE' && c.full === 'Fill the gap: On ___ in Europe'));
  check('fake Gemini: SCAR gets its def', (bank.get('scar') ?? []).some(c => c.by === 'gemini' && c.text === 'Mark left by a wound' && c.sense.entryId !== undefined));
  asked = [];
  await runShorten({ call, words, file, logFile: log });
  check('a second run asks Gemini nothing', asked.length === 0, asked);
  const logLines = readFileSync(log, 'utf8').trim().split('\n');
  check('the run is logged with model, requests and words', logLines.length === 1 && JSON.parse(logLines[0]).requests === 1 && JSON.parse(logLines[0]).words === 3, logLines);
  rmSync(dir, { recursive: true, force: true });
}

(async () => {
  await fakeGeminiChecks();
  if (failures) { console.error(`\n${failures} check(s) failed`); process.exit(1); }
  console.log('\nall duel content checks passed');
})();
