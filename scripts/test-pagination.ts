// Structural invariants of the built book (data/dictionary.db). No hard-coded page numbers: every expectation
// is derived from the data itself.
// Usage: npm run test:pagination   (after npm run build:data)
import Database from 'better-sqlite3';
import { DB_PATH, ENTRIES_PER_COLUMN, ENTRIES_PER_PAGE, collectEntries } from './init-db';
import { normalizeHindi } from '../src/lib/hindi';

let failures = 0;
function check(label: string, ok: boolean, detail?: unknown) {
  if (ok) console.log(`✓ ${label}`);
  else {
    failures++;
    console.error(`✗ ${label}${detail !== undefined ? ` — ${JSON.stringify(detail)}` : ''}`);
  }
}

console.log('Running pagination & database invariants...');
const db = new Database(DB_PATH, { readonly: true, fileMustExist: true });

interface Row { rowid: number; id: string; headword: string; normalized: string; pos: string; pronunciation_deva: string;
  definition_en: string; meaning_hi: string; page_number: number; col_idx: number; position_in_col: number; reviewed: number;
  meaning_hi_search: string; pronunciation_search: string; freq_rank: number | null }
const entries = db.prepare('SELECT rowid, * FROM entries ORDER BY rowid').all() as Row[];
const pages = db.prepare('SELECT * FROM pages ORDER BY page_number').all() as Array<{ page_number: number;
  first_headword: string; last_headword: string; guide_left: string; guide_right: string; entry_ids: string }>;
const meta = Object.fromEntries((db.prepare('SELECT key, value FROM meta').all() as { key: string; value: string }[])
  .map((r) => [r.key, r.value]));

// 1. Every source entry is printed exactly once.
const expected = collectEntries().entries;
check(`all ${expected.length} source headwords are printed`, entries.length === expected.length,
  { printed: entries.length, expected: expected.length });
const expectedPronunciations = new Map(expected.map((e) => [e.normalized, e.pronunciation_deva]));
const changedPronunciations = entries.filter((e) => expectedPronunciations.get(e.normalized) !== e.pronunciation_deva)
  .map((e) => e.headword);
check('source pronunciations are preserved exactly (including all 453 editorial entries)', changedPronunciations.length === 0,
  changedPronunciations);
check('zero duplicate headwords', new Set(entries.map((e) => e.normalized)).size === entries.length);
check('zero missing fields', entries.every((e) => e.pos && e.pronunciation_deva && e.definition_en && e.meaning_hi),
  entries.filter((e) => !(e.pos && e.pronunciation_deva && e.definition_en && e.meaning_hi)).map((e) => e.headword));

// 2. Strict alphabetical order across the whole book (and therefore within every page).
const collator = new Intl.Collator('en', { sensitivity: 'base' });
const outOfOrder = entries.slice(1).filter((e, i) => collator.compare(entries[i].headword, e.headword) > 0)
  .map((e) => e.headword);
check('strict alphabetical collation across all pages', outOfOrder.length === 0, outOfOrder);

// 3. Pages are contiguous from 1, hold 8 entries (4 per column) except the last, and positions are monotonic.
check('pages are numbered 1..N with no gaps', pages.every((p, i) => p.page_number === i + 1));
check('meta.total_pages matches pages table', Number(meta.total_pages) === pages.length, meta.total_pages);
check('meta.total_entries matches entries table', Number(meta.total_entries) === entries.length, meta.total_entries);
const badSlots = entries.filter((e, i) => {
  const slot = i % ENTRIES_PER_PAGE;
  return e.page_number !== Math.floor(i / ENTRIES_PER_PAGE) + 1
    || e.col_idx !== (slot < ENTRIES_PER_COLUMN ? 1 : 2)
    || e.position_in_col !== slot % ENTRIES_PER_COLUMN;
});
check(`${ENTRIES_PER_PAGE} entries per page (${ENTRIES_PER_COLUMN} per column), monotonic positions`, badSlots.length === 0,
  badSlots.slice(0, 5).map((e) => e.headword));
const lastPageCount = entries.filter((e) => e.page_number === pages.length).length;
check('only the last page may be short', lastPageCount >= 1 && lastPageCount <= ENTRIES_PER_PAGE, lastPageCount);

// 4. Page rows agree with their entries (guide words, entry id lists).
const pageMismatch = pages.filter((p) => {
  const onPage = entries.filter((e) => e.page_number === p.page_number);
  return JSON.stringify(onPage.map((e) => e.id)) !== p.entry_ids
    || p.first_headword !== onPage[0].headword || p.last_headword !== onPage[onPage.length - 1].headword
    || p.guide_left !== p.first_headword || p.guide_right !== p.last_headword;
});
check('guide words and entry lists match the printed entries', pageMismatch.length === 0,
  pageMismatch.map((p) => p.page_number));

