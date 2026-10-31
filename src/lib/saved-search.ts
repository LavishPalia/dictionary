// Find a saved word: by its English headword, its Hindi meaning, or the meaning typed in English letters ("pyaar").
// Best matches first: headwords that start with the text, headwords that contain it, then Hindi and Hinglish matches.

import { hinglishKey, romanize, spellingDistance, HINDI_STOPWORDS } from './hinglish';

/** The search field shows once this many words are saved. */
export const SAVED_SEARCH_FROM = 10;

export interface SavedSearchable { headword: string; meaning_hi: string }

/** Which text to highlight: [start, length] in the headword or in the Hindi meaning. */
export type SavedMark = { field: 'headword' | 'hindi'; start: number; length: number };

export interface SavedHit<T> { word: T; mark: SavedMark }

const DEVANAGARI = /[ऀ-ॿ]/;
// Hindi words in a meaning, with where each starts ("प्यारा, प्रिय" → प्यारा at 0, प्रिय at 8).
const HINDI_WORD = /[^\s,;/()।.]+/g;

// The Hindi word in `text` around index `at`, for ordering: a match on a short word (प्यार) beats a longer one (प्यारा).
const wordLength = (text: string, at: number) => [...text.matchAll(HINDI_WORD)].find((m) => m.index! <= at && at < m.index! + m[0].length)?.[0].length ?? 0;

// Hindi folded for matching, as normalizeHindi folds it (no nukta, ँ → ं, ॉ → ा, न् before a consonant → ं), with the
// span of the printed text each folded letter came from, so a match in the folded text highlights the printed letters.
function foldHindi(text: string): { folded: string; span: Array<[number, number]> } {
  const out: Array<{ c: string; start: number; end: number }> = [];
  let at = 0;
  for (const ch of text) {
    for (const d of ch.normalize('NFD')) {
      if (d === '़' || d === '‌' || d === '‍') { if (out.length) out[out.length - 1].end = at + ch.length; continue; }
      out.push({ c: d === 'ँ' ? 'ं' : d === 'ॉ' ? 'ा' : d === 'ऑ' ? 'आ' : d, start: at, end: at + ch.length });
    }
    at += ch.length;
  }
  for (let i = 0; i + 2 < out.length; i++) {
    if (/[ङञणनम]/.test(out[i].c) && out[i + 1].c === '्' && /[क-ह]/.test(out[i + 2].c)) {
      out.splice(i, 2, { c: 'ं', start: out[i].start, end: out[i + 1].end });
    }
  }
  return { folded: out.map((x) => x.c).join(''), span: out.map((x) => [x.start, x.end]) };
}

// Each query word against the next Hindi word, the last one as a prefix (pyaar kar → प्यार करना); null when one misses.
function phraseHit(words: string[], tokens: RegExpMatchArray[], from: number): { d: number; end: number } | null {
  let d = 0;
  for (let k = 0; k < words.length; k++) {
    const token = tokens[from + k]?.[0];
    const key = hinglishKey(words[k]);
    if (!token || !romanize(token).some((r) => hinglishKey(r).startsWith(key))) return null;
    const dk = spellingDistance(words[k], token);
    if (dk === null) return null;
    d += dk;
  }
  const last = tokens[from + words.length - 1];
  return { d, end: last.index! + last[0].length };
}

// The rank of one word for the query (lower is better; ties go to the shorter Hindi word), or null when it doesn't match.
function rankOf(w: SavedSearchable, q: string, qKey: string): { rank: number; mark: SavedMark } | null {
  const hw = w.headword.toLowerCase();
  if (DEVANAGARI.test(q)) {
    // Folded on both sides, so ज़रूर, ज़रूर and जरूर all find each other.
    const query = foldHindi(q).folded.replace(/\s+/g, ' ');
    const { folded, span } = foldHindi(w.meaning_hi);
    const at = folded.indexOf(query);
    if (at < 0 || !query) return null;
    const start = span[at][0];
    return { rank: 3 + wordLength(w.meaning_hi, start) / 1000, mark: { field: 'hindi', start, length: span[at + query.length - 1][1] - start } };
  }
  if (hw.startsWith(q)) return { rank: 0, mark: { field: 'headword', start: 0, length: q.length } };
  const inside = q.length >= 2 ? hw.indexOf(q) : -1;
  if (inside >= 0) return { rank: 1, mark: { field: 'headword', start: inside, length: q.length } };
  // Hinglish: the start of a Hindi word in the meaning, spelled loosely (pyar, pyaar, pyara → प्यार, प्यारा).
  if (qKey.length < 2 || !/^[a-z\s]+$/.test(q)) return null;
  let best: { rank: number; mark: SavedMark } | null = null;
  const qWords = q.split(/\s+/);
  if (qWords.length > 1) {
    // Several words: a run of Hindi words in the meaning (pyaar karna → प्यार करना).
    const tokens = [...w.meaning_hi.matchAll(HINDI_WORD)];
    for (let j = 0; j < tokens.length; j++) {
      const hit = phraseHit(qWords, tokens, j);
      if (!hit) continue;
      const start = tokens[j].index!;
      const rank = 2 + Math.min(hit.d, 9) / 10 + (hit.end - start) / 1000;
      if (!best || rank < best.rank) best = { rank, mark: { field: 'hindi', start, length: hit.end - start } };
    }
    return best;
  }
  for (const m of w.meaning_hi.matchAll(HINDI_WORD)) {
    const token = m[0];
    if (HINDI_STOPWORDS.has(token) || !romanize(token).some((r) => hinglishKey(r).startsWith(qKey))) continue;
    const d = spellingDistance(q, token);
    if (d === null) continue;
    const rank = 2 + Math.min(d, 9) / 10 + token.length / 1000; // after English matches, closer spellings first
    if (!best || rank < best.rank) best = { rank, mark: { field: 'hindi', start: m.index!, length: token.length } };
  }
  return best;
}

/** The saved words matching `query`, best first (ties alphabetical); [] for a blank query. */
export function searchSaved<T extends SavedSearchable>(words: readonly T[], query: string): SavedHit<T>[] {
  const q = query.trim().toLowerCase().normalize('NFC');
  if (!q) return [];
  const qKey = DEVANAGARI.test(q) ? '' : hinglishKey(q);
  return words
    .map((word) => ({ word, hit: rankOf(word, q, qKey) }))
    .filter((x): x is { word: T; hit: { rank: number; mark: SavedMark } } => x.hit !== null)
    .sort((a, b) => a.hit.rank - b.hit.rank
      || (a.hit.rank === 0 ? a.word.headword.length - b.word.headword.length : 0)
      || a.word.headword.localeCompare(b.word.headword))
    .map(({ word, hit }) => ({ word, mark: hit.mark }));
}
