// Review cards for every entry: three wrong options, none sharing a Hindi meaning with the answer, mostly the
// same part of speech. Usage: npx tsx scripts/test-quiz.ts   (after npm run build:data)
import Database from 'better-sqlite3';
import { getQuizCards, meaningInSentence } from '../src/lib/book-data';

let seed = 42;
const random = () => ((seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31);
const db = new Database('data/dictionary.db', { readonly: true });
const all = (db.prepare('SELECT normalized FROM entries').all() as { normalized: string }[]).map((r) => r.normalized);
let failures = 0;
const fail = (msg: string) => { failures++; if (failures <= 10) console.error(`✗ ${msg}`); };
let samePos = 0, total = 0, oppositeCards = 0, blankCards = 0;
const related = (word: string, kind: 'similar' | 'opposite', source?: 'wordnet') => (db.prepare(`SELECT t.normalized FROM related r
  JOIN entries e ON e.id = r.entry_id JOIN entries t ON t.id = r.related_id WHERE e.normalized = ? AND r.kind = ?
  ${source ? "AND r.source = 'wordnet'" : ''} ORDER BY r.rank`)
  .all(word, kind) as { normalized: string }[]).map((r) => r.normalized);
for (let i = 0; i < all.length; i += 20) {
  for (const card of getQuizCards(all.slice(i, i + 20), random)) {
    const { entry, distractors } = card;
    if (distractors.length !== 3) fail(`${entry.headword}: ${distractors.length} wrong options`);
    const answers = new Set(entry.meaning_hi.split(/[,;]/).map((m) => m.trim()));
    for (const d of distractors) {
      total++;
      if (d.normalized === entry.normalized) fail(`${entry.headword}: offered itself as a wrong option`);
      if (d.meaning_hi.split(/[,;]/).some((m) => answers.has(m.trim()))) fail(`${entry.headword}: "${d.headword}" shares a meaning (${d.meaning_hi})`);
      if (d.pos.split('&')[0].trim() === entry.pos.split('&')[0].trim()) samePos++;
    }
    if (new Set(distractors.map((d) => d.meaning_hi)).size !== distractors.length) fail(`${entry.headword}: two wrong options look the same`);
    // "Fill in the blank": the blanked span is the headword as written, and no wrong option can fit the gap too.
    const blank = entry.example?.blank;
    if (blank) {
      blankCards++;
      const span = entry.example!.en.slice(blank[0], blank[0] + blank[1]);
      if (span.toLowerCase() !== entry.headword.toLowerCase()) fail(`${entry.headword}: blank covers "${span}"`);
      for (const d of distractors) {
        const row = db.prepare('SELECT meaning_hi_search FROM entries WHERE normalized = ?').get(d.normalized) as { meaning_hi_search: string };
        if (meaningInSentence(row.meaning_hi_search, entry.example!.hi)) fail(`${entry.headword}: blank option "${d.headword}" (${d.meaning_hi}) is translated in "${entry.example!.hi}"`);
        if (d.headword !== d.headword.toLowerCase()) fail(`${entry.headword}: blank option "${d.headword}" is capitalised`);
      }
      for (const d of distractors) if (d.headword.toLowerCase() === entry.headword.toLowerCase() || d.normalized === entry.normalized) fail(`${entry.headword}: blank option "${d.headword}" equals the answer`);
    }
    // "Which word means the opposite?": exactly one option is one of the word's opposites, none is the word itself
    // or something similar to the answer.
    // Gemini opposites stay out of Review: the right answer is always a WordNet opposite, and a word with only Gemini
    // opposites gets no opposite card.
    const opposites = related(entry.normalized, 'opposite');
    const wordnetOpposites = related(entry.normalized, 'opposite', 'wordnet');
    if (wordnetOpposites.length && card.opposite) {
      oppositeCards++;
      const { answer, distractors: wrong } = card.opposite;
      if (answer.normalized !== wordnetOpposites[0]) fail(`${entry.headword}: opposite answer ${answer.headword}, expected WordNet opposite ${wordnetOpposites[0]}`);
      if (wrong.length !== 3 || new Set(wrong.map((d) => d.normalized)).size !== 3) fail(`${entry.headword}: opposite card needs three distinct wrong options`);
      const banned = new Set([entry.normalized, answer.normalized, ...opposites.flatMap((o) => [o, ...related(o, 'similar')])]);
      for (const d of wrong) if (banned.has(d.normalized)) fail(`${entry.headword}: "${d.headword}" is not clearly wrong as its opposite`);
    } else if (card.opposite) fail(`${entry.headword}: opposite card without a WordNet opposite`);
  }
}
const withOpposite = (db.prepare(`SELECT count(DISTINCT entry_id) n FROM related WHERE kind = 'opposite' AND source = 'wordnet'`).get() as { n: number }).n;
console.log(`${oppositeCards} of ${withOpposite} words with a WordNet opposite get an opposite card.`);
if (oppositeCards < withOpposite * 0.9) fail(`only ${oppositeCards} of ${withOpposite} words with a WordNet opposite get an opposite card`);
console.log(`${blankCards} words have a fill-in-the-blank example.`);
const share = total ? samePos / total : 0;
console.log(`${all.length} cards, ${total} wrong options, ${(100 * share).toFixed(1)}% share the answer's part of speech.`);
if (share < 0.8) fail(`only ${(100 * share).toFixed(1)}% of wrong options share the part of speech`);
const sample = getQuizCards(['camel', 'abandon', 'quickly'], random);
const above = getQuizCards(['above'], random)[0]?.opposite;
if (above) console.log(`  opposite of Above: ${above.answer.headword} vs ${above.distractors.map((d) => d.headword).join(', ')}`);
for (const c of sample) console.log(`  ${c.entry.headword} (${c.entry.meaning_hi}) vs ${c.distractors.map((d) => `${d.headword} (${d.meaning_hi})`).join(', ')}`);
if (failures) { console.error(`\n${failures} quiz check(s) failed.`); process.exit(1); }
console.log('✓ Every review card has three distinct wrong options and exactly one right answer.');
