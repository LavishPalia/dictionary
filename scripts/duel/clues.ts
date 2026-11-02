// The clue bank: every clue a pool word can get. Rule-built clues (similar/opposite words, pictures, picture maths,
// the curated short answers) are made here from Panna data on every load; Gemini's short definitions and fill-the-gap
// phrases are cached in data/duel/clue-bank.jsonl (scripts/duel/shorten.ts). The filler only uses words with a clue.
import { existsSync, readFileSync } from 'node:fs';
import type { Clue, Sense } from '../../src/duel/engine/types';
import { picMath } from './check';
import { textProblem } from './lib/clue-rules';
import { dictionary } from './lib/db';
import { fits } from './lib/fontwidth';
import { curated, pictures, type PoolWord, wordPool } from './words';

export interface BankClue { word: string; kind: Clue['kind']; text?: string; img?: string; math?: string; full: string; sense: Sense; by: 'rule' | 'gemini' }
/** A word Gemini couldn't clue in its stored sense, or whose clue broke a rule; never asked again. */
export interface BankReject { word: string; rejected: string; by: 'gemini' }
export type BankLine = BankClue | BankReject;

export const BANK_FILE = 'data/duel/clue-bank.jsonl';
export const REJECTED_FILE = 'data/duel/rejected-clues.jsonl';

/** Why a clue can't be used for this word (null = fine). Shared by the rule-built clues and Gemini's. */
export function acceptClue(word: string, c: BankClue): string | null {
  if (!c.full?.trim()) return 'no full text';
  if (!c.sense?.en?.trim() || !c.sense?.hi?.trim()) return 'no sense';
  for (const t of [c.text, c.full]) {
    const why = t ? textProblem(word, t) : null;
    if (why) return why;
  }
  // Plural or possessive forms give the answer away too (ANT in "Ants' home" is caught above; ANTS → "Ant colony" here).
  if (word.length >= 4 && /s$/.test(word) && (c.text ?? c.full).toLowerCase().includes(word.slice(0, -1))) return `contains a form of ${word.toUpperCase()}`;
  if (c.kind === 'pic' || c.kind === 'picmath') return c.img ? null : 'picture clue without a picture';
  if (!c.text?.trim()) return 'no clue text';
  if (c.kind === 'gap' && !c.text.includes('__')) return 'gap clue without a gap';
  // A single-clue square has a bigger font and 3 lines, half a two-clue square a smaller one and 2 lines; make picks by square.
  if (!fits(c.text, 'one') && !fits(c.text, 'two')) return 'too long for a square';
  return null;
}

/** Shares a stem of 4+ letters (COLD / COLDER): too close to clue each other. */
const sameStem = (a: string, b: string) => a.length >= 4 && b.length >= 4 && a.slice(0, 4) === b.slice(0, 4);
/** The word in a similar/opposite clue must be common, or the clue is harder than the answer (DEFRAUD → "Diddle"). */
export const REL_MAX_RANK = 10000;
const cap = (s: string) => s[0].toUpperCase() + s.slice(1);

/** Clues built from Panna data alone, no Gemini. */
export function ruleClues(pool: PoolWord[] = wordPool()): BankClue[] {
  const byWord = new Map(pool.map(w => [w.word, w]));
  const out: BankClue[] = [];
  const push = (c: BankClue) => { if (!acceptClue(c.word, c)) out.push(c); };

  // Similar and opposite words. Opposites are WordNet-only until RELATED_GEMINI_REVIEW.csv is checked (as in Review).
  const links = dictionary().prepare(`select e.normalized w, r.kind, t.normalized o, r.source from related r
    join entries e on e.id = r.entry_id join entries t on t.id = r.related_id order by e.normalized, r.kind, r.rank`).all() as { w: string; kind: 'similar' | 'opposite'; o: string; source: string }[];
  for (const l of links) {
    const pw = byWord.get(l.w);
    const other = byWord.get(l.o);
    if (!pw || pw.source !== 'panna' || !other || other.rank > REL_MAX_RANK || sameStem(l.w, l.o) || textProblem(l.o, l.w)) continue;
    if (l.kind === 'opposite' && l.source !== 'wordnet') continue;
    const text = l.kind === 'opposite' ? `Opposite of ${l.o}` : cap(l.o);
    push({ word: l.w, kind: 'rel', text, full: l.kind === 'opposite' ? text : `Similar to ${l.o}`, sense: pw.sense, by: 'rule' });
  }

  // Pictures, and picture maths: a picture word plus a letter at the end, or minus one of its letters.
  for (const p of pictures()) for (const pic of p.words) {
    const pw = byWord.get(pic);
    if (pw) push({ word: pic, kind: 'pic', img: p.key, full: `Picture: ${p.alt}`, sense: pw.sense, by: 'rule' });
    const made = new Map<string, string>();
    for (const l of 'abcdefghijklmnopqrstuvwxyz') made.set(pic + l, `+${l}`);
    for (const l of new Set(pic)) made.set(picMath(pic, `−${l}`)!, `−${l}`);
    for (const [w, math] of made) {
      const target = byWord.get(w);
      if (!target || target.source !== 'panna' || w.length < 3 || p.words.includes(w)) continue;
      const how = math[0] === '+' ? 'plus' : 'minus';
      push({ word: w, kind: 'picmath', img: p.key, math, full: `Picture maths: ${p.alt}, ${how} ${math[1].toUpperCase()}`, sense: target.sense, by: 'rule' });
    }
  }

  // The curated one- and two-letter answers carry their own clue and sense.
  for (const c of curated()) if (byWord.has(c.answer)) push({ word: c.answer, kind: c.kind, text: c.clue, full: c.clue, sense: { en: c.en, hi: c.hi }, by: 'rule' });
  return out;
}

export function readBankFile(file = BANK_FILE): BankLine[] {
  if (!existsSync(file)) return [];
  return readFileSync(file, 'utf8').split(/\r?\n/).filter(Boolean).map(l => JSON.parse(l) as BankLine);
}

/** Every usable clue per word: rule-built plus Gemini's cached ones, minus the (word, clue) pairs the user marked bad. */
export function loadBank(file = BANK_FILE, pool: PoolWord[] = wordPool()): Map<string, BankClue[]> {
  const bad = new Set(readBankFile(REJECTED_FILE).map(r => `${r.word}|${'full' in r ? r.full : ''}`));
  const inPool = new Set(pool.map(w => w.word));
  const bank = new Map<string, BankClue[]>();
  for (const c of [...ruleClues(pool), ...readBankFile(file).filter((l): l is BankClue => !('rejected' in l))]) {
    if (!inPool.has(c.word) || bad.has(`${c.word}|${c.full}`) || acceptClue(c.word, c)) continue;
    bank.set(c.word, [...(bank.get(c.word) ?? []), c]);
  }
  return bank;
}
