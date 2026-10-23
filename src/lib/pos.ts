// Plain-English names for the dictionary's part-of-speech abbreviations ("v. t." → "verb that takes an object"),
// for readers who have not learnt grammar terms. The printed page keeps the abbreviations.

const NAMES: Record<string, { name: string; hint?: string }> = {
  'n.': { name: 'noun', hint: 'a person, place, thing or idea' },
  'adj.': { name: 'adjective', hint: 'describes a noun' },
  'adv.': { name: 'adverb', hint: 'says how, when or where' },
  'pron.': { name: 'pronoun', hint: 'stands in for a noun' },
  'v.': { name: 'verb', hint: 'an action or state' },
  'v. t.': { name: 'verb', hint: 'takes an object: “eat an apple”' },
  'v. i.': { name: 'verb', hint: 'needs no object: “she slept”' },
  'modal v.': { name: 'modal verb', hint: 'can, must, should…' },
  'aux. v.': { name: 'helping verb', hint: 'is, have, do…' },
  'prep.': { name: 'preposition', hint: 'shows place, time or relation' },
  'conj.': { name: 'conjunction', hint: 'joins words or sentences' },
  'det.': { name: 'determiner', hint: 'comes before a noun: this, some…' },
  'art.': { name: 'article', hint: 'a, an, the' },
  'num.': { name: 'number' },
  'interj.': { name: 'exclamation', hint: 'an expression of feeling' },
};

/** e.g. "adj." → { label: "adjective", hint: "describes a noun" }; "prep. & adv." → { label: "preposition or adverb" }. */
export function describePos(pos: string): { label: string; hint?: string } {
  const parts = pos.split('&').map((p) => p.trim()).filter(Boolean);
  if (!parts.length) return { label: '' };
  const known = parts.map((p) => NAMES[p]);
  if (known.some((k) => !k)) return { label: pos };
  if (known.length === 1) return { label: known[0].name, hint: known[0].hint };
  return { label: [...new Set(known.map((k) => k.name))].join(' or ') };
}
