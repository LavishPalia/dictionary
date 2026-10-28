// Offline support, browser side: registers the service worker (public/sw.js) and saves the whole book onto the
// device. The cache names match public/sw.js.

export const BOOK_CACHE = 'panna-book-v1';
export const SAVED_MARKER = '/__panna/book-saved';

export interface SavedBook { data_version: string; pages: number; saved_at: number; bytes: number }

export const pageUrl = (page: number, version: string) => `/api/page/${page}?v=${version}`;

/** Pages per request when saving the whole book (/api/chunk/N); each is still cached under its own pageUrl. */
export const CHUNK_PAGES = 100;
export const chunkUrl = (chunk: number, version: string) => `/api/chunk/${chunk}?v=${version}`;

/**
 * Registers the service worker (production builds only: in development it would serve stale code). Once it is
 * active it is told which files this page already loaded, so they are cached too, plus `extraUrls` (the data of the
 * pages that came inside the HTML, so offline search knows them). Resolves true when it is running.
 */
export async function registerServiceWorker(extraUrls: string[] = []): Promise<boolean> {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return false;
  if (process.env.NODE_ENV !== 'production') {
    // A worker left by a production run on this address would serve stale app files to the dev server: remove it.
    navigator.serviceWorker.getRegistrations().then((regs) => regs.forEach((r) => r.unregister())).catch(() => {});
    caches?.keys().then((names) => names.filter((n) => n.startsWith('panna-')).forEach((n) => caches.delete(n))).catch(() => {});
    return false;
  }
  try {
    await navigator.serviceWorker.register('/sw.js');
    const reg = await navigator.serviceWorker.ready;
    const urls = [
      location.href,
      ...extraUrls.map((u) => new URL(u, location.origin).href),
      ...performance.getEntriesByType('resource').map((e) => e.name),
    ].filter((u) => u.startsWith(location.origin));
    reg.active?.postMessage({ type: 'warm', urls: [...new Set(urls)] });
    return true;
  } catch {
    return false;
  }
}

/** The book saved on this device, if any. */
export async function savedBook(): Promise<SavedBook | null> {
  if (typeof caches === 'undefined') return null;
  try {
    const hit = await (await caches.open(BOOK_CACHE)).match(SAVED_MARKER);
    return hit ? ((await hit.json()) as SavedBook) : null;
  } catch {
    return null;
  }
}

/**
 * Downloads the book (this build) into the cache CHUNK_PAGES pages per request, a few requests at a time, and stores
 * each page under its own pageUrl, so the app and the service worker read them exactly like pages fetched one by one.
 * Chunks whose pages are all cached already are skipped, so a cancelled save resumes. Then drops pages from older
 * builds and asks the browser to keep the data even when storage runs low.
 */
export async function saveBook(
  meta: { total_pages: number; data_version: string },
  onProgress: (done: number, total: number) => void,
  signal?: AbortSignal,
): Promise<SavedBook> {
  const cache = await caches.open(BOOK_CACHE);
  const total = meta.total_pages;
  const cached = new Set((await cache.keys()).map((key) => new URL(key.url).pathname + new URL(key.url).search));
  let done = 0;
  let bytes = 0;
  const queue = Array.from({ length: Math.ceil(total / CHUNK_PAGES) }, (_, i) => i + 1);
  const worker = async () => {
    for (let chunk = queue.shift(); chunk !== undefined; chunk = queue.shift()) {
      if (signal?.aborted) throw new DOMException('Cancelled', 'AbortError');
      const first = (chunk - 1) * CHUNK_PAGES + 1;
      const numbers = Array.from({ length: Math.min(CHUNK_PAGES, total - first + 1) }, (_, i) => first + i);
      if (numbers.every((n) => cached.has(pageUrl(n, meta.data_version)))) {
        for (const n of numbers) bytes += (await (await cache.match(pageUrl(n, meta.data_version)))!.blob()).size;
      } else {
        const res = await fetch(chunkUrl(chunk, meta.data_version), { signal });
        if (!res.ok) throw new Error(`Pages ${first}–${numbers.at(-1)}: ${res.status}`); // 409: a newer build was deployed
        const { pages } = (await res.json()) as { pages: Array<{ page_number: number }> };
        if (pages.length !== numbers.length) throw new Error(`Pages ${first}–${numbers.at(-1)}: got ${pages.length}`);
        for (const page of pages) {
          const body = JSON.stringify(page);
          bytes += new Blob([body]).size;
          await cache.put(pageUrl(page.page_number, meta.data_version), new Response(body, { headers: { 'Content-Type': 'application/json' } }));
        }
      }
      done += numbers.length;
      onProgress(done, total);
    }
  };
  await Promise.all(Array.from({ length: 3 }, worker));
  for (const key of await cache.keys()) {
    const url = new URL(key.url);
    if (url.pathname.startsWith('/api/page/') && url.searchParams.get('v') !== meta.data_version) await cache.delete(key);
  }
  const saved: SavedBook = { data_version: meta.data_version, pages: total, saved_at: Date.now(), bytes };
  await cache.put(SAVED_MARKER, new Response(JSON.stringify(saved), { headers: { 'Content-Type': 'application/json' } }));
  try { await navigator.storage?.persist?.(); } catch {}
  navigator.serviceWorker?.controller?.postMessage({ type: 'book-changed' });
  return saved;
}

export const formatBytes = (bytes: number) =>
  bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`;
