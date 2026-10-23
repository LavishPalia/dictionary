// Server-only dictionary access. Reads data/dictionary.db (built by scripts/init-db.ts) with better-sqlite3.
// Never import this from a client component.
import path from 'path';
import Database from 'better-sqlite3';
import { BookMeta, BookPage, DictionaryEntry } from './types';
import { damerauLevenshtein } from './search-distance';
import { normalizeHindi } from './hindi';
import { hinglishKey, spellingDistance } from './hinglish';

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

/** Why a search result was returned; the search list groups results by it. */
export type SearchMatch = 'headword' | 'form' | 'definition' | 'hindi' | 'hinglish' | 'pronunciation' | 'suggestion';

export interface SearchResult {
  headword: string;
  normalized: string;
  page_number: number;
  pos: string;
  meaning_hi: string;
  /** Kept for older clients: `${pos} ${meaning_hi}`. */
  preview: string;
  match: SearchMatch;
  matched_form?: string;
  /** Only for Hinglish matches: the Hindi meaning or word that the English letters spelled. */
  matched_hi?: string;
  /** Only for definition matches, so the list can show where the word was found. */
  definition_en?: string;
  suggestion?: boolean;
}

function toResult(r: EntryRow, match: SearchMatch, extra: Partial<SearchResult> = {}): SearchResult {
  return {
    headword: r.headword, normalized: r.normalized, page_number: r.page_number,
    pos: r.pos, meaning_hi: r.meaning_hi, preview: `${r.pos} ${r.meaning_hi}`, match, ...extra,
  };
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

/** Adds each entry's similar and opposite words (one query for the lot). */
function withRelated(entries: DictionaryEntry[]): DictionaryEntry[] {
  if (!entries.length) return entries;
  const rows = db().prepare(`
    SELECT r.entry_id, r.kind, e.headword, e.page_number FROM related r JOIN entries e ON e.id = r.related_id
    WHERE r.entry_id IN (${entries.map(() => '?').join(',')}) ORDER BY r.entry_id, r.kind, r.rank
  `).all(...entries.map((e) => e.id)) as { entry_id: string; kind: 'similar' | 'opposite'; headword: string; page_number: number }[];
  return entries.map((e) => {
    const mine = rows.filter((r) => r.entry_id === e.id);
    if (!mine.length) return e;
    const pick = (kind: 'similar' | 'opposite') =>
      mine.filter((r) => r.kind === kind).map(({ headword, page_number }) => ({ headword, page_number }));
    return { ...e, similar: pick('similar'), opposite: pick('opposite') };
  });
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
  const withLinks = withRelated(entries);
  return {
    page_number: page.page_number,
    first_headword: page.first_headword,
    last_headword: page.last_headword,
    guide_left: page.guide_left,
    guide_right: page.guide_right,
    footer_hints: page.footer_hints,
    column1: withLinks.filter((e) => e.column === 1),
    column2: withLinks.filter((e) => e.column === 2),
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
    entry: withRelated([toEntry(row)])[0],
    pageNumber: row.page_number,
    neighbours: page ? [...page.column1, ...page.column2] : [],
    ...(form ? { redirectedFrom: headword } : {}),
  };
}

const DEVANAGARI = /[ऀ-ॿ]/;

interface HindiSearchRow extends EntryRow {
  meaning_hi_search: string;
  pronunciation_search: string;
  freq_rank: number | null;
}

/**
 * How well a (folded) Devanagari query matches an entry; lower is better.
 * 0: a whole Hindi meaning, or the Devanagari pronunciation, equals the query (ऊपर → Above, स्कूल → School)
 * 1: a Hindi meaning starts with the query (छोड़ → छोड़ना)
 * 2: a word inside a Hindi meaning starts with the query (ऊपर → के ऊपर)
 * 3: only the pronunciation starts with the query
 */
function hindiMatchTier(nq: string, row: HindiSearchRow): number {
  const meanings = row.meaning_hi_search.split(/[,;]/)
    .map((m) => m.replace(/\([^)]*\)/g, '').trim())
    .filter(Boolean);
  if (meanings.includes(nq) || row.pronunciation_search === nq) return 0;
  if (meanings.some((m) => m.startsWith(nq))) return 1;
  if (meanings.some((m) => ` ${m}`.includes(` ${nq}`))) return 2;
  return 3;
}

function escapeLike(s: string): string {
  return s.replace(/[\\%_]/g, (c) => `\\${c}`);
}

function prefixUpperBound(prefix: string): string {
  const last = prefix.codePointAt(0)!;
  return String.fromCodePoint(last + 1);
}

const MAX_HINGLISH = 4;

/**
 * Hindi typed in English letters ("chhod" → छोड़ना). Best first: the query spells a whole Hindi meaning, then a word
 * in one, then the start of a meaning, then the start of a word (only for keys of three letters or more); then the
 * closest spelling (then with the aspirate h's as typed), the closest in length, and the commonest word.
 */
