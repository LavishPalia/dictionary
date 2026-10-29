// Checks the lookup history store (src/lib/history.ts). Usage: npx tsx scripts/test-history.ts
import {
  isHistoryWord, recordLookup, touchWord, removeWord, markNudged, shouldNudge, foldRecent, mergeHistory, clearHistory,
  loadHistory, sourceLabel, HISTORY_MAX, type HistoryWord,
} from '../src/lib/history';

let failures = 0;
function check(label: string, ok: boolean, detail?: unknown) {
  if (ok) console.log(`✓ ${label}`);
  else { failures++; console.error(`✗ ${label}${detail !== undefined ? ` — ${JSON.stringify(detail)}` : ''}`); }
}

const T = Date.UTC(2026, 9, 29, 10);
const MIN = 60_000;
const DAY = 86_400_000;
const obf = { normalized: 'obfuscate', headword: 'obfuscate', meaning_hi: 'अस्पष्ट करना' };

const first = recordLookup([], obf, 'share', T);
check('first lookup', first.length === 1 && first[0].count === 1 && JSON.stringify(first[0].lookups) === `[${T}]`
  && first[0].first_at === T && first[0].last_at === T && first[0].source === 'share' && first[0].page === null, first);

const second = recordLookup(first, obf, 'book', T + 9 * MIN) ;
const secondW = recordLookup(first, { ...obf, page: 412 }, 'book', T + 9 * MIN)[0];
check('repeat within 10 min', second[0].count === 1 && secondW.count === 1 && secondW.lookups.length === 1
  && secondW.last_at === T + 9 * MIN && secondW.source === 'book' && secondW.page === 412, secondW);
const third = recordLookup([secondW], obf, 'book', T + 21 * MIN)[0];
check('repeat after 10 min counts', third.count === 2 && third.lookups.length === 2, third);

const a = { normalized: 'a', headword: 'a' }, b = { normalized: 'b', headword: 'b' };
let list = recordLookup([], a, 'search', T);
list = recordLookup(list, b, 'search', T + MIN);
list = recordLookup(list, a, 'search', T + 20 * MIN);
check('newest first', list.map((w) => w.normalized).join() === 'a,b', list);

let big: HistoryWord[] = [];
for (let i = 0; i < HISTORY_MAX + 1; i++) big = recordLookup(big, { normalized: `w${i}`, headword: `w${i}` }, 'search', T + i);
check('cap', big.length === HISTORY_MAX && big[0].normalized === `w${HISTORY_MAX}` && !big.some((w) => w.normalized === 'w0'), big.length);

const old = recordLookup([], obf, 'search', T);
const later = recordLookup(old, obf, 'search', T + 31 * DAY)[0];
check('30-day window', later.count === 2 && later.lookups.length === 1 && later.lookups[0] === T + 31 * DAY, later);

const kept = recordLookup(first, { normalized: 'obfuscate', headword: 'obfuscate' }, 'search', T + 20 * MIN)[0];
check('meaning kept', kept.meaning_hi === 'अस्पष्ट करना', kept);

const ab = recordLookup(recordLookup([], a, 'search', T), b, 'search', T + MIN);
const touched = touchWord(ab, 'a', T + 5 * MIN);
check('touchWord', touched[0].normalized === 'a' && touched[0].last_at === T + 5 * MIN && touched[0].count === 1
  && touched[0].lookups.length === 1 && touched.length === 2, touched);
check('touchWord unknown', JSON.stringify(touchWord(ab, 'zzz', T + 5 * MIN)) === JSON.stringify(ab));

const mk = (lookups: number[], extra: Partial<HistoryWord> = {}): HistoryWord => ({
  normalized: 'x', headword: 'x', meaning_hi: '', first_at: lookups[0] ?? T, last_at: lookups[lookups.length - 1] ?? T,
  count: lookups.length, lookups, source: 'search', page: null, ...extra,
});
check('shouldNudge week', JSON.stringify(shouldNudge(mk([T, T + DAY, T + 2 * DAY]), false, T + 2 * DAY)) === '{"times":3,"span":"week"}');
check('shouldNudge month', shouldNudge(mk([T - 10 * DAY, T + DAY, T + 2 * DAY]), false, T + 2 * DAY)?.span === 'month');
check('shouldNudge saved', shouldNudge(mk([T, T + DAY, T + 2 * DAY]), true, T + 2 * DAY) === null);
check('shouldNudge nudged', shouldNudge(mk([T, T + DAY, T + 2 * DAY], { nudged: true }), false, T + 2 * DAY) === null);
check('shouldNudge two lookups', shouldNudge(mk([T, T + DAY]), false, T + DAY) === null);
check('shouldNudge undefined', shouldNudge(undefined, false, T) === null);

