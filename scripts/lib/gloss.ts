// Gemini sense selection + length-bounded gloss generation (offline only; never called at build or runtime).
// Shared by scripts/pilot-glosses.ts (Phase 1) and the Phase 4 bulk generator.
//
// Words are sent in batches (one request = up to BATCH_SIZE headwords) to stay inside per-day request quotas.
// Entries that fail validation are re-sent with explicit feedback, up to MAX_ATTEMPTS; they are never truncated.
import fs from 'fs';
import path from 'path';
import type { Synset, WnPos } from './lexicon';
import { TRANSITIVE_FRAMES } from './lexicon';

/** Models tried in order; on a daily-quota 429 the next one is used. Override with GEMINI_MODEL. */
export const GEMINI_MODELS = (process.env.GEMINI_MODEL || [
  'gemini-3.8-flash',
  'gemini-3.6-flash',
  'gemini-3.5-flash-lite',
  'gemini-2.5-flash',
  'gemini-2.5-flash-lite',
].join(',')).split(',').map((m) => m.trim());
export const THINKING_LEVEL = process.env.GEMINI_THINKING_LEVEL || ''; // '' = model default
export const BATCH_SIZE = Number(process.env.GEMINI_BATCH_SIZE || 20);
export const MAX_DEF = 140;
export const MAX_HI = 35;
const MAX_ATTEMPTS = 3;
const DEVANAGARI = /[ऀ-ॿ]/;

export function loadApiKey(): string {
  if (process.env.GEMINI_API_KEY) return process.env.GEMINI_API_KEY;
  const envFile = path.join(process.cwd(), '.env.local');
  if (fs.existsSync(envFile)) {
    const m = fs.readFileSync(envFile, 'utf8').match(/^GEMINI_API_KEY=(.+)$/m);
    if (m) return m[1].trim();
  }
  throw new Error('GEMINI_API_KEY missing: set it in the environment or in .env.local (git-ignored).');
}

export interface GlossRequest {
  headword: string;
  posLabel: string; // e.g. "n.", "v.", "n. & adj."
  wnPos: WnPos | null;
  synsets: Synset[]; // top 3 WordNet senses for the dominant POS, frequency-ordered; empty for non-WordNet words
  needsPronunciation: boolean; // true when CMUdict has no entry
}

export interface GlossResult {
  is_valid_headword: boolean;
  chosen_sense: string; // synset id, or "none" when the everyday sense was not among the candidates
  pos: string;
  definition_en: string;
  meaning_hi: string;
  pronunciation_deva?: string;
}

export interface GlossOutcome {
  ok: boolean;
  attempts: number;
  model?: string;
  result?: GlossResult;
  failure?: string;
}

const SYSTEM_PROMPT = `You write entries for "Panna", a compact English-to-Hindi pocket dictionary for Hindi speakers.
You receive a list of headwords. For each one you get its allowed part-of-speech labels and up to three WordNet senses, ordered from most to least frequent. Return one result per headword, in the same order, echoing the headword.

Rules:
1. chosen_sense: pick the sense an ordinary speaker means first in everyday modern English (usually, but not always, the first). Return its id. If none of the candidates is the everyday sense, return "none" and define the everyday sense yourself. Never pick a rare, technical, archaic or proper-noun sense when a common one exists.
2. definition_en: one concise dictionary definition of the chosen sense, at most ${MAX_DEF} characters, lowercase start, ending with a period. Verbs start with "to". Do not use the headword itself. Plain words a learner understands.
3. meaning_hi: 1 to 3 Hindi equivalents in Devanagari, comma-separated, at most ${MAX_HI} characters in total. Use the Hindi that people actually say today. If Hindi speakers normally use the English loanword (स्टेशन, कंप्यूटर), give it first, then a native equivalent if one is natural. Avoid stiff, Sanskritised coinages nobody uses. Match the chosen sense and part of speech: verbs as infinitives ending in -ना, adjectives as adjectives.
4. pos: choose from the allowed labels given for the word. For verbs use "v. t." if the chosen sense normally takes a direct object, otherwise "v. i.".
5. is_valid_headword: false if the word is a personal name, brand, place, misspelling, slang fragment, non-English word or vulgar term that a family dictionary would not print; otherwise true.
6. pronunciation_deva: only when requested — how a Hindi speaker would write the English pronunciation in Devanagari (e.g. "school" → स्कूल). Otherwise return an empty string.

Style examples:
- abandon (v. t.): "to give up completely; leave without intending to return." → "त्याग देना, छोड़ना"
- danger (n.): "the possibility of suffering harm or injury." → "खतरा, संकट"
- damp (adj.): "slightly wet; moist." → "नम, गीला"
- station (n.): "a place where trains or buses stop for passengers." → "स्टेशन, अड्डा"`;