function searchHinglish(q: string): Array<EntryRow & { matched_hi: string }> {
  const key = hinglishKey(q);
  // Three of a letter in a row (zzzzqx) is never Hindi, though folding would shrink it to something that matches.
  if (q.length < 3 || key.length < 2 || /(.)\1\1/.test(q)) return [];
  // The word itself and the verb (key + ना) always; longer words that start with the key, up to a limit (kr has
  // thousands), only for keys of three letters or more.
  const rows = db().prepare(`
    SELECT h.key AS hkey, h.hi AS matched_hi, h.whole, e.* FROM hinglish h JOIN entries e ON e.id = h.entry_id
    WHERE h.key IN (?, ?)
    UNION
    SELECT * FROM (SELECT h.key AS hkey, h.hi AS matched_hi, h.whole, e.* FROM hinglish h JOIN entries e ON e.id = h.entry_id
      WHERE ? >= 3 AND h.key > ? AND h.key < ? LIMIT 2000)
  `).all(key, `${key}n`, key.length, key, `${key}\u{10FFFF}`) as Array<HindiSearchRow & { hkey: string; matched_hi: string; whole: number }>;
  // A verb is often typed as its stem (chhod for छोड़ना), so stem + ना counts as an exact match.
  const tier = (r: { hkey: string; whole: number }) => (r.hkey === key || r.hkey === `${key}n` ? 0 : 2) + (r.whole ? 0 : 1);
  // A verb found through its stem ranks just behind a word spelled exactly (chor: चोर before छोड़ना).
  const length = (r: { hkey: string }) => (r.hkey === `${key}n` ? key.length + 0.5 : r.hkey.length);
  const scored = rows
    // A two-letter key (oont → ut) is too loose to match one word inside a phrase (उठा हुआ); only a whole meaning.
    .filter((r) => key.length >= 3 || (tier(r) === 0))
    .map((r) => ({ ...r, distance: spellingDistance(q, r.matched_hi), exact: spellingDistance(q, r.matched_hi, true) ?? 99 }))
    .filter((r): r is typeof r & { distance: number } => r.distance !== null && (key.length >= 3 || r.distance === 0));
  const best = new Map<string, (typeof scored)[number]>();
  for (const r of scored.sort((a, b) => tier(a) - tier(b) || a.distance - b.distance || a.exact - b.exact || length(a) - length(b)
    || (a.freq_rank ?? Infinity) - (b.freq_rank ?? Infinity) || (a.normalized < b.normalized ? -1 : 1))) {
    if (!best.has(r.normalized)) best.set(r.normalized, r);
  }
  return [...best.values()].slice(0, MAX_HINGLISH);
}

/**
 * Headword search. Latin: exact match, then prefix (B-tree range on `normalized`) alongside Hinglish (searchHinglish),
 * then substring, then definition text. Devanagari: FTS5 prefix match on the variant-folded Hindi meaning and Devanagari
 * pronunciation, ranked by hindiMatchTier and then by word frequency.
 */
