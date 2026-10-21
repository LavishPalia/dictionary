// Server-only dictionary access. Reads data/dictionary.db (built by scripts/init-db.ts) with better-sqlite3.
// Never import this from a client component.
import path from 'path';
import Database from 'better-sqlite3';
import { BookMeta, BookPage, DictionaryEntry } from './types';
import { damerauLevenshtein } from './search-distance';

const DB_FILE = path.join(process.cwd(), 'data', 'dictionary.db');

interface EntryRow {
  id: string;
  headword: string;
  normalized: string;
  pos: string;
  pronunciation_deva: string;
  definition_en: string;
  meaning_hi: string;
  source: string;
  license_attribution: string;
  reviewed: number;
  page_number: number;
  col_idx: number;
  position_in_col: number;
}

interface PageRow {
  page_number: number;
  guide_left: string;
  guide_right: string;
  first_headword: string;
  last_headword: string;
  footer_hints: string;
}

export interface SearchResult {
  headword: string;
  normalized: string;
  page_number: number;
  preview: string;
  matched_form?: string;
  suggestion?: boolean;
}

// One read-only connection per server process (kept on globalThis so dev-mode HMR doesn't leak handles).
const globalForDb = globalThis as unknown as { __pannaDb?: Database.Database };

function db(): Database.Database {
  if (!globalForDb.__pannaDb) {
    globalForDb.__pannaDb = new Database(DB_FILE, { readonly: true, fileMustExist: true });
  }
  return globalForDb.__pannaDb;
}

function toEntry(r: EntryRow): DictionaryEntry {
  return {
    id: r.id,
    headword: r.headword,
    normalized: r.normalized,
    pos: r.pos,
    pronunciation_deva: r.pronunciation_deva,
    definition_en: r.definition_en,
    meaning_hi: r.meaning_hi,
    source: r.source,
    license_attribution: r.license_attribution,
    reviewed: r.reviewed ? 1 : 0,
    page_number: r.page_number,
    column: r.col_idx === 2 ? 2 : 1,
    position_in_column: r.position_in_col,
  };
}

let cachedMeta: BookMeta | null = null;

export function getMeta(): BookMeta {
  if (!cachedMeta) {
    const rows = db().prepare('SELECT key, value FROM meta').all() as { key: string; value: string }[];
    const m = Object.fromEntries(rows.map((r) => [r.key, r.value]));
    cachedMeta = {
      total_pages: Number(m.total_pages),
      total_entries: Number(m.total_entries),
      thumb_index: JSON.parse(m.thumb_index),
      data_version: m.data_version,
    };
  }
  return cachedMeta;
}

export function getPage(pageNum: number): BookPage | null {
  if (!Number.isInteger(pageNum)) return null;
  const page = db().prepare('SELECT * FROM pages WHERE page_number = ?').get(pageNum) as PageRow | undefined;
  if (!page) return null;
  const entries = (db().prepare(
    'SELECT * FROM entries WHERE page_number = ? ORDER BY col_idx, position_in_col',
  ).all(pageNum) as EntryRow[]).map(toEntry);
  return {
    page_number: page.page_number,
    first_headword: page.first_headword,
    last_headword: page.last_headword,
    guide_left: page.guide_left,
    guide_right: page.guide_right,
    footer_hints: page.footer_hints,
    column1: entries.filter((e) => e.column === 1),
    column2: entries.filter((e) => e.column === 2),
  };
}

/** Left page of the two-page spread that shows pageNum (left pages are even; page 1 faces the endpaper). */
export function spreadLeft(pageNum: number): number {
  return pageNum % 2 === 0 ? pageNum : pageNum - 1;
}

/** The existing pages of the spread containing pageNum. */
export function getSpreadPages(pageNum: number): BookPage[] {
  const left = spreadLeft(pageNum);
  return [getPage(left), getPage(left + 1)].filter((p): p is BookPage => p !== null);
}

export function getWordEntry(headword: string): {
  entry: DictionaryEntry | null;
  pageNumber: number | null;
  neighbours: DictionaryEntry[];
  redirectedFrom?: string;
} {
  const norm = headword.toLowerCase().trim();
  const exact = db().prepare('SELECT * FROM entries WHERE normalized = ?').get(norm) as EntryRow | undefined;
  const form = exact ? undefined : db().prepare(`SELECT e.* FROM forms f JOIN entries e ON e.id = f.lemma_id
    WHERE f.normalized_form = ? ORDER BY e.normalized LIMIT 1`).get(norm) as EntryRow | undefined;
  const row = exact ?? form;
  if (!row) return { entry: null, pageNumber: null, neighbours: [] };
  const page = getPage(row.page_number);
  return {
    entry: toEntry(row),
    pageNumber: row.page_number,
    neighbours: page ? [...page.column1, ...page.column2] : [],
    ...(form ? { redirectedFrom: headword } : {}),
  };
}

const DEVANAGARI = /[ऀ-ॿ]/;

function escapeLike(s: string): string {
  return s.replace(/[\\%_]/g, (c) => `\\${c}`);
}

function prefixUpperBound(prefix: string): string {
  const last = prefix.codePointAt(0)!;
  return String.fromCodePoint(last + 1);
}

