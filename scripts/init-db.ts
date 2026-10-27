// Builds data/dictionary.db (SQLite + FTS5) from committed sources. Run by `npm run build:data` (predev/prebuild).
//
// Phase 2 contents: the 453 hand-written editorial entries + the closed-class layer (data/sources/closed-class-words.jsonl).
// Pages are dense and data-driven: entries are collated alphabetically and laid out 8 per page (4 per column),
// starting at page 1. No page numbers are hard-coded anywhere.
//
// Deterministic: the same sources always produce the same rows (verify with `npm run verify:determinism`).
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import Database from 'better-sqlite3';
import { DictionaryEntry } from '../src/lib/types';
import { normalizeHindi } from '../src/lib/hindi';
import { HINDI_STOPWORDS, hinglishKey, romanize } from '../src/lib/hinglish';
import { SEED_ENTRIES } from './seed-entries';
import { COMPANION_PAGES } from './companion-entries';
import { EXPANDED_PAGES } from './expanded-entries';
import { SOURCES_DIR, WordNet, loadAgid, verifyChecksums } from './lib/lexicon';
import { GeminiRow, findRelated, mergeGeminiLinks } from './lib/related';
import { GeneratedGloss, toPhase4Entry } from './lib/phase4';

const RELATED_GEMINI_FILE = path.join(SOURCES_DIR, 'related-gemini.jsonl');
export const DB_PATH = path.join(process.cwd(), 'data', 'dictionary.db');
export const ENTRIES_PER_COLUMN = 4;
export const ENTRIES_PER_PAGE = ENTRIES_PER_COLUMN * 2;

type SourceEntry = Omit<DictionaryEntry, 'id' | 'page_number' | 'column' | 'position_in_column'> & { reviewed: 0 | 1 };

interface LaidOutEntry extends SourceEntry {
  id: string;
  page_number: number;
  col_idx: 1 | 2;
  position_in_col: number;
}

interface PageRow {
  page_number: number;
  guide_left: string;
  guide_right: string;
  first_headword: string;
  last_headword: string;
  footer_hints: string;
  entry_ids: string[];
}

export interface BuildReport {
  entries: number;
  pages: number;
  editorial: number;
  closed_class: number;
  generated: number;
  /** Editorial headwords that appeared more than once; the first source in precedence order was kept. */
  editorial_duplicates_dropped: string[];
  /** Headwords defined in both layers; the closed-class (everyday function-word) sense was kept. */
  closed_class_overrides: string[];
  /** Similar / opposite links stored. */
  related: number;
  data_version: string;
}

const REQUIRED_FIELDS = ['headword', 'normalized', 'pos', 'pronunciation_deva', 'definition_en', 'meaning_hi',
  'source', 'license_attribution'] as const;

const collator = new Intl.Collator('en', { sensitivity: 'base' });

function validate(e: SourceEntry, origin: string): void {
  for (const f of REQUIRED_FIELDS) {
    if (typeof e[f] !== 'string' || !e[f].trim()) throw new Error(`${origin}: "${e.headword}" has empty ${f}`);
  }
  if (e.normalized !== e.headword.trim().toLowerCase()) {
    throw new Error(`${origin}: normalized "${e.normalized}" does not match headword "${e.headword}"`);
  }
}

/** Merges the source layers into one entry per normalized headword, in collation order. */
export function collectEntries(): { entries: SourceEntry[]; duplicates: string[]; overrides: string[]; editorial: number; closed: number; generated: number } {
  // Editorial precedence for duplicate headwords: seed list, then companion pages, then expanded pages.
  const byPage = (pages: Record<number, Omit<SourceEntry, 'reviewed'>[]>) =>
    Object.keys(pages).map(Number).sort((a, b) => a - b).flatMap((p) => pages[p]);
  const editorialSources = [...SEED_ENTRIES, ...byPage(COMPANION_PAGES), ...byPage(EXPANDED_PAGES)];

  const merged = new Map<string, SourceEntry>();
  const duplicates = new Set<string>();
  for (const raw of editorialSources) {
    const e: SourceEntry = { ...raw, reviewed: 1 };
    validate(e, 'editorial');
    if (merged.has(e.normalized)) duplicates.add(e.normalized);
    else merged.set(e.normalized, e);
  }
  const editorial = merged.size;

  const pinnedInputs = ['data/sources/closed-class-words.jsonl', 'data/sources/infl.txt'];
  const glossFile = path.join(SOURCES_DIR, 'hindi-glosses.jsonl');
  if (fs.existsSync(glossFile)) pinnedInputs.push('data/sources/hindi-glosses.jsonl');
  if (fs.existsSync(RELATED_GEMINI_FILE)) pinnedInputs.push('data/sources/related-gemini.jsonl');
  verifyChecksums(pinnedInputs);
  const closedClass: SourceEntry[] = fs.readFileSync(path.join(SOURCES_DIR, 'closed-class-words.jsonl'), 'utf8')
    .split('\n').filter((l) => l.trim()).map((l) => {
      const { id: _id, ...rest } = JSON.parse(l);
      return { ...rest, reviewed: rest.reviewed === 1 ? 1 : 0 };
    });
  const overrides: string[] = [];
  for (const e of closedClass) {
    validate(e, 'closed-class');
    if (merged.has(e.normalized)) overrides.push(e.normalized);
    merged.set(e.normalized, e);
  }

  let generated = 0;
  if (fs.existsSync(glossFile)) {
    const glosses = fs.readFileSync(glossFile, 'utf8').split('\n').filter((l) => l.trim()).map((l) => JSON.parse(l) as GeneratedGloss);
    for (const g of glosses) {
      const entry = toPhase4Entry(g);
      if (!entry || merged.has(entry.normalized)) continue;
      validate(entry, 'phase-4 gloss');
      merged.set(entry.normalized, entry);
      generated++;
    }
  }

  const entries = [...merged.values()].sort((a, b) =>
    collator.compare(a.headword, b.headword) || (a.normalized < b.normalized ? -1 : a.normalized > b.normalized ? 1 : 0));
  return { entries, duplicates: [...duplicates].sort(), overrides: overrides.sort(), editorial, closed: closedClass.length, generated };
}

