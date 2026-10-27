// Similar and opposite words (scripts/lib/related.ts) and the related table in data/dictionary.db.
// Usage: npx tsx scripts/test-related.ts   (after npm run build:data)
import fs from 'fs';
import path from 'path';
import Database from 'better-sqlite3';
import { SOURCES_DIR, WN_POS_LABEL, WnPos, WordNet } from './lib/lexicon';
import { MAX_OPPOSITE, MAX_SIMILAR, Related, findRelated, mergeGeminiLinks, wnPosesOf } from './lib/related';
import { questionKind } from '../src/lib/review';

let failures = 0;
function check(label: string, ok: boolean, detail?: unknown) {
  if (ok) console.log(`✓ ${label}`);
  else { failures++; console.error(`✗ ${label}${detail !== undefined ? ` — ${JSON.stringify(detail)}` : ''}`); }
}

check('pos labels map to WordNet parts of speech',
  JSON.stringify([wnPosesOf('n.'), wnPosesOf('v. t.'), wnPosesOf('prep. & adv.'), wnPosesOf('adj. & n.'), wnPosesOf('pron.'), wnPosesOf('modal v.')])
  === JSON.stringify([['n'], ['v'], ['r'], ['a', 'n'], [], ['v']]));

// The full lemma list stands in for the finished book (every lemma with its main part of speech).
const lemmas = fs.readFileSync(path.join(SOURCES_DIR, 'lemmas.jsonl'), 'utf8').split('\n').filter((l) => l.trim())
  .map((l) => JSON.parse(l) as { lemma: string; rank: number; wn_pos: WnPos | null });
const posBy = new Map<string, string>();
const rank = new Map<string, number>();
for (const l of lemmas) {
  if (!posBy.has(l.lemma)) posBy.set(l.lemma, l.wn_pos ? WN_POS_LABEL[l.wn_pos] : '');
  if (!rank.has(l.lemma)) rank.set(l.lemma, l.rank);
}
const wn = new WordNet();
const full = findRelated(wn, posBy, rank);
const again = findRelated(wn, posBy, rank);
check('the same sources give the same words', JSON.stringify([...full]) === JSON.stringify([...again]));

const sim = (w: string) => full.get(w)?.similar ?? [];
const opp = (w: string) => full.get(w)?.opposite ?? [];
const has = (list: string[], ...words: string[]) => words.every((w) => list.includes(w));
check('direct opposites: rich → poor, buy → sell, accept → reject, true → false',
  has(opp('rich'), 'poor') && has(opp('buy'), 'sell') && has(opp('accept'), 'reject') && has(opp('true'), 'false'),
  [opp('rich'), opp('buy'), opp('accept'), opp('true')]);
check('opposites through the head adjective: huge → small, haughty → humble',
  has(opp('huge'), 'small') && has(opp('haughty'), 'humble'), [opp('huge'), opp('haughty')]);
check('close synonyms come first: brave → courageous, rich → wealthy, begin → start',
  sim('brave')[0] === 'courageous' && sim('rich')[0] === 'wealthy' && sim('begin')[0] === 'start', [sim('brave'), sim('rich'), sim('begin')]);
check('a word is not offered for a minor sense of its own: "get" is not similar to "begin"', !sim('begin').includes('get'), sim('begin'));
check('the rarest words are left out: "brobdingnagian" is not similar to "huge"', !sim('huge').includes('brobdingnagian'), sim('huge'));
let shapeOk = true;
for (const [word, r] of full) {
  if (r.similar.length > MAX_SIMILAR || r.opposite.length > MAX_OPPOSITE || r.similar.includes(word) || r.opposite.includes(word)
    || r.similar.some((w) => !posBy.has(w)) || r.opposite.some((w) => !posBy.has(w)) || r.opposite.some((w) => r.similar.includes(w))) {
    shapeOk = false;
    console.error(`  ${word}: ${JSON.stringify(r)}`);
    break;
  }
}
check(`every list is short, in the book, and never the word itself or both similar and opposite (${full.size} words)`, shapeOk);

// Merging Gemini's links (pure function, 3 fixture rows; the real file is not touched).
const wnFixture = new Map<string, Related>([
  ['cold', { similar: ['chilly', 'cool', 'icy', 'frigid'], opposite: ['hot'] }],
  ['hot', { similar: ['warm'], opposite: ['cold', 'mild', 'cool'] }],
  ['big', { similar: ['large'], opposite: ['small'] }],
]);
const fixtureWords = new Set(['cold', 'hot', 'big', 'large', 'small', 'chilly', 'cool', 'icy', 'frigid', 'warm', 'mild', 'tiny', 'wintry', 'huge']);
const fixtureRows = [
  { normalized: 'cold', similar: ['wintry', 'icy', 'nope'], opposite: ['warm', 'cold'], model: 'fixture' },
  { normalized: 'big', similar: ['huge', 'big', 'large'], opposite: ['tiny'], model: 'fixture' },
  { normalized: 'hot', similar: ['cold'], opposite: ['huge'], model: 'fixture' },
  { normalized: 'warm', similar: [], opposite: ['hot'], model: 'fixture' }, // hot is full: no reverse
  { normalized: 'icy', similar: [], opposite: ['cold'], model: 'fixture' }, // cold lists icy as similar: no reverse
];
const merged = mergeGeminiLinks(wnFixture, [...fixtureRows].reverse(), (w) => fixtureWords.has(w));
const words = (w: string, kind: 'similar' | 'opposite', source?: string) =>
  (merged.get(w)?.[kind] ?? []).filter((l) => !source || l.source === source).map((l) => l.word);
