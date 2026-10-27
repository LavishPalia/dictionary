// Checks candidate selection and suggestion validation for Gemini similar/opposite words.
// Usage: npx tsx scripts/test-related-gemini.ts
import Database from 'better-sqlite3';
import { GRAMMAR_POS } from '../src/lib/book-data';
import { selectCandidates, validateSuggestions, type HeadwordInfo, type HeadwordLookup, type RelatedCandidate } from './lib/related-gemini';

let failures = 0;
function check(label: string, ok: boolean, detail?: unknown) {
  if (ok) console.log(`✓ ${label}`);
  else { failures++; console.error(`✗ ${label}${detail !== undefined ? ` — ${JSON.stringify(detail)}` : ''}`); }
}

const heads: Record<string, HeadwordInfo> = {
  know: { normalized: 'know', pos: 'v. t.', freq_rank: 100 },
  understand: { normalized: 'understand', pos: 'v. t.', freq_rank: 300 },
  realize: { normalized: 'realize', pos: 'v. i.', freq_rank: 900 },
  comprehend: { normalized: 'comprehend', pos: 'v. t.', freq_rank: 5000 },
  table: { normalized: 'table', pos: 'n.', freq_rank: 400 },
  obscure: { normalized: 'obscure', pos: 'v. t.', freq_rank: 30000 },
  grasp: { normalized: 'grasp', pos: 'v. t.', freq_rank: 2000 },
  unranked: { normalized: 'unranked', pos: 'v. t.', freq_rank: null },
  ignore: { normalized: 'ignore', pos: 'v. t.', freq_rank: 700 },
};
const forms: Record<string, string> = { realise: 'realize', knows: 'know' };
const lookup: HeadwordLookup = (w) => heads[forms[w.toLowerCase()] ?? w.toLowerCase()] ?? null;
const cand = (over: Partial<RelatedCandidate> = {}): RelatedCandidate => ({
  normalized: 'know', headword: 'know', pos: 'v. t.', definition_en: '', meaning_hi: '', freq_rank: 100, similar: [], opposite: [], ...over,
});

const a = validateSuggestions(cand(), { similar: ['understand', 'realise', 'knows', 'cognize', 'comprehend'], opposite: [] }, lookup);
check('keeps understand, realize (via forms), comprehend', JSON.stringify(a.similar) === '["understand","realize","comprehend"]', a.similar);
check('rejects own inflection as self', a.rejected.some((r) => r.word === 'knows' && r.reason === 'self'), a.rejected);
check('rejects unknown word as not-in-panna', a.rejected.some((r) => r.word === 'cognize' && r.reason === 'not-in-panna'), a.rejected);

const b = validateSuggestions(cand(), { similar: ['table'], opposite: [] }, lookup);
check('noun for a verb rejected as pos', b.similar.length === 0 && b.rejected[0]?.reason === 'pos', b);

const c = validateSuggestions(cand(), { similar: ['obscure', 'unranked'], opposite: [] }, lookup);
check('rank 30000 rejected as rare', c.rejected.some((r) => r.word === 'obscure' && r.reason === 'rare'), c);
check('null freq_rank treated as rare', c.rejected.some((r) => r.word === 'unranked' && r.reason === 'rare'), c);

const d = validateSuggestions(cand(), { similar: ['grasp'], opposite: ['grasp', 'ignore'] }, lookup);
check('word in both lists rejected from both', d.similar.length === 0 && d.opposite.join() === 'ignore'
  && d.rejected.filter((r) => r.word === 'grasp' && r.reason === 'both-lists').length === 2, d);

const e = validateSuggestions(cand({ similar: ['a', 'b', 'c', 'd'] }), { similar: ['understand', 'realize', 'comprehend'], opposite: [] }, lookup);
check('4 WordNet similar leaves room for 1', e.similar.join() === 'understand' && e.rejected.filter((r) => r.reason === 'cap').length === 2, e);

const f = validateSuggestions(cand({ similar: ['understand'] }), { similar: ['understand', 'grasp', 'grasp'], opposite: [] }, lookup);
check('already-linked and repeated words are duplicates',
  f.similar.join() === 'grasp' && f.rejected.filter((r) => r.reason === 'duplicate').length === 2, f);

const g = validateSuggestions(cand({ opposite: ['x', 'y'] }), { similar: [], opposite: ['ignore', 'grasp'] }, lookup);
check('opposite cap is 3 including WordNet links', g.opposite.join() === 'ignore' && g.rejected.some((r) => r.reason === 'cap'), g);

const db = new Database('data/dictionary.db', { readonly: true });
const cands = selectCandidates(db, 1500);
check('selectCandidates(1500) is about 1,171 items (1,009 have no opposite; 162 more have an opposite but under 2 similar)', cands.length >= 1100 && cands.length <= 1250, cands.length);
check('candidates are content words', cands.every((x) => !GRAMMAR_POS.some((p) => x.pos.startsWith(p))));
check('candidates are sorted by freq_rank and within top', cands.every((x, i) => x.freq_rank <= 1500 && (i === 0 || cands[i - 1].freq_rank <= x.freq_rank)));
check('candidates need links', cands.every((x) => x.similar.length < 2 || x.opposite.length === 0));
console.log(`candidates: ${cands.length}`);
db.close();

if (failures) { console.error(`${failures} check(s) failed.`); process.exit(1); }
console.log('Related Gemini checks passed.');
