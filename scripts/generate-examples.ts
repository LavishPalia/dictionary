// Offline generator: Gemini writes one short example sentence (English + Hindi) per common headword.
// Network is used only here; build:data never calls an LLM. Resume is automatic from the progress file, which is kept
// (a later, larger --top reuses it). Usage: npm run data:examples -- --top 5000 [--dry-run] [--max-requests n]
import fs from 'fs';
import path from 'path';
import Database from 'better-sqlite3';
import { SOURCES_DIR, pinChecksum } from './lib/lexicon';
import { DailyQuotaError, callGeminiJson, currentModel } from './lib/gemini';
import { loadApiKey } from './lib/gloss';
import { ExampleRequest, ExampleRow, findWord, validateExample } from './lib/examples';
import { GRAMMAR_POS } from '../src/lib/book-data';

const BATCH_SIZE = 20;
const MAX_ATTEMPTS = 3; // times a word may be omitted from a response before it is closed with nothing
const PROGRESS_FILE = path.join(SOURCES_DIR, 'examples-progress.jsonl');
const FINAL_FILE = path.join(SOURCES_DIR, 'examples.jsonl');
const REVIEW_FILE = path.join(SOURCES_DIR, 'EXAMPLES_TOP5000_REVIEW.csv');

interface Candidate extends ExampleRequest { freq_rank: number }
type Prompted = Candidate & { retryReason?: string };

interface ProgressRow {
  normalized: string;
  headword: string;
  freq_rank: number;
  pos: string;
  meaning_hi: string;
  final: boolean; // false: omitted or rejected so far and still due a retry
  attempts: number; // responses sent for this word
  rejections: number;
  model?: string;
  raw?: { example_en: string; example_hi: string }; // Gemini's output as received
  status: 'valid' | 'rejected' | 'omitted';
  rejectionReason?: string; // last validation rejection; survives a later omission so the retry prompt can carry it
  reason?: string; // why it was rejected / omitted (last attempt)
  example?: ExampleRow; // present only when valid
}

const SYSTEM_PROMPT = `You write one short example sentence per entry for an English-to-Hindi learner's dictionary.
For each entry you get the headword, its part of speech, its English definition and its Hindi meaning. Write the sentence in that sense, not in another meaning of the word.
Rules for example_en:
- 6 to 16 words, and at most 100 characters.
- Everyday or exam-style English. Indian settings (school, market, train, family, festival) are fine.
- Use the headword in its exact form when that is grammatical. Otherwise use exactly one inflected form of it (for example a plural, past tense or -ing form).
- Use the word only once in the sentence.
- End with a full stop, question mark or exclamation mark.
- No real people, brands, politics, religion or violence.
Rules for example_hi:
- A natural Hindi translation of example_en, written in Devanagari only (no Latin letters), at most 120 characters.
Return one object per entry, with the headword copied exactly as given. If an entry says "previous attempt rejected", fix that problem.`;

const RESPONSE_SCHEMA = {
  type: 'ARRAY',
  items: {
    type: 'OBJECT',
    properties: {
      headword: { type: 'STRING' },
      example_en: { type: 'STRING' },
      example_hi: { type: 'STRING' },
    },
    required: ['headword', 'example_en', 'example_hi'],
  },
};

export function buildUserContent(batch: Prompted[]): string {
  const blocks = batch.map((c) => [
    `headword: ${c.normalized}`,
    `pos: ${c.pos}`,
    `definition: ${c.definition_en}`,
    `hindi: ${c.meaning_hi}`,
    ...(c.retryReason ? [`previous attempt rejected: ${c.retryReason}`] : []),
  ].join('\n'));
  return `Entries:\n\n${blocks.join('\n\n')}`;
}

function buildContents(batch: Prompted[]): unknown[] {
  return [{ role: 'user', parts: [{ text: buildUserContent(batch) }] }];
}

/** Content words (not grammar words) with freq_rank <= top, in frequency order, with their inflected forms. */
function selectCandidates(db: Database.Database, top: number): Candidate[] {
  const rows = db.prepare(`SELECT id, normalized, headword, pos, definition_en, meaning_hi, freq_rank FROM entries
    WHERE freq_rank IS NOT NULL AND freq_rank <= ? AND ${GRAMMAR_POS.map(() => 'pos NOT LIKE ?').join(' AND ')}
    ORDER BY freq_rank, normalized`).all(top, ...GRAMMAR_POS.map((p) => `${p}%`)) as
    Array<{ id: number; normalized: string; headword: string; pos: string; definition_en: string; meaning_hi: string; freq_rank: number }>;
  const formRows = db.prepare(`SELECT f.lemma_id AS id, f.normalized_form AS form FROM forms f
    JOIN entries e ON e.id = f.lemma_id WHERE e.freq_rank <= ?`).all(top) as { id: number; form: string }[];
  const formsOf = new Map<number, string[]>();
  for (const f of formRows) formsOf.set(f.id, [...(formsOf.get(f.id) ?? []), f.form]);
  const seen = new Set<string>();
  const out: Candidate[] = [];
  for (const r of rows) {
    if (seen.has(r.normalized)) continue; // one example per normalized word (the most frequent entry)
    seen.add(r.normalized);
    out.push({
      headword: r.headword, normalized: r.normalized, pos: r.pos, definition_en: r.definition_en ?? '',
      meaning_hi: r.meaning_hi ?? '', freq_rank: r.freq_rank, forms: formsOf.get(r.id) ?? [],
    });
  }
  return out;
}

