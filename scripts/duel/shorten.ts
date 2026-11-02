// Gemini writes a short crossword clue (and, where natural, a fill-the-gap phrase) for every pool word from the word's
// stored Panna sense, and says whether the clue fits that sense. Results are cached in data/duel/clue-bank.jsonl, so a
// word is asked once; a word whose clue breaks a rule or fits another sense is stored as rejected and never asked again.
// Free tier, Flash Lite only. Stops cleanly on the daily quota; run it again after the reset to resume.
// A second pass shows Gemini each word's similar/opposite candidates with the stored sense and keeps only those that fit
// it (loadBank uses no rel clue until then).
// Usage: npm run duel:clues [-- --max-requests N]
import { appendFileSync } from 'node:fs';
import type { Sense } from '../../src/duel/engine/types';
import { acceptClue, BANK_FILE, type BankClue, type BankLine, isRelVet, readBankFile, relOf, ruleClues } from './clues';
import { dictionary } from './lib/db';
import { type PoolWord, wordPool } from './words';

export const BATCH_SIZE = 40;
export const LOG_FILE = 'data/duel/gemini-log.jsonl';
const MODELS = 'gemini-3.5-flash-lite,gemini-3.1-flash-lite';

export interface ShortenItem { word: string; def: string; gap: string | null; fits: boolean }
export interface ShortenInput { word: string; pos: string; sense: Sense }
/** One Gemini request for a batch; tests pass a fake. */
export type ShortenCall = (batch: ShortenInput[]) => Promise<{ model: string; items: ShortenItem[] }>;

export const SYSTEM_PROMPT = `You write clues for an arrowword puzzle (a crossword where each clue sits in a small square of the grid) in an English learner's game.
For each entry you get a word, its part of speech, the one English definition the puzzle uses, and its Hindi meaning.
Return for every entry:
- "def": a crossword clue of 1 to 3 words for the word in THIS definition's sense, in plain everyday English, first letter capitalised, no full stop. The square is tiny: no word in the clue may be longer than 7 letters, and shorter is better. Examples: SCAR → "Mark left by a wound", HASTEN → "Hurry", TEE → "Golf ball peg", ORCHESTRA → "Concert band".
- "gap": an everyday phrase or short sentence of at most 4 short words (none longer than 7 letters) where the word fits, with the word replaced by a single "_", in this same sense. Example: ANYMORE → "I don't cry _". Use null when no natural short phrase exists.
- "fits": true only if "def" really describes this definition. If the word is usually meant in another sense, still clue THIS sense; if you cannot, set "fits" to false.
Never use the word itself, any form of it (plural, past tense, -ing, -er), or a word that contains it, in "def". In "gap", only the "_" may stand for it.
Never write "briefly", "for short", "abbr." or any hint that the answer is shortened. No proper names, no offensive words.
Return one object per entry with the word copied exactly as given.`;

const SCHEMA = {
  type: 'ARRAY',
  items: {
    type: 'OBJECT',
    properties: { word: { type: 'STRING' }, def: { type: 'STRING' }, gap: { type: 'STRING', nullable: true }, fits: { type: 'BOOLEAN' } },
    required: ['word', 'def', 'gap', 'fits'],
  },
};

/** Turns one Gemini answer into bank lines: the accepted clues, or one rejection with the reason. */
export function bankLines(w: PoolWord, item: ShortenItem): BankLine[] {
  if (!item.fits) return [{ word: w.word, rejected: 'clue fits another sense', by: 'gemini' }];
  const out: BankLine[] = [];
  const def: BankClue = { word: w.word, kind: 'def', text: item.def.trim().replace(/\.$/, ''), full: item.def.trim().replace(/\.$/, ''), sense: w.sense, by: 'gemini' };
  const defWhy = acceptClue(w.word, def);
  if (defWhy) out.push({ word: w.word, rejected: `def "${item.def}": ${defWhy}`, by: 'gemini' });
  else out.push(def);
  const phrase = item.gap?.trim();
  if (phrase && (phrase.match(/_+/g) ?? []).length === 1) {
    const gap: BankClue = { word: w.word, kind: 'gap', text: phrase.replace(/_+/, '__').toUpperCase(), full: `Fill the gap: ${phrase.replace(/_+/, '___')}`, sense: w.sense, by: 'gemini' };
    if (!acceptClue(w.word, gap)) out.push(gap);
  }
  return out;
}