const ITEM_SCHEMA = {
  type: 'OBJECT',
  properties: {
    headword: { type: 'STRING' },
    is_valid_headword: { type: 'BOOLEAN' },
    chosen_sense: { type: 'STRING' },
    pos: { type: 'STRING' },
    definition_en: { type: 'STRING' },
    meaning_hi: { type: 'STRING' },
    pronunciation_deva: { type: 'STRING' },
  },
  required: ['headword', 'is_valid_headword', 'chosen_sense', 'pos', 'definition_en', 'meaning_hi', 'pronunciation_deva'],
  propertyOrdering: ['headword', 'is_valid_headword', 'chosen_sense', 'pos', 'definition_en', 'meaning_hi', 'pronunciation_deva'],
};
const RESPONSE_SCHEMA = { type: 'ARRAY', items: ITEM_SCHEMA };

export function allowedPosLabels(req: GlossRequest): string[] {
  const parts = req.posLabel.split(' & ');
  const expand = (p: string) => (p === 'v.' ? ['v. t.', 'v. i.'] : [p]);
  const first = expand(parts[0]);
  if (parts.length === 1) return first;
  return first.flatMap((f) => expand(parts[1]).map((s) => `${f} & ${s}`)).concat(first);
}

function verbHint(s: Synset): string {
  if (s.pos !== 'v' || s.verbFrames.length === 0) return '';
  return s.verbFrames.some((f) => TRANSITIVE_FRAMES.has(f)) ? ' [usually takes an object]' : ' [no direct object]';
}

export function buildPrompt(req: GlossRequest): string {
  const lines = [
    `headword: ${req.headword}`,
    `allowed pos labels: ${allowedPosLabels(req).join(' | ')}`,
  ];
  if (req.synsets.length) {
    lines.push('candidate senses:');
    for (const s of req.synsets) {
      const syn = s.words.filter((w) => w.toLowerCase() !== req.headword).slice(0, 4);
      const ex = s.examples[0] ? ` e.g. "${s.examples[0]}"` : '';
      lines.push(`- ${s.id}: ${s.gloss}${syn.length ? ` (synonyms: ${syn.join(', ')})` : ''}${ex}${verbHint(s)}`);
    }
  } else {
    lines.push('candidate senses: none (word is not in WordNet) — set chosen_sense to "none" and define the everyday sense.');
  }
  lines.push(`pronunciation_deva requested: ${req.needsPronunciation ? 'yes' : 'no'}`);
  return lines.join('\n');
}

export function charLen(s: string): number {
  return [...s].length;
}

function validate(req: GlossRequest, r: GlossResult): string | null {
  if (!r.is_valid_headword) return null; // reported, not length-checked
  if (!allowedPosLabels(req).includes(r.pos)) return `pos "${r.pos}" is not one of the allowed labels`;
  if (r.chosen_sense !== 'none' && !req.synsets.some((s) => s.id === r.chosen_sense)) return `chosen_sense "${r.chosen_sense}" is not a candidate id`;
  if (!r.definition_en) return 'definition_en is empty';
  if (!DEVANAGARI.test(r.meaning_hi) || /[A-Za-z]/.test(r.meaning_hi)) return 'meaning_hi must be Devanagari only';
  if (req.needsPronunciation && !DEVANAGARI.test(r.pronunciation_deva ?? '')) return 'pronunciation_deva is required';
  const over: string[] = [];
  if (charLen(r.definition_en) > MAX_DEF) over.push(`definition_en is ${charLen(r.definition_en)} characters; it must be at most ${MAX_DEF}`);
  if (charLen(r.meaning_hi) > MAX_HI) over.push(`meaning_hi is ${charLen(r.meaning_hi)} characters; it must be at most ${MAX_HI}`);
  return over.length ? over.join('; ') : null;
}