/**
 * Headword search. Latin: exact match, then prefix (B-tree range on `normalized`), then substring, then
 * definition text. Devanagari: FTS5 prefix match on the Hindi meaning and the Devanagari pronunciation.
 */
export function searchWords(query: string, limit: number = 8): SearchResult[] {
  const q = query.toLowerCase().trim();
  if (!q) return [];

  const seen = new Set<string>();
  const results: SearchResult[] = [];
  const add = (rows: EntryRow[]) => {
    for (const r of rows) {
      if (results.length >= limit || seen.has(r.normalized)) continue;
      seen.add(r.normalized);
      results.push({ headword: r.headword, normalized: r.normalized, page_number: r.page_number, preview: `${r.pos} ${r.meaning_hi}` });
    }
  };

  if (DEVANAGARI.test(q)) {
    const term = `"${q.replace(/"/g, '""')}"*`;
    add(db().prepare(`
      SELECT e.* FROM entries_fts JOIN entries e ON e.rowid = entries_fts.rowid
      WHERE entries_fts MATCH ? ORDER BY rank LIMIT ?
    `).all(`meaning_hi : ${term} OR pronunciation_deva : ${term}`, limit) as EntryRow[]);
    return results;
  }

  add(db().prepare('SELECT * FROM entries WHERE normalized = ?').all(q) as EntryRow[]);
  if (results.length < limit) {
    const forms = db().prepare(`SELECT e.*, f.form AS matched_form FROM forms f JOIN entries e ON e.id = f.lemma_id
      WHERE f.normalized_form = ? ORDER BY e.normalized LIMIT ?`).all(q, limit) as (EntryRow & { matched_form: string })[];
    for (const r of forms) {
      if (results.length >= limit || seen.has(r.normalized)) continue;
      seen.add(r.normalized);
      results.push({ headword: r.headword, normalized: r.normalized, page_number: r.page_number,
        preview: `${r.pos} ${r.meaning_hi}`, matched_form: r.matched_form });
    }
  }
  add(db().prepare(`
    SELECT * FROM entries WHERE normalized >= ? AND normalized < ?
    ORDER BY length(normalized), normalized LIMIT ?
  `).all(q, `${q}\u{10FFFF}`, limit) as EntryRow[]);
  if (results.length < limit) {
    add(db().prepare(`SELECT * FROM entries WHERE normalized LIKE ? ESCAPE '\\' ORDER BY length(normalized), normalized LIMIT ?`)
      .all(`%${escapeLike(q)}%`, limit) as EntryRow[]);
  }
  if (results.length < limit) {
    add(db().prepare(`SELECT * FROM entries WHERE lower(definition_en) LIKE ? ESCAPE '\\' ORDER BY rowid LIMIT ?`)
      .all(`%${escapeLike(q)}%`, limit) as EntryRow[]);
  }
  if (results.length) return results;

  // A typo scan is intentionally the final fallback. Restrict the pool by initial letter and
  // a narrow length window so the JS distance calculation stays cheap on the full dictionary.
  if (q.length < 3 || q.length > 48 || limit < 1 || !/^[a-z]/.test(q)) return [];
  const lengthSlack = q.length > 6 ? 2 : 1;
  const minLength = Math.max(1, q.length - lengthSlack);
  const maxLength = q.length + lengthSlack;
  const initial = q[0];
  const candidateEntries = db().prepare(`
    SELECT * FROM entries
    WHERE normalized >= ? AND normalized < ? AND length(normalized) BETWEEN ? AND ?
    LIMIT 4000
  `).all(initial, prefixUpperBound(initial), minLength, maxLength) as EntryRow[];
  const candidateForms = db().prepare(`
    SELECT e.*, f.form AS matched_form
    FROM forms f JOIN entries e ON e.id = f.lemma_id
    WHERE f.normalized_form >= ? AND f.normalized_form < ? AND length(f.normalized_form) BETWEEN ? AND ?
    LIMIT 4000
  `).all(initial, prefixUpperBound(initial), minLength, maxLength) as (EntryRow & { matched_form: string })[];
  const ranked = new Map<string, { row: EntryRow; form?: string; distance: number }>();
  for (const row of candidateEntries) {
    const distance = damerauLevenshtein(q, row.normalized);
    const prior = ranked.get(row.normalized);
    if (!prior || distance < prior.distance) ranked.set(row.normalized, { row, distance });
  }
  for (const row of candidateForms) {
    const distance = damerauLevenshtein(q, row.matched_form);
    const prior = ranked.get(row.normalized);
    if (!prior || distance < prior.distance) ranked.set(row.normalized, { row, form: row.matched_form, distance });
  }
  const maxDistance = q.length <= 5 ? 1 : 2;
  return [...ranked.values()]
    .filter((candidate) => candidate.distance > 0 && candidate.distance <= maxDistance)
    .sort((a, b) => a.distance - b.distance || a.row.normalized.localeCompare(b.row.normalized))
    .slice(0, Math.min(3, limit))
    .map(({ row, form }) => ({
      headword: row.headword,
      normalized: row.normalized,
      page_number: row.page_number,
      preview: `${row.pos} ${row.meaning_hi}`,
      ...(form ? { matched_form: form } : {}),
      suggestion: true,
    }));
}
