// Gemini writes a short crossword clue (and, where natural, a fill-the-gap phrase) for every pool word from the word's
// stored Panna sense, and says whether the clue fits that sense. Results are cached in data/duel/clue-bank.jsonl, so a
// word is asked once; a word whose clue breaks a rule or fits another sense is stored as rejected and never asked again.
// Free tier, Flash Lite only. Stops cleanly on the daily quota; run it again after the reset to resume.
// Usage: npm run duel:clues [-- --max-requests N]
import { appendFileSync } from 'node:fs';
import type { Sense } from '../../src/duel/engine/types';
import { acceptClue, BANK_FILE, type BankClue, type BankLine, readBankFile } from './clues';
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

/** Asks Gemini for every pool word not yet in the bank file. Returns the number of requests made. */
export async function runShorten(opts: { call: ShortenCall; words?: PoolWord[]; file?: string; logFile?: string; maxRequests?: number; quotaError?: new (...a: never[]) => Error }): Promise<number> {
  const file = opts.file ?? BANK_FILE;
  const asked = new Set(readBankFile(file).map(l => l.word));
  const todo = (opts.words ?? wordPool()).filter(w => w.source === 'panna' && !asked.has(w.word));
  const pos = dictionary().prepare('select pos from entries where rowid = ?');
  let requests = 0, words = 0, model = '';
  try {
    for (let i = 0; i < todo.length && requests < (opts.maxRequests ?? Infinity); i += BATCH_SIZE) {
      const batch = todo.slice(i, i + BATCH_SIZE);
      const res = await opts.call(batch.map(w => ({ word: w.word, pos: (pos.get(w.sense.entryId) as { pos: string } | undefined)?.pos ?? '', sense: w.sense })));
      requests++; model = res.model;
      const got = new Map(res.items.map(it => [it.word.toLowerCase().trim(), it]));
      const lines = batch.flatMap(w => (got.has(w.word) ? bankLines(w, got.get(w.word)!) : [])); // omitted words are asked again next run
      if (lines.length) appendFileSync(file, lines.map(l => JSON.stringify(l)).join('\n') + '\n');
      words += new Set(lines.map(l => l.word)).size;
      process.stderr.write(`[duel:clues] ${Math.min(i + BATCH_SIZE, todo.length)}/${todo.length}\n`);
    }
  } catch (err) {
    if (!(opts.quotaError && err instanceof opts.quotaError)) throw err;
    process.stderr.write(`[duel:clues] daily quota reached; run again after the reset (~12:30 PM IST)\n`);
  } finally {
    if (requests) appendFileSync(opts.logFile ?? LOG_FILE, JSON.stringify({ at: new Date().toISOString(), model, requests, words }) + '\n');
  }
  return requests;
}

if (process.argv[1]?.endsWith('shorten.ts')) {
  process.env.GEMINI_MODEL ??= MODELS;
  const max = process.argv.indexOf('--max-requests');
  (async () => {
    const { callGeminiJson, DailyQuotaError } = await import('../lib/gemini');
    const { loadApiKey } = await import('../lib/gloss');
    const key = loadApiKey();
    const call: ShortenCall = batch => callGeminiJson<ShortenItem>(key, {
      system: SYSTEM_PROMPT,
      schema: SCHEMA,
      contents: [{ role: 'user', parts: [{ text: batch.map(b => `word: ${b.word}\npos: ${b.pos}\ndefinition: ${b.sense.en}\nhindi: ${b.sense.hi}`).join('\n\n') }] }],
    });
    const n = await runShorten({ call, maxRequests: max > 0 ? Number(process.argv[max + 1]) : undefined, quotaError: DailyQuotaError });
    console.log(`${n} request(s) made; bank: ${BANK_FILE}`);
  })().catch(err => { console.error(err instanceof Error ? err.message : err); process.exit(1); });
}
