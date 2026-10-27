// Phase 4 offline batch generator. Network is used only here; build:data never calls an LLM.
// Resume is automatic from hindi-glosses-progress.jsonl. The final source is written only at 25k entries.
import fs from 'fs';
import path from 'path';
import { collectEntries } from './init-db';
import { SOURCES_DIR, WordNet, loadCmu, pinChecksum, verifyChecksums, WnPos } from './lib/lexicon';
import { BATCH_SIZE, charLen, currentModel, generateGlossBatch, loadApiKey, GlossRequest } from './lib/gloss';
import { LemmaCandidate, generatedEntriesNeeded, selectPhase4Candidates } from './lib/phase4';
import { pronunciationFor } from './phonetics';

const TARGET_ENTRIES = Number(process.env.PHASE4_TARGET_ENTRIES || 25000);
const MAX_REQUESTS = Number(process.env.PHASE4_MAX_REQUESTS || Number.POSITIVE_INFINITY);
const GLOSS_FILE = path.join(SOURCES_DIR, 'hindi-glosses.jsonl');
const PROGRESS_FILE = path.join(SOURCES_DIR, 'hindi-glosses-progress.jsonl');
const REVIEW_FILE = path.join(SOURCES_DIR, 'PHASE4_TOP5000_REVIEW.csv');