export function layOut(entries: SourceEntry[]): { laid: LaidOutEntry[]; pages: PageRow[]; thumbIndex: Record<string, number> } {
  const laid: LaidOutEntry[] = entries.map((e, i) => {
    const slot = i % ENTRIES_PER_PAGE;
    return {
      ...e,
      id: `entry-${e.normalized}`,
      page_number: Math.floor(i / ENTRIES_PER_PAGE) + 1,
      col_idx: slot < ENTRIES_PER_COLUMN ? 1 : 2,
      position_in_col: slot % ENTRIES_PER_COLUMN,
    };
  });

  const pages: PageRow[] = [];
  for (let start = 0; start < laid.length; start += ENTRIES_PER_PAGE) {
    const onPage = laid.slice(start, start + ENTRIES_PER_PAGE);
    const first = onPage[0].headword;
    const last = onPage[onPage.length - 1].headword;
    pages.push({
      page_number: onPage[0].page_number,
      guide_left: first,
      guide_right: last,
      first_headword: first,
      last_headword: last,
      footer_hints: onPage.slice(0, 4).map((e) => `${e.headword} ${e.pronunciation_deva}`).join(' · '),
      entry_ids: onPage.map((e) => e.id),
    });
  }

  // Thumb index: the page holding the first headword of each letter.
  const thumbIndex: Record<string, number> = {};
  for (const e of laid) {
    const letter = e.headword[0].toUpperCase();
    if (/[A-Z]/.test(letter) && !(letter in thumbIndex)) thumbIndex[letter] = e.page_number;
  }
  return { laid, pages, thumbIndex };
}

