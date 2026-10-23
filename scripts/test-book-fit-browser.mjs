// Step 5: the desktop spread fits smaller windows (scaled, never clipped), and on phones the page follows the
// finger when swiped, springs back from a short drag, and turns on a long swipe or a flick.
// Usage: node scripts/test-book-fit-browser.mjs   (needs the app running on localhost:3000)
import { spawn, spawnSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import Database from 'better-sqlite3';
// The page Calm is on: tests open it to tap a known entry (page numbers change when the book grows).
const CALM_PAGE = new Database('data/dictionary.db', { readonly: true })
  .prepare("SELECT page_number FROM entries WHERE normalized = 'calm'").get().page_number;

const EDGE_PATH = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const PORT = 9355;
const BASE = 'http://localhost:3000';
const USER_DATA = path.join(process.cwd(), 'scratch', `panna-bookfit-edge-${process.pid}-${Date.now()}`);
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


    const click = async (selector) => {
      for (let i = 0; i < 40; i++) { if (await evaluate(`(() => { const el = document.querySelector(${JSON.stringify(selector)}); if (!el) return false; el.click(); return true; })()`)) return true; await sleep(100); }
      return false;
    };
    const quiet = () => evaluate(`localStorage.clear(); localStorage.setItem('panna_tours', JSON.stringify({ seen: { start: 1, word: 1, review: 1, settings: 1 }, tips: {}, welcomeDone: true, tipsOff: true, listOpened: true })); true`);
    const where = () => evaluate('location.pathname');
    // A real mouse click at the middle of an element, so hit testing goes through the scaled spread.
    const mouseClick = async (expr) => {
      const at = await evaluate(`(() => { const el = ${expr}; if (!el) return null; const r = el.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()`);
      if (!at) return false;
      await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: at.x, y: at.y });
      await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: at.x, y: at.y, button: 'left', clickCount: 1 });
      await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: at.x, y: at.y, button: 'left', clickCount: 1 });
      return true;
    };
    // Everything the spread draws, arrows and letter tabs included.
    const footprint = () => evaluate(`(() => {
      const c = document.querySelector('#book-spread-container'); if (!c) return null;
      let l = Infinity, r = -Infinity, t = Infinity, b = -Infinity;
      for (const el of [c, ...c.querySelectorAll('*')]) { const x = el.getBoundingClientRect(); if (!x.width || !x.height || getComputedStyle(el).visibility === 'hidden') continue;
        l = Math.min(l, x.left); r = Math.max(r, x.right); t = Math.min(t, x.top); b = Math.max(b, x.bottom); }
      return { l: Math.round(l), r: Math.round(r), t: Math.round(t), b: Math.round(b), scale: Number(document.querySelector('#book-scale')?.dataset.scale), scrollW: document.documentElement.scrollWidth };
    })()`);

    // ── Desktop: the spread fits the window ──
    await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
    await send('Page.navigate', { url: `${BASE}/page/${CALM_PAGE}` });
    await sleep(1500);
    await quiet();
    for (const [w, h] of [[1440, 900], [1366, 768], [1280, 800], [1280, 720], [1180, 800], [1100, 800], [1024, 768]]) {
      const name = `${w}×${h}`;
      check(`${name}: app hydrates`, await open(`/page/${CALM_PAGE}`, { width: w, height: h, mobile: false }));
      await sleep(400);
      const f = await footprint();
      check(`${name}: nothing scrolls sideways`, f && f.scrollW <= w, f);
      check(`${name}: the spread, arrows and letter tabs are all on screen`, f && f.l >= 0 && f.r <= w && f.t >= 0 && f.b <= h, f);
      if (w === 1440) check(`${name}: full size when there is room`, f?.scale === 1, f?.scale);
      else check(`${name}: shrunk to fit, and no further`, f && f.scale < 1 && f.scale >= 0.6 && (f.r - f.l > w - 60 || f.b > h - 40), f);
    }
    // At the smallest size, the scaled book still works with the mouse.
    await open(`/page/${CALM_PAGE}`, { width: 1024, height: 768, mobile: false });
    await sleep(400);
    await mouseClick(`[...document.querySelectorAll('.entry-open')].find((b) => b.textContent.startsWith('Calm'))`);
    await sleep(900);
    check('1024×768: clicking a word on the scaled page opens its card', await evaluate(`document.querySelector('#word-sheet-title')?.textContent === 'Calm'`));
    await key('Escape');
    await sleep(500);
    const before = await where();
    await mouseClick(`document.querySelector('[aria-label="Next spread"]')`);
    for (let i = 0; i < 25 && (await where()) === before; i++) await sleep(200);
    check('1024×768: the next-spread arrow turns the page', (await where()) !== before, { before, after: await where() });

    // ── Phone: the page follows the finger ──
    const phone = { width: 390, height: 844, mobile: true };
    await send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 1 });
    const touch = (type, x, y) => send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x, y }] });
    const offset = () => evaluate(`(() => { const el = document.querySelector('#mobile-page'); if (!el) return null; const t = getComputedStyle(el).transform; return t === 'none' ? 0 : Math.round(new DOMMatrix(t).m41); })()`);
    // Drag from x0 to x1 in steps; keep the finger down unless lift is set.
    const drag = async (x0, x1, { y0 = 420, y1 = 420, steps = 8, stepMs = 16, lift = true } = {}) => {
      await touch('touchStart', x0, y0);
      for (let i = 1; i <= steps; i++) { await touch('touchMove', x0 + ((x1 - x0) * i) / steps, y0 + ((y1 - y0) * i) / steps); await sleep(stepMs); }
      if (lift) await touch('touchEnd');
    };
    const waitFor = async (page, ms = 2500) => { for (let i = 0; i < ms / 100 && (await where()) !== page; i++) await sleep(100); return where(); };
    for (const reduce of [false, true]) {
      const label = reduce ? 'phone, reduce motion' : 'phone';
      await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: reduce ? 'reduce' : 'no-preference' }] });
      check(`${label}: app hydrates`, await open(`/page/${CALM_PAGE}`, phone));
      await sleep(600);
      await drag(300, 200, { lift: false });
      await sleep(50);
      check(`${label}: the page follows the finger`, Math.abs((await offset()) + 100) <= 2, await offset());
      await touch('touchMove', 250, 420);
      await sleep(50);
      check(`${label}: and comes back with it`, Math.abs((await offset()) + 50) <= 2, await offset());
      await touch('touchEnd');
      await sleep(400);
      check(`${label}: a short drag springs back without turning`, (await offset()) === 0 && (await where()) === `/page/${CALM_PAGE}`, { offset: await offset(), path: await where() });

      await drag(320, 100, { steps: 10, stepMs: 30 });
      check(`${label}: a long swipe left turns to the next page`, (await waitFor(`/page/${CALM_PAGE + 1}`)) === `/page/${CALM_PAGE + 1}`, await where());
      await sleep(600);
      check(`${label}: the new page settles in place`, (await offset()) === 0, await offset());

      await drag(80, 300, { steps: 10, stepMs: 30 });
      check(`${label}: a long swipe right turns back`, (await waitFor(`/page/${CALM_PAGE}`)) === `/page/${CALM_PAGE}`, await where());
      await sleep(600);

      // 80px in two quick moves: under a quarter of the page (a swipe), so only its speed can turn the page.
      await drag(260, 180, { steps: 2, stepMs: 0 });
      check(`${label}: a quick flick turns the page`, (await waitFor(`/page/${CALM_PAGE + 1}`)) === `/page/${CALM_PAGE + 1}`, await where());
      await sleep(600);

      const at = await where();
      await drag(200, 215, { y0: 600, y1: 300, lift: false });
      check(`${label}: an up-and-down drag does not move the page sideways`, (await offset()) === 0, await offset());
      await touch('touchEnd');
      await sleep(300);
      check(`${label}: nor turn it`, (await where()) === at, await where());

      await open('/page/1', phone);
      await sleep(500);
      await drag(80, 280, { lift: false });
      const resisted = await offset();
      check(`${label}: on page 1 the page resists a swipe back`, resisted > 20 && resisted <= 60, resisted);
      await touch('touchEnd');
      await sleep(500);
      check(`${label}: and stays on page 1`, (await where()) === '/page/1' && (await offset()) === 0, { path: await where(), offset: await offset() });
    }
    await send('Emulation.setEmulatedMedia', { features: [] });
    // The buttons still turn pages.
    await open(`/page/${CALM_PAGE}`, phone);
    await sleep(500);
    await click('[aria-label="Next page"]');
    check('phone: the → button still turns the page', (await waitFor(`/page/${CALM_PAGE + 1}`)) === `/page/${CALM_PAGE + 1}`, await where());
  } finally {
    if (socket) { try { socket.send(JSON.stringify({ id: 999999, method: 'Browser.close' })); } catch {} socket.close(); }
    if (edge.pid) spawnSync('taskkill', ['/PID', String(edge.pid), '/T', '/F'], { stdio: 'ignore' });
    await sleep(500);
    try { fs.rmSync(USER_DATA, { recursive: true, force: true, maxRetries: 10, retryDelay: 250 }); } catch {}
  }
  console.log(`Book fit: ${checks - failures}/${checks} checks passed.`);
  if (failures) process.exitCode = 1;
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
