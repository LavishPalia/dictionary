import type { DictionaryEntry } from './types';

/** The example's blank, or undefined when it is missing or does not fit the sentence (stale or corrupted data). */
export function exampleBlank(example: DictionaryEntry['example']): [number, number] | undefined {
  const blank = example?.blank;
  if (!example || !blank) return undefined;
  const [start, length] = blank;
  if (!Number.isInteger(start) || !Number.isInteger(length) || start < 0 || length <= 0 || start + length > example.en.length) return undefined;
  return blank;
}