const SCHEMA = `
CREATE TABLE entries (
  rowid INTEGER PRIMARY KEY,
  id TEXT UNIQUE NOT NULL,
  headword TEXT NOT NULL,
  normalized TEXT UNIQUE NOT NULL,
  pos TEXT NOT NULL,
  pronunciation_deva TEXT NOT NULL,
  definition_en TEXT NOT NULL,
  meaning_hi TEXT NOT NULL,
  source TEXT NOT NULL,
  license_attribution TEXT NOT NULL,
  reviewed INTEGER NOT NULL DEFAULT 0,
  -- Search-only copies with Hindi spelling variants folded (src/lib/hindi.ts); never printed.
  meaning_hi_search TEXT NOT NULL,
  pronunciation_search TEXT NOT NULL,
  -- SUBTLEX-US frequency rank (1 = most common); NULL for words outside the ranked list. Orders Hindi results.
  freq_rank INTEGER,
  page_number INTEGER NOT NULL,
  col_idx INTEGER NOT NULL,
  position_in_col INTEGER NOT NULL
);
CREATE INDEX idx_entries_page ON entries(page_number);

-- Inflection redirects; populated from AGID in Phase 3.
CREATE TABLE forms (
  normalized_form TEXT NOT NULL,
  form TEXT NOT NULL,
  lemma_id TEXT NOT NULL REFERENCES entries(id),
  lemma_headword TEXT NOT NULL,
  page_number INTEGER NOT NULL,
  PRIMARY KEY (normalized_form, lemma_id)
);

-- Similar and opposite words (WordNet 3.1 first, then Gemini's; scripts/lib/related.ts); both ends are Panna entries.
CREATE TABLE related (
  entry_id TEXT NOT NULL REFERENCES entries(id),
  kind TEXT NOT NULL CHECK (kind IN ('similar', 'opposite')),
  rank INTEGER NOT NULL,
  related_id TEXT NOT NULL REFERENCES entries(id),
  source TEXT NOT NULL DEFAULT 'wordnet' CHECK (source IN ('wordnet', 'gemini')),
  PRIMARY KEY (entry_id, kind, rank)
);

-- Hinglish search keys (src/lib/hinglish.ts): each Hindi meaning, and each word in it, as a loose Latin key.
-- whole = 1 when hi is a complete meaning (छोड़ना), 0 for a word inside one (त्याग in त्याग देना).
CREATE TABLE hinglish (
  key TEXT NOT NULL,
  entry_id TEXT NOT NULL REFERENCES entries(id),
  hi TEXT NOT NULL,
  whole INTEGER NOT NULL,
  PRIMARY KEY (key, entry_id, hi)
) WITHOUT ROWID;

CREATE TABLE pages (
  page_number INTEGER PRIMARY KEY,
  guide_left TEXT NOT NULL,
  guide_right TEXT NOT NULL,
  first_headword TEXT NOT NULL,
  last_headword TEXT NOT NULL,
  footer_hints TEXT NOT NULL,
  entry_ids TEXT NOT NULL
);

CREATE TABLE meta (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE VIRTUAL TABLE entries_fts USING fts5(
  headword,
  normalized,
  meaning_hi_search,
  pronunciation_search,
  content='entries',
  content_rowid='rowid',
  tokenize = "unicode61 categories 'L* N* Co Mn Mc'"
);
`;

