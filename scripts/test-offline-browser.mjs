// Offline and installable: manifest and icons, the service worker, reading and searching offline, saving the whole
// book for offline use, at desktop and phone sizes. Needs a production build (the service worker is off in dev).
// Usage: node scripts/test-offline-browser.mjs   (needs the app running on localhost:3000)
import { spawn, spawnSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import Database from 'better-sqlite3';
// The page Calm is on: tests open it to use a known entry (page numbers change when the book grows).
const book = new Database('data/dictionary.db', { readonly: true });
const CALM_PAGE = book.prepare("SELECT page_number FROM entries WHERE normalized = 'calm'").get().page_number;
// Example sentences exist only in builds that have them (skipped otherwise).
const CEREMONY = (() => { try { return book.prepare("SELECT e.en FROM examples e JOIN entries n ON n.id = e.entry_id WHERE n.normalized = 'ceremony'").get(); } catch (e) { if (/no such table: examples/.test(e.message)) return undefined; throw e; } })();

const EDGE_PATH = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const PORT = 9341;
const BASE = 'http://localhost:3000';
const USER_DATA = path.join(process.cwd(), 'scratch', `panna-offline-edge-${process.pid}-${Date.now()}`);
let checks = 0;
let failures = 0;
function check(label, ok, detail) {
  checks++;
  if (ok) console.log(`✓ ${label}`);
  else { failures++; console.error(`✗ ${label}${detail !== undefined ? ` — ${JSON.stringify(detail)}` : ''}`); }
}
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function main() {
  const edge = spawn(EDGE_PATH, ['--headless=new', `--remote-debugging-port=${PORT}`, `--user-data-dir=${USER_DATA}`,
    '--disable-gpu', '--window-size=1440,900', 'about:blank'], { stdio: 'ignore' });
  let socket;
  try {
    let endpoint;
    for (let i = 0; i < 40 && !endpoint; i++) {
      await sleep(250);
      try { endpoint = (await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json()).find((t) => t.type === 'page')?.webSocketDebuggerUrl; }
      catch {}
    }
    if (!endpoint) throw new Error('Could not connect to Edge DevTools');
    socket = new WebSocket(endpoint);
    await new Promise((resolve, reject) => { socket.onopen = resolve; socket.onerror = reject; });
    let nextId = 1;
    const send = (method, params = {}) => new Promise((resolve, reject) => {
      const id = nextId++;
      const onMessage = (event) => {
        const message = JSON.parse(event.data);
        if (message.id !== id) return;
        socket.removeEventListener('message', onMessage);
        message.error ? reject(new Error(message.error.message)) : resolve(message.result);
      };
      socket.addEventListener('message', onMessage);
      socket.send(JSON.stringify({ id, method, params }));
    });
    const evaluate = async (expression) =>
      (await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true })).result?.value;
    const key = async (keyName, code = keyName, text) => {
      await send('Input.dispatchKeyEvent', { type: 'keyDown', key: keyName, code, text });
      await send('Input.dispatchKeyEvent', { type: 'keyUp', key: keyName, code });
    };
    const open = async (url, size) => {
      await send('Emulation.setDeviceMetricsOverride', { width: size.width, height: size.height, deviceScaleFactor: 1, mobile: size.mobile });
      await send('Page.navigate', { url: `${BASE}${url}` });
      for (let i = 0; i < 60; i++) {
        await sleep(250);
        try {
          if (await evaluate(`(() => { const el = document.querySelector('#lookup-input'); return Boolean(el && document.querySelector('.entry-text') && Object.keys(el).some((k) => k.startsWith('__reactFiber$'))); })()`)) return true;
        } catch {}
      }
      return false;
    };
    const visible = (selector) => evaluate(`(() => { const el = document.querySelector(${JSON.stringify(selector)}); if (!el) return false; const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== 'hidden'; })()`);
    await send('Page.enable');
    await send('Runtime.enable');

    // "Offline" must cover the service worker as well as the page: the worker fetches on its own.
    const workers = new Set();
    socket.addEventListener('message', (event) => {
      const m = JSON.parse(event.data);
      if (m.method === 'Target.attachedToTarget' && m.params.targetInfo.type === 'service_worker') workers.add(m.params.sessionId);
      if (m.method === 'Target.detachedFromTarget') workers.delete(m.params.sessionId);
    });
    // A worker that has already stopped (after the site's data is wiped) never answers: give up after 2 s.
    const sendTo = (sessionId, method, params = {}) => new Promise((resolve) => {
      const id = 500000 + Math.floor(Math.random() * 400000);
      const done = (result) => { clearTimeout(timer); socket.removeEventListener('message', onMessage); resolve(result); };
      const onMessage = (event) => { const m = JSON.parse(event.data); if (m.id === id) done(m.result ?? null); };
      const timer = setTimeout(() => { workers.delete(sessionId); done(null); }, 2000);
      socket.addEventListener('message', onMessage);
      socket.send(JSON.stringify({ id, method, params, sessionId }));
    });
    const setOffline = async (offline) => {
      const conditions = { offline, latency: 0, downloadThroughput: -1, uploadThroughput: -1 };
      await send('Network.enable');
      await send('Network.emulateNetworkConditions', conditions);
      for (const s of workers) { await sendTo(s, 'Network.enable'); await sendTo(s, 'Network.emulateNetworkConditions', conditions); }
      await sleep(300);
    };
    await send('Target.setAutoAttach', { autoAttach: true, waitForDebuggerOnStart: false, flatten: true });

    const type = async (text) => {
      await evaluate(`(() => { const input = document.querySelector('#lookup-input'); input.focus(); const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set; set.call(input, ${JSON.stringify(text)}); input.dispatchEvent(new Event('input', { bubbles: true })); return true; })()`);
      for (let i = 0; i < 30; i++) { await sleep(150); if (await evaluate(`Boolean(document.querySelector('#lookup-panel [role="option"], #lookup-panel .noentry'))`)) break; }
      await sleep(200);
    };
    const panel = () => evaluate(`(() => { const p = document.querySelector('#lookup-panel'); return p ? { text: p.innerText, options: [...p.querySelectorAll('[role="option"] .lookup-hw')].map((o) => o.textContent) } : null; })()`);
    const click = async (selector) => {
      for (let i = 0; i < 40; i++) { if (await evaluate(`(() => { const el = document.querySelector(${JSON.stringify(selector)}); if (!el) return false; el.click(); return true; })()`)) return true; await sleep(100); }
      return false;
    };
    // The worker is in charge of the page. Right after the site's data is wiped (as this test does between sizes) the
    // old worker may still be shutting down, and the new one takes charge only from the next load: reload and wait.
    const controlled = async (size) => {
      for (let attempt = 0; attempt < 3; attempt++) {
        for (let i = 0; i < 40; i++) { if (await evaluate('Boolean(navigator.serviceWorker && navigator.serviceWorker.controller)')) return true; await sleep(150); }
        await open(`/page/${CALM_PAGE}`, size);
      }
      return false;
    };
    const appShows = (word) => evaluate(`[...document.querySelectorAll('.entry-text')].some((e) => e.textContent.startsWith(${JSON.stringify(word)}) && e.getBoundingClientRect().width > 0)`);
    const quiet = { seen: { start: 1, word: 1, review: 1, settings: 1 }, tips: {}, welcomeDone: true, tipsOff: true, listOpened: true };

    for (const [sizeName, size] of [['desktop', { width: 1440, height: 900, mobile: false }], ['phone', { width: 390, height: 844, mobile: true }]]) {
      await setOffline(false);
      check(`${sizeName}: app hydrates`, await open(`/page/${CALM_PAGE}`, size));
      // Start each size from a clean site, but only once any worker has finished installing: wiping the site in the
      // middle of an install can leave a registration that never takes charge.
      await evaluate(`Promise.race([navigator.serviceWorker.ready.then(() => true), new Promise((ok) => setTimeout(() => ok(false), 15000))])`);
      await sleep(500);
      await send('Storage.clearDataForOrigin', { origin: BASE, storageTypes: 'all' });
      await sleep(500);
      await evaluate(`localStorage.setItem('panna_tours', ${JSON.stringify(JSON.stringify(quiet))}); true`);
      await open(`/page/${CALM_PAGE}`, size);

      if (sizeName === 'desktop') {
        // Installable: a manifest with the right icons, an iOS icon and a theme colour.
        const m = await evaluate(`fetch('/manifest.webmanifest').then((r) => r.json())`);
        check('the manifest names the app and opens it full screen at Today', m.short_name === 'Panna' && m.start_url === '/' && m.display === 'standalone', m);
        const icons = await evaluate(`Promise.all(${JSON.stringify(m.icons)}.map((i) => new Promise((ok) => { const img = new Image(); img.onload = () => ok(i.sizes === img.naturalWidth + 'x' + img.naturalHeight); img.onerror = () => ok(false); img.src = i.src; })))`);
        check('every manifest icon loads at its stated size, including a maskable one', icons.length === 3 && icons.every(Boolean) && m.icons.some((i) => i.purpose === 'maskable'), { icons, m: m.icons });
        check('iOS gets a home-screen icon and the browser a theme colour', await evaluate(`Boolean(document.querySelector('link[rel="apple-touch-icon"]')) && document.querySelector('meta[name="theme-color"]')?.content === '#2b1d14' && Boolean(document.querySelector('link[rel="icon"]'))`));
      }

      check(`${sizeName}: the service worker takes charge`, await controlled(size), await evaluate(`(async () => {
        const r = await navigator.serviceWorker.getRegistration();
        return { controller: Boolean(navigator.serviceWorker.controller), reg: Boolean(r), active: r?.active?.state, installing: r?.installing?.state,
          waiting: r?.waiting?.state, regs: (await navigator.serviceWorker.getRegistrations()).length, url: location.href };
      })()`));
      await sleep(1500); // let it cache what the page already loaded
      await click('#menu-btn');
      await sleep(400);
      check(`${sizeName}: the menu offers to save the book for offline`, (await evaluate(`document.querySelector('#offline-save-btn')?.innerText ?? ''`)).includes('Read and search the whole book without a connection'));
      await key('Escape');
      await sleep(300);

      // ── Offline, before saving the book ──
      await setOffline(true);
      await open(`/page/${CALM_PAGE}`, size);
      check(`${sizeName}: a page opened before still loads offline`, await appShows('Calm'));
      check(`${sizeName}: an offline notice says what still works`, (await evaluate(`document.querySelector('#offline-notice')?.innerText ?? ''`)).includes('Pages you’ve opened still work'));
      await evaluate(`[...document.querySelectorAll('.entry-text')].find((e) => e.textContent.startsWith('Calm') && e.style.cursor === 'pointer').click(); true`);
      await sleep(700);
      check(`${sizeName}: its words open offline`, await evaluate(`document.querySelector('#word-sheet-title')?.textContent === 'Calm'`));
      await key('Escape');
      await sleep(400);
      await type('cal');
      let p = await panel();
      check(`${sizeName}: offline search finds words on pages already opened, and says so`, p?.options.includes('Calm') && p.text.includes('only pages you’ve opened'), p);
      await type('zebra');
      p = await panel();
      check(`${sizeName}: other words explain that search needs a connection or a saved book`, p?.text.includes('You’re offline') && p.text.includes('Save the book for offline'), p);
      await evaluate(`document.querySelector('.lookup-clear')?.click(); document.activeElement.blur(); true`);
      await send('Page.navigate', { url: `${BASE}/page/80` });
      await sleep(2500);
      check(`${sizeName}: a page never opened falls back to Today offline`, await evaluate(`Boolean(document.querySelector('#today-screen')) && Boolean(document.querySelector('#offline-notice'))`),
        await evaluate(`(async () => ({ title: document.title, path: location.pathname, today: Boolean(document.querySelector('#today-screen')), notice: Boolean(document.querySelector('#offline-notice')),
          body: document.body.innerText.slice(0, 120), pages: (await (await caches.open('panna-pages-v1')).keys()).map((k) => k.url) }))()`));

      // ── Back online: save the whole book ──
      await setOffline(false);
      await open(`/page/${CALM_PAGE}`, size);
      check(`${sizeName}: the notice goes away online`, !(await visible('#offline-notice')));
      const total = (await evaluate(`fetch('/api/meta').then((r) => r.json())`)).total_pages;
      const far = await evaluate(`fetch('/api/page/80').then((r) => r.json()).then((p) => p.column1[0].headword)`);
      await click('#menu-btn');
      await sleep(400);
      await click('#offline-save-btn');
      let status = '';
      // The whole book (3,125 pages) takes about 75 s to save here; allow 120 s.
      for (let i = 0; i < 600 && !status.startsWith('Saved on this device'); i++) { await sleep(200); status = await evaluate(`document.querySelector('#offline-status')?.textContent ?? ''`); }
      check(`${sizeName}: saving shows when it is done, with the size`, status.startsWith(`Saved on this device · ${total.toLocaleString('en-IN')} pages ·`) && /\d+(\.\d)? (KB|MB)$/.test(status), status);
      check(`${sizeName}: the menu stays open while saving`, await visible('#reading-menu'));
      await key('Escape');
      await sleep(300);

      // ── Offline with the book saved ──
      await setOffline(true);
      await open(`/page/${CALM_PAGE}`, size);
      // The notice learns that the book is saved a moment after the page opens.
      let notice = '';
      for (let i = 0; i < 20 && !notice.includes('whole book is saved'); i++) { await sleep(150); notice = await evaluate(`document.querySelector('#offline-notice')?.innerText ?? ''`); }
      check(`${sizeName}: the notice says the whole book is saved`, notice.includes('whole book is saved'), notice);
      if (!CEREMONY) console.log(`${sizeName}: skipped: no example in this build (offline example)`);
      else {
        // Reached the way a reader would offline: search the saved book, then tap the word on its page.
        await type('ceremony');
        await click('#lookup-panel [role="option"]');
        await sleep(2500);
        await evaluate(`[...document.querySelectorAll('.entry-text')].find((e) => e.textContent.startsWith('Ceremony') && e.style.cursor === 'pointer').click(); true`);
        await sleep(900);
        const ex = await evaluate(`({ en: document.querySelector('#word-example p')?.textContent, hi: document.querySelector('#word-example .word-example-hi')?.getAttribute('lang'), title: document.querySelector('#word-sheet-title')?.textContent ?? null, path: location.pathname })`);
        check(`${sizeName}: the example still shows offline`, ex.en === CEREMONY.en && ex.hi === 'hi', ex);
        await key('Escape');
        await sleep(300);
      }
      await type(far.toLowerCase());
      p = await panel();
      check(`${sizeName}: offline search covers the whole saved book`, p?.options[0] === far && !p.text.includes('only pages you’ve opened'), { far, p });
      await click('#lookup-panel [role="option"]');
      await sleep(2500);
      check(`${sizeName}: and opens a page never visited`, await appShows(far), far);
      await type('qqqzzz');
      p = await panel();
      check(`${sizeName}: a word not in the book says so, offline`, p?.text.includes('in the book saved on this device'), p);
      await evaluate(`document.querySelector('.lookup-clear')?.click(); document.activeElement.blur(); true`);
      await click('#menu-btn');
      await sleep(400);
      check(`${sizeName}: the saved book is remembered after a reload`, (await evaluate(`document.querySelector('#offline-status')?.textContent ?? ''`)).startsWith('Saved on this device'));
      await key('Escape');
      await setOffline(false);
      check(`${sizeName}: nothing overflows sideways`, await evaluate(`document.documentElement.scrollWidth <= innerWidth`));
    }
    await send('Storage.clearDataForOrigin', { origin: BASE, storageTypes: 'all' });
  } finally {
    if (socket) { try { socket.send(JSON.stringify({ id: 999999, method: 'Browser.close' })); } catch {} socket.close(); }
    if (edge.pid) spawnSync('taskkill', ['/PID', String(edge.pid), '/T', '/F'], { stdio: 'ignore' });
    await sleep(500);
    try { fs.rmSync(USER_DATA, { recursive: true, force: true, maxRetries: 10, retryDelay: 250 }); } catch {}
  }
  console.log(`Offline: ${checks - failures}/${checks} checks passed.`);
  if (failures) process.exitCode = 1;
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
