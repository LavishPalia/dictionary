// Motion pass: page-to-sheet glide, drawn underline, save stamp, Instant speed, saved settings, and the
// reduce-motion setting, at desktop and phone sizes.
// Usage: node scripts/test-motion-browser.mjs   (needs the app running on localhost:3000)
import { spawn, spawnSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import Database from 'better-sqlite3';
// The page Camel is on: tests open it to tap a known entry (page numbers change when the book grows).
const CAMEL_PAGE = new Database('data/dictionary.db', { readonly: true })
  .prepare("SELECT page_number FROM entries WHERE normalized = 'camel'").get().page_number;
// Desktop spreads start on an even page; the next spread is two pages on. Guide word: the spread's first headword.
const SPREAD = CAMEL_PAGE - (CAMEL_PAGE % 2);
const NEXT_SPREAD = SPREAD + 2;
const guideOf = (page) => new Database('data/dictionary.db', { readonly: true })
  .prepare('SELECT headword FROM entries WHERE page_number = ? ORDER BY col_idx, position_in_col LIMIT 1').get(page).headword;
const [GUIDE, NEXT_GUIDE] = [guideOf(SPREAD), guideOf(NEXT_SPREAD)];

const EDGE_PATH = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const PORT = 9323;
const BASE = 'http://localhost:3000';
const USER_DATA = path.join(process.cwd(), 'scratch', `panna-motion-edge-${process.pid}-${Date.now()}`);
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

    const desktop = { width: 1440, height: 900, mobile: false };
    const phone = { width: 390, height: 844, mobile: true };
    const reduce = (on) => send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: on ? 'reduce' : 'no-preference' }] });
    const clickEntry = (headword) => evaluate(`(() => { const p = [...document.querySelectorAll('.entry-text')].find((e) => e.textContent.startsWith(${JSON.stringify(headword)}) && e.style.cursor === 'pointer'); if (!p) return false; p.click(); return true; })()`);
    // Counts View Transitions started from now on.
    const watchTransitions = () => evaluate(`(() => { window.__vt = 0; const orig = document.startViewTransition?.bind(document); if (orig) document.startViewTransition = (cb) => { window.__vt++; return orig(cb); }; return Boolean(orig); })()`);
    // Turns forward one spread; reports how long the URL took to change and what the page shows 150ms later.
    const timeTurn = () => evaluate(`(async () => {
      const from = location.pathname; const t0 = performance.now();
      document.querySelector('button[aria-label="Next spread"]').click();
      for (let i = 0; i < 160; i++) { await new Promise((r) => setTimeout(r, 25)); if (location.pathname !== from) break; }
      const ms = Math.round(performance.now() - t0);
      await new Promise((r) => setTimeout(r, 150));
      return { ms, path: location.pathname, guide: document.querySelector('.guide-word')?.textContent };
    })()`);

    // ── Desktop, normal motion ──────────────────────────────
    await reduce(false);
    check('desktop: app hydrates', await open(`/page/${CAMEL_PAGE}`, desktop));
    await evaluate(`localStorage.removeItem('panna_saved_words'); localStorage.removeItem('panna_settings'); true`);
    check('desktop: page 16 reloads with no saved state', await open(`/page/${CAMEL_PAGE}`, desktop));
    const hasVT = await watchTransitions();
    check('desktop: tapping an entry opens its sheet', await clickEntry('Camel'));
    await sleep(80);
    const underline = await evaluate(`[...document.querySelectorAll('.pencil-underlined')].find((e) => e.textContent.trim() === 'Camel')?.getAnimations().map((a) => a.animationName) ?? []`);
    check('desktop: the pencil underline draws itself', underline.includes('pencil-draw'), underline);
    await sleep(600);
    check('desktop: the headword glides into the sheet (View Transition) when the browser supports it',
      !hasVT || await evaluate('window.__vt === 1'), { hasVT, calls: await evaluate('window.__vt') });
    check('desktop: sheet title carries the shared transition name',
      await evaluate(`getComputedStyle(document.querySelector('#word-sheet-title')).viewTransitionName === 'word-headword'`));
    await evaluate(`document.querySelector('#save-word-btn').click(); true`);
    await sleep(100);
    const stamp = await evaluate(`({ star: Boolean(document.querySelector('.motion-flying-star')), anims: document.querySelector('#save-word-btn svg').getAnimations().map((a) => a.animationName) })`);
    check('desktop: saving stamps the star and sends one flying to Saved', stamp.star && stamp.anims.includes('ink-stamp'), stamp);
    await sleep(900);
    check('desktop: the flying star cleans itself up', await evaluate(`!document.querySelector('.motion-flying-star')`));
    await evaluate(`document.querySelector('#save-word-btn').click(); true`);
    await key('Escape');
    await sleep(300);


    await evaluate(`document.querySelector('#menu-btn').click(); true`);
    await sleep(200);
    await evaluate(`[...document.querySelectorAll('[role="radio"]')].find((r) => r.textContent === 'Instant').click(); [...document.querySelectorAll('[role="radio"]')].find((r) => r.textContent === 'Evening').click(); true`);
    await key('Escape');
    await sleep(200);
    const instant = await timeTurn();
    check('desktop: "Instant" page turns land at once (no 3D flip)', instant.ms < 400 && instant.path === `/page/${NEXT_SPREAD}` && instant.guide === NEXT_GUIDE, instant);
    check('desktop: lighting (with the legacy evening key), speed and sounds are saved',
      await evaluate(`localStorage.getItem('panna_settings')`) === JSON.stringify({ lighting: 'evening', evening: true, speed: 'instant', sounds: true }),
      await evaluate(`localStorage.getItem('panna_settings')`));
    await open(`/page/${CAMEL_PAGE}`, desktop);
    await evaluate(`document.querySelector('#menu-btn').click(); true`);
    await sleep(200);
    const restored = await evaluate(`[...document.querySelectorAll('[role="radio"][aria-checked="true"]')].map((r) => r.textContent)`);
    check('desktop: settings are restored after a reload', restored.includes('Evening') && restored.includes('Instant'), restored);
    await evaluate(`[...document.querySelectorAll('[role="radio"]')].find((r) => r.textContent === 'Normal').click(); [...document.querySelectorAll('[role="radio"]')].find((r) => r.textContent === 'Day').click(); true`);
    await key('Escape');
    await sleep(200);
    const flipping = await evaluate(`(async () => {
      document.querySelector('button[aria-label="Next spread"]').click();
      for (let i = 0; i < 40; i++) { await new Promise((r) => setTimeout(r, 25)); if (location.pathname !== '/page/${CAMEL_PAGE}') break; }
      await new Promise((r) => setTimeout(r, 150));
      // Mid-turn the spread still shows the old guide word: the leaf is animating.
      return { path: location.pathname, guide: document.querySelector('.guide-word')?.textContent };
    })()`);
    check('desktop: "Normal" speed still plays the 3D page turn', flipping.path === `/page/${NEXT_SPREAD}` && flipping.guide === GUIDE, flipping);
    await sleep(1500);

    // ── Desktop, reduce motion ──────────────────────────────
    await reduce(true);
    check('reduce motion: app hydrates', await open(`/page/${CAMEL_PAGE}`, desktop));
    await watchTransitions();
    const reduced = await evaluate(`(async () => {
      document.querySelector('button[aria-label="Next spread"]').click();
      for (let i = 0; i < 40; i++) { await new Promise((r) => setTimeout(r, 25)); if (location.pathname !== '/page/${CAMEL_PAGE}') break; }
      await new Promise((r) => setTimeout(r, 150));
      return { path: location.pathname, guide: document.querySelector('.guide-word')?.textContent };
    })()`);
    check('reduce motion: page turns land at once', reduced.path === `/page/${NEXT_SPREAD}` && reduced.guide === NEXT_GUIDE, reduced);
    await evaluate(`document.querySelector('#menu-btn').click(); true`);
    await sleep(200);
    check('reduce motion: the menu explains why pages turn instantly', await evaluate(`document.querySelector('#reading-menu').innerText.includes('asks for less motion')`));
    await key('Escape');
    await sleep(200);
    await clickEntry('Century');
    await sleep(150);
    check('reduce motion: no glide into the sheet', await evaluate('window.__vt === 0'));
    check('reduce motion: the underline appears without drawing',
      await evaluate(`[...document.querySelectorAll('.pencil-underlined')].every((e) => getComputedStyle(e).animationName === 'none')`));
    await evaluate(`document.querySelector('#save-word-btn').click(); true`);
    await sleep(60);
    check('reduce motion: no flying star', await evaluate(`!document.querySelector('.motion-flying-star')`));
    await evaluate(`document.querySelector('#save-word-btn').click(); true`);
    await key('Escape');
    await sleep(200);
    await evaluate(`document.querySelector('#menu-btn').click(); true`);
    await sleep(200);
    await evaluate(`document.querySelector('#cover-toggle-btn').click(); true`);
    await sleep(300);
    await evaluate(`document.querySelector('#book-front-cover')?.click(); true`);
    await sleep(150);
    check('reduce motion: the cover opens without the swing',
      await evaluate(`Boolean(document.querySelector('#book-spread-container')) && !document.querySelector('#cover-cinematic-container')`));

    // ── Phone ───────────────────────────────────────────────
    await reduce(false);
    check('phone: app hydrates', await open(`/page/${CAMEL_PAGE}`, phone));
    await clickEntry('Camel');
    await sleep(500);
    await evaluate(`document.querySelector('#save-word-btn').click(); true`);
    const landing = await evaluate(`(async () => {
      const tab = document.querySelector('#nav-saved-btn').getBoundingClientRect();
      let last = null;
      for (let i = 0; i < 12; i++) { await new Promise((r) => setTimeout(r, 50)); const s = document.querySelector('.motion-flying-star'); if (s) { const r = s.getBoundingClientRect(); last = [r.left + r.width / 2, r.top + r.height / 2]; } }
      return { tab: [tab.left + tab.width / 2, tab.top + tab.height / 2], last };
    })()`);
    check('phone: the saved star lands on the Saved tab',
      landing.last && Math.abs(landing.last[0] - landing.tab[0]) < 30 && Math.abs(landing.last[1] - landing.tab[1]) < 30, landing);
    await evaluate(`document.querySelector('#save-word-btn').click(); localStorage.removeItem('panna_settings'); true`);

    // ── Ink lines while a page loads (a slow connection) ──
    // Page requests are held back 2.5 s from the very start, so even the pages fetched ahead are still on their way.
    await send('Page.addScriptToEvaluateOnNewDocument', { source: `if (localStorage.getItem('test-slow-pages')) {
      const real = window.fetch.bind(window);
      window.fetch = (input, init) => (String(input?.url ?? input).includes('/api/page/') ? new Promise((r) => setTimeout(r, 2500)).then(() => real(input, init)) : real(input, init));
    }` });
    const slowTurn = (label, inside) => evaluate(`(async () => {
      const from = location.pathname;
      document.querySelector('button[aria-label="${label}"]').click();
      const seen = { at300: null, inside: false, said: '' };
      await new Promise((r) => setTimeout(r, 120));
      seen.early = Boolean(document.querySelector('#page-loading'));
      await new Promise((r) => setTimeout(r, 180));
      const lines = document.querySelector('#page-loading');
      seen.at300 = Boolean(lines);
      seen.inside = Boolean(lines?.closest('${inside}'));
      seen.said = lines?.textContent ?? '';
      seen.anim = lines ? getComputedStyle(lines.querySelector('i')).animationName : null;
      for (let i = 0; i < 200; i++) { await new Promise((r) => setTimeout(r, 25)); if (location.pathname !== from) break; }
      await new Promise((r) => setTimeout(r, 100));
      seen.turned = location.pathname !== from;
      seen.gone = !document.querySelector('#page-loading');
      return seen;
    })()`);
    for (const [name, size, label, inside] of [['desktop', desktop, 'Next spread', '#book-spread-container'], ['phone', phone, 'Next page', '#mobile-page']]) {
      await reduce(false);
      await open(`/page/${CAMEL_PAGE}`, size);
      await evaluate(`localStorage.setItem('test-slow-pages', '1'); true`);
      await open(`/page/${CAMEL_PAGE}`, size);
      const seen = await slowTurn(label, inside);
      check(`${name}: a slow page shows ink lines over the book, and says it is loading`,
        seen.at300 && seen.inside && seen.said.startsWith('Loading page') && seen.anim === 'ink-write', seen);
      check(`${name}: a quick wait shows nothing (no lines in the first 120 ms)`, seen.early === false, seen);
      check(`${name}: the lines go once the page arrives and the turn happens`, seen.turned && seen.gone, seen);
      if (name === 'desktop') {
        await reduce(true);
        await open(`/page/${CAMEL_PAGE}`, size);
        const still = await slowTurn(label, inside);
        check('reduce motion: the ink lines show still, without writing', still.at300 && still.anim === 'none' && still.turned && still.gone, still);
        await reduce(false);
      }
      await evaluate(`localStorage.removeItem('test-slow-pages'); true`);
    }
  } finally {
    if (socket) { try { socket.send(JSON.stringify({ id: 999999, method: 'Browser.close' })); } catch {} socket.close(); }
    if (edge.pid) spawnSync('taskkill', ['/PID', String(edge.pid), '/T', '/F'], { stdio: 'ignore' });
    await sleep(500);
    try { fs.rmSync(USER_DATA, { recursive: true, force: true, maxRetries: 10, retryDelay: 250 }); } catch {}
  }
  console.log(`Motion: ${checks - failures}/${checks} checks passed.`);
  if (failures) process.exitCode = 1;
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