export function searchWords(query: string, limit: number = 8): SearchResult[] {
  const q = query.toLowerCase().trim();
  if (!q) return [];

  const seen = new Set<string>();
  const results: SearchResult[] = [];
  const add = (rows: EntryRow[], match: SearchMatch | ((r: EntryRow) => SearchMatch), extra?: (r: EntryRow) => Partial<SearchResult>) => {
    for (const r of rows) {
      if (results.length >= limit || seen.has(r.normalized)) continue;
      seen.add(r.normalized);
      results.push(toResult(r, typeof match === 'function' ? match(r) : match, extra?.(r)));
    }
  };

  if (DEVANAGARI.test(q)) {
    const nq = normalizeHindi(q);
    if (!nq) return [];
    const term = `"${nq.replace(/"/g, '""')}"*`;
    const rows = db().prepare(`
      SELECT e.* FROM entries_fts JOIN entries e ON e.rowid = entries_fts.rowid
      WHERE entries_fts MATCH ? LIMIT 1000
    `).all(`meaning_hi_search : ${term} OR pronunciation_search : ${term}`) as HindiSearchRow[];
    const ranked = rows
      .map((row) => ({ row, tier: hindiMatchTier(nq, row) }))
      .sort((a, b) => a.tier - b.tier
        || (a.row.freq_rank ?? Infinity) - (b.row.freq_rank ?? Infinity)
        || (a.row.normalized < b.row.normalized ? -1 : 1));
    const tierOf = new Map(ranked.map(({ row, tier }) => [row.normalized, tier]));
    add(ranked.map(({ row }) => row), (r) => (tierOf.get(r.normalized) === 3 ? 'pronunciation' : 'hindi'));
    return results;
  }

  add(db().prepare('SELECT * FROM entries WHERE normalized = ?').all(q) as EntryRow[], 'headword');
  if (results.length < limit) {
    const forms = db().prepare(`SELECT e.*, f.form AS matched_form FROM forms f JOIN entries e ON e.id = f.lemma_id
      WHERE f.normalized_form = ? ORDER BY e.normalized LIMIT ?`).all(q, limit) as (EntryRow & { matched_form: string })[];
    add(forms, 'form', (r) => ({ matched_form: (r as EntryRow & { matched_form: string }).matched_form }));
  }
  // Hinglish only when the query is not an English word or a form of one ("hum", "mat" stay English). Its results
  // keep room among the English words that merely start with the query ("pani": Panic…).
  const hinglish = results.length ? [] : searchHinglish(q);
  add(db().prepare(`
    SELECT * FROM entries WHERE normalized >= ? AND normalized < ?
    ORDER BY length(normalized), normalized LIMIT ?
  `).all(q, `${q}\u{10FFFF}`, limit - hinglish.length) as EntryRow[], 'headword');
  add(hinglish, 'hinglish', (r) => ({ matched_hi: (r as EntryRow & { matched_hi: string }).matched_hi }));
  if (results.length < limit) {
    add(db().prepare(`SELECT * FROM entries WHERE normalized LIKE ? ESCAPE '\\' ORDER BY length(normalized), normalized LIMIT ?`)
      .all(`%${escapeLike(q)}%`, limit) as EntryRow[], 'headword');
  }
  if (results.length < limit) {
    add(db().prepare(`SELECT * FROM entries WHERE lower(definition_en) LIKE ? ESCAPE '\\' ORDER BY rowid LIMIT ?`)
      .all(`%${escapeLike(q)}%`, limit) as EntryRow[], 'definition', (r) => ({ definition_en: r.definition_en }));
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
    .map(({ row, form }) => toResult(row, 'suggestion', { ...(form ? { matched_form: form } : {}), suggestion: true }));
}

/** One review card: the word, and three wrong options a learner could plausibly confuse with it. */
type QuizOption = Pick<DictionaryEntry, 'headword' | 'normalized' | 'pos' | 'meaning_hi' | 'definition_en'>;

export interface QuizCard {
  entry: DictionaryEntry;
  distractors: QuizOption[];
  /** For words with an opposite in Panna: "Which word means the opposite?" */
  opposite?: { answer: QuizOption; distractors: QuizOption[] };
}

const toOption = (r: EntryRow): QuizOption =>
  ({ headword: r.headword, normalized: r.normalized, pos: r.pos, meaning_hi: r.meaning_hi, definition_en: r.definition_en });

function relatedRows(entryId: string, kind: 'similar' | 'opposite'): HindiSearchRow[] {
  return db().prepare(`SELECT e.* FROM related r JOIN entries e ON e.id = r.related_id
    WHERE r.entry_id = ? AND r.kind = ? ORDER BY r.rank`).all(entryId, kind) as HindiSearchRow[];
}

/**
 * The opposite question for a word, or undefined if it has no opposite. Wrong options are the word's own similar
 * words first (tempting, and clearly not opposites), then words of the same type and frequency. None is another of
 * its opposites, or similar to one, so exactly one option is right.
 */
function oppositeQuestion(row: HindiSearchRow, nearest: HindiSearchRow[], random: () => number): QuizCard['opposite'] {
  const opposites = relatedRows(row.id, 'opposite');
  if (!opposites.length) return undefined;
  const answer = opposites[0];
  const excluded = new Set([row.normalized, ...opposites.flatMap((o) => [o.normalized, ...relatedRows(o.id, 'similar').map((s) => s.normalized)])]);
  const picked: HindiSearchRow[] = [];
  const similar = relatedRows(row.id, 'similar');
  const fillers = nearest.slice(0, 12);
  for (let i = fillers.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [fillers[i], fillers[j]] = [fillers[j], fillers[i]];
  }
  for (const c of [...similar, ...fillers]) {
    if (picked.length < 3 && !excluded.has(c.normalized) && !picked.some((p) => p.normalized === c.normalized)) picked.push(c);
  }
  return picked.length === 3 ? { answer: toOption(answer), distractors: picked.map(toOption) } : undefined;
}

const primaryPos = (pos: string) => pos.split('&')[0].trim();

// The comma-separated meanings and their words, folded like search, so "छोड़ना" and "छोड़ देना" count as overlapping.
function hindiTokens(meaningSearch: string): Set<string> {
  const tokens = new Set<string>();
  for (const meaning of meaningSearch.split(/[,;]/).map((m) => m.replace(/\([^)]*\)/g, '').trim()).filter(Boolean)) {
    tokens.add(meaning);
    for (const word of meaning.split(' ')) if (word.length > 1 && !['के', 'की', 'का', 'को', 'में', 'से', 'पर', 'है', 'और', 'या'].includes(word)) tokens.add(word);
  }
  return tokens;
}

