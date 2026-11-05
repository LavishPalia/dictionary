// Leaderboard names (UI-DESIGN §3.5): the generated "Adjective Noun" names and the shape rule. Pure, so the server
// and the rename sheet share them. The word filter is server-only (src/duel/server/players.ts).
export const ADJECTIVES = [
  'Curious', 'Wandering', 'Quiet', 'Brave', 'Merry', 'Patient', 'Clever', 'Bold', 'Gentle', 'Swift', 'Lucky', 'Sly',
  'Wise', 'Sunny', 'Dusky', 'Nimble', 'Rustic', 'Trusty', 'Jolly', 'Keen', 'Calm', 'Eager', 'Golden', 'Silver',
  'Amber', 'Velvet', 'Crisp', 'Humble', 'Plucky', 'Stalwart', 'Bright', 'Cosy', 'Dapper', 'Earnest', 'Fond', 'Graceful',
  'Hopeful', 'Inky', 'Kindly', 'Lively', 'Mellow', 'Noble', 'Oaken', 'Peaceful', 'Rosy', 'Sincere', 'Thrifty', 'Untold',
  'Vivid', 'Warm', 'Zesty', 'Careful', 'Daring', 'Faithful', 'Hushed', 'Jaunty', 'Lucid', 'Modest', 'Polite', 'Radiant',
];

export const NOUNS = [
  'Inkwell', 'Penholder', 'Lexicon', 'Bookmark', 'Marginalia', 'Pagecurl', 'Colophon', 'Footnote', 'Glossary', 'Serif',
  'Ligature', 'Semicolon', 'Wordbook', 'Folio', 'Diphthong', 'Nib', 'Rubric', 'Thesaurus', 'Jacket', 'Kerning',
  'Lantern', 'Margin', 'Almanac', 'Appendix', 'Ballad', 'Bindery', 'Bookend', 'Chapter', 'Comma', 'Couplet',
  'Dictionary', 'Epigram', 'Fable', 'Flyleaf', 'Grammar', 'Headword', 'Index', 'Journal', 'Keyword', 'Library',
  'Limerick', 'Manuscript', 'Notebook', 'Paperback', 'Parchment', 'Pencil', 'Preface', 'Proverb', 'Reader', 'Riddle',
  'Scribe', 'Sonnet', 'Spine', 'Stanza', 'Syllable', 'Typeface', 'Verse', 'Vowel', 'Wordsmith', 'Scroll',
];

export function generateName(rand: () => number): string {
  const pick = (list: string[]) => list[Math.floor(rand() * list.length)];
  return `${pick(ADJECTIVES)} ${pick(NOUNS)}`;
}

/** What makes two names the same: case and spaces don't count. */
export const nameKey = (name: string) => name.toLowerCase().replace(/\s+/g, '');

export const tidyName = (name: string) => name.trim().replace(/\s+/g, ' ');

export type NameError = 'short' | 'long' | 'chars';

/** 3–20 English letters, digits and spaces (the user, 6 Nov: the filter can't police other scripts yet). */
export function checkNameShape(name: string): NameError | null {
  const tidy = tidyName(name);
  if (tidy.length < 3) return 'short';
  if (tidy.length > 20) return 'long';
  return /^[A-Za-z0-9 ]+$/.test(tidy) ? null : 'chars';
}
