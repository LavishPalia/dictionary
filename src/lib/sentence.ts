import type { DictionaryEntry } from './types';

export const MAX_WORDS = 40;
export const UNCOMMON_RANK = 8000;
const MAX_RAW = 2000;
const MAX_WORD_LEN = 100;

export type Shared = { kind: 'empty' } | { kind: 'link' } | { kind: 'text'; text: string; truncated: boolean };

/** The first n UTF-16 units of s, never ending on half an emoji (a lone high surrogate breaks encodeURIComponent). */
export function cutText(s: string, n: number = MAX_RAW): string {
  const cut = s.slice(0, n);
  return /[\uD800-\uDBFF]$/.test(cut) ? cut.slice(0, -1) : cut;
}

const URL_RE = /\bhttps?:\/\/\S+|\bwww\.\S+/gi;

/** title is ignored; URLs are stripped from text and url; whitespace collapsed; cut to MAX_WORDS words. */
export function cleanShared(input: { text?: string | null; title?: string | null; url?: string | null }): Shared {
  const raw = cutText(input.text ?? '');
  const rawUrl = cutText(input.url ?? '');
  const hadUrl = new RegExp(URL_RE.source, 'i').test(raw) || new RegExp(URL_RE.source, 'i').test(rawUrl) || rawUrl.trim() !== '';
  const lines = raw.replace(URL_RE, ' ').split(/\r\n|\r|\n/)
    .map((l) => l.split(/\s+/).filter(Boolean))
    .filter((w) => w.length > 0);
  const total = lines.reduce((n, w) => n + w.length, 0);
  if (total === 0) return hadUrl ? { kind: 'link' } : { kind: 'empty' };
  let left = MAX_WORDS;
  const kept: string[] = [];
  for (const w of lines) {
    if (left <= 0) break;
    kept.push(w.slice(0, left).join(' '));
    left -= w.length;
  }
  return { kind: 'text', text: kept.join('\n'), truncated: total > MAX_WORDS };
}

export interface Token {
  text: string;
  /** lowercase lookup key, or null for spaces/punctuation/numbers/over-long */
  key: string | null;
  /** capitalised and not the first word of a sentence */
  midCap: boolean;
}

const WORD_RE = /[A-Za-z]+(?:['’][A-Za-z]+)*/g;

/** Words are letters with inner apostrophes; ’ is folded to '; a trailing 's is dropped from the key. */
export function tokenize(text: string): Token[] {
  const tokens: Token[] = [];
  let pos = 0;
  let atStart = true;
  const pushGap = (gap: string) => {
    if (!gap) return;
    if (/[.!?:\n\r]/.test(gap)) atStart = true;
    tokens.push({ text: gap, key: null, midCap: false });
  };
  for (const m of text.matchAll(WORD_RE)) {
    const start = m.index ?? 0;
    pushGap(text.slice(pos, start));
    const word = m[0];
    pos = start + word.length;
    if (word.length > MAX_WORD_LEN) {
      tokens.push({ text: word, key: null, midCap: false });
    } else {
      const key = word.toLowerCase().replace(/’/g, "'").replace(/'s$/, '');
      const capital = /^[A-Z]/.test(word);
      tokens.push({ text: word, key, midCap: capital && !atStart });
    }
    atStart = false;
  }
  pushGap(text.slice(pos));
  return tokens;
}

export interface Candidate { index: number; key: string; rank: number | null; midCap: boolean }

/** by 'rank': highest rank (null = rarest); by 'length': longest key; ties → first. midCap candidates are skipped unless none other remain, and the rule is off when more than half of all word tokens are capitalised. */
export function pickWord(candidates: Candidate[], by: 'rank' | 'length', capitalisedShare: number): number | null {
  if (candidates.length === 0) return null;
  let pool = candidates;
  if (capitalisedShare <= 0.5) {
    const plain = candidates.filter((c) => !c.midCap);
    if (plain.length > 0) pool = plain;
  }
  const score = (c: Candidate) => (by === 'length' ? c.key.length : c.rank ?? Infinity);
  let best = pool[0];
  for (const c of pool) if (score(c) > score(best)) best = c;
  return best.index;
}

/**
 * Share of non-sentence-initial word tokens that start with a capital letter.
 * Returns 0 when there are fewer than 3 such words, so short texts never switch the name rule off.
 */
export function capitalisedShare(tokens: Token[]): number {
  let atStart = true;
  let later = 0;
  let caps = 0;
  for (const t of tokens) {
    if (t.key === null) {
      if (/[A-Za-z]/.test(t.text)) atStart = false;
      else if (/[.!?:\n\r]/.test(t.text)) atStart = true;
      continue;
    }
    if (!atStart) {
      later++;
      if (/^[A-Z]/.test(t.text)) caps++;
    }
    atStart = false;
  }
  return later < 3 ? 0 : caps / later;
}

export interface SentenceToken { text: string; headword?: string; uncommon?: boolean }
export interface SentenceAnalysis { tokens: SentenceToken[]; picked: number | null; entries: Record<string, DictionaryEntry>; truncated: boolean; offline?: boolean }
