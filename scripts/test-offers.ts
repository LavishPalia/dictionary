// The first-visit rule (src/lib/first-visit.ts) and which one offer card shows (src/lib/offers.ts).
// The browser side (the swap to the book, the dock and its cards) is test-first-visit-browser.mjs.
// Usage: npx tsx scripts/test-offers.ts
import { FIRST_VISIT_PRE_PAINT, isFirstVisit, READER_KEYS } from '../src/lib/first-visit';
import { INSTALL_AGAIN_AFTER, nextOffer, type OfferState } from '../src/lib/offers';

let checks = 0, failures = 0;
function check(label: string, ok: boolean, detail?: unknown) {
  checks++;
  if (ok) console.log(`✓ ${label}`);
  else { failures++; console.error(`✗ ${label}${detail !== undefined ? ` — ${JSON.stringify(detail)}` : ''}`); }
}

// ── First visit ──
const none = (_k: string) => null;
const has = (key: string, v: string) => (k: string) => (k === key ? v : null);
check('no Panna storage, no query: first visit', isFirstVisit(none, ''));
check('visited before: not first', !isFirstVisit(has('panna_visited', '1'), ''));
for (const k of READER_KEYS) check(`existing reader (${k}): not first`, !isFirstVisit(has(k, k === 'panna_saved_words' ? '[{"normalized":"a"}]' : '{}'), ''));
check('an empty saved list still counts as first', isFirstVisit(has('panna_saved_words', '[]'), ''));
for (const q of ['?share_text=hello', '?share_title=a', '?share_url=https%3A%2F%2Fx.in', '?voice=1', '?open=review', '?missing=%2Fpage%2F80'])
  check(`a launch (${q}): not first`, !isFirstVisit(none, q));
for (const q of ['?utm_source=instagram', '?fbclid=abc', '?gclid=1&utm_medium=cpc'])
  check(`a tracking query (${q}) is still a first visit`, isFirstVisit(none, q));
check('storage throws: not first', !isFirstVisit(() => { throw new Error('blocked'); }, ''));

// The head script follows the same rule (run with a fake page).
function prePaint(path: string, search: string, store: Record<string, string>, throws = false, userAgent = 'Mozilla/5.0 (Linux; Android 14) Chrome/150 Mobile Safari/537.36'): boolean {
  let marked = false;
  const localStorage = { getItem: (k: string) => { if (throws) throw new Error('blocked'); return store[k] ?? null; } };
  const document = { documentElement: { setAttribute: (n: string, v: string) => { if (n === 'data-first-visit' && v === '1') marked = true; } } };
  new Function('location', 'localStorage', 'document', 'navigator', 'URLSearchParams', FIRST_VISIT_PRE_PAINT)({ pathname: path, search }, localStorage, document, { userAgent }, URLSearchParams);
  return marked;
}
check('head script: marks a first visit to /', prePaint('/', '', {}));
check('head script: an empty saved list still marks', prePaint('/', '', { panna_saved_words: '[]' }));
check('head script: not on another address', !prePaint('/page/4', '', {}) && !prePaint('/word/a', '', {}));
check('head script: not with a launch query', !prePaint('/', '?share_text=hello', {}) && !prePaint('/', '?voice=1', {}) && !prePaint('/', '?open=review', {}));
check('head script: a tracking query still marks', prePaint('/', '?utm_source=instagram&fbclid=abc', {}));
for (const ua of ['Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)', 'Mozilla/5.0 (compatible; bingbot/2.0)', 'Mozilla/5.0 (Linux; Android 11; moto g power (2022)) Chrome/120 Mobile Safari/537.36 Chrome-Lighthouse'])
  check(`head script: a crawler (${ua.slice(0, 40)}…) keeps the home page`, !prePaint('/', '', {}, false, ua));
check('head script: not for a visited or existing reader', !prePaint('/', '', { panna_visited: '1' }) && !prePaint('/', '', { panna_settings: '{}' }));
check('head script: blocked storage, no mark and no throw', !prePaint('/', '', {}, true));

// ── Which offer ──
const base: OfferState = { hint: false, lookups: 0, plate: false, bookplateDone: false, install: { possible: true, times: 0, lastAt: null }, now: 1e12 };
check('nothing before a lookup', nextOffer(base) === null);
check('the hint first, whatever else is due', nextOffer({ ...base, hint: true, lookups: 5 }) === 'hint');
check('bookplate after the first lookup', nextOffer({ ...base, lookups: 1 }) === 'bookplate');
check('no bookplate once written or answered', nextOffer({ ...base, lookups: 1, plate: true }) === null && nextOffer({ ...base, lookups: 1, bookplateDone: true }) === null);
check('install waits for the bookplate answer', nextOffer({ ...base, lookups: 2 }) === 'bookplate');
check('install after the second lookup', nextOffer({ ...base, lookups: 2, bookplateDone: true }) === 'install');
check('a written plate also lets install through', nextOffer({ ...base, lookups: 2, plate: true }) === 'install');
check('not after one lookup', nextOffer({ ...base, lookups: 1, bookplateDone: true }) === null);
check('not when install is impossible', nextOffer({ ...base, lookups: 2, bookplateDone: true, install: { possible: false, times: 0, lastAt: null } }) === null);
const once = { possible: true, times: 1, lastAt: base.now - INSTALL_AGAIN_AFTER + 1 };
check('dismissed once: not again within 7 days', nextOffer({ ...base, lookups: 2, bookplateDone: true, install: once }) === null);
check('dismissed once: again after 7 days', nextOffer({ ...base, lookups: 2, bookplateDone: true, install: { ...once, lastAt: base.now - INSTALL_AGAIN_AFTER } }) === 'install');
check('twice: never', nextOffer({ ...base, lookups: 9, bookplateDone: true, install: { possible: true, times: 2, lastAt: 0 } }) === null);

console.log(`\n${checks - failures}/${checks} checks passed`);
if (failures) process.exit(1);
