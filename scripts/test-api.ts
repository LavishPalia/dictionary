// Smoke test against a running server (npm run dev / npm start). Resolves pages through the API instead of
// assuming page numbers.
// Usage: npx tsx scripts/test-api.ts [baseUrl]
import { CHUNK_PAGES } from '../src/lib/offline';

const BASE = process.argv[2] || 'http://localhost:3000';

let failures = 0;
function check(label: string, ok: boolean, detail?: unknown) {
  if (ok) console.log(`✓ ${label}`);
  else {
    failures++;
    console.error(`✗ ${label}${detail !== undefined ? ` — ${JSON.stringify(detail)}` : ''}`);
  }
}

async function getJson(path: string) {
  const res = await fetch(`${BASE}${path}`);
  return { status: res.status, cache: res.headers.get('cache-control'), body: await res.json() };
}

async function testEndpoints() {
  console.log(`Checking Next.js API endpoints on ${BASE}...\n`);

  const meta = await getJson('/api/meta');
  check('GET /api/meta returns totals, thumb index and data version',
    meta.status === 200 && meta.body.total_pages > 0 && meta.body.thumb_index.A === 1 && !!meta.body.data_version, meta.body);

  const word = await getJson('/api/word/Ceremony');
  check('GET /api/word/Ceremony resolves its page', word.status === 200 && word.body.pageNumber >= 1, word.body);
  const inflected = await getJson('/api/word/ceremonies');
  check('GET /api/word/ceremonies resolves to Ceremony', inflected.status === 200
    && inflected.body.entry?.normalized === 'ceremony' && inflected.body.redirectedFrom === 'ceremonies', inflected.body);
  const pageNum = word.body.pageNumber;

  const page = await getJson(`/api/page/${pageNum}?v=${meta.body.data_version}`);
  const onPage = [...page.body.column1, ...page.body.column2].map((e: { headword: string }) => e.headword);
  check(`GET /api/page/${pageNum} contains Ceremony`, page.status === 200 && onPage.includes('Ceremony'), onPage);
  // Example sentences: present only once examples exist for the word (the fixture or the real data has ceremony).
  const ex = word.body.entry?.example;
  if (ex) {
    check('GET /api/word/Ceremony carries an example with en, hi and a blank',
      typeof ex.en === 'string' && typeof ex.hi === 'string' && Array.isArray(ex.blank) && ex.blank.length === 2
      && ex.en.slice(ex.blank[0], ex.blank[0] + ex.blank[1]).toLowerCase() === 'ceremony', ex);
    const onPageEntry = [...page.body.column1, ...page.body.column2].find((e: { headword: string }) => e.headword === 'Ceremony');
    check(`GET /api/page/${pageNum} carries the same example`, JSON.stringify(onPageEntry?.example) === JSON.stringify(ex), onPageEntry?.example);
  } else {
    console.log('- skipped: Ceremony has no example in this build');
  }
  const pageEntries = [...page.body.column1, ...page.body.column2] as Array<Record<string, unknown>>;
  const without = pageEntries.filter((e) => !e.example);
  check('an entry without an example has no example key', without.every((e) => !('example' in e)), without.find((e) => 'example' in e));
  check('no entry carries the retired "examples" list', pageEntries.every((e) => !('examples' in e)));
  check('versioned page responses are immutable', page.cache?.includes('immutable') === true, page.cache);
  const unversioned = await getJson(`/api/page/${pageNum}`);
  check('unversioned page responses are not immutable', unversioned.cache?.includes('immutable') === false, unversioned.cache);

  check('GET /api/page/0 is 404', (await getJson('/api/page/0')).status === 404);
  check(`GET /api/page/${meta.body.total_pages + 1} is 404`, (await getJson(`/api/page/${meta.body.total_pages + 1}`)).status === 404);

  // Chunks: the offline save downloads the book CHUNK_PAGES pages at a time.
  const v = meta.body.data_version;
  const chunkOf = Math.ceil(pageNum / CHUNK_PAGES);
  const chunk = await getJson(`/api/chunk/${chunkOf}?v=${v}`);
  const inChunk = chunk.body.pages?.find((p: { page_number: number }) => p.page_number === pageNum);
  check(`GET /api/chunk/${chunkOf} holds page ${pageNum} exactly as /api/page serves it`,
    chunk.status === 200 && JSON.stringify(inChunk) === JSON.stringify(page.body), chunk.status);
  check(`chunk ${chunkOf} holds pages ${(chunkOf - 1) * CHUNK_PAGES + 1}–${chunkOf * CHUNK_PAGES} in order`,
    chunk.body.pages?.length === CHUNK_PAGES && chunk.body.pages.every((p: { page_number: number }, i: number) => p.page_number === (chunkOf - 1) * CHUNK_PAGES + 1 + i));
  check('chunk responses are immutable', chunk.cache?.includes('immutable') === true, chunk.cache);
  const lastChunk = Math.ceil(meta.body.total_pages / CHUNK_PAGES);
  const last = await getJson(`/api/chunk/${lastChunk}?v=${v}`);
  check(`the last chunk (${lastChunk}) ends at page ${meta.body.total_pages}`,
    last.status === 200 && last.body.pages?.at(-1)?.page_number === meta.body.total_pages, last.body.pages?.length);
  check('GET /api/chunk/0 is 404', (await getJson(`/api/chunk/0?v=${v}`)).status === 404);
  check(`GET /api/chunk/${lastChunk + 1} is 404`, (await getJson(`/api/chunk/${lastChunk + 1}?v=${v}`)).status === 404);
  check('a chunk for another book version is 409, so a save never mixes two builds',
    (await getJson(`/api/chunk/1?v=stale`)).status === 409);
  check('a chunk without a version is 409', (await getJson('/api/chunk/1')).status === 409);
  check('GET /api/word/100%25 is 404, not a crash', (await getJson('/api/word/100%25')).status === 404);
  check('GET /api/word/zzzzqx is 404', (await getJson('/api/word/zzzzqx')).status === 404);

  const prefix = await getJson('/api/search?q=ceremo');
  check('GET /api/search?q=ceremo finds Ceremony', prefix.body.results[0]?.headword === 'Ceremony', prefix.body.results);
  const exact = await getJson('/api/search?q=the');
  check('GET /api/search?q=the ranks the exact headword first', exact.body.results[0]?.headword === 'The', exact.body.results);
  const inflection = await getJson('/api/search?q=ceremonies');
  check('GET /api/search?q=ceremonies finds Ceremony', inflection.body.results[0]?.headword === 'Ceremony', inflection.body.results);
  const typo = await getJson('/api/search?q=ceremonis');
  check('GET /api/search?q=ceremonis offers Ceremony as a typo suggestion',
    typo.body.results[0]?.headword === 'Ceremony' && typo.body.results[0]?.suggestion === true, typo.body.results);
  const noSuggestion = await getJson('/api/search?q=zzzzqx');
  check('GET /api/search?q=zzzzqx returns no false typo suggestions', noSuggestion.body.results.length === 0, noSuggestion.body.results);
  const hindi = await getJson(`/api/search?q=${encodeURIComponent('समारो')}`);
  check('GET /api/search Devanagari prefix "समारो" finds Ceremony',
    hindi.body.results.some((r: { headword: string }) => r.headword === 'Ceremony'), hindi.body.results);
  const quote = await getJson(`/api/search?q=${encodeURIComponent('"स')}`);
  check('Devanagari search with a stray quote does not error', quote.status === 200, quote.status);

  // Hindi spelling variants: each pair must find the same entry first.
  const hindiFirst = async (q: string) =>
    (await getJson(`/api/search?q=${encodeURIComponent(q)}`)).body.results[0]?.headword as string | undefined;
  for (const [a, b, headword] of [
    ['ऊँट', 'ऊंट', 'Camel'], // chandrabindu / anusvara
    ['अफ़सोस', 'अफसोस', 'Alas'], // nukta / none
    ['केन्द्र', 'केंद्र', 'center'], // half nasal / anusvara
  ]) {
    const [ra, rb] = [await hindiFirst(a), await hindiFirst(b)];
    check(`Hindi "${a}" and "${b}" both find ${headword}`, ra === headword && rb === headword, { [a]: ra, [b]: rb });
  }
  const upar = (await getJson(`/api/search?q=${encodeURIComponent('ऊपर')}`)).body.results
    .map((r: { headword: string }) => r.headword);
  check('Hindi "ऊपर" ranks exact meanings first, most common word first (On, Up, Above)',
    upar.slice(0, 3).join() === 'On,Up,Above', upar);

  // Every result says why it matched, so the search list can group it.
  const kinds = async (q: string) => (await getJson(`/api/search?q=${encodeURIComponent(q)}`)).body.results
    .map((r: { headword: string; match: string; pos?: string; meaning_hi?: string }) => ({ h: r.headword, m: r.match, ok: typeof r.pos === 'string' && typeof r.meaning_hi === 'string' }));
  const ceremo = await kinds('ceremo');
  check('search results carry pos and meaning_hi', ceremo.length > 0 && ceremo.every((r: { ok: boolean }) => r.ok), ceremo);
  check('prefix match is labelled "headword"', ceremo[0]?.m === 'headword', ceremo);
  const plural = await kinds('ceremonies');
  check('inflected form is labelled "form"', plural[0]?.h === 'Ceremony' && plural[0]?.m === 'form', plural);
  const mammal = await kinds('mammal');
  check('definition-only match is labelled "definition"', mammal.some((r: { h: string; m: string }) => r.h === 'Camel' && r.m === 'definition'), mammal);
  const hindiKinds = await kinds('ऊंट');
  check('Hindi meaning match is labelled "hindi"', hindiKinds[0]?.h === 'Camel' && hindiKinds[0]?.m === 'hindi', hindiKinds);
  check('typo suggestion is labelled "suggestion"', (await kinds('ceremonis'))[0]?.m === 'suggestion');

  const sent = await getJson('/api/sentence?text=obfuscate%20the%20facts');
  check('GET /api/sentence picks a word', sent.status === 200 && typeof sent.body.picked === 'number' && sent.cache === 'private, no-store', { picked: sent.body.picked, cache: sent.cache });
  const link = await getJson('/api/sentence?url=https://x.com');
  check('GET /api/sentence with only a url is a link', link.status === 200 && link.body.kind === 'link', link.body);
  const near = await getJson('/api/search?q=principal&near=1');
  check('GET /api/search near=1 excludes the word itself', near.status === 200 && Array.isArray(near.body.results)
    && !near.body.results.some((r: { normalized: string }) => r.normalized === 'principal'), near.body);

  const quick = await fetch(`${BASE}/api/quick?q=${encodeURIComponent('obfuscate')}`);
  const quickBody = await quick.text();
  check('GET /api/quick is plain text, cached a day, short', quick.status === 200
    && quick.headers.get('content-type') === 'text/plain; charset=utf-8'
    && quick.headers.get('cache-control') === 'public, max-age=86400'
    && quickBody.startsWith('obfuscate (') && quickBody.length <= 600, { type: quick.headers.get('content-type'), cache: quick.headers.get('cache-control') });

  if (failures) {
    console.error(`\n${failures} check(s) failed.`);
    process.exit(1);
  }
  console.log('\nAll API checks passed.');
}

testEndpoints().catch(err => {
  console.error('Endpoint test error:', err);
  process.exit(1);
});
