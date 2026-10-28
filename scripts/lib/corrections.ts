// Hand-made corrections (data/sources/corrections.jsonl), applied by the build after every generated layer, so they
// survive regenerating the glosses or examples. One row per word:
//   { normalized, note, entry?: { field: value, … }, add?: true, example?: { en, hi } }
// `entry` fixes fields of a word in the book; with `add: true` it is a whole new word. `example` replaces the word's
// example sentence. Mistakes (a word not in the book, a bad label, Latin letters in the Hindi) stop the build.
import fs from 'fs';
import path from 'path';
import { SOURCES_DIR } from './lexicon';
import { MAX_DEF, MAX_HI, charLen, OTHER_SCRIPT } from './gloss';
import { findWord, validateExample, type ExampleRow } from './examples';
import type { DictionaryEntry } from '../../src/lib/types';

export const CORRECTIONS_FILE = path.join(SOURCES_DIR, 'corrections.jsonl');

const ENTRY_FIELDS = ['headword', 'pos', 'pronunciation_deva', 'definition_en', 'meaning_hi'] as const;
type EntryField = (typeof ENTRY_FIELDS)[number];
const POS_LABELS = new Set(['n.', 'v. t.', 'v. i.', 'adj.', 'adv.', 'pron.', 'prep.', 'conj.', 'interj.', 'num.']);
const DEVANAGARI = /[ऀ-ॿ]/;

export interface Correction {
  normalized: string;
  /** Why: shown in review, required. */
  note: string;
  add?: boolean;
  entry?: Partial<Record<EntryField, string>>;
  example?: { en: string; hi: string };
}

type Entry = Omit<DictionaryEntry, 'id' | 'page_number' | 'column' | 'position_in_column'> & { reviewed: 0 | 1 };

export function loadCorrections(file = CORRECTIONS_FILE): Correction[] {
  if (!fs.existsSync(file)) return [];
  return fs.readFileSync(file, 'utf8').split(/\r?\n/).filter((l) => l.trim()).map((l) => JSON.parse(l) as Correction);
}

/** The first problem with a correction, or null. */
export function validateCorrection(c: Correction): string | null {
  if (!c.normalized || c.normalized !== c.normalized.trim().toLowerCase()) return 'normalized must be trimmed lower case';
  if (!c.note?.trim()) return 'note is required';
  if (!c.entry && !c.example) return 'nothing to correct';
  const e = c.entry ?? {};
  for (const key of Object.keys(e)) if (!ENTRY_FIELDS.includes(key as EntryField)) return `unknown entry field "${key}"`;
  if (c.add && ENTRY_FIELDS.some((f) => !e[f]?.trim())) return 'an added word needs headword, pos, pronunciation_deva, definition_en and meaning_hi';
  if (e.headword !== undefined && e.headword.trim().toLowerCase() !== c.normalized) return 'headword does not match normalized';
  if (e.pos !== undefined && !POS_LABELS.has(e.pos)) return `pos "${e.pos}" is not an allowed label`;
  if (e.definition_en !== undefined && (charLen(e.definition_en) > MAX_DEF || !/^[a-z].*\.$/.test(e.definition_en)))
    return `definition_en must start lower case, end with a period and be at most ${MAX_DEF} characters`;
  for (const f of ['meaning_hi', 'pronunciation_deva'] as const) {
    const v = e[f];
    if (v !== undefined && (!DEVANAGARI.test(v) || OTHER_SCRIPT.test(v))) return `${f} must be Devanagari only`;
  }
  if (e.meaning_hi !== undefined && charLen(e.meaning_hi) > MAX_HI) return `meaning_hi must be at most ${MAX_HI} characters`;
  if (c.example) {
    const problem = validateExample({ headword: c.normalized, normalized: c.normalized, pos: '', definition_en: '', meaning_hi: '', forms: [] },
      { headword: c.normalized, example_en: c.example.en, example_hi: c.example.hi });
    if (problem) return `example: ${problem}`;
  }
  return null;
}

/** Applies the entry parts of the corrections to the merged book, in place. */
export function applyEntryCorrections(merged: Map<string, Entry>, corrections: Correction[]): { changed: string[]; added: string[] } {
  const changed: string[] = [];
  const added: string[] = [];
  for (const c of corrections) {
    const problem = validateCorrection(c);
    if (problem) throw new Error(`corrections.jsonl: "${c.normalized}": ${problem}`);
    if (!c.entry) continue;
    const current = merged.get(c.normalized);
    if (c.add) {
      if (current) throw new Error(`corrections.jsonl: "${c.normalized}" is already in the book; fix its fields instead of adding it`);
      merged.set(c.normalized, {
        ...(c.entry as Record<EntryField, string>), normalized: c.normalized, reviewed: 0,
        source: 'Panna correction', license_attribution: 'English and Hindi: written by hand for Panna; not yet native-reviewed',
      });
      added.push(c.normalized);
    } else {
      if (!current) throw new Error(`corrections.jsonl: "${c.normalized}" is not in the book`);
      merged.set(c.normalized, { ...current, ...c.entry });
      changed.push(c.normalized);
    }
  }
  return { changed, added };
}

/** Replaces generated example rows with the corrected ones; the blank is found in the sentence like a generated one. */
export function correctExamples(rows: ExampleRow[], corrections: Correction[], formsOf: Map<string, string[]>): ExampleRow[] {
  const fixes = new Map<string, ExampleRow>();
  for (const c of corrections) {
    if (!c.example) continue;
    const span = findWord(c.example.en, c.normalized, formsOf.get(c.normalized) ?? []);
    if (!span) throw new Error(`corrections.jsonl: the example for "${c.normalized}" must contain the word exactly once`);
    fixes.set(c.normalized, { normalized: c.normalized, en: c.example.en, hi: c.example.hi, ...span, model: 'correction' });
  }
  return [...[...fixes.values()], ...rows.filter((r) => !fixes.has(r.normalized))];
}
