// The Duel's candidate answers: Panna headwords (a–z only, up to a rank per length) plus the curated short answers.
// Rarer words are allowed (the user, 2 Nov): a fully crossed 9 × 7 grid won't fill from common words alone.
import { readFileSync } from 'node:fs';
import type { Sense } from '../../src/duel/engine/types';
import { blocklist, dictionary } from './lib/db';

export interface PoolWord { word: string; len: number; rank: number; sense: Sense; source: 'panna' | 'curated' }
export interface Curated { answer: string; clue: string; kind: 'abbr' | 'def'; en: string; hi: string }
/** A Twemoji picture: key = code point file name, e.g. "1f402". The alt describes it without naming it. */
export interface Picture { key: string; words: string[]; alt: string }

/** The highest frequency rank allowed per answer length. Length 8 can't occur on the 9 × 7 board. */
export const MAX_RANK: Record<number, number> = { 2: 3000, 3: 8000, 4: 12000, 5: 16000, 6: 20000, 7: 24000, 9: 50000 };
export const LENGTHS = [1, 2, 3, 4, 5, 6, 7, 9];

export const curated = (): Curated[] => JSON.parse(readFileSync('data/duel/curated.json', 'utf8'));
export const pictures = (): Picture[] => JSON.parse(readFileSync('data/duel/pictures.json', 'utf8'));

let pool: PoolWord[] | undefined;
export function wordPool(): PoolWord[] {
  if (pool) return pool;
  const blocked = blocklist();
  const out = new Map<string, PoolWord>();
  const rows = dictionary().prepare('select rowid, normalized, freq_rank, definition_en, meaning_hi from entries where freq_rank is not null order by freq_rank, normalized')
    .all() as { rowid: number; normalized: string; freq_rank: number; definition_en: string; meaning_hi: string }[];
  for (const r of rows) {
    const w = r.normalized, max = MAX_RANK[w.length];
    if (!max || r.freq_rank > max || !/^[a-z]+$/.test(w) || blocked.has(w) || !r.definition_en.trim() || !r.meaning_hi.trim()) continue;
    out.set(w, { word: w, len: w.length, rank: r.freq_rank, sense: { en: r.definition_en, hi: r.meaning_hi, entryId: r.rowid }, source: 'panna' });
  }
  for (const c of curated()) {
    if (out.has(c.answer) || blocked.has(c.answer)) continue;
    out.set(c.answer, { word: c.answer, len: c.answer.length, rank: 0, sense: { en: c.en, hi: c.hi }, source: 'curated' });
  }
  return (pool = [...out.values()]);
}

if (process.argv[1]?.endsWith('words.ts')) {
  const by = new Map<number, number>();
  for (const w of wordPool()) by.set(w.len, (by.get(w.len) ?? 0) + 1);
  console.log(`pool: ${wordPool().length} words;`, [...by].sort((a, b) => a[0] - b[0]).map(([l, n]) => `${l}: ${n}`).join(', '));
}
