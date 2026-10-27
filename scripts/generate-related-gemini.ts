// Offline generator: Gemini suggests similar/opposite words for entries with thin WordNet coverage.
// Network is used only here; build:data never calls an LLM. Resume is automatic from the progress file, which is kept
// (a later, larger --top reuses it). Usage: npm run data:related-gemini -- --top 1500 [--dry-run] [--max-requests n]
import fs from 'fs';
import path from 'path';
import Database from 'better-sqlite3';
import { SOURCES_DIR, pinChecksum } from './lib/lexicon';
import { DailyQuotaError, callGeminiJson, currentModel } from './lib/gemini';
import { loadApiKey } from './lib/gloss';
import { RelatedCandidate, makeLookup, selectCandidates, validateSuggestions } from './lib/related-gemini';

const BATCH_SIZE = 25;
const MAX_ATTEMPTS = 3; // times a word may be omitted from a response before it is closed with nothing
const PROGRESS_FILE = path.join(SOURCES_DIR, 'related-gemini-progress.jsonl');
const FINAL_FILE = path.join(SOURCES_DIR, 'related-gemini.jsonl');
const REVIEW_FILE = path.join(SOURCES_DIR, 'RELATED_GEMINI_REVIEW.csv');

interface ProgressRow {
  normalized: string;
  headword: string;
  freq_rank: number;
  final: boolean; // false: Gemini omitted the word so far (attempts counts the omissions)
  attempts: number;
  model?: string;
  raw: { similar: string[]; opposite: string[] };
  similar: string[]; // kept after validation
  opposite: string[];
  rejected: Array<{ word: string; reason: string; kind: 'similar' | 'opposite' }>;
  note?: string;
}

interface GeminiItem { headword: string; similar?: string[]; opposite?: string[] }

const SYSTEM_PROMPT = `You suggest similar and opposite words for entries in an English-to-Hindi learner's dictionary.
For each entry you get the headword, its part of speech, its English definition, its Hindi meaning, and the similar and opposite words the dictionary already shows.
Rules:
- Work in the sense given by the definition, and give words of the same part of speech as the headword.
- Use single, everyday English words only. No slang, rare or archaic words, and no multi-word phrases.
- Give up to 5 similar words and up to 3 opposite words. Fewer is fine; do not pad.
- Do not repeat the words already shown, and never give the headword itself.
- Leave "opposite" empty when the word has no true opposite (for example table, know).
- Return one object per entry, with the headword copied exactly as given.`;

const RESPONSE_SCHEMA = {
  type: 'ARRAY',
  items: {
    type: 'OBJECT',
    properties: {
      headword: { type: 'STRING' },
      similar: { type: 'ARRAY', items: { type: 'STRING' } },
      opposite: { type: 'ARRAY', items: { type: 'STRING' } },
    },
    required: ['headword', 'similar', 'opposite'],
  },
};

export function buildUserContent(batch: RelatedCandidate[]): string {
  const blocks = batch.map((c) => [
    `headword: ${c.normalized}`,
    `pos: ${c.pos}`,
    `definition: ${c.definition_en}`,
    `hindi: ${c.meaning_hi}`,
    `already shown similar (do not repeat): ${c.similar.join(', ') || '(none)'}`,
    `already shown opposite (do not repeat): ${c.opposite.join(', ') || '(none)'}`,
  ].join('\n'));
  return `Entries:\n\n${blocks.join('\n\n')}`;
}

function buildContents(batch: RelatedCandidate[]): unknown[] {
  return [{ role: 'user', parts: [{ text: buildUserContent(batch) }] }];
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
  const lines: Array<{ rank: number; word: string; cells: unknown[] }> = [];
  for (const r of progress.values()) {
    const add = (kind: 'similar' | 'opposite', suggested: string, status: string, reason: string) =>
      lines.push({ rank: r.freq_rank, word: r.normalized, cells: [r.normalized, r.freq_rank, kind, suggested, status, reason, r.model ?? ''] });
    for (const kind of ['similar', 'opposite'] as const) {
      for (const w of r[kind]) add(kind, w, 'kept', '');
      for (const x of r.rejected.filter((j) => j.kind === kind)) add(kind, x.word, 'rejected', x.reason);
    }
    if (r.note) add('similar', '', 'rejected', r.note);
  }
  lines.sort((a, b) => a.rank - b.rank || a.word.localeCompare(b.word));
  const rows = [['word', 'freq_rank', 'kind', 'suggested', 'kept/rejected', 'reason', 'model'], ...lines.map((l) => l.cells)];
  fs.writeFileSync(REVIEW_FILE, '﻿' + rows.map((r) => r.map(csvCell).join(',')).join('\r\n') + '\r\n');
}

