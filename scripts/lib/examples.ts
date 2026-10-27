import { OTHER_SCRIPT } from './gloss';

export interface ExampleRequest { headword: string; normalized: string; pos: string; definition_en: string; meaning_hi: string; forms: string[] }
export interface ExampleResult { headword: string; example_en: string; example_hi: string }
export interface ExampleRow { normalized: string; en: string; hi: string; start: number; length: number; exact: boolean; model: string }

const DEVANAGARI = /[ऀ-ॿ]/;
const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\\/]/g, (c) => '\\' + c);

/**
 * Finds the headword (or one of its forms) as a whole word, case-insensitively.
 * Boundaries are lookarounds on letters/digits/underscore rather than \b, so a
 * headword that starts or ends with a non-word character (e.g. "o'clock") still
 * matches sensibly. Returns null when there is no match or more than one.
 * start/length index the original string.
 */
export function findWord(en: string, headword: string, forms: string[]): { start: number; length: number; exact: boolean } | null {
  const words = [...new Set([headword, ...forms].map((w) => w.trim()).filter(Boolean))].sort((x, y) => y.length - x.length);
  if (!words.length) return null;
  const edge = String.raw`[\p{L}\p{M}\p{N}_]`;
  const re = new RegExp(`(?<!${edge})(?:${words.map(escapeRe).join('|')})(?!${edge})`, 'giu');
  const hits = [...en.matchAll(re)];
  if (hits.length !== 1) return null;
  const m = hits[0];
  return { start: m.index!, length: m[0].length, exact: m[0].toLowerCase() === headword.trim().toLowerCase() };
}

export function validateExample(req: ExampleRequest, r: ExampleResult): string | null {
  const en = (r.example_en ?? '').trim();
  const hi = (r.example_hi ?? '').trim();
  if (!findWord(en, req.headword, req.forms)) return 'English must contain the word exactly once';
  const words = en.split(/\s+/).filter(Boolean).length;
  if (words < 6 || words > 16) return `English must be 6-16 words (got ${words})`;
  if (en.length < 20 || en.length > 100) return 'English must be 20-100 characters';
  if (!/[.?!]$/.test(en)) return 'English must end with . ? or !';
  if (DEVANAGARI.test(en)) return 'English must not contain Devanagari';
  if (hi.length < 1 || hi.length > 120) return 'Hindi must be 1-120 characters';
  if (!DEVANAGARI.test(hi) || OTHER_SCRIPT.test(hi)) return 'Hindi must be Devanagari only';
  return null;
}
