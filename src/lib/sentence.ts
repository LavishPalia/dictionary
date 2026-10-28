import type { DictionaryEntry } from './types';

export const MAX_WORDS = 40;
export const UNCOMMON_RANK = 8000;
const MAX_RAW = 2000;
const MAX_WORD_LEN = 100;

export type Shared = { kind: 'empty' } | { kind: 'link' } | { kind: 'text'; text: string; truncated: boolean };

const URL_RE = /\bhttps?:\/\/\S+|\bwww\.\S+/gi;

/** title is ignored; URLs are stripped from text and url; whitespace collapsed; cut to MAX_WORDS words. */
export function cleanShared(input: { text?: string | null; title?: string | null; url?: string | null }): Shared {
  const raw = (input.text ?? '').slice(0, MAX_RAW);
  const rawUrl = (input.url ?? '').slice(0, MAX_RAW);
  const hadUrl = new RegExp(URL_RE.source, 'i').test(raw) || new RegExp(URL_RE.source, 'i').test(rawUrl) || rawUrl.trim() !== '';
  const words = raw.replace(URL_RE, ' ').split(/\s+/).filter(Boolean);
  if (words.length === 0) return hadUrl ? { kind: 'link' } : { kind: 'empty' };
  const truncated = words.length > MAX_WORDS;
  return { kind: 'text', text: words.slice(0, MAX_WORDS).join(' '), truncated };
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

/** Share of word tokens that start with a capital letter. */
export function capitalisedShare(tokens: Token[]): number {
  const words = tokens.filter((t) => t.key !== null);
  if (words.length === 0) return 0;
  return words.filter((t) => /^[A-Z]/.test(t.text)).length / words.length;
}

export interface SentenceToken { text: string; headword?: string; uncommon?: boolean }
export interface SentenceAnalysis { tokens: SentenceToken[]; picked: number | null; entries: Record<string, DictionaryEntry>; truncated: boolean; offline?: boolean }
