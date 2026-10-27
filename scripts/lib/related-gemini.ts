// Gemini suggestions for similar/opposite words: which words need them, and which suggestions may be kept.
import type Database from 'better-sqlite3';
import { GRAMMAR_POS } from '../../src/lib/book-data';
import { MAX_OPPOSITE, MAX_SIMILAR, RARE_RANK, wnPosesOf } from './related';

export interface RelatedCandidate {
  normalized: string; headword: string; pos: string; definition_en: string; meaning_hi: string; freq_rank: number;
  similar: string[]; // existing WordNet links (normalized), in rank order
  opposite: string[];
  forms?: string[]; // the word's own inflections (normalized): one that is also a headword (account/accounting) is 'self'
}
export interface HeadwordInfo { normalized: string; pos: string; freq_rank: number | null }
/** Resolves a word (lower-cased; inflections mapped to their headword through `forms`) to its Panna entry. */
export type HeadwordLookup = (word: string) => HeadwordInfo | null;
export type RejectReason = 'not-in-panna' | 'self' | 'rare' | 'pos' | 'duplicate' | 'both-lists' | 'cap';

/** Content words in the top `top` by frequency that have fewer than 2 WordNet similar words or no WordNet opposite. */
export function selectCandidates(db: Database.Database, top: number): RelatedCandidate[] {
  const hasSource = (db.prepare('PRAGMA table_info(related)').all() as { name: string }[]).some((c) => c.name === 'source');
  const wn = hasSource ? "AND r.source = 'wordnet'" : '';
  const links = db.prepare(`
    SELECT e.normalized AS word, r.kind, t.normalized AS other
    FROM related r JOIN entries e ON e.id = r.entry_id JOIN entries t ON t.id = r.related_id
    WHERE e.freq_rank <= ? ${wn} ORDER BY e.normalized, r.kind, r.rank
  `).all(top) as { word: string; kind: 'similar' | 'opposite'; other: string }[];
  const byWord = new Map<string, { similar: string[]; opposite: string[] }>();
  for (const l of links) {
    const slot = byWord.get(l.word) ?? { similar: [], opposite: [] };
    slot[l.kind].push(l.other);
    byWord.set(l.word, slot);
  }
  const rows = db.prepare(`
    SELECT normalized, headword, pos, definition_en, meaning_hi, freq_rank FROM entries
    WHERE freq_rank <= ? AND ${GRAMMAR_POS.map(() => 'pos NOT LIKE ?').join(' AND ')}
    ORDER BY freq_rank, normalized
  `).all(top, ...GRAMMAR_POS.map((p) => `${p}%`)) as Omit<RelatedCandidate, 'similar' | 'opposite'>[];
  const formRows = db.prepare(`SELECT e.normalized AS word, f.normalized_form AS form FROM forms f
    JOIN entries e ON e.id = f.lemma_id WHERE e.freq_rank <= ?`).all(top) as { word: string; form: string }[];
  const formsOf = new Map<string, string[]>();
  for (const f of formRows) formsOf.set(f.word, [...(formsOf.get(f.word) ?? []), f.form]);
  return rows.map((r) => ({ ...r, ...(byWord.get(r.normalized) ?? { similar: [], opposite: [] }), forms: formsOf.get(r.normalized) ?? [] }))
    .filter((r) => r.similar.length < 2 || r.opposite.length === 0);
}

export function makeLookup(db: Database.Database): HeadwordLookup {
  const direct = db.prepare('SELECT normalized, pos, freq_rank FROM entries WHERE normalized = ?');
  const viaForm = db.prepare(`SELECT e.normalized, e.pos, e.freq_rank FROM forms f JOIN entries e ON e.id = f.lemma_id
    WHERE f.normalized_form = ? ORDER BY e.freq_rank IS NULL, e.freq_rank LIMIT 1`);
  return (word) => {
    const w = word.trim().toLowerCase();
    return (direct.get(w) ?? viaForm.get(w) ?? null) as HeadwordInfo | null;
  };
}

/**
 * Keeps a suggestion only if it is a non-rare Panna headword of the same part-of-speech family, is not the word itself
 * and not already linked. A null freq_rank counts as rare, as for WordNet links. Caps count WordNet links first.
 */
export function validateSuggestions(c: RelatedCandidate, r: { similar: string[]; opposite: string[] },
  lookup: HeadwordLookup): { similar: string[]; opposite: string[]; rejected: Array<{ word: string; reason: RejectReason }> } {
  const rejected: Array<{ word: string; reason: RejectReason }> = [];
  const own = wnPosesOf(c.pos);
  const resolve = (w: string) => lookup(w.trim().toLowerCase());
  const inOpposite = new Set(r.opposite.map((w) => resolve(w)?.normalized).filter(Boolean));
  const inSimilar = new Set(r.similar.map((w) => resolve(w)?.normalized).filter(Boolean));
  const ownForms = new Set(c.forms ?? []);
  const linked = new Set([...c.similar, ...c.opposite]);

  const run = (words: string[], other: Set<string | undefined>, existing: number, max: number) => {
    const kept: string[] = [];
    const seen = new Set<string>();
    for (const word of words) {
      const info = resolve(word);
      const reject = (reason: RejectReason) => { rejected.push({ word, reason }); };
      if (!info) reject('not-in-panna');
      else if (info.normalized === c.normalized || ownForms.has(word.trim().toLowerCase())) reject('self');
      else if (info.freq_rank === null || info.freq_rank > RARE_RANK) reject('rare');
      else if (!wnPosesOf(info.pos).some((p) => own.includes(p))) reject('pos');
      else if (other.has(info.normalized)) reject('both-lists');
      else if (linked.has(info.normalized) || seen.has(info.normalized)) reject('duplicate');
      else {
        seen.add(info.normalized);
        if (existing + kept.length >= max) reject('cap');
        else kept.push(info.normalized);
      }
    }
    return kept;
  };
  const similar = run(r.similar, inOpposite, c.similar.length, MAX_SIMILAR);
  const opposite = run(r.opposite, inSimilar, c.opposite.length, MAX_OPPOSITE);
  return { similar, opposite, rejected };
}