/** Builds the database at outPath (replacing it) and returns a summary. */
export function buildDatabase(outPath = DB_PATH): BuildReport {
  const { entries, duplicates, overrides, editorial, closed, generated } = collectEntries();
  const { laid, pages, thumbIndex } = layOut(entries);
  verifyChecksums(['data/sources/infl.txt', 'data/sources/lemmas.jsonl']);
  const agid = loadAgid();
  const freqRank = new Map<string, number>();
  for (const line of fs.readFileSync(path.join(SOURCES_DIR, 'lemmas.jsonl'), 'utf8').split(/\r?\n/)) {
    if (!line.trim()) continue;
    const { lemma, rank } = JSON.parse(line) as { lemma: string; rank: number };
    if (!freqRank.has(lemma)) freqRank.set(lemma, rank);
  }
  const entryByWord = new Map(laid.map((e) => [e.normalized, e]));
  const wordnetLinks = findRelated(new WordNet(), new Map(laid.map((e) => [e.normalized, e.pos])), freqRank);
  // Gemini's links (collectEntries has already verified the file's checksum) go after WordNet's.
  const geminiRows: GeminiRow[] = fs.existsSync(RELATED_GEMINI_FILE)
    ? fs.readFileSync(RELATED_GEMINI_FILE, 'utf8').split(/\r?\n/).filter((l) => l.trim()).map((l) => JSON.parse(l) as GeminiRow)
    : [];
  const related = [...mergeGeminiLinks(wordnetLinks, geminiRows, (w) => entryByWord.has(w))]
    .flatMap(([word, r]) => (['similar', 'opposite'] as const).flatMap((kind) => r[kind].map((link, rank) => ({
      entry_id: entryByWord.get(word)!.id, kind, rank, related_id: entryByWord.get(link.word)!.id, source: link.source,
    }))));

  // Content hash of everything the client can see; used to version /api/page caching.
  const dataVersion = crypto.createHash('sha256')
    .update(JSON.stringify({ laid, pages, thumbIndex, related }))
    .digest('hex').slice(0, 12);

  // Build into a temp file and swap it in, so a reader never sees a half-written database.
  const tmpPath = `${outPath}.tmp`;
  for (const f of [tmpPath, `${tmpPath}-journal`]) fs.rmSync(f, { force: true });
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  const db = new Database(tmpPath);
  try {
    db.exec(SCHEMA);
    const insertEntry = db.prepare(`INSERT INTO entries (rowid, id, headword, normalized, pos, pronunciation_deva,
      definition_en, meaning_hi, source, license_attribution, reviewed, meaning_hi_search, pronunciation_search, freq_rank,
      page_number, col_idx, position_in_col)
      VALUES (@rowid, @id, @headword, @normalized, @pos, @pronunciation_deva, @definition_en, @meaning_hi, @source,
      @license_attribution, @reviewed, @meaning_hi_search, @pronunciation_search, @freq_rank, @page_number, @col_idx,
      @position_in_col)`);
    const insertPage = db.prepare(`INSERT INTO pages (page_number, guide_left, guide_right, first_headword,
      last_headword, footer_hints, entry_ids) VALUES (@page_number, @guide_left, @guide_right, @first_headword,
      @last_headword, @footer_hints, @entry_ids)`);
    const insertForm = db.prepare(`INSERT OR IGNORE INTO forms (normalized_form, form, lemma_id, lemma_headword, page_number)
      VALUES (?, ?, ?, ?, ?)`);
    const insertMeta = db.prepare('INSERT INTO meta (key, value) VALUES (?, ?)');
    const insertHinglish = db.prepare('INSERT OR IGNORE INTO hinglish (key, entry_id, hi, whole) VALUES (?, ?, ?, ?)');
    const insertRelated = db.prepare(`INSERT INTO related (entry_id, kind, rank, related_id, source)
      VALUES (@entry_id, @kind, @rank, @related_id, @source)`);

    db.transaction(() => {
      laid.forEach((e, i) => insertEntry.run({
        rowid: i + 1, id: e.id, headword: e.headword, normalized: e.normalized, pos: e.pos,
        pronunciation_deva: e.pronunciation_deva, definition_en: e.definition_en, meaning_hi: e.meaning_hi,
        source: e.source, license_attribution: e.license_attribution, reviewed: e.reviewed,
        meaning_hi_search: normalizeHindi(e.meaning_hi), pronunciation_search: normalizeHindi(e.pronunciation_deva),
        freq_rank: freqRank.get(e.normalized) ?? null,
        page_number: e.page_number, col_idx: e.col_idx, position_in_col: e.position_in_col,
      }));
      for (const p of pages) insertPage.run({ ...p, entry_ids: JSON.stringify(p.entry_ids) });
      for (const r of related) insertRelated.run(r);
      for (const e of laid) {
        for (const meaning of e.meaning_hi.split(/[,;]/).map((m) => m.replace(/\([^)]*\)/g, '').trim()).filter(Boolean)) {
          const words = meaning.split(/\s+/);
          const phraseKeys = (words.length === 1 ? romanize(meaning) : words.map(romanize).reduce<string[]>(
            (acc, forms) => acc.flatMap((a) => forms.map((f) => a + f)), ['']));
          for (const r of phraseKeys) { const key = hinglishKey(r); if (key.length >= 2) insertHinglish.run(key, e.id, meaning, 1); }
          if (words.length === 1) continue;
          for (const word of words) {
            if (HINDI_STOPWORDS.has(word)) continue;
            for (const r of romanize(word)) { const key = hinglishKey(r); if (key.length >= 2) insertHinglish.run(key, e.id, word, 0); }
          }
        }
      }
      for (const [form, parents] of agid.formToParents) {
        for (const { lemma } of parents) {
          const entry = entryByWord.get(lemma);
          if (entry && form !== entry.normalized) insertForm.run(form, form, entry.id, entry.headword, entry.page_number);
        }
      }
      insertMeta.run('data_version', dataVersion);
      insertMeta.run('total_pages', String(pages.length));
      insertMeta.run('total_entries', String(laid.length));
      insertMeta.run('thumb_index', JSON.stringify(thumbIndex));
      db.exec(`INSERT INTO entries_fts(entries_fts) VALUES('rebuild')`);
    })();
  } finally {
    db.close();
  }
  for (const f of [`${outPath}-journal`, `${outPath}-wal`, `${outPath}-shm`]) fs.rmSync(f, { force: true });
  fs.renameSync(tmpPath, outPath);

  return {
    entries: laid.length,
    pages: pages.length,
    editorial,
    closed_class: closed,
    generated,
    related: related.length,
    editorial_duplicates_dropped: duplicates,
    closed_class_overrides: overrides,
    data_version: dataVersion,
  };
}

if (require.main === module) {
  try {
    const report = buildDatabase();
    console.log(`✓ Built ${path.relative(process.cwd(), DB_PATH)}: ${report.entries} entries on ${report.pages} pages ` +
      `(${report.editorial} editorial + ${report.closed_class} closed-class + ${report.generated} generated), ` +
      `${report.related} similar/opposite links, data version ${report.data_version}`);
    if (report.editorial_duplicates_dropped.length) {
      console.log(`  ${report.editorial_duplicates_dropped.length} duplicate editorial headwords kept once: ` +
        report.editorial_duplicates_dropped.join(', '));
    }
    if (report.closed_class_overrides.length) {
      console.log(`  Closed-class sense kept over editorial entry: ${report.closed_class_overrides.join(', ')}`);
    }
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code === 'EBUSY' || code === 'EPERM') {
      console.error(`Cannot replace ${DB_PATH}: it is open in another process (stop \`npm run dev\` and retry).`);
    } else {
      console.error(err);
    }
    process.exit(1);
  }
}