interface GeneratedRow {
  rank: number;
  headword: string;
  normalized: string;
  has_wordnet: boolean;
  is_valid_headword: boolean;
  ok: boolean;
  attempts: number;
  model?: string;
  failure?: string;
  chosen_sense?: string;
  pos?: string;
  definition_en?: string;
  meaning_hi?: string;
  pronunciation_deva?: string;
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

function writeReviewSheet(lemmas: LemmaCandidate[], curated: ReturnType<typeof collectEntries>['entries'], generated: GeneratedRow[]): void {
  const entries = new Map(curated.map((e) => [e.normalized, e]));
  for (const row of generated) {
    if (!row.ok || !row.is_valid_headword) continue;
    entries.set(row.normalized, {
      headword: row.headword, normalized: row.normalized, pos: row.pos!, pronunciation_deva: row.pronunciation_deva!,
      definition_en: row.definition_en!, meaning_hi: row.meaning_hi!, source: 'Panna Phase 4 generated',
      license_attribution: '', reviewed: 0,
    });
  }
  const header = ['rank', 'headword', 'pos', 'English definition', 'Hindi meaning', 'review status', 'verdict (OK / ERROR)',
    'corrected English definition', 'corrected Hindi meaning', 'reviewer notes'];
  const rows: unknown[][] = [header];
  for (const lemma of lemmas.filter((l) => l.rank <= 5000)) {
    const entry = entries.get(lemma.lemma);
    if (!entry) continue;
    rows.push([lemma.rank, entry.headword, entry.pos, entry.definition_en, entry.meaning_hi,
      entry.reviewed ? 'Already reviewed editorial' : 'Needs native Hindi review', '', '', '', '']);
  }
  fs.writeFileSync(REVIEW_FILE, '\uFEFF' + rows.map((r) => r.map(csvCell).join(',')).join('\r\n') + '\r\n');
}

function saveProgress(rows: Map<string, GeneratedRow>): void {
  writeJsonlAtomic(PROGRESS_FILE, [...rows.values()].sort((a, b) => a.rank - b.rank));
}

async function main(): Promise<void> {
  verifyChecksums(['data/sources/lemmas.jsonl', 'data/sources/closed-class-words.jsonl', 'data/sources/infl.txt']);
  const apiKey = loadApiKey();
  const lemmas: LemmaCandidate[] = fs.readFileSync(path.join(SOURCES_DIR, 'lemmas.jsonl'), 'utf8').trim().split('\n')
    .map((line) => JSON.parse(line));
  const curated = collectEntries().entries;
  const reserved = new Set(curated.map((e) => e.normalized));
  const candidates = selectPhase4Candidates(lemmas, reserved);
  const candidateWords = new Set(candidates.map((c) => c.lemma));
  const needed = generatedEntriesNeeded(TARGET_ENTRIES, reserved.size);
  if (candidates.length < needed) throw new Error(`Only ${candidates.length} generated candidates; ${needed} needed for target ${TARGET_ENTRIES}`);

  const progress = new Map<string, GeneratedRow>();
  if (fs.existsSync(PROGRESS_FILE)) {
    for (const line of fs.readFileSync(PROGRESS_FILE, 'utf8').split(/\r?\n/).filter(Boolean)) {
      const row = JSON.parse(line) as GeneratedRow;
      progress.set(row.normalized, row);
    }
  }
  if (fs.existsSync(GLOSS_FILE)) {
    verifyChecksums(['data/sources/hindi-glosses.jsonl']);
    for (const line of fs.readFileSync(GLOSS_FILE, 'utf8').split(/\r?\n/).filter(Boolean)) {
      const row = JSON.parse(line) as GeneratedRow;
      progress.set(row.normalized, row);
    }
  }

  const wn = new WordNet();
  const cmu = await loadCmu();
  const heteronyms: Record<string, Record<string, string>> = JSON.parse(
    fs.readFileSync(path.join(SOURCES_DIR, 'heteronyms.json'), 'utf8'),
  );
  const acceptedCount = () => [...progress.values()]
    .filter((r) => candidateWords.has(r.normalized) && r.ok && r.is_valid_headword).length;
  let requestsMade = 0;
  console.log(`Phase 4 target: ${TARGET_ENTRIES} total entries (${reserved.size} curated, ${needed} generated); ` +
    `${candidates.length} ranked candidates; resume has ${acceptedCount()} valid glosses.`);

  while (acceptedCount() < needed) {
    if (requestsMade >= MAX_REQUESTS) break;
    const todo: LemmaCandidate[] = [];
    let valid = 0;
    for (const candidate of candidates) {
      const saved = progress.get(candidate.lemma);
      if (saved && !String(saved.failure ?? '').startsWith('error:')) {
        if (saved.ok && saved.is_valid_headword) valid++;
      } else {
        todo.push(candidate);
      }
      if (valid >= needed || todo.length >= BATCH_SIZE) break;
    }
    if (!todo.length) break;

    const requests: GlossRequest[] = todo.map((c) => ({
      headword: c.lemma,
      posLabel: c.pos_label,
      wnPos: c.wn_pos as WnPos | null,
      synsets: c.wn_pos ? wn.synsets(c.lemma, c.wn_pos, 3) : [],
      needsPronunciation: !cmu[c.lemma],
    }));
    const outcomes = await generateGlossBatch(apiKey, requests);
    requestsMade++;
    for (let i = 0; i < todo.length; i++) {
      const candidate = todo[i];
      const outcome = outcomes[i];
      const result = outcome.result;
      const converted = result && outcome.ok && result.is_valid_headword
        ? (requests[i].needsPronunciation
          ? result.pronunciation_deva
          : pronunciationFor(candidate.lemma, result.pos, cmu, heteronyms))
        : undefined;
      const row: GeneratedRow = {
        rank: candidate.rank,
        headword: candidate.lemma,
        normalized: candidate.lemma,
        has_wordnet: !!candidate.wn_pos,
        is_valid_headword: result?.is_valid_headword ?? false,
        ok: outcome.ok,
        attempts: outcome.attempts,
        ...(outcome.model ? { model: outcome.model } : {}),
        ...(outcome.failure ? { failure: outcome.failure } : {}),
        ...(result ? {
          chosen_sense: result.chosen_sense, pos: result.pos, definition_en: result.definition_en, meaning_hi: result.meaning_hi,
        } : {}),
        ...(converted ? { pronunciation_deva: converted } : {}),
      };
      if (row.ok && row.is_valid_headword && !row.pronunciation_deva) {
        row.ok = false;
        row.failure = 'no CMUdict or generated pronunciation available';
      }
      progress.set(row.normalized, row);
    }
    saveProgress(progress);
    const validationFailures = outcomes.map((o, i) => ({ o, candidate: todo[i] }))
      .filter(({ o }) => !o.ok && !String(o.failure ?? '').startsWith('error:'));
    if (validationFailures.length) {
      const queueFile = path.join(SOURCES_DIR, 'review-queue.jsonl');
      const existing = fs.existsSync(queueFile)
        ? fs.readFileSync(queueFile, 'utf8').split(/\r?\n/).filter(Boolean).map((line) => JSON.parse(line)) : [];
      const seen = new Set(existing.map((r: { stage?: string; headword?: string }) => `${r.stage}:${r.headword}`));
      for (const { o, candidate } of validationFailures) {
        const key = `phase4:${candidate.lemma}`;
        if (!seen.has(key)) existing.push({ headword: candidate.lemma, stage: 'phase4', reason: o.failure });
      }
      writeJsonlAtomic(queueFile, existing);
    }
    console.log(`  request ${requestsMade}: ${Math.min(acceptedCount(), needed)}/${needed} valid glosses (${currentModel() ?? 'quota exhausted'})`);
    if (outcomes.some((o) => String(o.failure ?? '').startsWith('error:'))) break;
  }

  const completed = [...progress.values()].filter((r) => candidateWords.has(r.normalized) && r.ok && r.is_valid_headword)
    .sort((a, b) => a.rank - b.rank).slice(0, needed);
  if (completed.length < needed) {
    console.log(`Phase 4 is resumable: ${completed.length}/${needed} generated glosses are ready; ` +
      `the top-5,000 review sheet is written after full generation.`);
    process.exitCode = 2;
    return;
  }

  writeJsonlAtomic(GLOSS_FILE, completed);
  writeReviewSheet(lemmas, curated, completed);
  pinChecksum('data/sources/hindi-glosses.jsonl');
  fs.rmSync(PROGRESS_FILE, { force: true });
  const summary = {
    target_entries: TARGET_ENTRIES,
    curated_entries: reserved.size,
    generated_entries: completed.length,
    top_5000_generated: completed.filter((r) => r.rank <= 5000).length,
    models: Object.fromEntries([...new Set(completed.map((r) => r.model ?? 'unknown'))]
      .map((m) => [m, completed.filter((r) => (r.model ?? 'unknown') === m).length])),
    max_definition_characters: Math.max(...completed.map((r) => charLen(r.definition_en ?? ''))),
    max_hindi_characters: Math.max(...completed.map((r) => charLen(r.meaning_hi ?? ''))),
    review_sheet: path.relative(process.cwd(), REVIEW_FILE),
  };
  fs.writeFileSync(path.join(SOURCES_DIR, 'hindi-glosses-summary.json'), JSON.stringify(summary, null, 2) + '\n');
  console.log(JSON.stringify(summary, null, 2));
}

main().catch((err) => { console.error(err); process.exit(1); });
