// Every part of speech in the built dictionary must have a plain-English label in the word sheet.
// Usage: npx tsx scripts/test-pos.ts   (after npm run build:data)
import Database from 'better-sqlite3';
import { describePos } from '../src/lib/pos';

const db = new Database('data/dictionary.db', { readonly: true });
const values = (db.prepare('SELECT DISTINCT pos FROM entries').all() as { pos: string }[]).map((r) => r.pos);
const unmapped = values.filter((p) => describePos(p).label === p);
const expect = (pos: string, label: string) => {
  const got = describePos(pos).label;
  if (got !== label) unmapped.push(`${pos} → ${got} (expected ${label})`);
};
expect('v. t.', 'verb');
expect('prep. & adv.', 'preposition or adverb');
expect('interj.', 'exclamation');
if (unmapped.length) {
  console.error(`✗ No plain-English label for: ${unmapped.join(', ')}`);
  process.exit(1);
}
console.log(`✓ All ${values.length} part-of-speech values have plain-English labels.`);
