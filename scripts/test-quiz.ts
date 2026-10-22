// Review cards for every entry: three wrong options, none sharing a Hindi meaning with the answer, mostly the
// same part of speech. Usage: npx tsx scripts/test-quiz.ts   (after npm run build:data)
import Database from 'better-sqlite3';
import { getQuizCards } from '../src/lib/book-data';

let seed = 42;
const random = () => ((seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31);
const db = new Database('data/dictionary.db', { readonly: true });
const all = (db.prepare('SELECT normalized FROM entries').all() as { normalized: string }[]).map((r) => r.normalized);
let failures = 0;
const fail = (msg: string) => { failures++; if (failures <= 10) console.error(`✗ ${msg}`); };
let samePos = 0, total = 0;
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
  }
}
const share = total ? samePos / total : 0;
console.log(`${all.length} cards, ${total} wrong options, ${(100 * share).toFixed(1)}% share the answer's part of speech.`);
if (share < 0.8) fail(`only ${(100 * share).toFixed(1)}% of wrong options share the part of speech`);
const sample = getQuizCards(['camel', 'abandon', 'quickly'], random);
for (const c of sample) console.log(`  ${c.entry.headword} (${c.entry.meaning_hi}) vs ${c.distractors.map((d) => `${d.headword} (${d.meaning_hi})`).join(', ')}`);
if (failures) { console.error(`\n${failures} quiz check(s) failed.`); process.exit(1); }
console.log('✓ Every review card has three distinct wrong options and exactly one right answer.');
