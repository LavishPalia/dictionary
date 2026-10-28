// Panna's service worker: the app keeps working without a connection.
//
//   App files (/_next/static, fonts, icons)   cache first: their names change whenever their content does
//   Book pages (/api/page/N?v=<version>)      cache first: a rebuilt book has a new version, so new URLs
//   Other API calls                           network first, falling back to the last copy
//   Search and word look-ups, offline         answered from the book pages in the cache (all of them once
//                                             "Save the book for offline" has run, else the pages visited)
//   Page visits (HTML)                        network first; offline, the cached copy of that address, else a
//                                             redirect to Today (Next cannot run Today's page under another address)
//
// Cache names are shared with src/lib/offline.ts, which saves the whole book into BOOK.
const STATIC = 'panna-static-v1';
const PAGES = 'panna-pages-v1';
const BOOK = 'panna-book-v1';
const DATA = 'panna-data-v1';
const KEEP = [STATIC, PAGES, BOOK, DATA];
const LIMITS = { [STATIC]: 400, [PAGES]: 60, [DATA]: 400 }; // BOOK is not trimmed: it holds the saved book
const SAVED_MARKER = '/__panna/book-saved';

self.addEventListener('install', (event) => {
  self.skipWaiting();
  // Today, so a first offline visit to any address has something to show.
  event.waitUntil(fetch('/').then((res) => (res.ok ? putPage(new Request('/'), res) : null)).catch(() => {}));
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    for (const name of await caches.keys()) if (name.startsWith('panna-') && !KEEP.includes(name)) await caches.delete(name);
    await self.clients.claim();
  })());
});

// The page that registered us lists the files it loaded before we were in control, so they are cached too.
self.addEventListener('message', (event) => {
  if (event.data?.type === 'warm' && Array.isArray(event.data.urls)) {
    event.waitUntil(Promise.all(event.data.urls.map((url) => warm(url))));
  }
  if (event.data?.type === 'book-changed') bookIndex = null;
});

async function warm(url) {
  const request = new Request(url);
  const u = new URL(request.url);
  // The address the page was opened at is an HTML page visit.
  const name = cacheFor(u) ?? (u.origin === self.location.origin && !u.pathname.startsWith('/_next/') ? PAGES : null);
  if (!name) return;
  const cache = await caches.open(name);
  if (await cache.match(request)) return;
  try {
    const res = await fetch(request);
    if (res.ok) await (name === PAGES ? putPage(request, res) : put(name, request, res));
  } catch {}
}