function writeJsonlAtomic(file: string, rows: unknown[]): void {
  const tmp = `${file}.tmp`;
  fs.writeFileSync(tmp, rows.map((r) => JSON.stringify(r)).join('\n') + '\n');
  // On Windows a virus scanner or the search indexer can briefly lock the file; wait and try again.
  for (let attempt = 1; ; attempt++) {
    try {
      fs.renameSync(tmp, file);
      return;
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if ((code !== 'EPERM' && code !== 'EBUSY' && code !== 'EACCES') || attempt >= 10) throw error;
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 200 * attempt);
    }
  }
}

function csvCell(value: unknown): string {
  const s = String(value ?? '');
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function writeReviewSheet(progress: Map<string, ProgressRow>): void {
  const valid = [...progress.values()].filter((r) => r.example)
    .sort((a, b) => a.freq_rank - b.freq_rank || a.normalized.localeCompare(b.normalized));
  const rows = [
    ['word', 'freq_rank', 'pos', 'hindi meaning', 'example_en', 'example_hi', 'exact', 'model'],
    ...valid.map((r) => [r.normalized, r.freq_rank, r.pos, r.meaning_hi, r.example!.en, r.example!.hi, r.example!.exact, r.example!.model]),
  ];
  fs.writeFileSync(REVIEW_FILE, '﻿' + rows.map((r) => r.map(csvCell).join(',')).join('\r\n') + '\r\n');
}

function writeFinal(progress: Map<string, ProgressRow>): number {
  const out = [...progress.values()].filter((r) => r.example)
    .sort((a, b) => (a.normalized < b.normalized ? -1 : a.normalized > b.normalized ? 1 : 0))
    .map((r) => {
      const { en, hi, start, length, exact, model } = r.example!;
      return { normalized: r.normalized, en, hi, start, length, exact, model };
    });
  writeJsonlAtomic(FINAL_FILE, out);
  pinChecksum('data/sources/examples.jsonl');
  return out.length;
}

function saveProgress(progress: Map<string, ProgressRow>): void {
  writeJsonlAtomic(PROGRESS_FILE, [...progress.values()].sort((a, b) => a.freq_rank - b.freq_rank || a.normalized.localeCompare(b.normalized)));
  writeReviewSheet(progress);
}

function argValue(args: string[], name: string): string | undefined {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const top = Number(argValue(args, '--top') ?? 5000);
  const dryRun = args.includes('--dry-run');
  const maxRequests = Number(argValue(args, '--max-requests') ?? Number.POSITIVE_INFINITY);
  if (!Number.isInteger(top) || top < 1) throw new Error(`Invalid --top: ${argValue(args, '--top')}`);
  if (Number.isNaN(maxRequests)) throw new Error('Invalid --max-requests');

  const db = new Database(path.join(process.cwd(), 'data', 'dictionary.db'), { readonly: true, fileMustExist: true });
  const candidates = selectCandidates(db, top);

  if (dryRun) {
    console.log(`--- system prompt ---\n${SYSTEM_PROMPT}\n\n--- user content (first ${Math.min(BATCH_SIZE, candidates.length)} words) ---`);
    console.log(buildUserContent(candidates.slice(0, BATCH_SIZE)));
    console.log(`\nCandidates for --top ${top}: ${candidates.length} (${Math.ceil(candidates.length / BATCH_SIZE)} requests of ${BATCH_SIZE}). Dry run: no network call made.`);
    return;
  }

  const apiKey = loadApiKey();
  const progress = new Map<string, ProgressRow>();
  if (fs.existsSync(PROGRESS_FILE)) {
    for (const line of fs.readFileSync(PROGRESS_FILE, 'utf8').split(/\r?\n/).filter(Boolean)) {
      const row = JSON.parse(line) as ProgressRow;
      progress.set(row.normalized, row);
    }
  }
  // Fresh words first; words due a retry go to a later batch.
  const pending = () => {
    const due = candidates.filter((c) => !progress.get(c.normalized)?.final);
    return [...due.filter((c) => !progress.get(c.normalized)), ...due.filter((c) => progress.get(c.normalized))];
  };
  console.log(`Example generation: ${candidates.length} candidates for --top ${top}; ${candidates.length - pending().length} already done.`);

  let requests = 0;
  let stoppedEarly = false;
  while (pending().length && requests < maxRequests) {
    const batch: Prompted[] = pending().slice(0, BATCH_SIZE).map((c) => {
      const prev = progress.get(c.normalized);
      return { ...c, retryReason: prev?.rejectionReason };
    });
    let result: { model: string; items: Array<{ headword: string; example_en?: string; example_hi?: string }> };
    try {
      result = await callGeminiJson(apiKey, { system: SYSTEM_PROMPT, contents: buildContents(batch), schema: RESPONSE_SCHEMA });
    } catch (error) {
      if (error instanceof DailyQuotaError) {
        console.log('All Gemini models are out of daily quota. Progress is saved; run the same command again after the quota resets to resume.');
        stoppedEarly = true;
        break;
      }
      throw error;
    }
    requests++;
    const byWord = new Map<string, (typeof result.items)[number]>();
    for (const item of result.items) {
      const key = String(item?.headword ?? '').trim().toLowerCase();
      if (key && !byWord.has(key)) byWord.set(key, item);
    }
    for (const c of batch) {
      const item = byWord.get(c.normalized);
      const prev = progress.get(c.normalized);
      const attempts = (prev?.attempts ?? 0) + 1;
      const base = { normalized: c.normalized, headword: c.headword, freq_rank: c.freq_rank, pos: c.pos, meaning_hi: c.meaning_hi, attempts, model: result.model };
      if (!item) {
        const giveUp = attempts >= MAX_ATTEMPTS;
        progress.set(c.normalized, {
          ...base, rejections: prev?.rejections ?? 0, final: giveUp, status: 'omitted', raw: prev?.raw, rejectionReason: prev?.rejectionReason,
          reason: giveUp ? `omitted by Gemini in ${attempts} responses; given up` : `omitted by Gemini (attempt ${attempts})`,
        });
        continue;
      }
      const raw = { example_en: String(item.example_en ?? ''), example_hi: String(item.example_hi ?? '') };
      const reason = validateExample(c, { headword: c.normalized, ...raw });
      const hit = reason ? null : findWord(raw.example_en.trim(), c.headword, c.forms);
      if (!reason && hit) {
        progress.set(c.normalized, {
          ...base, rejections: prev?.rejections ?? 0, final: true, raw, status: 'valid',
          example: { normalized: c.normalized, en: raw.example_en.trim(), hi: raw.example_hi.trim(), start: hit.start, length: hit.length, exact: hit.exact, model: result.model },
        });
      } else {
        const rejections = (prev?.rejections ?? 0) + 1;
        progress.set(c.normalized, { ...base, rejections, final: rejections >= 2, raw, status: 'rejected', rejectionReason: reason ?? 'English must contain the word exactly once', reason: reason ?? 'English must contain the word exactly once' });
      }
    }
    saveProgress(progress);
    const done = candidates.length - pending().length;
    console.log(`  request ${requests}: ${done}/${candidates.length} words done (${currentModel() ?? 'quota exhausted'})`);
  }

  saveProgress(progress);
  const left = pending().length;
  if (left) {
    const why = stoppedEarly ? 'daily quota' : 'request limit';
    console.log(`Stopped (${why}) with ${left} of ${candidates.length} words left. Progress kept in ${path.relative(process.cwd(), PROGRESS_FILE)}; ` +
      `re-run: npm run data:examples -- --top ${top}`);
    process.exitCode = 2;
    return;
  }

  const finalRows = writeFinal(progress);
  const done = candidates.map((c) => progress.get(c.normalized)!);
  const noExample = done.filter((r) => !r.example);
  const byReason: Record<string, number> = {};
  for (const r of noExample) byReason[r.reason ?? 'unknown'] = (byReason[r.reason ?? 'unknown'] ?? 0) + 1;
  const summary = {
    top,
    candidates: candidates.length,
    with_example: done.length - noExample.length,
    exact_form: done.filter((r) => r.example?.exact).length,
    without_example: noExample.length,
    without_example_by_reason: byReason,
    final_rows_all_tiers: finalRows,
    models: Object.fromEntries([...new Set(done.map((r) => r.model ?? 'unknown'))]
      .map((m) => [m, done.filter((r) => (r.model ?? 'unknown') === m).length])),
    final_file: path.relative(process.cwd(), FINAL_FILE),
    review_sheet: path.relative(process.cwd(), REVIEW_FILE),
  };
  console.log(JSON.stringify(summary, null, 2));
}

main().catch((err) => { console.error(err); process.exit(1); });