export interface RelVetInput { word: string; pos: string; sense: Sense; similar: string[]; opposite: string[] }
export interface RelVetItem { word: string; similar: string[]; opposite: string[] }
export type RelVetCall = (batch: RelVetInput[]) => Promise<{ model: string; items: RelVetItem[] }>;

export const REL_PROMPT = `You check similar and opposite words for an English learner's word puzzle.
For each entry you get a word, its part of speech, the one English definition the puzzle uses, its Hindi meaning, and candidate similar and opposite words.
Keep a similar word only if, in THIS definition's sense, it means nearly the same and a learner would accept it as a clue for the word.
Keep an opposite word only if it is the true opposite in THIS definition's sense.
Drop candidates that belong to another sense of the word, are vague, or are rare. Never add words that are not in the candidate lists.
Return one object per entry with the word copied exactly as given and the kept candidates.`;

const REL_SCHEMA = {
  type: 'ARRAY',
  items: {
    type: 'OBJECT',
    properties: { word: { type: 'STRING' }, similar: { type: 'ARRAY', items: { type: 'STRING' } }, opposite: { type: 'ARRAY', items: { type: 'STRING' } } },
    required: ['word', 'similar', 'opposite'],
  },
};

interface RunOpts { file?: string; logFile?: string; maxRequests?: number; quotaError?: new (...a: never[]) => Error; words?: PoolWord[] }

/** Sends `todo` to Gemini in batches and appends the bank lines; stops cleanly on the daily quota and logs the run. */
async function runBatches<T extends { word: string }, I extends { word: string }>(label: string, todo: T[], o: RunOpts,
  call: (batch: T[]) => Promise<{ model: string; items: I[] }>, toLines: (w: T, item: I) => BankLine[]): Promise<number> {
  const file = o.file ?? BANK_FILE;
  let requests = 0, words = 0, model = '';
  try {
    for (let i = 0; i < todo.length && requests < (o.maxRequests ?? Infinity); i += BATCH_SIZE) {
      const batch = todo.slice(i, i + BATCH_SIZE);
      const res = await call(batch);
      requests++; model = res.model;
      const got = new Map(res.items.map(it => [it.word.toLowerCase().trim(), it]));
      const lines = batch.flatMap(w => (got.has(w.word) ? toLines(w, got.get(w.word)!) : [])); // omitted words are asked again next run
      if (lines.length) appendFileSync(file, lines.map(l => JSON.stringify(l)).join('\n') + '\n');
      words += new Set(lines.map(l => l.word)).size;
      process.stderr.write(`[duel:clues] ${label} ${Math.min(i + BATCH_SIZE, todo.length)}/${todo.length}\n`);
    }
  } catch (err) {
    if (!(o.quotaError && err instanceof o.quotaError)) throw err;
    process.stderr.write(`[duel:clues] daily quota reached; run again after the reset (~12:30 PM IST)\n`);
  } finally {
    if (requests) appendFileSync(o.logFile ?? LOG_FILE, JSON.stringify({ at: new Date().toISOString(), model, requests, words, pass: label }) + '\n');
  }
  return requests;
}

const posOf = () => { const q = dictionary().prepare('select pos from entries where rowid = ?'); return (w: PoolWord) => (q.get(w.sense.entryId) as { pos: string } | undefined)?.pos ?? ''; };

