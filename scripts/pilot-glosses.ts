// Phase 1 pilot — 200 Gemini-generated entries, stratified by frequency band, for native-speaker review.
//
// Reads data/sources/lemmas.jsonl (run scripts/build-lemma-list.ts first) and WordNet 3.1.
// Writes data/sources/pilot/pilot-glosses-200.jsonl, data/sources/pilot/PILOT_REVIEW_SHEET.csv and
// appends length-gate failures to data/sources/review-queue.jsonl.
// Usage: npx tsx scripts/pilot-glosses.ts   (needs GEMINI_API_KEY in env or .env.local)
import fs from 'fs';
import path from 'path';
import { SOURCES_DIR, WordNet, loadCmu, WnPos } from './lib/lexicon';
import {
  BATCH_SIZE, GEMINI_MODELS, charLen, currentModel, generateGlossBatch, loadApiKey, GlossOutcome, GlossRequest,
} from './lib/gloss';

const PILOT_DIR = path.join(SOURCES_DIR, 'pilot');
const SEED = 20261020;
const BANDS = [
  { name: 'top 1k', from: 1, to: 1000 },
  { name: '1k-5k', from: 1001, to: 5000 },
  { name: '5k-15k', from: 5001, to: 15000 },
  { name: '15k-25k', from: 15001, to: 25000 },
];
const PER_BAND = 50;
const POLYSEMY = ['bank', 'light', 'run', 'spring', 'match', 'tie', 'strike', 'plant', 'organ'];

interface Lemma { rank: number; lemma: string; class: string; pos_label: string; wn_pos: WnPos | null; in_cmu: boolean }