check('WordNet links are unchanged and first', JSON.stringify(words('cold', 'similar', 'wordnet')) === JSON.stringify(wnFixture.get('cold')!.similar)
  && JSON.stringify(words('cold', 'similar').slice(0, 4)) === JSON.stringify(wnFixture.get('cold')!.similar)
  && JSON.stringify(words('big', 'opposite').slice(0, 1)) === '["small"]', words('cold', 'similar'));
check('Gemini words gain gemini links; non-entries, itself and already-linked are skipped',
  JSON.stringify(words('cold', 'similar', 'gemini')) === '["wintry"]' && JSON.stringify(words('big', 'similar', 'gemini')) === '["huge"]'
  && JSON.stringify(words('cold', 'opposite', 'gemini')) === '["warm"]', [merged.get('cold'), merged.get('big')]);
check('caps hold (5 similar, 3 opposite), counting WordNet first', [...merged.values()].every((l) => l.similar.length <= MAX_SIMILAR && l.opposite.length <= MAX_OPPOSITE));
check('a Gemini opposite gets its reverse link', words('tiny', 'opposite', 'gemini').includes('big') && words('warm', 'opposite', 'gemini').includes('cold'));
check('the reverse opposite is blocked by a full list or an existing similar link',
  words('warm', 'opposite').includes('hot') && !words('hot', 'opposite').includes('warm') && words('hot', 'opposite').length === MAX_OPPOSITE
  && words('icy', 'opposite').includes('cold') && !words('cold', 'opposite').includes('icy'), [merged.get('hot'), merged.get('cold')]);
check('similar links are not made two-way', !words('huge', 'similar').includes('big') && !words('wintry', 'similar').includes('cold'));
check('merging is deterministic', JSON.stringify([...merged]) === JSON.stringify([...mergeGeminiLinks(wnFixture, fixtureRows, (w) => fixtureWords.has(w))]));
check('merging without Gemini rows keeps only WordNet links', [...mergeGeminiLinks(wnFixture, [], (w) => fixtureWords.has(w))]
  .every(([, l]) => [...l.similar, ...l.opposite].every((x) => x.source === 'wordnet')));

// The built database.
const db = new Database('data/dictionary.db', { readonly: true });
const rows = db.prepare(`SELECT e.normalized w, r.kind, t.normalized o, e.pos wp, t.pos op FROM related r
  JOIN entries e ON e.id = r.entry_id JOIN entries t ON t.id = r.related_id`).all() as { w: string; kind: string; o: string; wp: string; op: string }[];
const orphans = (db.prepare(`SELECT count(*) n FROM related r LEFT JOIN entries e ON e.id = r.related_id WHERE e.id IS NULL`).get() as { n: number }).n;
check(`every link in the database opens an entry (${rows.length} links)`, rows.length > 0 && orphans === 0);
check('linked words share a part of speech', rows.every((r) => wnPosesOf(r.wp).some((p) => wnPosesOf(r.op).includes(p))),
  rows.find((r) => !wnPosesOf(r.wp).some((p) => wnPosesOf(r.op).includes(p))));
const cols = (db.prepare('PRAGMA table_info(related)').all() as { name: string }[]).map((c) => c.name);
check('related has a source column', cols.includes('source'), cols);
const dbCounts = db.prepare(`SELECT entry_id, kind, count(*) n FROM related GROUP BY entry_id, kind`).all() as { kind: string; n: number }[];
check('no word in the database exceeds 5 similar or 3 opposite', dbCounts.every((c) => c.n <= (c.kind === 'similar' ? MAX_SIMILAR : MAX_OPPOSITE)));
check('WordNet links of sample words are kept with source wordnet', cols.includes('source') && ['rich:poor', 'buy:sell', 'accept:reject', 'true:false'].every((pair) => {
  const [w, o] = pair.split(':');
  return (db.prepare(`SELECT count(*) n FROM related r JOIN entries e ON e.id = r.entry_id JOIN entries t ON t.id = r.related_id
    WHERE e.normalized = ? AND t.normalized = ? AND r.kind = 'opposite' AND r.source = 'wordnet'`).get(w, o) as { n: number }).n === 1;
}));
check('above ↔ below in the book', rows.some((r) => r.w === 'above' && r.kind === 'opposite' && r.o === 'below')
  && rows.some((r) => r.w === 'below' && r.kind === 'opposite' && r.o === 'above'));

// Review asks "which word means the opposite?" only for known words that have one.
const later = { box: 2, due_at: 0, right: 2, wrong: 0 };
check('the opposite question is only asked for words that have an opposite',
  [0, 1, 2, 3, 4, 5, 6, 7].every((s) => questionKind(later, s, false) !== 'opposite')
  && [0, 1, 2, 3].some((s) => questionKind(later, s, true) === 'opposite'));
check('new and shaky words never get the opposite question', [0, 1, 2, 3].every((s) => questionKind(undefined, s, true) === 'meaning'));

if (failures) { console.error(`\n${failures} related-word check(s) failed.`); process.exit(1); }
console.log('Related word checks passed.');