// 5. Thumb index points at the page holding each letter's first headword.
const thumb: Record<string, number> = JSON.parse(meta.thumb_index);
const thumbBad = Object.entries(thumb).filter(([letter, page]) =>
  entries.find((e) => e.headword[0].toUpperCase() === letter)?.page_number !== page);
check('thumb index points at each letter\'s first page', thumbBad.length === 0, thumbBad);

// 6. Closed-class layer is present and unreviewed; editorial entries are reviewed.
for (const w of ['the', 'of', 'and', 'be', 'you']) {
  check(`function word "${w}" is printed`, entries.some((e) => e.normalized === w));
}
check('closed-class entries carry reviewed = 0 until checked', entries.filter((e) => e.normalized === 'the')[0]?.reviewed === 0);

// 7. FTS5 index is consistent with the entries table, and Devanagari prefix search works.
try {
  // integrity-check is a special INSERT, so it needs a writable handle (it does not modify the file).
  const rw = new Database(DB_PATH, { fileMustExist: true });
  try { rw.prepare(`INSERT INTO entries_fts(entries_fts) VALUES('integrity-check')`).run(); } finally { rw.close(); }
  check('FTS5 integrity-check passes', true);
} catch (err) {
  check('FTS5 integrity-check passes', false, String(err));
}
const sample = entries.find((e) => e.meaning_hi.length >= 3)!;
const prefix = normalizeHindi([...sample.meaning_hi.split(/[ ,]/)[0]].slice(0, 2).join(''));
const ftsHits = db.prepare(`SELECT rowid FROM entries_fts WHERE entries_fts MATCH ?`)
  .all(`meaning_hi_search : "${prefix}"*`) as { rowid: number }[];
check(`Devanagari prefix "${prefix}" finds "${sample.headword}"`, ftsHits.some((h) => h.rowid === sample.rowid));

// 7b. Search-only columns: Hindi spelling variants are folded, the printed text is untouched, ranks are present.
const unfolded = entries.filter((e) => e.meaning_hi_search !== normalizeHindi(e.meaning_hi)
  || e.pronunciation_search !== normalizeHindi(e.pronunciation_deva)).map((e) => e.headword);
check('search columns hold the folded Hindi meaning and pronunciation', unfolded.length === 0, unfolded.slice(0, 5));
check('folding removes nukta, chandrabindu and half-nasal variants',
  entries.every((e) => !/[़ँॉ]|[ङञणनम]्[क-ह]/.test(e.meaning_hi_search)));
check('printed meanings keep their original spelling', entries.some((e) => e.meaning_hi.includes('ँ')));
const rankOf = (w: string) => entries.find((e) => e.normalized === w)?.freq_rank;
check('frequency ranks are populated (on ranks above above)', (rankOf('on') ?? Infinity) < (rankOf('above') ?? Infinity),
  { on: rankOf('on'), above: rankOf('above') });

// 8. No orphan redirects (forms is populated in Phase 3).
const orphans = db.prepare('SELECT count(*) AS n FROM forms WHERE lemma_id NOT IN (SELECT id FROM entries)').get() as { n: number };
check('zero orphan redirects in forms', orphans.n === 0, orphans.n);
const formCount = (db.prepare('SELECT count(*) AS n FROM forms').get() as { n: number }).n;
check('AGID redirects are populated', formCount > 0, formCount);
const plural = db.prepare(`SELECT e.normalized FROM forms f JOIN entries e ON e.id = f.lemma_id
  WHERE f.normalized_form = 'ceremonies'`).get() as { normalized: string } | undefined;
check('AGID inflection ceremonies resolves to ceremony', plural?.normalized === 'ceremony', plural);

// 9. Example sentences (empty until data/sources/examples.jsonl exists): each belongs to an entry and its blank fits.
const exampleRows = db.prepare(`SELECT x.entry_id, x.en, x.blank_start, x.blank_len, x.exact, e.normalized
  FROM examples x LEFT JOIN entries e ON e.id = x.entry_id`).all() as
  Array<{ entry_id: string; en: string; blank_start: number; blank_len: number; exact: number; normalized: string | null }>;
check('every example belongs to an entry', exampleRows.every((x) => x.normalized !== null),
  exampleRows.filter((x) => x.normalized === null).slice(0, 5));
check('every example blank lies inside its sentence', exampleRows.every((x) =>
  x.blank_start >= 0 && x.blank_len >= 1 && x.blank_start + x.blank_len <= x.en.length), exampleRows.length);
const badBlank = exampleRows.filter((x) => x.exact === 1
  && x.en.substr(x.blank_start, x.blank_len).toLowerCase() !== x.normalized);
check('an exact blank is the headword itself', badBlank.length === 0, badBlank.slice(0, 5));
console.log(`  (${exampleRows.length} example sentences)`);

db.close();
if (failures) {
  console.error(`${failures} invariant(s) failed.`);
  process.exit(1);
}
console.log('All pagination & database invariants passed!');