// A cached page is only usable offline with the app files it names (its own route's scripts, styles and fonts), so
// those are cached with it.
async function putPage(request, response) {
  await put(PAGES, request, response.clone());
  const html = await response.text();
  // File names end at a quote, a backslash (escaped inside inline scripts), whitespace or a closing bracket.
  const files = new Set([...html.matchAll(/(?:\/_next\/)?static\/(?:chunks|css|media)\/[^"'\\\s)]+/g)].map((m) => `/_next/${m[0].replace(/^\/_next\//, '')}`));
  const cache = await caches.open(STATIC);
  await Promise.all([...files].map(async (file) => {
    if (await cache.match(file)) return;
    try { const res = await fetch(file); if (res.ok) await put(STATIC, new Request(file), res); } catch {}
  }));
}

function cacheFor(url) {
  if (url.origin !== self.location.origin) return null;
  const p = url.pathname;
  if (p.startsWith('/_next/static/') || p.startsWith('/icons/') || p === '/icon.svg' || p === '/manifest.webmanifest') return STATIC;
  if (p.startsWith('/api/page/')) return BOOK;
  if (p.startsWith('/api/')) return DATA;
  return null;
}

async function put(name, request, response) {
  const cache = await caches.open(name);
  await cache.put(request, response);
  if (name === BOOK) bookIndex = null; // a newly visited page joins offline search
  const limit = LIMITS[name];
  if (!limit) return;
  const keys = await cache.keys();
  for (let i = 0; i < keys.length - limit; i++) await cache.delete(keys[i]); // oldest first
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (request.mode === 'navigate') { event.respondWith(page(request)); return; }
  const name = cacheFor(url);
  if (name === STATIC || name === BOOK) { event.respondWith(cacheFirst(name, request)); return; }
  if (name === DATA) { event.respondWith(networkFirst(request, url)); return; }
});

async function cacheFirst(name, request) {
  const hit = await caches.match(request, { cacheName: name });
  if (hit) return hit;
  const res = await fetch(request);
  if (res.ok) await put(name, request, res.clone());
  return res;
}

async function networkFirst(request, url) {
  try {
    const res = await fetch(request);
    if (res.ok) await put(DATA, request, res.clone());
    return res;
  } catch (error) {
    const hit = await caches.match(request, { cacheName: DATA });
    if (hit) return hit;
    if (url.pathname === '/api/search') return offlineSearch(url.searchParams.get('q') || '');
    if (url.pathname.startsWith('/api/word/')) return offlineWord(decodeURIComponent(url.pathname.slice('/api/word/'.length)));
    throw error;
  }
}

async function page(request) {
  try {
    const res = await fetch(request);
    if (res.ok) await putPage(request, res.clone());
    return res;
  } catch {
    const hit = await caches.match(request, { cacheName: PAGES });
    if (hit) return hit;
    const url = new URL(request.url);
    // A launch (/?share_text=…, /?voice=1, /?open=review) is the front page with a query: the cached front page reads it.
    if (url.pathname === '/' && url.search) {
      const home = await caches.match('/', { cacheName: PAGES });
      if (home) return home;
    }
    if (url.pathname !== '/' && await caches.match('/', { cacheName: PAGES })) return Response.redirect('/', 302);
    return new Response('<!doctype html><meta charset="utf-8"><title>Panna</title><p style="font:18px Georgia,serif;padding:2em">You’re offline, and Panna hasn’t been opened on this device before. Connect once, and it will work offline after that.</p>',
        { status: 503, headers: { 'Content-Type': 'text/html; charset=utf-8' } });
  }
}

// ── Offline look-ups from the cached book pages ──

let bookIndex = null; // { entries: [...], pages: Map<number, entries[]>, complete: boolean }

async function loadBook() {
  if (bookIndex) return bookIndex;
  const cache = await caches.open(BOOK);
  const marker = await cache.match(SAVED_MARKER);
  const saved = marker ? await marker.json() : null;
  const pages = new Map();
  // Read the pages in parallel: one at a time, a saved book (3,000+ pages) took seconds to index, and the index
  // is rebuilt whenever the browser stops an idle service worker.
  const keys = (await cache.keys()).filter((key) => {
    const url = new URL(key.url);
    return url.pathname.startsWith('/api/page/') && (!saved || url.searchParams.get('v') === saved.data_version);
  });
  await Promise.all(keys.map(async (key) => {
    try {
      const p = await (await cache.match(key)).json();
      pages.set(p.page_number, [...p.column1, ...p.column2]);
    } catch {}
  }));
  // In book order, so results do not depend on which page was read first.
  const entries = [...pages.entries()].sort((a, b) => a[0] - b[0]).flatMap(([, onPage]) => onPage);
  bookIndex = { entries, pages, complete: Boolean(saved && saved.pages && pages.size >= saved.pages) };
  return bookIndex;
}

const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', 'X-Panna-Offline': '1' } });
const DEVANAGARI = /[ऀ-ॿ]/;
const toResult = (e, match) => ({
  headword: e.headword, normalized: e.normalized, page_number: e.page_number, pos: e.pos, meaning_hi: e.meaning_hi,
  preview: `${e.pos} ${e.meaning_hi}`, match,
});

async function offlineSearch(query) {
  const { entries, complete } = await loadBook();
  const q = query.toLowerCase().trim();
  let results = [];
  if (q && DEVANAGARI.test(q)) {
    results = entries.filter((e) => e.meaning_hi.split(/[,;]/).some((m) => m.trim().startsWith(q) || m.includes(` ${q}`)))
      .slice(0, 10).map((e) => toResult(e, 'hindi'));
  } else if (q) {
    const exact = entries.filter((e) => e.normalized === q);
    const prefix = entries.filter((e) => e.normalized !== q && e.normalized.startsWith(q))
      .sort((a, b) => a.normalized.length - b.normalized.length || (a.normalized < b.normalized ? -1 : 1));
    results = [...exact, ...prefix].slice(0, 10).map((e) => toResult(e, 'headword'));
  }
  return json({ query, results, offline: true, complete });
}

async function offlineWord(headword) {
  const { entries, pages } = await loadBook();
  const entry = entries.find((e) => e.normalized === headword.toLowerCase().trim());
  if (!entry) return json({ error: 'Word not found', offline: true }, 404);
  return json({ entry, pageNumber: entry.page_number, neighbours: pages.get(entry.page_number) ?? [], offline: true });
}