function mulberry32(seed: number) {
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function csvCell(v: unknown): string {
  const s = String(v ?? '');
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

async function main() {
  const apiKey = loadApiKey();
  const lemmas: Lemma[] = fs.readFileSync(path.join(SOURCES_DIR, 'lemmas.jsonl'), 'utf8')
    .trim().split('\n').map((l) => JSON.parse(l));
  const overrides = new Set<string>(
    fs.readFileSync(path.join(SOURCES_DIR, 'closed-class-words.jsonl'), 'utf8').trim().split('\n')
      .map((l) => JSON.parse(l).normalized),
  );
  const catalog = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'data', 'book', 'catalog.json'), 'utf8'));
  for (const w of Object.keys(catalog.word_to_page)) overrides.add(w);

  // Population = generated content words only (closed-class and the hand-written entries are overrides).
  const pool = lemmas.filter((l) => l.class === 'content' && !overrides.has(l.lemma));
  // The sample is frozen in pilot-sample.json once drawn, so rebuilding lemmas.jsonl doesn't reshuffle it.
  // Frozen words that are no longer valid lemmas (e.g. plurals later folded into their singular) are replaced
  // by the next seeded pick from the same band.
  const sampleFile = path.join(PILOT_DIR, 'pilot-sample.json');
  const frozen: Array<{ lemma: string; band: string }> = fs.existsSync(sampleFile)
    ? JSON.parse(fs.readFileSync(sampleFile, 'utf8')) : [];
  const poolSet = new Set(pool.map((l) => l.lemma));
  const byLemma = new Map(lemmas.map((l) => [l.lemma, l]));
  const rand = mulberry32(SEED);
  const sample: Array<Lemma & { band: string; polysemy: boolean }> = [];
  for (const band of BANDS) {
    const inBand = pool.filter((l) => l.rank >= band.from && l.rank <= band.to);
    // Polysemy probes test the generator, so they are included even if a hand-written entry exists (match).
    const forced = lemmas.filter((l) => l.rank >= band.from && l.rank <= band.to && POLYSEMY.includes(l.lemma));
    const rest = inBand.filter((l) => !POLYSEMY.includes(l.lemma));
    for (let i = rest.length - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      [rest[i], rest[j]] = [rest[j], rest[i]];
    }
    const kept = frozen.filter((f) => f.band === band.name && !POLYSEMY.includes(f.lemma) && poolSet.has(f.lemma))
      .map((f) => byLemma.get(f.lemma)!);
    const chosen = new Set([...forced, ...kept].map((l) => l.lemma));
    const fill = rest.filter((l) => !chosen.has(l.lemma)).slice(0, PER_BAND - forced.length - kept.length);
    const picked = [...forced, ...kept, ...fill].sort((a, b) => a.rank - b.rank);
    sample.push(...picked.map((l) => ({ ...l, band: band.name, polysemy: POLYSEMY.includes(l.lemma) })));
  }
  fs.mkdirSync(PILOT_DIR, { recursive: true });
  fs.writeFileSync(sampleFile, JSON.stringify(sample.map((s) => ({ lemma: s.lemma, band: s.band })), null, 1) + '\n');
  const missingPolysemy = POLYSEMY.filter((w) => !sample.some((s) => s.lemma === w));
  if (missingPolysemy.length) throw new Error(`Polysemy words outside the sampled bands: ${missingPolysemy.join(', ')}`);

  const wn = new WordNet();
  const cmu = await loadCmu();
  const requests: GlossRequest[] = sample.map((s) => ({
    headword: s.lemma,
    posLabel: s.pos_label,
    wnPos: s.wn_pos,
    synsets: s.wn_pos ? wn.synsets(s.lemma, s.wn_pos, 3) : [],
    needsPronunciation: !cmu[s.lemma],
  }));

  // RESUME=1 keeps finished rows from the previous run and only redoes API errors (the sample is deterministic).
  const outcomes: GlossOutcome[] = new Array(requests.length);
  const pilotFile = path.join(PILOT_DIR, 'pilot-glosses-200.jsonl');
  if (process.env.RESUME && fs.existsSync(pilotFile)) {
    for (const line of fs.readFileSync(pilotFile, 'utf8').trim().split('\n')) {
      const prev = JSON.parse(line);
      const i = sample.findIndex((s) => s.lemma === prev.headword);
      if (i < 0 || String(prev.failure ?? '').startsWith('error:')) continue;
      outcomes[i] = {
        ok: prev.ok,
        attempts: prev.attempts,
        model: prev.model ?? undefined,
        failure: prev.failure ?? undefined,
        result: prev.definition_en === null ? undefined : {
          is_valid_headword: prev.is_valid_headword, chosen_sense: prev.chosen_sense, pos: prev.pos,
          definition_en: prev.definition_en, meaning_hi: prev.meaning_hi, pronunciation_deva: prev.pronunciation_deva_oov ?? '',
        },
      };
    }
  }
  const todo = requests.map((_, i) => i).filter((i) => !outcomes[i]);
  console.log(`Generating ${todo.length} of ${requests.length} pilot entries (models: ${GEMINI_MODELS.join(', ')}; ${BATCH_SIZE} per request)...`);
  // Batches run sequentially: free-tier keys allow only ~20 requests per model per day.
  for (let b = 0; b < todo.length; b += BATCH_SIZE) {
    const idx = todo.slice(b, b + BATCH_SIZE);
    const res = await generateGlossBatch(apiKey, idx.map((i) => requests[i]));
    idx.forEach((i, k) => { outcomes[i] = res[k]; });
    console.log(`  ${Math.min(b + BATCH_SIZE, todo.length)}/${todo.length} (${currentModel() ?? 'no model left'})`);
  }

  fs.mkdirSync(PILOT_DIR, { recursive: true });
  const rows = sample.map((s, i) => {
    const o = outcomes[i];
    const r = o.result;
    return {
      n: i + 1,
      rank: s.rank,
      band: s.band,
      polysemy: s.polysemy,
      headword: s.lemma,
      offered_senses: requests[i].synsets.map((x) => `${x.id}: ${x.gloss}`),
      ok: o.ok,
      attempts: o.attempts,
      model: o.model ?? null,
      failure: o.failure ?? null,
      is_valid_headword: r?.is_valid_headword ?? null,
      chosen_sense: r?.chosen_sense ?? null,
      pos: r?.pos ?? null,
      definition_en: r?.definition_en ?? null,
      meaning_hi: r?.meaning_hi ?? null,
      pronunciation_deva_oov: r?.pronunciation_deva || null,
      def_chars: r ? charLen(r.definition_en) : null,
      hi_chars: r ? charLen(r.meaning_hi) : null,
    };
  });
  fs.writeFileSync(pilotFile, rows.map((r) => JSON.stringify(r)).join('\n') + '\n');

  // Length/validation failures go to the manual review queue (API errors are retried with RESUME=1 instead).
  const failures = rows.filter((r) => !r.ok);
  const queueFile = path.join(SOURCES_DIR, 'review-queue.jsonl');
  const otherStages = fs.existsSync(queueFile)
    ? fs.readFileSync(queueFile, 'utf8').split('\n').filter((l) => l.trim() && JSON.parse(l).stage !== 'pilot')
    : [];
  const pilotQueue = failures.filter((r) => !String(r.failure).startsWith('error:'))
    .map((r) => JSON.stringify({ headword: r.headword, stage: 'pilot', reason: r.failure }));
  fs.writeFileSync(queueFile, [...otherStages, ...pilotQueue].map((l) => l + '\n').join(''));

  const header = ['#', 'word', 'band', 'polysemy test', 'pos', 'English definition', 'Hindi meaning', 'sense picked',
    'VERDICT (OK / ERROR)', 'correct Hindi / definition', 'reviewer notes'];
  const csv = [header, ...rows.map((r) => [r.n, r.headword, r.band, r.polysemy ? 'yes' : '', r.pos, r.definition_en,
    r.meaning_hi, r.chosen_sense, '', '', r.is_valid_headword === false ? 'model flagged: not a valid headword' : ''])]
    .map((cols) => cols.map(csvCell).join(',')).join('\r\n');
  fs.writeFileSync(path.join(PILOT_DIR, 'PILOT_REVIEW_SHEET.csv'), '﻿' + csv + '\r\n'); // BOM so Excel shows Devanagari

  const okRows = rows.filter((r) => r.ok);
  const summary = {
    models_used: Object.fromEntries([...new Set(rows.map((r) => r.model))].map((m) => [m, rows.filter((r) => r.model === m).length])),
    sampled: rows.length,
    per_band: Object.fromEntries(BANDS.map((b) => [b.name, rows.filter((r) => r.band === b.name).length])),
    generated_ok: okRows.length,
    sent_to_review_queue: pilotQueue.length,
    api_errors_pending_resume: failures.length - pilotQueue.length,
    first_try: okRows.filter((r) => r.attempts === 1).length,
    flagged_invalid_headword: rows.filter((r) => r.is_valid_headword === false).map((r) => r.headword),
    chose_none: okRows.filter((r) => r.chosen_sense === 'none').map((r) => r.headword),
    chose_non_first_sense: okRows.filter((r) => r.chosen_sense && r.chosen_sense !== 'none' && !r.chosen_sense.endsWith('.01')).length,
    max_def_chars: Math.max(...okRows.map((r) => r.def_chars ?? 0)),
    max_hi_chars: Math.max(...okRows.map((r) => r.hi_chars ?? 0)),
  };
  fs.writeFileSync(path.join(PILOT_DIR, 'pilot-summary.json'), JSON.stringify(summary, null, 2) + '\n');
  console.log(JSON.stringify(summary, null, 2));
}

main().catch((err) => { console.error(err); process.exit(1); });