/** Asks Gemini for a def (and gap) clue for every pool word not yet in the bank file. Returns the number of requests. */
export async function runShorten(o: RunOpts & { call: ShortenCall }): Promise<number> {
  const asked = new Set(readBankFile(o.file ?? BANK_FILE).filter(l => !isRelVet(l)).map(l => l.word));
  const todo = (o.words ?? wordPool()).filter(w => w.source === 'panna' && !asked.has(w.word));
  const pos = posOf();
  return runBatches('defs', todo, o, batch => o.call(batch.map(w => ({ word: w.word, pos: pos(w), sense: w.sense }))), bankLines);
}

/** Asks Gemini which similar/opposite candidates fit each word's stored sense, for words not yet vetted. */
export async function runRelVet(o: RunOpts & { call: RelVetCall }): Promise<number> {
  const pool = o.words ?? wordPool(), asking = new Set(pool.map(w => w.word));
  const vetted = new Set(readBankFile(o.file ?? BANK_FILE).filter(isRelVet).map(l => l.word));
  const cands = new Map<string, { similar: string[]; opposite: string[] }>();
  for (const c of ruleClues()) { // candidates may be any pool word, even when only some words are asked
    const rel = relOf(c);
    if (!rel || vetted.has(c.word) || !asking.has(c.word)) continue;
    const e = cands.get(c.word) ?? { similar: [], opposite: [] };
    e[rel.kind].push(rel.other);
    cands.set(c.word, e);
  }
  const pos = posOf();
  const todo = pool.filter(w => cands.has(w.word)).map(w => ({ w, ...cands.get(w.word)!, word: w.word }));
  return runBatches('rel', todo, o,
    batch => o.call(batch.map(t => ({ word: t.word, pos: pos(t.w), sense: t.w.sense, similar: t.similar, opposite: t.opposite }))),
    (t, item) => {
      const keep = (asked: string[], got: string[]) => asked.filter(x => got.map(g => g.toLowerCase().trim()).includes(x)); // never a word it made up
      return [{ word: t.word, similar: keep(t.similar, item.similar ?? []), opposite: keep(t.opposite, item.opposite ?? []), by: 'gemini-rel' }];
    });
}

if (process.argv[1]?.endsWith('shorten.ts')) {
  process.env.GEMINI_MODEL ??= MODELS;
  const max = process.argv.indexOf('--max-requests');
  (async () => {
    const { callGeminiJson, DailyQuotaError } = await import('../lib/gemini');
    const { loadApiKey } = await import('../lib/gloss');
    const key = loadApiKey();
    const opts = { maxRequests: max > 0 ? Number(process.argv[max + 1]) : undefined, quotaError: DailyQuotaError };
    const entry = (b: ShortenInput) => `word: ${b.word}\npos: ${b.pos}\ndefinition: ${b.sense.en}\nhindi: ${b.sense.hi}`;
    const defs = await runShorten({ ...opts, call: batch => callGeminiJson<ShortenItem>(key, { system: SYSTEM_PROMPT, schema: SCHEMA, contents: [{ role: 'user', parts: [{ text: batch.map(entry).join('\n\n') }] }] }) });
    const left = opts.maxRequests === undefined ? undefined : Math.max(0, opts.maxRequests - defs);
    const rel = await runRelVet({ ...opts, maxRequests: left, call: batch => callGeminiJson<RelVetItem>(key, {
      system: REL_PROMPT, schema: REL_SCHEMA,
      contents: [{ role: 'user', parts: [{ text: batch.map(b => `${entry(b)}\nsimilar candidates: ${b.similar.join(', ') || '(none)'}\nopposite candidates: ${b.opposite.join(', ') || '(none)'}`).join('\n\n') }] }],
    }) });
    console.log(`${defs + rel} request(s) made (${defs} defs, ${rel} similar/opposite checks); bank: ${BANK_FILE}`);
  })().catch(err => { console.error(err instanceof Error ? err.message : err); process.exit(1); });
}
