// Evening theme: the lighting mode is decided before first paint, from panna_settings and the (faked) clock.
// Usage: node scripts/test-evening-browser.mjs   (needs the app running on localhost:3000)
import { spawn, spawnSync } from 'child_process';
import fs from 'fs';
import path from 'path';

const EDGE_PATH = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const PORT = 9367;
const BASE = 'http://localhost:3000';
const USER_DATA = path.join(process.cwd(), 'scratch', `panna-evening-edge-${process.pid}-${Date.now()}`);
const THEME = { day: '#2b1d14', evening: '#120a06' };
let checks = 0;
let failures = 0;
function check(label, ok, detail) {
  checks++;
  if (ok) console.log(`✓ ${label}`);
  else { failures++; console.error(`✗ ${label}${detail !== undefined ? ` — ${JSON.stringify(detail)}` : ''}`); }
}
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Replaces Date with one whose "now" starts at the given local hour today and keeps ticking from there.
const fakeClock = (hour) => `(() => {
  const Real = Date;
  const start = new Real(); start.setHours(${hour}, 0, 0, 0);
  const offset = start.getTime() - Real.now();
  class FakeDate extends Real {
    constructor(...args) { if (args.length) super(...args); else super(Real.now() + offset); }
    static now() { return Real.now() + offset; }
  }
  globalThis.Date = FakeDate;
})();`;
// Records the mode and the theme-color meta as they stand when the document has been parsed, before any paint
// React could influence.
const PROBE = `document.addEventListener('DOMContentLoaded', () => {
  const meta = document.querySelector('meta[name="theme-color"]');
  window.__dcl = { light: document.documentElement.dataset.light ?? null, meta: meta ? meta.content : null,
    metas: document.querySelectorAll('meta[name="theme-color"]').length };
});`;

async function main() {
  const edge = spawn(EDGE_PATH, ['--headless=new', `--remote-debugging-port=${PORT}`, `--user-data-dir=${USER_DATA}`,
    '--disable-gpu', '--window-size=390,844', 'about:blank'], { stdio: 'ignore' });
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
    const consoleLines = [];
    socket.addEventListener('message', (event) => {
      const message = JSON.parse(event.data);
      if (message.method === 'Runtime.consoleAPICalled') {
        consoleLines.push(message.params.args.map((a) => a.value ?? a.description ?? '').join(' '));
      } else if (message.method === 'Runtime.exceptionThrown') {
        consoleLines.push(`exception: ${message.params.exceptionDetails?.exception?.description ?? message.params.exceptionDetails?.text}`);
      } else if (message.method === 'Log.entryAdded') {
        consoleLines.push(message.params.entry.text);
      }
    });
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
    const hydrated = async () => {
      for (let i = 0; i < 60; i++) {
        await sleep(250);
        try {
          if (await evaluate(`(() => { const el = document.querySelector('#lookup-input'); return Boolean(el && document.querySelector('.entry-text') && Object.keys(el).some((k) => k.startsWith('__reactFiber$'))); })()`)) return true;
        } catch {}
      }
      return false;
    };
    await send('Page.enable');
    await send('Runtime.enable');
    await send('Log.enable');
    await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });

    // An origin to write localStorage on (no faked clock yet).
    await send('Page.navigate', { url: `${BASE}/page/16` });
    await sleep(1500);

    let registered = [];
    // Loads /page/16 with the given stored settings (undefined: none) at the given hour.
    const load = async (settings, hour) => {
      for (const identifier of registered) await send('Page.removeScriptToEvaluateOnNewDocument', { identifier });
      registered = [];
      await evaluate(`(() => { localStorage.clear(); localStorage.setItem('panna_tours', JSON.stringify({ seen: { start: 1, word: 1, review: 1, settings: 1 }, tips: {}, welcomeDone: true, tipsOff: true, listOpened: true }));
        ${settings === undefined ? '' : `localStorage.setItem('panna_settings', ${JSON.stringify(settings)});`} return true; })()`);
      for (const source of [fakeClock(hour), PROBE]) registered.push((await send('Page.addScriptToEvaluateOnNewDocument', { source })).identifier);
      consoleLines.length = 0;
      await send('Page.navigate', { url: `${BASE}/page/16` });
      const ok = await hydrated();
      await sleep(500);
      const state = await evaluate(`(() => ({ dcl: window.__dcl ?? null, now: document.documentElement.dataset.light ?? null,
        meta: document.querySelector('meta[name="theme-color"]')?.content ?? null, hour: new Date().getHours() }))()`);
      return { ok, ...state };
    };

    // ── No settings at 20:00 ──
    const night = await load(undefined, 20);
    check('the faked clock reads 20:00', night.hour === 20, night);
    check('no settings at 20:00: the first paint is evening', night.dcl?.light === 'evening', night);
    check('no settings at 20:00: still evening after hydration', night.ok && night.now === 'evening', night);
    check('theme-color follows: #120a06 in Evening (one meta)', night.dcl?.meta === THEME.evening && night.dcl?.metas === 1 && night.meta === THEME.evening, night);
    const hydrationLines = consoleLines.filter((line) => /hydrat/i.test(line));
    check('no hydration warning at 20:00', hydrationLines.length === 0, hydrationLines);
    // A client-side navigation must not drop the script-managed meta.
    await evaluate(`(() => { const a = document.querySelector('#nav-saved-btn'); a && a.click(); return true; })()`);
    await sleep(800);
    const afterNav = await evaluate(`({ light: document.documentElement.dataset.light, meta: document.querySelector('meta[name="theme-color"]')?.content })`);
    check('after moving around the app, the mode and meta stay', afterNav?.light === 'evening' && afterNav?.meta === THEME.evening, afterNav);

    // ── No settings at 10:00 ──
    const day = await load(undefined, 10);
    check('no settings at 10:00: day', day.dcl?.light === 'day' && day.ok && day.now === 'day', day);
    check('theme-color follows: #2b1d14 in Day', day.dcl?.meta === THEME.day && day.meta === THEME.day, day);

    // ── Old setting {evening:true} at 10:00 ──
    const old = await load(JSON.stringify({ evening: true, speed: 'realistic', sounds: true }), 10);
    check('{evening:true} at 10:00: evening', old.dcl?.light === 'evening' && old.ok && old.now === 'evening', old);

    // ── {lighting:'day'} at 20:00 ──
    const pinned = await load(JSON.stringify({ lighting: 'day' }), 20);
    check("{lighting:'day'} at 20:00: day", pinned.dcl?.light === 'day' && pinned.ok && pinned.now === 'day', pinned);

    // ── Broken settings at 20:00 ──
    const broken = await load('{', 20);
    check('broken settings at 20:00: evening, no crash', broken.dcl?.light === 'evening' && broken.ok && broken.now === 'evening', broken);
    const errors = consoleLines.filter((line) => /^exception:/.test(line));
    check('broken settings: no uncaught exception', errors.length === 0, errors);
  } finally {
    if (socket) { try { socket.send(JSON.stringify({ id: 999999, method: 'Browser.close' })); } catch {} socket.close(); }
    if (edge.pid) spawnSync('taskkill', ['/PID', String(edge.pid), '/T', '/F'], { stdio: 'ignore' });
    await sleep(500);
    try { fs.rmSync(USER_DATA, { recursive: true, force: true, maxRetries: 10, retryDelay: 250 }); } catch {}
  }
  console.log(`Evening (pre-paint): ${checks - failures}/${checks} checks passed.`);
  if (failures) process.exitCode = 1;
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