/**
 * Review cards for saved words. Wrong options share the word's part of speech and are close to it in frequency
 * (so they look like real alternatives), and never share a Hindi meaning or meaning-word with it (so there is
 * exactly one right answer). `random` is injectable so tests can make the choice repeatable.
 */
export function getQuizCards(headwords: string[], random: () => number = Math.random): QuizCard[] {
  const cards: QuizCard[] = [];
  for (const headword of headwords.slice(0, 20)) {
    const row = db().prepare('SELECT * FROM entries WHERE normalized = ?').get(headword.toLowerCase().trim()) as HindiSearchRow | undefined;
    if (!row) continue;
    const answerTokens = hindiTokens(row.meaning_hi_search);
    const rank = row.freq_rank ?? 1_000_000;
    const pos = primaryPos(row.pos);
    const nearest = (samePos: boolean) => db().prepare(`
      SELECT * FROM entries
      WHERE normalized != ? ${samePos ? "AND (pos = ? OR pos LIKE ? || ' &%')" : ''}
      ORDER BY abs(coalesce(freq_rank, 1000000) - ?), normalized
      LIMIT 40
    `).all(...(samePos ? [row.normalized, pos, pos, rank] : [row.normalized, rank])) as HindiSearchRow[];

    const picked: HindiSearchRow[] = [];
    const usable = (c: HindiSearchRow) => c.meaning_hi.trim() && c.definition_en.trim()
      && c.definition_en !== row.definition_en
      && ![...hindiTokens(c.meaning_hi_search)].some((t) => answerTokens.has(t))
      && !picked.some((p) => p.meaning_hi === c.meaning_hi || [...hindiTokens(p.meaning_hi_search)].some((t) => hindiTokens(c.meaning_hi_search).has(t)));
    for (const pool of [nearest(true), nearest(false)]) {
      // Shuffle the 12 closest usable candidates so the same word does not always get the same options.
      const candidates = pool.filter(usable).slice(0, 12);
      for (let i = candidates.length - 1; i > 0; i--) {
        const j = Math.floor(random() * (i + 1));
        [candidates[i], candidates[j]] = [candidates[j], candidates[i]];
      }
      for (const c of candidates) if (picked.length < 3 && usable(c)) picked.push(c);
      if (picked.length === 3) break;
    }
    const opposite = oppositeQuestion(row, nearest(true), random);
    cards.push({ entry: toEntry(row), distractors: picked.map(toOption), ...(opposite ? { opposite } : {}) });
  }
  return cards;
}

/** Current page of each word (normalized), for moving bookmarks and notes after the book is rebuilt. */
export function locateWords(words: string[]): Record<string, number> {
  const unique = [...new Set(words.map((w) => w.toLowerCase().trim()).filter(Boolean))].slice(0, 500);
  if (!unique.length) return {};
  const rows = db().prepare(`SELECT normalized, page_number FROM entries WHERE normalized IN (${unique.map(() => '?').join(',')})`)
    .all(...unique) as { normalized: string; page_number: number }[];
  return Object.fromEntries(rows.map((r) => [r.normalized, r.page_number]));
}

// Grammar words (the, of, and…) make poor words of the day: learners know them, and they have no single meaning.
const GRAMMAR_POS = ['art.', 'prep.', 'pron.', 'det.', 'conj.', 'num.', 'interj.', 'aux. v.', 'modal v.'];

/**
 * The word of the day for a date (YYYY-MM-DD): the same for everyone that day. Drawn from words outside the 1,500
 * most frequent (likely already known) that are not grammar words; falls back to any entry in a small book.
 */
export function getWordOfDay(date: string): DictionaryEntry | null {
  const candidates = db().prepare(`
    SELECT normalized FROM entries
    WHERE freq_rank > 1500 AND ${GRAMMAR_POS.map(() => 'pos NOT LIKE ?').join(' AND ')}
    ORDER BY normalized
  `).all(...GRAMMAR_POS.map((p) => `${p}%`)) as { normalized: string }[];
  const pool = candidates.length ? candidates : (db().prepare('SELECT normalized FROM entries ORDER BY normalized').all() as { normalized: string }[]);
  if (!pool.length) return null;
  // FNV-1a hash of the date picks the same word all day, and a different one tomorrow.
  let hash = 0x811c9dc5;
  for (const ch of date) { hash ^= ch.charCodeAt(0); hash = Math.imul(hash, 0x01000193) >>> 0; }
  const row = db().prepare('SELECT * FROM entries WHERE normalized = ?').get(pool[hash % pool.length].normalized) as EntryRow;
  return withRelated([toEntry(row)])[0];
}
