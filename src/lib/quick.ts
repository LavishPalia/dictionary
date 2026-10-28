import { analyseSentence, getWordEntry, nearSpellings, searchWords } from './book-data';
import { cleanShared, tokenize } from './sentence';
import type { DictionaryEntry } from './types';

const MAX_LEN = 600;
const DEVANAGARI = /[ऀ-ॿ]/;

export function limitQuick(text: string): string {
  if (text.length <= MAX_LEN) return text;
  const cut = text.lastIndexOf('\n', MAX_LEN - 1);
  return cut > 0 ? text.slice(0, cut).trimEnd() : text.slice(0, MAX_LEN - 1) + '…';
}

function full(entry: DictionaryEntry, from?: string): string {
  const lines = [`${from ? `${from} → ` : ''}${entry.headword} (${entry.pos})`, entry.meaning_hi, entry.definition_en];
  if (entry.example?.en) lines.push('', `e.g. ${entry.example.en}`);
  return lines.join('\n');
}

const short = (w: { headword: string; meaning_hi: string }) => `${w.headword} – ${w.meaning_hi}`;

/** Plain text for the iPhone Shortcut popup (and Siri): at most 600 characters, no emoji. */
export function quickText(q: string): string {
  const shared = cleanShared({ text: q });
  if (shared.kind === 'empty') return 'Select a word or sentence first.';
  if (shared.kind === 'link') return 'Share a word or sentence, not a link.';
  const text = shared.text;

  if (DEVANAGARI.test(text)) {
    const hits = searchWords(text.replace(/\s+/g, ' ').trim(), 3);
    return limitQuick(hits.length ? hits.map(short).join('\n') : 'Nothing in Panna matches that.');
  }

  const keys = tokenize(text).filter((t) => t.key !== null);
  if (keys.length === 0) return 'None of these words are in Panna.';

  if (keys.length === 1) {
    const word = keys[0].text;
    const { entry, redirectedFrom } = getWordEntry(keys[0].key!);
    if (entry) return limitQuick(full(entry, redirectedFrom ? word : undefined));
    const hits = searchWords(word, 3);
    if (hits[0]?.match === 'hinglish') {
      return limitQuick(hits.filter((h) => h.match === 'hinglish').map(short).join('\n'));
    }
    const close = nearSpellings(word.toLowerCase(), 3).map((r) => r.headword);
    const base = `“${word}” isn't in Panna.`;
    return limitQuick(close.length ? `${base} Closest: ${close.join(', ')}.` : base);
  }

  const a = analyseSentence(text, shared.truncated);
  if (a.picked === null) return 'None of these words are in Panna.';
  const pickedHw = a.tokens[a.picked].headword!;
  const seen = new Set([pickedHw]);
  const others: DictionaryEntry[] = [];
  for (const t of a.tokens) {
    if (t.headword && t.uncommon && !seen.has(t.headword) && others.length < 2) {
      seen.add(t.headword);
      others.push(a.entries[t.headword]);
    }
  }
  const parts = [full(a.entries[pickedHw])];
  if (others.length) parts.push(others.map(short).join('\n'));
  return limitQuick(parts.join('\n\n'));
}
