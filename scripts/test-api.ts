// Smoke test against a running server (npm run dev / npm start). Resolves pages through the API instead of
// assuming page numbers.
// Usage: npx tsx scripts/test-api.ts [baseUrl]
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
  check('versioned page responses are immutable', page.cache?.includes('immutable') === true, page.cache);
  const unversioned = await getJson(`/api/page/${pageNum}`);
  check('unversioned page responses are not immutable', unversioned.cache?.includes('immutable') === false, unversioned.cache);

  check('GET /api/page/0 is 404', (await getJson('/api/page/0')).status === 404);
  check(`GET /api/page/${meta.body.total_pages + 1} is 404`, (await getJson(`/api/page/${meta.body.total_pages + 1}`)).status === 404);
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