function writeFinal(progress: Map<string, ProgressRow>): number {
  const rows = [...progress.values()].filter((r) => r.final && (r.similar.length || r.opposite.length))
    .sort((a, b) => (a.normalized < b.normalized ? -1 : a.normalized > b.normalized ? 1 : 0))
    .map((r) => ({ normalized: r.normalized, similar: r.similar, opposite: r.opposite, model: r.model ?? 'unknown' }));
  writeJsonlAtomic(FINAL_FILE, rows);
  pinChecksum('data/sources/related-gemini.jsonl');
  return rows.length;
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
  const top = Number(argValue(args, '--top') ?? 1500);
  const dryRun = args.includes('--dry-run');
  const maxRequests = Number(argValue(args, '--max-requests') ?? process.env.RELATED_MAX_REQUESTS ?? Number.POSITIVE_INFINITY);
  if (!Number.isInteger(top) || top < 1) throw new Error(`Invalid --top: ${argValue(args, '--top')}`);
  if (Number.isNaN(maxRequests)) throw new Error('Invalid --max-requests');

  const db = new Database(path.join(process.cwd(), 'data', 'dictionary.db'), { readonly: true, fileMustExist: true });
  const candidates = selectCandidates(db, top);
  const lookup = makeLookup(db);

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
  const pending = () => candidates.filter((c) => !progress.get(c.normalized)?.final);
  console.log(`Related-words generation: ${candidates.length} candidates for --top ${top}; ${candidates.length - pending().length} already done.`);

  let requests = 0;
  let stoppedEarly = false;
  while (pending().length && requests < maxRequests) {
    const batch = pending().slice(0, BATCH_SIZE);
    let result: { model: string; items: GeminiItem[] };
    try {
      result = await callGeminiJson<GeminiItem>(apiKey, { system: SYSTEM_PROMPT, contents: buildContents(batch), schema: RESPONSE_SCHEMA });
    } catch (error) {
      if (error instanceof DailyQuotaError) {
        console.log('All Gemini models are out of daily quota. Progress is saved; run the same command again after the quota resets to resume.');
        stoppedEarly = true;
        break;
      }
      throw error;
    }
    requests++;
    const byWord = new Map<string, GeminiItem>();
    for (const item of result.items) {
      const key = String(item?.headword ?? '').trim().toLowerCase();
      if (key && !byWord.has(key)) byWord.set(key, item);
    }
    for (const c of batch) {
      const item = byWord.get(c.normalized);
      const prev = progress.get(c.normalized);
      const base = { normalized: c.normalized, headword: c.headword, freq_rank: c.freq_rank };
      if (item) {
        const raw = {
          similar: (item.similar ?? []).map(String),
          opposite: (item.opposite ?? []).map(String),
        };
        const v = validateSuggestions(c, raw, lookup);
        // validateSuggestions does not say which list a rejection came from; recover it by checking each raw list.
        const rejected: ProgressRow['rejected'] = [];
        const left = [...v.rejected];
        for (const kind of ['similar', 'opposite'] as const) {
          for (const w of raw[kind]) {
            const idx = left.findIndex((x) => x.word === w);
            if (idx >= 0) rejected.push({ word: w, reason: left.splice(idx, 1)[0].reason, kind });
          }
        }
        progress.set(c.normalized, {
          ...base, final: true, attempts: (prev?.attempts ?? 0) + 1, model: result.model,
          raw, similar: v.similar, opposite: v.opposite, rejected,
        });
      } else {
        const attempts = (prev?.attempts ?? 0) + 1;
        const giveUp = attempts >= MAX_ATTEMPTS;
        progress.set(c.normalized, {
          ...base, final: giveUp, attempts, model: result.model, raw: { similar: [], opposite: [] },
          similar: [], opposite: [], rejected: [],
          note: giveUp ? `omitted by Gemini in ${attempts} responses; given up` : `omitted by Gemini (attempt ${attempts})`,
        });
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
      `re-run: npm run data:related-gemini -- --top ${top}`);
    process.exitCode = 2;
    return;
  }

  const finalRows = writeFinal(progress);
  const done = candidates.map((c) => progress.get(c.normalized)!);
  const summary = {
    top,
    candidates: candidates.length,
    words_with_kept_suggestions: done.filter((r) => r.similar.length || r.opposite.length).length,
    kept_similar: done.reduce((n, r) => n + r.similar.length, 0),
    kept_opposite: done.reduce((n, r) => n + r.opposite.length, 0),
    rejected: done.reduce((n, r) => n + r.rejected.length, 0),
    final_rows_all_tiers: finalRows,
    models: Object.fromEntries([...new Set(done.map((r) => r.model ?? 'unknown'))]
      .map((m) => [m, done.filter((r) => (r.model ?? 'unknown') === m).length])),
    final_file: path.relative(process.cwd(), FINAL_FILE),
    review_sheet: path.relative(process.cwd(), REVIEW_FILE),
  };
  console.log(JSON.stringify(summary, null, 2));
}

main().catch((err) => { console.error(err); process.exit(1); });