const two = [mk([T]), { ...mk([T]), normalized: 'y' }];
const nudged = markNudged(two, 'y');
check('markNudged', nudged[1].nudged === true && nudged[0].nudged !== true);
const removed = removeWord(two, 'x');
check('removeWord', removed.length === 1 && removed[0].normalized === 'y');

const full = mk([T]);
check('isHistoryWord accepts', isHistoryWord(full));
check('isHistoryWord rejects missing normalized', !isHistoryWord({ ...full, normalized: undefined }));
check('isHistoryWord rejects non-array lookups', !isHistoryWord({ ...full, lookups: 'x' }));
check('isHistoryWord rejects unknown source', !isHistoryWord({ ...full, source: 'carrier-pigeon' }));
check('isHistoryWord rejects string page', !isHistoryWord({ ...full, page: '12' }));

const folded = foldRecent([{ headword: 'Camel', page: 16 }, { headword: 'heal', page: 40 }, 'junk'], T);
check('foldRecent', folded.length === 2 && folded[0].normalized === 'camel' && folded[1].normalized === 'heal'
  && folded.every((w) => w.source === 'search' && w.count === 1) && folded[0].page === 16 && folded[1].page === 40, folded);
check('foldRecent non-array', foldRecent('nope', T).length === 0);

const m1 = [mk([T, T + 20 * MIN], { count: 5, source: 'voice', page: 3, last_at: T + 20 * MIN, first_at: T })];
const m2 = [mk([T - DAY, T + 40 * MIN], { count: 2, source: 'book', page: 9, last_at: T + 40 * MIN, first_at: T - DAY, nudged: true })];
const merged = mergeHistory(m1, m2);
check('mergeHistory', merged.length === 1 && merged[0].first_at === T - DAY && merged[0].last_at === T + 40 * MIN
  && merged[0].count === 5 && merged[0].lookups.length === 4 && merged[0].nudged === true
  && merged[0].source === 'book' && merged[0].page === 9, merged);
const mo = mergeHistory([{ ...mk([T]), normalized: 'old', last_at: T }], [{ ...mk([T + DAY]), normalized: 'new', last_at: T + DAY }]);
check('mergeHistory sorted', mo.map((w) => w.normalized).join() === 'new,old', mo);
const bigA = Array.from({ length: 700 }, (_, i) => ({ ...mk([T + i]), normalized: `a${i}`, last_at: T + i }));
const bigB = Array.from({ length: 700 }, (_, i) => ({ ...mk([T + i]), normalized: `b${i}`, last_at: T + i }));
check('mergeHistory cap', mergeHistory(bigA, bigB).length === HISTORY_MAX);

check('sourceLabel', sourceLabel(mk([T], { source: 'search' })) === 'searched' && sourceLabel(mk([T], { source: 'voice' })) === 'spoken'
  && sourceLabel(mk([T], { source: 'share' })) === 'shared' && sourceLabel(mk([T], { source: 'book', page: 412 })) === 'on page 412'
  && sourceLabel(mk([T], { source: 'book', page: null })) === 'in the book' && sourceLabel(mk([T], { source: 'other' })) === '');

function stub(init: Record<string, string>) {
  const store = new Map(Object.entries(init));
  (globalThis as { localStorage?: unknown }).localStorage = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => { store.set(k, v); },
    removeItem: (k: string) => { store.delete(k); },
  };
  return store;
}
stub({ panna_history: JSON.stringify([full, { x: 1 }, null]) });
check('loadHistory drops broken items', loadHistory().length === 1);
const store = stub({ panna_recent_searches: JSON.stringify([{ headword: 'Camel', page: 16 }]) });
const loaded = loadHistory();
check('loadHistory folds recent once and saves', loaded.length === 1 && loaded[0].normalized === 'camel' && store.has('panna_history'), loaded);
check('loadHistory removes the old recents key after folding', !store.has('panna_recent_searches'));
store.set('panna_recent_searches', '[{"headword":"Heal"}]');
clearHistory();
check('clearHistory empties history and leaves no old recents', store.get('panna_history') === '[]' && !store.has('panna_recent_searches'));

if (failures) { console.error(`\n${failures} check(s) failed`); process.exit(1); }
console.log('\nAll history checks passed');
