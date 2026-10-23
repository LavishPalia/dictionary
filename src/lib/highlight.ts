import { normalizeHindi } from './hindi';

// Finds the part of `text` that a search query matched, for highlighting in the results list.
// Devanagari is compared after the same spelling-variant folding the search uses (ऊंट highlights ऊँट), and
// matches are snapped to whole letters so a highlight never splits a letter from its vowel sign.

const DEVANAGARI = /[ऀ-ॿ]/;

function graphemeBoundaries(text: string): number[] {
  const bounds: number[] = [];
  if (typeof Intl !== 'undefined' && 'Segmenter' in Intl) {
    const segmenter = new Intl.Segmenter('hi', { granularity: 'grapheme' });
    for (const { index } of segmenter.segment(text)) bounds.push(index);
  } else {
    for (let i = 0; i < text.length; i += (text.codePointAt(i)! > 0xffff ? 2 : 1)) bounds.push(i);
  }
  bounds.push(text.length);
  return bounds;
}

const isWordStart = (text: string, i: number) => i === 0 || /[\s,;(/\-–]/.test(text[i - 1]);

/** [start, end) of the first match, preferring one that begins a word; null when the query is not in the text. */
export function findMatch(text: string, query: string): [number, number] | null {
  const q = query.trim();
  if (!q || !text) return null;

  if (!DEVANAGARI.test(q)) {
    const lower = text.toLowerCase();
    const needle = q.toLowerCase();
    let fallback: [number, number] | null = null;
    for (let i = lower.indexOf(needle); i !== -1; i = lower.indexOf(needle, i + 1)) {
      if (isWordStart(text, i)) return [i, i + needle.length];
      fallback ??= [i, i + needle.length];
    }
    return fallback;
  }

  const nq = normalizeHindi(q);
  if (!nq) return null;
  const bounds = graphemeBoundaries(text);
  let fallback: [number, number] | null = null;
  for (let a = 0; a < bounds.length - 1; a++) {
    const start = bounds[a];
    if (text[start] === ' ') continue;
    let end = -1;
    for (let b = a + 1; b < bounds.length; b++) {
      const folded = normalizeHindi(text.slice(start, bounds[b]));
      // Folding trims spaces, so never let a highlight end on one.
      if (/\s/.test(text[bounds[b] - 1])) { if (!nq.startsWith(folded)) break; continue; }
      if (folded === nq) end = bounds[b]; // keep extending: the longest slice keeps a trailing nukta/chandrabindu
      else if (folded.startsWith(nq)) { if (end === -1) end = bounds[b]; break; } // query ends inside a letter (क → कै)
      else if (!nq.startsWith(folded)) break;
    }
    if (end === -1) continue;
    if (isWordStart(text, start)) return [start, end];
    fallback ??= [start, end];
  }
  return fallback;
}

/** Splits text into [before, match, after] for rendering; match is '' when nothing matched. */
export function splitMatch(text: string, query: string): [string, string, string] {
  const m = findMatch(text, query);
  return m ? [text.slice(0, m[0]), text.slice(m[0], m[1]), text.slice(m[1])] : [text, '', ''];
}