class DailyQuotaError extends Error {}

let modelIndex = 0;
export function currentModel(): string {
  return GEMINI_MODELS[modelIndex];
}

async function callGemini(apiKey: string, contents: unknown[]): Promise<{ model: string; items: Array<GlossResult & { headword: string }> }> {
  for (let attempt = 0; ; attempt++) {
    const model = GEMINI_MODELS[modelIndex];
    if (!model) throw new DailyQuotaError('All configured Gemini models are out of daily quota');
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
        contents,
        generationConfig: {
          responseMimeType: 'application/json',
          responseSchema: RESPONSE_SCHEMA,
          ...(THINKING_LEVEL ? { thinkingConfig: { thinkingLevel: THINKING_LEVEL } } : {}),
        },
      }),
    });
    const body = await res.json().catch(() => ({}));
    if (res.status === 429 && /PerDay/.test(JSON.stringify(body))) {
      process.stderr.write(`[gemini] ${model}: daily quota exhausted, switching model\n`);
      modelIndex++;
      continue;
    }
    if (res.status === 429 || res.status >= 500) {
      if (attempt >= 6) throw new Error(`Gemini HTTP ${res.status} after retries`);
      process.stderr.write(`[gemini] ${model}: HTTP ${res.status}, backing off ${2 * 2 ** attempt}s\n`);
      await new Promise((r) => setTimeout(r, 2000 * 2 ** attempt));
      continue;
    }
    if (!res.ok) throw new Error(`Gemini HTTP ${res.status}: ${JSON.stringify(body).slice(0, 300)}`);
    const parts = body.candidates?.[0]?.content?.parts ?? [];
    const text = parts.filter((p: { thought?: boolean }) => !p.thought).map((p: { text?: string }) => p.text ?? '').join('');
    if (!text) throw new Error(`Empty Gemini response: ${JSON.stringify(body).slice(0, 300)}`);
    const items = JSON.parse(text) as Array<GlossResult & { headword: string }>;
    for (const it of items) {
      for (const k of ['headword', 'definition_en', 'meaning_hi', 'pos', 'chosen_sense', 'pronunciation_deva'] as const) {
        it[k] = (it[k] ?? '').trim();
      }
    }
    return { model, items };
  }
}

/** Generates one batch of entries; failing entries are re-sent with feedback, never truncated. */
export async function generateGlossBatch(apiKey: string, reqs: GlossRequest[]): Promise<GlossOutcome[]> {
  const outcomes: GlossOutcome[] = reqs.map(() => ({ ok: false, attempts: 0, failure: 'not attempted' }));
  let pending = reqs.map((_, i) => i);
  let feedback = new Map<number, string>();
  for (let attempt = 1; attempt <= MAX_ATTEMPTS && pending.length; attempt++) {
    const prompt = pending.map((i, n) => {
      const fb = feedback.get(i);
      return `### ${n + 1}\n${buildPrompt(reqs[i])}${fb ? `\nPREVIOUS ANSWER REJECTED: ${fb}. Compress harder: keep only the core meaning.` : ''}`;
    }).join('\n\n');
    let res;
    try {
      res = await callGemini(apiKey, [{ role: 'user', parts: [{ text: prompt }] }]);
    } catch (err) {
      for (const i of pending) outcomes[i] = { ok: false, attempts: attempt, failure: `error: ${(err as Error).message}` };
      if (err instanceof DailyQuotaError) return outcomes;
      continue;
    }
    const byWord = new Map(res.items.map((it) => [it.headword.toLowerCase(), it]));
    feedback = new Map();
    const stillPending: number[] = [];
    for (const i of pending) {
      const item = byWord.get(reqs[i].headword);
      if (!item) {
        outcomes[i] = { ok: false, attempts: attempt, model: res.model, failure: 'missing from batch response' };
        feedback.set(i, 'you did not return this headword');
        stillPending.push(i);
        continue;
      }
      const { headword: _hw, ...result } = item;
      const problem = validate(reqs[i], result);
      outcomes[i] = problem
        ? { ok: false, attempts: attempt, model: res.model, result, failure: problem }
        : { ok: true, attempts: attempt, model: res.model, result };
      if (problem) {
        feedback.set(i, problem);
        stillPending.push(i);
      }
    }
    pending = stillPending;
  }
  return outcomes;
}
