// Usage counts in the browser, against a fake PostHog: every request to /relay is answered here (Edge's Fetch domain)
// and its payload decoded and kept, so nothing reaches the real project. Checks that nothing loads without the switch,
// that page views are one per screen and none per page turn, the events and the profile, that no payload ever holds a
// word, a search or a page number, the Usage counts switch (and Do Not Track), the service worker, the CSP, and axe.
// Usage: node scripts/test-analytics-browser.mjs   (needs the app running on localhost:3000, built off Vercel)
import { spawn, spawnSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import zlib from 'zlib';
import Database from 'better-sqlite3';

const CAMEL_PAGE = new Database('data/dictionary.db', { readonly: true })
  .prepare("SELECT page_number FROM entries WHERE normalized = 'camel'").get().page_number;
const EDGE_PATH = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const BASE = 'http://localhost:3000';
const USER_DATA = path.join(process.cwd(), 'scratch', `panna-analytics-edge-${process.pid}-${Date.now()}`);
const AXE = fs.readFileSync(path.join(process.cwd(), 'node_modules', 'axe-core', 'axe.min.js'), 'utf8');
// The CSP as it stood before usage counts (next.config.mjs): /relay is same-origin, so nothing in it changes.
const CSP = "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; connect-src 'self'; worker-src 'self'; manifest-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'";
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
/** The events in one body: a list, a { batch } or a single event. */
function eventsIn(text) {
  try {
    const parsed = JSON.parse(text);
    const list = Array.isArray(parsed) ? parsed : Array.isArray(parsed?.batch) ? parsed.batch : parsed?.event ? [parsed] : [];
    return list;
  } catch {
    return [];
  }
}

async function main() {
  // Port 0: Edge picks a free port and writes it into its own profile, so this can only ever drive the Edge it started
  // (never one left running by an earlier run, whose storage would carry that run's state).
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

    // ── The fake PostHog: every /relay request is kept and answered here ──
    const requests = []; // { url, method, body }
    socket.addEventListener('message', (event) => {
      const message = JSON.parse(event.data);
      if (message.method !== 'Fetch.requestPaused') return;
      const { requestId, request } = message.params;
      let body = '';
      try { body = decodeBody(request); } catch (e) { body = `UNDECODABLE ${e.message}`; }
      requests.push({ url: request.url, method: request.method, body });
      send('Fetch.fulfillRequest', { requestId, responseCode: 200, responseHeaders: [{ name: 'Content-Type', value: 'application/json' }],
        body: Buffer.from('{"status":1}').toString('base64') }).catch(() => {});
    });
    await send('Fetch.enable', { patterns: [{ urlPattern: '*/relay*' }] });
    const events = () => requests.flatMap((r) => eventsIn(r.body));
    const named = (name, from = 0) => events().slice(from).filter((e) => e.event === name);
    // PostHog sends $pageview at once and batches everything else for about 3 s: settle() waits past one batch.
    const settle = () => sleep(4000);
    const waitFor = async (test, ms = 12000) => {
      for (let t = 0; t < ms; t += 200) { if (test()) return true; await sleep(200); }
      return test();
    };

    const open = async (url, size) => {
      await send('Emulation.setDeviceMetricsOverride', { width: size.width, height: size.height, deviceScaleFactor: 1, mobile: size.mobile });
      await send('Page.navigate', { url: `${BASE}${url}` });
      for (let i = 0; i < 60; i++) {
        await sleep(250);
        try {
          if (await evaluate(`(() => { const el = document.querySelector('#lookup-input'); return Boolean(el && Object.keys(el).some((k) => k.startsWith('__reactFiber$'))); })()`)) return true;
        } catch {}
      }
      return false;
    };
    const type = async (text) => {
      await evaluate(`(() => { const input = document.querySelector('#lookup-input'); input.focus(); const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set; set.call(input, ${JSON.stringify(text)}); input.dispatchEvent(new Event('input', { bubbles: true })); return true; })()`);
      for (let i = 0; i < 30; i++) {
        await sleep(150);
        if (await evaluate(`Boolean(document.querySelector('#lookup-panel [role="option"]'))`)) break;
      }
      await sleep(150);
    };
    const pickFirst = () => evaluate(`(() => { const o = document.querySelector('#lookup-panel [role="option"]'); if (!o) return false; o.dispatchEvent(new MouseEvent('mousedown', { bubbles: true })); o.click(); return true; })()`);
    const openMenu = async () => { await evaluate(`document.querySelector('#menu-btn').click(); true`); await sleep(500); };
    const closeMenu = async () => { await key('Escape'); await sleep(400); };
    const switchState = () => evaluate(`(() => { const s = document.querySelector('#usage-counts-switch'); return s && { checked: s.getAttribute('aria-checked'), disabled: s.disabled, sub: document.querySelector('#usage-counts-sub')?.textContent }; })()`);
    const axeMenu = () => evaluate(`(async () => {
      if (!window.axe) { const s = document.createElement('script'); s.textContent = ${JSON.stringify(AXE)}; document.head.appendChild(s); }
      const r = await axe.run(document.querySelector('#reading-menu'), { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'] } });
      return r.violations.map((v) => ({ id: v.id, nodes: v.nodes.map((n) => n.target.join(' ')).slice(0, 3) }));
    })()`);
    const setStorage = (pairs) => evaluate(`(() => { ${Object.entries(pairs).map(([k, v]) => v === null ? `localStorage.removeItem(${JSON.stringify(k)});` : `localStorage.setItem(${JSON.stringify(k)}, ${JSON.stringify(v)});`).join(' ')} return true; })()`);

    await send('Page.enable');
    await send('Runtime.enable');

    // ── 1. A local build without the tests' switch loads nothing and sends nothing ──
    check('desktop: app hydrates', await open('/', DESKTOP));
    await setStorage({ panna_analytics_test: null, panna_tours: JSON.stringify({ welcomeDone: true, tipsOff: true }) });
    await open('/', DESKTOP);
    await sleep(6500);
    check('without the switch (a local build, no token), nothing is sent', requests.length === 0, requests.map((r) => r.url));
    check('…and PostHog never loads (no PostHog keys in storage)', await evaluate(`!Object.keys(localStorage).some((k) => k.startsWith('ph_'))`));

    // ── 2. Counting on, opened from the share sheet with one word ──
    await setStorage({ panna_analytics_test: '1', panna_saved_words: null });
    await open('/?share_text=camel', DESKTOP);
    check('a share launch: the first page view arrives (PostHog loaded late, through /relay)', await waitFor(() => named('$pageview').length > 0), requests.map((r) => r.url));
    check('every request goes to the same-origin /relay', requests.every((r) => new URL(r.url).origin === BASE && new URL(r.url).pathname.startsWith('/relay/')), requests.map((r) => r.url));
    await waitFor(() => named('word_looked_up').length > 0 && named('$pageview').some((e) => e.properties?.screen === 'word'));
    const first = named('$pageview')[0];
    check('the first page view is Today, at "/"', first?.properties?.screen === 'today' && first?.properties?.$pathname === '/' && new URL(first?.properties?.$current_url).pathname === '/', first?.properties);
    check('every event carries env = test, display_mode and launched_from = share', events().filter((e) => !e.event.startsWith('$set') && e.event !== '$identify').every((e) => e.properties?.env === 'test' && e.properties?.display_mode === 'browser' && e.properties?.launched_from === 'share'),
      events().map((e) => [e.event, e.properties?.env, e.properties?.display_mode, e.properties?.launched_from]));
    const shareLookup = named('word_looked_up')[0];
    check('the shared word counts as a lookup via share, found', shareLookup?.properties?.via === 'share' && shareLookup?.properties?.found === true, shareLookup?.properties);
    check('the word card counts as a page view at /word/[word]', named('$pageview').some((e) => e.properties?.screen === 'word' && e.properties?.$pathname === '/word/[word]'));
    // The profile: the nickname and the counts.
    await waitFor(() => events().some((e) => (e.$set ?? e.properties?.$set)?.nickname) && events().some((e) => 'saved_words' in ((e.$set ?? e.properties?.$set) ?? {})));
    const sets = events().map((e) => e.$set ?? e.properties?.$set).filter(Boolean);
    const nick = sets.find((s) => s.nickname)?.nickname;
    check('the profile gets a nickname like "Indigo Owl 3f2", also as its name', /^[A-Z][a-z]+ [A-Z][a-z]+ [0-9a-z]{3}$/.test(nick ?? '') && sets.some((s) => s.name === nick), sets);
    const distinct = events().find((e) => e.properties?.distinct_id)?.properties?.distinct_id ?? '';
    check('the nickname\'s tag is the device ID\'s last 3 characters', nick?.endsWith(distinct.replace(/[^0-9a-z]/gi, '').slice(-3).toLowerCase()), { nick, distinct });
    const profile = sets.find((s) => 'saved_words' in s);
    check('the reading profile is counts only', profile && profile.installed === false && profile.saved_words === 0 && typeof profile.mastered_words === 'number'
      && typeof profile.review_streak === 'number' && typeof profile.duel_games === 'number' && profile.bookplate === false, profile);
    check('PostHog keeps its state in localStorage, never a cookie', await evaluate(`Object.keys(localStorage).some((k) => k.startsWith('ph_')) && !document.cookie.includes('ph_')`));

    // ── 3. Search, Hindi search, saving; page turns send nothing ──
    await key('Escape'); await sleep(500);
    let mark = events().length;
    await type('camel'); await pickFirst();
    check('a search lookup counts via search', await waitFor(() => named('word_looked_up', mark).some((e) => e.properties?.via === 'search' && e.properties?.found === true)), named('word_looked_up', mark).map((e) => e.properties));
    check('…and opening the book from Today counts the Book once', await waitFor(() => named('$pageview', mark).filter((e) => e.properties?.screen === 'book').length === 1), named('$pageview', mark).map((e) => e.properties?.screen));
    await settle();
    mark = events().length;
    await type('ऊंट'); await pickFirst();
    check('a Hindi search lookup counts via hindi', await waitFor(() => named('word_looked_up', mark).some((e) => e.properties?.via === 'hindi')), named('word_looked_up', mark).map((e) => e.properties));
    await settle();
    mark = events().length;
    const before = await evaluate('location.pathname');
    await evaluate('document.activeElement?.blur(); true');
    for (let i = 0; i < 3; i++) { await key('ArrowRight'); await sleep(1600); }
    const after = await evaluate('location.pathname');
    await settle();
    check('desktop: three page turns happened', before !== after && /^\/page\/\d+$/.test(after), { before, after });
    check('desktop: page turns send no page view (or anything else)', events().length === mark, events().slice(mark).map((e) => e.event));

    await open('/word/camel', DESKTOP);
    await waitFor(() => named('$pageview').filter((e) => e.properties?.screen === 'word').length >= 2);
    mark = events().length;
    await evaluate(`document.querySelector('#save-word-btn').click(); true`);
    check('saving a word sends word_saved, with nothing else in it', await waitFor(() => named('word_saved', mark).length === 1)
      && Object.keys(named('word_saved', mark)[0].properties).every((k) => k.startsWith('$') || ['env', 'display_mode', 'launched_from', 'token', 'distinct_id'].includes(k)), named('word_saved', mark)[0]?.properties);
    await sleep(400);
    await evaluate(`document.querySelector('#save-word-btn').click(); true`);
    check('unsaving sends word_unsaved', await waitFor(() => named('word_unsaved', mark).length === 1));

    // ── 4. Phone: the book once, page turns nothing ──
    check('phone: app hydrates', await open(`/page/${CAMEL_PAGE}`, PHONE));
    await waitFor(() => named('$pageview').some((e) => e.properties?.screen === 'book' && e.properties?.$current_url && e.properties.$pathname === '/page/[n]'));
    await settle();
    mark = events().length;
    for (let i = 0; i < 2; i++) { await evaluate(`document.querySelector('[aria-label="Next page"]')?.click(); true`); await sleep(1200); }
    await settle();
    check('phone: two page turns happened', await evaluate(`location.pathname !== '/page/${CAMEL_PAGE}'`), await evaluate('location.pathname'));
    check('phone: page turns send nothing', events().length === mark, events().slice(mark).map((e) => e.event));

    // ── 5. No word, search, Hindi or page number ever leaves the device ──
    const everything = requests.map((r) => `${r.url}\n${r.body}`).join('\n');
    const leaks = ['camel', 'ऊंट', 'ऊँट', 'share_text', `/page/${CAMEL_PAGE}`, '/word/camel'].filter((w) => everything.toLowerCase().includes(w.toLowerCase()));
    const pagePaths = everything.match(/\/page\/\d+/g) ?? [];
    check('no payload holds a headword, the search text, Hindi typed, a page address or the share text', leaks.length === 0 && pagePaths.length === 0, { leaks, pagePaths });
    check('no payload carries a page title', !/"\$?title"\s*:/.test(everything));
    check('every payload decoded', requests.every((r) => !r.body.startsWith('UNDECODABLE')), requests.filter((r) => r.body.startsWith('UNDECODABLE')).map((r) => r.body));
    check('only the events of the plan are sent', events().every((e) => ['$pageview', 'word_looked_up', 'word_saved', 'word_unsaved', '$set', '$identify'].includes(e.event)), [...new Set(events().map((e) => e.event))]);

    // ── 6. The Usage counts switch ──
    for (const [sizeName, size] of [['desktop', DESKTOP], ['phone', PHONE]]) {
      await open(`/page/${CAMEL_PAGE}`, size);
      await openMenu();
      const s = await switchState();
      check(`${sizeName}: the menu has a Usage counts row, switched on`, s?.checked === 'true' && s.disabled === false, s);
      const violations = await axeMenu();
      check(`${sizeName}: axe finds nothing in the menu with the Usage counts row`, Array.isArray(violations) && violations.length === 0, violations);
      await closeMenu();
    }
    await settle(); // let this open's own events arrive first
    await openMenu();
    await evaluate(`document.querySelector('#usage-counts-switch').click(); true`);
    await sleep(300);
    check('switching it off shows off', (await switchState())?.checked === 'false');
    check('…and saves analytics: false in panna_settings', await evaluate(`JSON.parse(localStorage.getItem('panna_settings')).analytics === false`), await evaluate(`localStorage.getItem('panna_settings')`));
    check('…and PostHog is opted out on this device', await evaluate(`Object.entries(localStorage).some(([k, v]) => k.includes('opt') && k.includes('out') || /__ph_opt_in_out_/.test(k) && v === '0')`), await evaluate(`Object.keys(localStorage)`));
    await closeMenu();
    let count = requests.length;
    await type('camel'); await pickFirst();
    await sleep(3000);
    check('off: a lookup sends nothing', requests.length === count, requests.slice(count).map((r) => r.url));
    // A lighting change rewrites panna_settings: the choice must survive it.
    await openMenu();
    await evaluate(`[...document.querySelectorAll('[role="radio"]')].find((r) => r.textContent === 'Evening')?.click(); true`);
    await sleep(300);
    await closeMenu();
    check('off survives a lighting change (panna_settings rewritten)', await evaluate(`(() => { const s = JSON.parse(localStorage.getItem('panna_settings')); return s.analytics === false && s.lighting === 'evening'; })()`), await evaluate(`localStorage.getItem('panna_settings')`));
    count = requests.length;
    await open('/', DESKTOP);
    await sleep(6500);
    check('off: a fresh open sends nothing', requests.length === count, requests.slice(count).map((r) => r.url));
    await openMenu();
    check('off: the switch stays off after a reload', (await switchState())?.checked === 'false');
    await evaluate(`document.querySelector('#usage-counts-switch').click(); true`);
    await sleep(300);
    await closeMenu();
    check('on again: analytics is removed from panna_settings', await evaluate(`!('analytics' in JSON.parse(localStorage.getItem('panna_settings')))`));
    mark = events().length;
    await type('camel'); await pickFirst();
    check('on again: counting resumes', await waitFor(() => named('word_looked_up', mark).length > 0));

    // ── 7. Do Not Track ──
    await settle();
    const { identifier } = await send('Page.addScriptToEvaluateOnNewDocument', { source: `Object.defineProperty(Navigator.prototype, 'doNotTrack', { get: () => '1' });` });
    count = requests.length;
    await open('/', DESKTOP);
    await sleep(6500);
    check('Do Not Track: nothing is sent', requests.length === count, requests.slice(count).map((r) => r.url));
    await openMenu();
    const dnt = await switchState();
    check('Do Not Track: the switch shows off and can\'t be turned on, and says why', dnt?.checked === 'false' && dnt.disabled === true && /browser/i.test(dnt.sub ?? ''), dnt);
    const dntAxe = await axeMenu();
    check('Do Not Track: axe finds nothing in the menu', Array.isArray(dntAxe) && dntAxe.length === 0, dntAxe);
    await closeMenu();
    await send('Page.removeScriptToEvaluateOnNewDocument', { identifier });

    // ── 8. The service worker keeps nothing from /relay, and the CSP is unchanged ──
    await open('/', DESKTOP);
    await evaluate(`Promise.race([navigator.serviceWorker.ready.then(() => true), new Promise((ok) => setTimeout(() => ok(false), 15000))])`);
    await sleep(5000);
    const cached = await evaluate(`(async () => { const out = []; for (const name of await caches.keys()) for (const r of await (await caches.open(name)).keys()) out.push(r.url); return out; })()`);
    check('the service worker has cached pages (so it ran)', Array.isArray(cached) && cached.length > 0, cached?.length);
    check('the service worker caches nothing under /relay', Array.isArray(cached) && !cached.some((u) => new URL(u).pathname.startsWith('/relay')), cached?.filter((u) => u.includes('relay')));
    const csp = await evaluate(`fetch('/').then((r) => r.headers.get('content-security-policy'))`);
    check('the CSP header is unchanged (connect-src \'self\')', csp === CSP, csp);
  } finally {
    socket?.close();
    if (edge.pid) spawnSync('taskkill', ['/PID', String(edge.pid), '/T', '/F'], { stdio: 'ignore' });
    // Edge can outlive its launcher here: stop every process using this run's profile.
    spawnSync('powershell', ['-NoProfile', '-Command', `Get-CimInstance Win32_Process -Filter "Name='msedge.exe'" | Where-Object { $_.CommandLine -like '*${path.basename(USER_DATA)}*' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }`], { stdio: 'ignore' });
    await sleep(500);
    try { fs.rmSync(USER_DATA, { recursive: true, force: true }); } catch {}
  }
  console.log(`\n${checks - failures}/${checks} checks passed`);
  process.exit(failures ? 1 : 0);
}

main().catch((error) => { console.error(error); process.exit(1); });
