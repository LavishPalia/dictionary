// Panna's service worker: the app keeps working without a connection.
//
//   App files (/_next/static, fonts, icons)   cache first: their names change whenever their content does
//   Book pages (/api/page/N?v=<version>)      cache first: a rebuilt book has a new version, so new URLs
//   Other API calls                           network first, falling back to the last copy
//   Search, word, sentence look-ups, offline  answered from the book pages in the cache (all of them once
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
  if (await cache.match(name === PAGES ? pageKey(request) : request)) return;
  try {
    const res = await fetch(request);
    if (res.ok) await (name === PAGES ? putPage(request, res) : put(name, request, res));
  } catch {}
}

// A launch address (/?share_text=…, /?voice=1, /?open=review) is the front page: it is cached as '/', so shared text
// is never kept on the device and launches don't push real pages out of the cache.
function pageKey(request) {
  const url = new URL(request.url);
  return url.pathname === '/' && url.search ? new Request(url.origin + '/') : request;
}

// A cached page is only usable offline with the app files it names (its own route's scripts, styles and fonts), so
// those are cached with it.
async function putPage(request, response) {
  await put(PAGES, pageKey(request), response.clone());
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
    if (url.pathname === '/api/sentence') {
      return offlineSentence(url.searchParams.get('text') || '', url.searchParams.get('title') || '', url.searchParams.get('url') || '');
    }
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

let bookIndex = null; // { entries: [...], pages: Map<number, entries[]>, byNorm: Map<normalized, entry>, complete: boolean }

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
  const byNorm = new Map();
  for (const e of entries) if (!byNorm.has(e.normalized)) byNorm.set(e.normalized, e);
  bookIndex = { entries, pages, byNorm, complete: Boolean(saved && saved.pages && pages.size >= saved.pages) };
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

// ── Offline sentence view ──
// cleanShared, tokenize and capitalisedShare below are plain-JS copies of the ones in src/lib/sentence.ts (a service
// worker cannot import TypeScript modules): keep them behaving the same. The match is simpler than online (no forms
// table): a word is tried as it is, then without s, es, ed, ing (ed and ing also with an e put back).

const MAX_WORDS = 40;
const MAX_RAW = 2000;
const MAX_WORD_LEN = 100;
const URL_RE = /\bhttps?:\/\/\S+|\bwww\.\S+/gi;
const WORD_RE = /[A-Za-z]+(?:['’][A-Za-z]+)*/g;

function cutText(s, n = MAX_RAW) {
  const cut = s.slice(0, n);
  return /[\uD800-\uDBFF]$/.test(cut) ? cut.slice(0, -1) : cut;
}

// The title is ignored, as online.
function cleanShared(text, url) {
  const raw = cutText(text);
  const rawUrl = cutText(url);
  const hadUrl = new RegExp(URL_RE.source, 'i').test(raw) || rawUrl.trim() !== '';
  const lines = raw.replace(URL_RE, ' ').split(/\r\n|\r|\n/).map((l) => l.split(/\s+/).filter(Boolean)).filter((w) => w.length > 0);
  const total = lines.reduce((n, w) => n + w.length, 0);
  if (total === 0) return { kind: hadUrl ? 'link' : 'empty' };
  let left = MAX_WORDS;
  const kept = [];
  for (const w of lines) {
    if (left <= 0) break;
    kept.push(w.slice(0, left).join(' '));
    left -= w.length;
  }
  return { kind: 'text', text: kept.join('\n'), truncated: total > MAX_WORDS };
}

function tokenize(text) {
  const tokens = [];
  let pos = 0;
  let atStart = true;
  const pushGap = (gap) => {
    if (!gap) return;
    if (/[.!?:\n\r]/.test(gap)) atStart = true;
    tokens.push({ text: gap, key: null, midCap: false });
  };
  for (const m of text.matchAll(WORD_RE)) {
    const start = m.index ?? 0;
    pushGap(text.slice(pos, start));
    const word = m[0];
    pos = start + word.length;
    if (word.length > MAX_WORD_LEN) tokens.push({ text: word, key: null, midCap: false });
    else tokens.push({ text: word, key: word.toLowerCase().replace(/’/g, "'").replace(/'s$/, ''), midCap: /^[A-Z]/.test(word) && !atStart });
    atStart = false;
  }
  pushGap(text.slice(pos));
  return tokens;
}

function capitalisedShare(tokens) {
  let atStart = true;
  let later = 0;
  let caps = 0;
  for (const t of tokens) {
    if (t.key === null) {
      if (/[A-Za-z]/.test(t.text)) atStart = false;
      else if (/[.!?:\n\r]/.test(t.text)) atStart = true;
      continue;
    }
    if (!atStart) {
      later++;
      if (/^[A-Z]/.test(t.text)) caps++;
    }
    atStart = false;
  }
  return later < 3 ? 0 : caps / later;
}

// pickWord(…, 'length') of src/lib/sentence.ts: the longest key, ties to the first; names (capitals mid-sentence) are
// skipped unless nothing else is left, and the rule is off when most words are capitalised.
function pickLongest(candidates, share) {
  if (candidates.length === 0) return null;
  let pool = candidates;
  if (share <= 0.5) {
    const plain = candidates.filter((c) => !c.midCap);
    if (plain.length > 0) pool = plain;
  }
  let best = pool[0];
  for (const c of pool) if (c.key.length > best.key.length) best = c;
  return best.index;
}

function matchEntry(key, byNorm) {
  const tries = [key];
  for (const [suffix, back] of [['es', ''], ['s', ''], ['ed', 'e'], ['ing', 'e']]) {
    if (key.length > suffix.length + 1 && key.endsWith(suffix)) {
      const stem = key.slice(0, -suffix.length);
      tries.push(stem);
      if (back) tries.push(stem + back);
    }
  }
  for (const t of tries) if (byNorm.has(t)) return byNorm.get(t);
  return undefined;
}

async function offlineSentence(text, title, url) {
  const shared = cleanShared(text, url);
  if (shared.kind !== 'text') return json({ kind: shared.kind });
  const { byNorm } = await loadBook();
  const toks = tokenize(shared.text);
  const matched = toks.map((t) => (t.key === null ? undefined : matchEntry(t.key, byNorm)));
  const entries = {};
  const tokens = toks.map((t, i) => {
    if (!matched[i]) return { text: t.text };
    entries[matched[i].normalized] = matched[i];
    return { text: t.text, headword: matched[i].normalized };
  });
  const candidates = toks.flatMap((t, index) => (matched[index] ? [{ index, key: t.key, midCap: t.midCap }] : []));
  return json({ tokens, picked: pickLongest(candidates, capitalisedShare(toks)), entries, truncated: shared.truncated, offline: true });
}
