// A first visit (docs/superpowers/specs/2026-11-15-first-visit-design.md): the front page opens on the book, never
// flashing Today, with the "tap any word" card; the offer dock's bookplate and install cards after the first and second
// lookups; existing readers, launches and other addresses unchanged. Events are checked against a fake PostHog that
// answers every /relay request here. Also axe on each card, Day and Evening, desktop and phone.
// Usage: node scripts/test-first-visit-browser.mjs   (needs the app running on localhost:3000, built off Vercel)
import { spawn, spawnSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import zlib from 'zlib';

const EDGE_PATH = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const BASE = 'http://localhost:3000';
const USER_DATA = path.join(process.cwd(), 'scratch', `panna-first-visit-edge-${process.pid}-${Date.now()}`);
const AXE = fs.readFileSync(path.join(process.cwd(), 'node_modules', 'axe-core', 'axe.min.js'), 'utf8');
const DESKTOP = { width: 1440, height: 900, mobile: false };
const PHONE = { width: 390, height: 844, mobile: true };

let checks = 0;
let failures = 0;
function check(label, ok, detail) {
  checks++;
  if (ok) console.log(`✓ ${label}`);
  else { failures++; console.error(`✗ ${label}${detail !== undefined ? ` — ${JSON.stringify(detail).slice(0, 600)}` : ''}`); }
}
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** A request body as PostHog sent it: gzip, base64 form data, or plain JSON. */
function decodeBody(request) {
  let buf = request.postDataEntries?.length
    ? Buffer.concat(request.postDataEntries.map((e) => Buffer.from(e.bytes ?? '', 'base64')))
    : Buffer.from(request.postData ?? '', 'utf8');
  if (buf[0] === 0x1f && buf[1] === 0x8b) buf = zlib.gunzipSync(buf);
  let text = buf.toString('utf8');
  if (text.startsWith('data=')) text = Buffer.from(decodeURIComponent(text.slice(5).split('&')[0]), 'base64').toString('utf8');
  return text;
}
function eventsIn(text) {
  try {
    const parsed = JSON.parse(text);
    return Array.isArray(parsed) ? parsed : Array.isArray(parsed?.batch) ? parsed.batch : parsed?.event ? [parsed] : [];
  } catch {
    return [];
  }
}

async function main() {
  const edge = spawn(EDGE_PATH, ['--headless=new', '--remote-debugging-port=0', `--user-data-dir=${USER_DATA}`,
    '--disable-gpu', '--window-size=1440,900', 'about:blank'], { stdio: 'ignore' });
  let socket;
  try {
    let endpoint;
    for (let i = 0; i < 60 && !endpoint; i++) {
      await sleep(250);
      try {
        const port = fs.readFileSync(path.join(USER_DATA, 'DevToolsActivePort'), 'utf8').split(/\s+/)[0];
        endpoint = (await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()).find((t) => t.type === 'page')?.webSocketDebuggerUrl;
      } catch {}
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
    const key = async (keyName, code = keyName) => {
      await send('Input.dispatchKeyEvent', { type: 'keyDown', key: keyName, code });
      await send('Input.dispatchKeyEvent', { type: 'keyUp', key: keyName, code });
    };

    // ── The fake PostHog ──
    const requests = [];
    socket.addEventListener('message', (event) => {
      const message = JSON.parse(event.data);
      if (message.method !== 'Fetch.requestPaused') return;
      const { requestId, request } = message.params;
      let body = '';
      try { body = decodeBody(request); } catch (e) { body = `UNDECODABLE ${e.message}`; }
      requests.push({ url: request.url, body });
      send('Fetch.fulfillRequest', { requestId, responseCode: 200, responseHeaders: [{ name: 'Content-Type', value: 'application/json' }],
        body: Buffer.from('{"status":1}').toString('base64') }).catch(() => {});
    });
    await send('Fetch.enable', { patterns: [{ urlPattern: '*/relay*' }] });
    const events = () => requests.flatMap((r) => eventsIn(r.body));
    const sets = (from = 0) => events().slice(from).map((e) => e.$set ?? e.properties?.$set).filter(Boolean);
    const waitFor = async (test, ms = 12000) => {
      for (let t = 0; t < ms; t += 200) { if (await test()) return true; await sleep(200); }
      return test();
    };

    const open = async (url, size) => {
      await send('Emulation.setDeviceMetricsOverride', { width: size.width, height: size.height, deviceScaleFactor: 1, mobile: size.mobile });
      await send('Page.navigate', { url: `${BASE}${url}` });
      for (let i = 0; i < 60; i++) {
        await sleep(250);
        try {
          if (await evaluate(`(() => { const el = document.querySelector('#lookup-input'); return Boolean(el && Object.keys(el).some((k) => k.startsWith('__reactFiber$'))); })()`)) {
            await sleep(400); // the effects that read storage
            return true;
          }
        } catch {}
      }
      return false;
    };
    const exists = (sel) => evaluate(`Boolean(document.querySelector(${JSON.stringify(sel)}))`);
    const click = (sel) => evaluate(`(() => { const el = document.querySelector(${JSON.stringify(sel)}); if (!el) return false; el.click(); return true; })()`);
    const text = (sel) => evaluate(`document.querySelector(${JSON.stringify(sel)})?.textContent ?? null`);
    const chipLabel = () => evaluate(`document.querySelector('#bookplate-btn')?.getAttribute('aria-label') ?? null`);
    const settings = () => evaluate(`JSON.parse(localStorage.getItem('panna_settings') || '{}')`);
    const setSettings = (change) => evaluate(`(() => { const s = JSON.parse(localStorage.getItem('panna_settings') || '{}'); const c = ${JSON.stringify(change)}; for (const [k, v] of Object.entries(c)) { if (v === null) delete s[k]; else s[k] = v; } localStorage.setItem('panna_settings', JSON.stringify(s)); return true; })()`);
    const typeName = (value) => evaluate(`(() => { const input = document.querySelector('#bookplate-name'); input.focus(); const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set; set.call(input, ${JSON.stringify(value)}); input.dispatchEvent(new Event('input', { bubbles: true })); return input.value; })()`);
    const nameValue = () => evaluate(`document.querySelector('#bookplate-name')?.value`);
    const openSheetFromMenu = async () => { await click('#menu-btn'); await sleep(500); await click('#bookplate-btn'); await sleep(500); };
    const axe = (sel) => evaluate(`(async () => {
      if (!window.axe) { const s = document.createElement('script'); s.textContent = ${JSON.stringify(AXE)}; document.head.appendChild(s); }
      const el = document.querySelector(${JSON.stringify(sel)}); if (!el) return 'missing';
      const r = await axe.run(el, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'] } });
      return r.violations.map((v) => ({ id: v.id, nodes: v.nodes.map((n) => n.target.join(' ')).slice(0, 3) }));
    })()`);

    await send('Page.enable');
    await send('Runtime.enable');
    const named = (name, from = 0) => events().slice(from).filter((e) => e.event === name);
    // Watches every frame from the document's start: was Today ever painted, and how long was history then.
    await send('Page.addScriptToEvaluateOnNewDocument', { source: `window.__todayShown = false; window.__histStart = history.length;
      (function loop() { const t = document.getElementById('today-screen');
        if (t) { const r = t.getBoundingClientRect(); if (r.height > 0 && getComputedStyle(t).visibility !== 'hidden') window.__todayShown = true; }
        requestAnimationFrame(loop); })();` });
    // A clean device: storage cleared on the origin without the app running (it would write its own keys).
    const fresh = async (extra = {}) => {
      await send('Page.navigate', { url: `${BASE}/api/meta` });
      await sleep(500);
      await evaluate(`(() => { localStorage.clear(); localStorage.setItem('panna_analytics_test', '1');
        const e = ${JSON.stringify(extra)}; for (const [k, v] of Object.entries(e)) localStorage.setItem(k, typeof v === 'string' ? v : JSON.stringify(v)); return true; })()`);
    };
    const bookShowing = () => evaluate(`[...document.querySelectorAll('.entry-headword')].some((el) => el.getBoundingClientRect().width > 0) && !document.querySelector('#today-screen')`);
    const visible = (sel) => evaluate(`(() => { const el = document.querySelector(${JSON.stringify(sel)}); if (!el) return false; const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== 'hidden'; })()`);
    const tours = () => evaluate(`JSON.parse(localStorage.getItem('panna_tours') || '{}')`);
    const type = async (value) => {
      await evaluate(`(() => { const input = document.querySelector('#lookup-input'); input.focus(); const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set; set.call(input, ${JSON.stringify(value)}); input.dispatchEvent(new Event('input', { bubbles: true })); return true; })()`);
      for (let i = 0; i < 30; i++) { await sleep(150); if (await evaluate(`document.querySelectorAll('#lookup-panel [role="option"]').length > 3`)) break; }
      await sleep(200);
    };

    for (const [sizeName, size] of [['desktop', DESKTOP], ['phone', PHONE]]) {
      // ── 1. A first visit to the front page opens the book, with the hint ──
      const runMark = events().length;
      await fresh();
      check(`${sizeName}: a first visit hydrates`, await open('/', size));
      check(`${sizeName}: the book is showing`, await bookShowing());
      check(`${sizeName}: Today was never painted`, await evaluate('window.__todayShown') === false);
      check(`${sizeName}: the address is the book's page 1`, await evaluate('location.pathname') === '/page/1', await evaluate('location.pathname'));
      check(`${sizeName}: no history entry was added (Back leaves, never to a Today)`, await evaluate('history.length === window.__histStart'), await evaluate('[history.length, window.__histStart]'));
      check(`${sizeName}: the visit is remembered`, await evaluate(`localStorage.getItem('panna_visited')`) === '1');
      check(`${sizeName}: the hint card shows`, await waitFor(() => visible('#first-visit-hint'), 4000));
      const hint = (await text('#first-visit-hint')) ?? '';
      check(`${sizeName}: the hint says to tap a word, in English and Hindi`, hint.includes('Tap any word for its Hindi meaning') && hint.includes('हिंदी अर्थ'), hint);
      if (sizeName === 'desktop') check('desktop: the Book button is pressed', await evaluate(`document.querySelector('#open-book-btn').getAttribute('aria-pressed') === 'true'`));
      await sleep(1500);
      check(`${sizeName}: the book's one-time tip does not show beside the hint`, !(await visible('#tip-card')));
      check(`${sizeName}: no Today page view was counted, the book's was`, await waitFor(() => named('$pageview', runMark).some((e) => e.properties?.$pathname === '/page/[n]'))
        && !named('$pageview', runMark).some((e) => e.properties?.$pathname === '/'), named('$pageview', runMark).map((e) => e.properties?.$pathname));
      check(`${sizeName}: the hint is counted as shown`, await waitFor(() => named('first_visit_hint', runMark).some((e) => e.properties?.action === 'shown')));
      // A visitor who searches instead of tapping: the results list is above the card, never under it.
      await type('ca');
      const covered = await evaluate(`(() => { const p = document.querySelector('#lookup-panel').getBoundingClientRect();
        // the results shown: inside the list's own box (it scrolls) and on screen
        const opts = [...document.querySelectorAll('#lookup-panel [role="option"]')].filter((o) => { const r = o.getBoundingClientRect(); const y = r.top + r.height / 2; return r.height > 0 && y > p.top && y < p.bottom && y < innerHeight; });
        return opts.filter((o) => { const r = o.getBoundingClientRect(); const top = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2); return !top || !document.querySelector('#lookup-panel').contains(top); }).map((o) => o.textContent.slice(0, 20)); })()`);
      check(`${sizeName}: every search result on screen is above the hint card`, Array.isArray(covered) && covered.length === 0, covered);
      await key('Escape'); await sleep(300);
      await evaluate(`document.activeElement?.blur(); true`);
      for (const light of ['day', 'evening']) {
        await evaluate(`document.documentElement.setAttribute('data-light', '${light}'); true`);
        await sleep(300);
        const v = await axe('#first-visit-hint');
        check(`${sizeName}, ${light}: axe finds nothing in the hint`, Array.isArray(v) && v.length === 0, v);
      }
      // Got it: gone, the welcome is done, and the book's tip never comes.
      let mark = events().length;
      await click('#first-visit-ok');
      await sleep(400);
      check(`${sizeName}: Got it hides the hint`, !(await exists('#first-visit-hint')));
      check(`${sizeName}: …and counts as the welcome answered`, (await tours()).welcomeDone === true, await tours());
      check(`${sizeName}: …and is counted`, await waitFor(() => named('first_visit_hint', mark).some((e) => e.properties?.action === 'dismiss')));
      await sleep(1500);
      check(`${sizeName}: the book's tip does not follow it`, !/Tap any word/.test((await text('#tip-card')) ?? ''), await text('#tip-card'));
      mark = events().length;
      await click(sizeName === 'phone' ? '#nav-today-btn' : '#open-today-btn');
      check(`${sizeName}: opening Today later in the first visit counts a Today page view`, await waitFor(() => named('$pageview', mark).some((e) => e.properties?.$pathname === '/')), named('$pageview', mark).map((e) => e.properties?.$pathname));
      // The next open of the front page is Today, with no welcome card.
      await open('/', size);
      check(`${sizeName}: the next open of / is Today`, await exists('#today-screen') && await evaluate('location.pathname') === '/');
      check(`${sizeName}: …with no welcome card and no hint`, !(await visible('#today-welcome')) && !(await exists('#first-visit-hint')));

      // ── 2. The tour from the hint ──
      await fresh();
      await open('/', size);
      await waitFor(() => exists('#first-visit-hint'), 4000);
      mark = events().length;
      await click('#first-visit-tour');
      check(`${sizeName}: Take the tour starts the Getting started tour`, await waitFor(() => exists('#tour-tip'), 4000) && /Getting started/.test((await text('#tour-count')) ?? ''), await text('#tour-count'));
      check(`${sizeName}: …the hint is gone`, !(await exists('#first-visit-hint')));
      check(`${sizeName}: …and counted`, await waitFor(() => named('first_visit_hint', mark).some((e) => e.properties?.action === 'tour')));
      await click('#tour-close-btn');
      await sleep(400);

      // ── 3. Not a first visit ──
      await fresh({ panna_saved_words: [{ normalized: 'camel', headword: 'Camel', saved_at: Date.now() }] });
      await open('/', size);
      check(`${sizeName}: an existing reader (saved words, no visited mark) gets Today`, await exists('#today-screen') && !(await exists('#first-visit-hint')) && await evaluate('location.pathname') === '/');
      await fresh();
      await open('/?utm_source=instagram&fbclid=abc', size);
      check(`${sizeName}: a link with tracking parameters is still a first visit`, await waitFor(() => exists('#first-visit-hint'), 4000) && await evaluate('location.pathname') === '/page/1', await evaluate('location.pathname'));
      await fresh();
      await open('/?share_text=camel', size);
      await sleep(800);
      check(`${sizeName}: a share launch on / is not a first visit`, !(await exists('#first-visit-hint')) && await evaluate('location.pathname') !== '/page/1', await evaluate('location.pathname'));
      await fresh();
      await open('/word/serendipity', size);
      await sleep(800);
      check(`${sizeName}: a first open at a word's address shows the word, no hint`, await exists('#word-sheet') && !(await exists('#first-visit-hint')));

      // ── 4. The offers: the bookplate after the first lookup, install after the second; one at a time ──
      // A controlled install prompt: the browser's own is stopped, and a fake one (with prompt and userChoice) fired.
      const { identifier: fakePrompt } = await send('Page.addScriptToEvaluateOnNewDocument', { source: `
        window.addEventListener('beforeinstallprompt', (e) => { if (!e.__fake) e.stopImmediatePropagation(); }, true);
        window.__fire = () => { const e = new Event('beforeinstallprompt'); e.__fake = true; e.prompt = async () => { window.__prompted = true; };
          Object.defineProperty(e, 'userChoice', { get: () => Promise.resolve({ outcome: window.__outcome || 'dismissed' }) }); window.dispatchEvent(e); };
        window.addEventListener('load', () => { for (const t of [300, 1500, 3000]) setTimeout(window.__fire, t); });` });
      const openWord = (n) => evaluate(`(() => { const el = [...document.querySelectorAll('.entry-text')].filter((el) => { const r = el.getBoundingClientRect(); return el.style.cursor === 'pointer' && r.width > 0 && r.top < innerHeight && r.bottom > 0; })[${n}]; if (!el) return false; el.click(); return true; })()`);
      const axeBoth = async (sel, what) => {
        for (const light of ['day', 'evening']) {
          await evaluate(`document.documentElement.setAttribute('data-light', '${light}'); true`);
          await sleep(300);
          const v = await axe(sel);
          check(`${sizeName}, ${light}: axe finds nothing in the ${what}`, Array.isArray(v) && v.length === 0, v);
        }
        await evaluate(`document.documentElement.setAttribute('data-light', 'day'); true`);
      };
      await fresh();
      await open('/', size);
      await waitFor(() => exists('#first-visit-hint'), 4000);
      await click('#first-visit-ok');
      await sleep(2500);
      check(`${sizeName}: no lookup yet: no bookplate offer`, !(await exists('#today-bookplate')));
      mark = events().length;
      check(`${sizeName}: a word on the page opens`, await openWord(0) && await waitFor(() => exists('#word-sheet'), 4000));
      await sleep(600);
      check(`${sizeName}: the dock stays hidden while the word card is open`, !(await exists('#offer-dock')));
      await key('Escape');
      check(`${sizeName}: after the first lookup the bookplate offer shows in the dock`, await waitFor(() => exists('#offer-dock #today-bookplate'), 4000));
      check(`${sizeName}: …and only it`, !(await exists('#install-offer')) && !(await exists('#first-visit-hint')));
      check(`${sizeName}: …counted as shown`, await waitFor(() => named('bookplate_offer', mark).some((e) => e.properties?.action === 'shown')));
      if (sizeName === 'phone') {
        const r = await evaluate(`(() => { const d = document.querySelector('#offer-dock').getBoundingClientRect(); const n = document.querySelector('.app-bottomnav').getBoundingClientRect(); return { dock: d.bottom, nav: n.top }; })()`);
        check('phone: the dock sits above the bottom bar', r && r.dock <= r.nav, r);
      }
      await axeBoth('#today-bookplate', 'bookplate offer');
      await click('#bookplate-not-now');
      await sleep(400);
      check(`${sizeName}: Not now hides the bookplate offer`, !(await exists('#today-bookplate')));
      check(`${sizeName}: …counted`, await waitFor(() => named('bookplate_offer', mark).some((e) => e.properties?.action === 'dismiss')));
      check(`${sizeName}: one lookup: no install offer yet`, !(await exists('#install-offer')));
      check(`${sizeName}: a second word opens`, await openWord(1) && await waitFor(() => exists('#word-sheet'), 4000));
      await sleep(600);
      await key('Escape');
      check(`${sizeName}: after the second lookup the install offer shows`, await waitFor(() => exists('#offer-dock #install-offer'), 4000));
      check(`${sizeName}: …with its Install button`, await exists('#install-offer-install') && /Open Panna like an app/.test((await text('#install-offer')) ?? ''), await text('#install-offer'));
      check(`${sizeName}: …counted as shown, with the prompt platform`, await waitFor(() => named('install_offer', mark).some((e) => e.properties?.action === 'shown' && e.properties?.platform === 'prompt')));
      await axeBoth('#install-offer', 'install offer');
      await click(sizeName === 'phone' ? '#nav-review-btn' : '#open-review-btn');
      await sleep(800);
      check(`${sizeName}: the dock is hidden on Review`, !(await exists('#offer-dock')));
      await click('#close-review-btn');
      await sleep(800);
      check(`${sizeName}: …and back after it`, await waitFor(() => exists('#install-offer'), 3000));
      await click('#install-offer-not-now');
      await sleep(400);
      check(`${sizeName}: Not now hides the install offer`, !(await exists('#install-offer')));
      check(`${sizeName}: …once, remembered`, (await settings()).installOffer?.times === 1, (await settings()).installOffer);
      check(`${sizeName}: …counted`, await waitFor(() => named('install_offer', mark).some((e) => e.properties?.action === 'dismiss')));
      await open('/', size);
      await sleep(3500);
      check(`${sizeName}: not again within the week`, !(await exists('#install-offer')));
      await setSettings({ installOffer: { times: 1, lastAt: Date.now() - 8 * 24 * 60 * 60 * 1000 } });
      await open('/', size);
      check(`${sizeName}: a week later it comes back once`, await waitFor(() => exists('#install-offer'), 5000));
      await evaluate(`window.__outcome = 'dismissed'; true`);
      await click('#install-offer-install');
      await sleep(600);
      check(`${sizeName}: Install opens the browser's install prompt`, await evaluate('window.__prompted === true'));
      check(`${sizeName}: cancelling the browser's dialog counts as the second Not now: never again`, (await settings()).installOffer?.times === 2 && !(await exists('#install-offer')), (await settings()).installOffer);
      check(`${sizeName}: …counted as cancel`, await waitFor(() => named('install_offer', mark).some((e) => e.properties?.action === 'cancel')));
      // Accepted on its first showing: never offered again, counted as install.
      await fresh({ panna_visited: '1', panna_tours: { welcomeDone: true, tipsOff: true }, panna_history: (() => { const t = Date.now() - 60000; return [{ normalized: 'calm', headword: 'Calm', meaning_hi: 'शांत', first_at: t, last_at: t, count: 2, lookups: [t, t + 1000], source: 'search', page: null }]; })(), panna_settings: { bookplateOffer: 'done' } });
      await open('/', size);
      check(`${sizeName}: the install offer shows for a reader with two lookups`, await waitFor(() => exists('#install-offer'), 5000));
      mark = events().length;
      await evaluate(`window.__outcome = 'accepted'; true`);
      await click('#install-offer-install');
      await sleep(600);
      check(`${sizeName}: accepting the browser's dialog: never offered again`, (await settings()).installOffer?.times === 2 && !(await exists('#install-offer')), (await settings()).installOffer);
      check(`${sizeName}: …counted as install`, await waitFor(() => named('install_offer', mark).some((e) => e.properties?.action === 'install')));
      await send('Page.removeScriptToEvaluateOnNewDocument', { identifier: fakePrompt });

      // A browser that can't install (no prompt, not an iPhone): no install offer, whatever the lookups.
      const twoLookups = (() => { const t = Date.now() - 60000; return [{ normalized: 'calm', headword: 'Calm', meaning_hi: 'शांत', first_at: t, last_at: t, count: 2, lookups: [t, t + 1000], source: 'search', page: null }]; })();
      const { identifier: noPrompt } = await send('Page.addScriptToEvaluateOnNewDocument', { source: `window.addEventListener('beforeinstallprompt', (e) => e.stopImmediatePropagation(), true);` });
      await fresh({ panna_visited: '1', panna_tours: { welcomeDone: true, tipsOff: true }, panna_history: twoLookups, panna_settings: { bookplateOffer: 'done' } });
      await open('/', size);
      await sleep(3500);
      check(`${sizeName}: no way to install: no install offer`, !(await exists('#install-offer')));
      await send('Page.removeScriptToEvaluateOnNewDocument', { identifier: noPrompt });

      // iPhone Safari: the Share steps, with Got it only.
      if (sizeName === 'phone') {
        const ua = await evaluate('navigator.userAgent');
        await send('Emulation.setUserAgentOverride', { userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1' });
        const { identifier: noPrompt2 } = await send('Page.addScriptToEvaluateOnNewDocument', { source: `window.addEventListener('beforeinstallprompt', (e) => e.stopImmediatePropagation(), true);` });
        await fresh({ panna_visited: '1', panna_tours: { welcomeDone: true, tipsOff: true }, panna_history: twoLookups, panna_settings: { bookplateOffer: 'done' } });
        await open('/', size);
        check('iPhone: the install offer gives the Share steps', await waitFor(() => exists('#install-offer'), 5000) && /Add to Home Screen/.test((await text('#install-offer')) ?? ''), await text('#install-offer'));
        check('iPhone: …with Got it, and no Install button', !(await exists('#install-offer-install')) && (await text('#install-offer-not-now')) === 'Got it');
        check('iPhone: …counted with the ios platform', await waitFor(() => named('install_offer').some((e) => e.properties?.action === 'shown' && e.properties?.platform === 'ios')));
        await send('Page.removeScriptToEvaluateOnNewDocument', { identifier: noPrompt2 });
        await send('Emulation.setUserAgentOverride', { userAgent: ua });
      }
    }
  } finally {
    socket?.close();
    if (edge.pid) spawnSync('taskkill', ['/PID', String(edge.pid), '/T', '/F'], { stdio: 'ignore' });
    spawnSync('powershell', ['-NoProfile', '-Command', `Get-CimInstance Win32_Process -Filter "Name='msedge.exe'" | Where-Object { $_.CommandLine -like '*${path.basename(USER_DATA)}*' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }`], { stdio: 'ignore' });
    await sleep(500);
    try { fs.rmSync(USER_DATA, { recursive: true, force: true }); } catch {}
  }
  console.log(`\n${checks - failures}/${checks} checks passed`);
  process.exit(failures ? 1 : 0);
}

main().catch((error) => { console.error(error); process.exit(1); });
