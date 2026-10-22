// Offline support, browser side: registers the service worker (public/sw.js) and saves the whole book onto the
// device. The cache names match public/sw.js.

export const BOOK_CACHE = 'panna-book-v1';
export const SAVED_MARKER = '/__panna/book-saved';

export interface SavedBook { data_version: string; pages: number; saved_at: number; bytes: number }

export const pageUrl = (page: number, version: string) => `/api/page/${page}?v=${version}`;

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
 * Downloads every page of the book (this build) into the cache, a few at a time, skipping pages already there, then
 * drops pages from older builds. Asks the browser to keep the data even when storage runs low.
 */
export async function saveBook(
  meta: { total_pages: number; data_version: string },
  onProgress: (done: number, total: number) => void,
  signal?: AbortSignal,
): Promise<SavedBook> {
  const cache = await caches.open(BOOK_CACHE);
  const total = meta.total_pages;
  let done = 0;
  let bytes = 0;
  const queue = Array.from({ length: total }, (_, i) => i + 1);
  const worker = async () => {
    for (let page = queue.shift(); page !== undefined; page = queue.shift()) {
      if (signal?.aborted) throw new DOMException('Cancelled', 'AbortError');
      const url = pageUrl(page, meta.data_version);
      let hit = await cache.match(url);
      if (!hit) {
        const res = await fetch(url, { signal });
        if (!res.ok) throw new Error(`Page ${page}: ${res.status}`);
        await cache.put(url, res.clone());
        hit = res;
      }
      bytes += (await hit.clone().blob()).size;
      onProgress(++done, total);
    }
  };
  await Promise.all(Array.from({ length: 4 }, worker));
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
