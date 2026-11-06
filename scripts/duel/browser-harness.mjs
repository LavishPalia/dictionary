// The scaffolding the Duel's newer browser tests share: Edge over CDP, checks, axe, and stand-in schedules.
import { spawn, spawnSync } from 'child_process';
import fs from 'fs';
import path from 'path';

const EDGE_PATH = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const PORT = 9333;
export const BASE = 'http://localhost:3000';
const AXE = fs.readFileSync(path.join(process.cwd(), 'node_modules', 'axe-core', 'axe.min.js'), 'utf8');
const IST_MS = (5 * 60 + 30) * 60 * 1000;

export const istDay = (offset = 0) => new Date(Date.now() + IST_MS + offset * 86400000).toISOString().slice(0, 10);
export const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
export const PHONE = { width: 412, height: 915, mobile: true };
export const DESKTOP = { width: 1280, height: 800, mobile: false };
/** A stand-in schedule of the given dates, all on the test puzzle p0000. */
export const fixture = (dates) => ({ dates: Object.fromEntries(dates.map((d) => [d, 'p0000.v1'])), files: { 'p0000.v1': 'p0000.v1.test0000.json' } });
const P0000 = fs.readFileSync('data/duel/puzzles/p0000.json', 'utf8');

/** Runs `body(t)` against a fresh headless Edge, then prints the result and exits non-zero on any failure. */
export async function run(name, body, { serviceWorker = false } = {}) {
  const userData = path.join(process.cwd(), 'scratch', `panna-duel-test-edge-${process.pid}-${Date.now()}`);
  const edge = spawn(EDGE_PATH, ['--headless=new', `--remote-debugging-port=${PORT}`, `--user-data-dir=${userData}`,
    '--disable-gpu', '--window-size=1280,800', 'about:blank'], { stdio: 'ignore' });
  let socket, failures = 0, total = 0;
  const check = (label, ok, detail) => {
    total++;
    if (ok) console.log(`✓ ${label}`);
    else { failures++; console.error(`✗ ${label}${detail !== undefined ? ` — ${JSON.stringify(detail).slice(0, 600)}` : ''}`); }
  };
  try {
    let endpoint;
    for (let i = 0; i < 40 && !endpoint; i++) {
      await sleep(250);
      try { endpoint = (await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json()).find((x) => x.type === 'page')?.webSocketDebuggerUrl; } catch {}
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
    const evaluate = async (expression) => {
      const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
      if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description ?? r.exceptionDetails.text);
      return r.result?.value;
    };
    const waitFor = async (expr, ms = 10000) => {
      for (let t = 0; t < ms; t += 100) { try { if (await evaluate(expr)) return true; } catch {} await sleep(100); }
      return false;
    };
    await send('Page.enable');
    await send('Runtime.enable');
    await send('Network.enable');
    // The stand-in schedule below only reaches requests the page itself makes, not ones a service worker makes for it.
    await send('Network.setBypassServiceWorker', { bypass: !serviceWorker });
    // "Offline" must cover the service worker as well as the page.
    const workers = new Set();
    socket.addEventListener('message', (event) => {
      const m = JSON.parse(event.data);
      if (m.method === 'Target.attachedToTarget' && m.params.targetInfo.type === 'service_worker') workers.add(m.params.sessionId);
      if (m.method === 'Target.detachedFromTarget') workers.delete(m.params.sessionId);
    });
    const sendTo = (sessionId, method, params = {}) => new Promise((resolve) => {
      const id = 500000 + Math.floor(Math.random() * 400000);
      const done = (result) => { clearTimeout(timer); socket.removeEventListener('message', onMessage); resolve(result); };
      const onMessage = (event) => { const m = JSON.parse(event.data); if (m.id === id) done(m.result ?? null); };
      const timer = setTimeout(() => { workers.delete(sessionId); done(null); }, 2000);
      socket.addEventListener('message', onMessage);
      socket.send(JSON.stringify({ id, method, params, sessionId }));
    });
    if (serviceWorker) await send('Target.setAutoAttach', { autoAttach: true, waitForDebuggerOnStart: false, flatten: true });

    // The schedule is always a stand-in, so a run doesn't depend on today's date in the real one.
    // With the service worker on, a test runs on the real schedule (null: leave the request alone).
    let schedule = serviceWorker ? null : fixture([]);
    // The Duel's server: left alone until a test sets a handler, or 'fail' for no connection.
    let api = null;
    const answerApi = async (requestId, request) => {
      const res = await api(new Request(request.url, { method: request.method, headers: request.headers, body: request.postData }));
      await send('Fetch.fulfillRequest', { requestId, responseCode: res.status, responseHeaders: [...res.headers].map(([name, value]) => ({ name, value })),
        body: Buffer.from(await res.text()).toString('base64') });
    };
    socket.addEventListener('message', (event) => {
      const m = JSON.parse(event.data);
      if (m.method !== 'Fetch.requestPaused') return;
      const { requestId, request } = m.params;
      if (request.url.includes('/api/duel/') && api) {
        if (api === 'fail') void send('Fetch.failRequest', { requestId, errorReason: 'InternetDisconnected' });
        else void answerApi(requestId, request).catch((e) => { console.error(e); void send('Fetch.failRequest', { requestId, errorReason: 'Failed' }); });
        return;
      }
      const ok = (body) => send('Fetch.fulfillRequest', { requestId, responseCode: 200, responseHeaders: [{ name: 'Content-Type', value: 'application/json' }],
        body: Buffer.from(typeof body === 'string' ? body : JSON.stringify(body)).toString('base64') });
      if (request.url.includes('/duel/schedule.json') && schedule === null) void send('Fetch.continueRequest', { requestId });
      else if (request.url.includes('/duel/schedule.json')) void (schedule === 'fail' ? send('Fetch.failRequest', { requestId, errorReason: 'InternetDisconnected' }) : ok(schedule));
      else if (request.url.includes('/duel/p/p0000.v1.test0000.json')) void ok(P0000);
      else void send('Fetch.continueRequest', { requestId });
    });
    await send('Fetch.enable', { patterns: [{ urlPattern: '*/duel/*' }] });

    const t = {
      send, evaluate, waitFor, check,
      setSchedule: (s) => { schedule = s; },
      /** A function from Request to Response, 'fail' for no connection, or null for the real server. */
      setApi: (a) => { api = a; },
      /** No connection, for the page and the service worker both. */
      offline: async (on) => {
        const conditions = { offline: on, latency: 0, downloadThroughput: -1, uploadThroughput: -1 };
        await send('Network.emulateNetworkConditions', conditions);
        for (const s of workers) { await sendTo(s, 'Network.enable'); await sendTo(s, 'Network.emulateNetworkConditions', conditions); }
        await sleep(300);
      },
      /** A connection that shows signal but carries nothing, for the service worker. */
      stalled: async (on) => {
        const conditions = { offline: false, latency: on ? 60000 : 0, downloadThroughput: -1, uploadThroughput: -1 };
        for (const s of workers) { await sendTo(s, 'Network.enable'); await sendTo(s, 'Network.emulateNetworkConditions', conditions); }
        await sleep(300);
      },
      setSize: (s) => send('Emulation.setDeviceMetricsOverride', { width: s.width, height: s.height, deviceScaleFactor: 1, mobile: s.mobile }),
      reduceMotion: (on) => send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: on ? 'reduce' : '' }] }),
      /** Opens a path with exactly this storage (values are JSON-encoded; `raw` ones are stored as they are). */
      open: async (url, store = {}, raw = {}) => {
        await send('Page.navigate', { url: `${BASE}/icon.svg` });
        await waitFor(`location.pathname === '/icon.svg' && document.readyState === 'complete'`);
        await evaluate(`localStorage.clear(); ${Object.entries(store).map(([k, v]) => `localStorage.setItem(${JSON.stringify(k)}, ${JSON.stringify(JSON.stringify(v))});`).join(' ')}
          ${Object.entries(raw).map(([k, v]) => `localStorage.setItem(${JSON.stringify(k)}, ${JSON.stringify(v)});`).join(' ')} true`);
        await send('Page.navigate', { url: `${BASE}${url}` });
      },
      /** Navigates without touching storage. */
      go: async (url) => { await send('Page.navigate', { url: `${BASE}${url}` }); },
      click: (sel) => evaluate(`(() => { const el = document.querySelector(${JSON.stringify(sel)}); if (!el) return false; el.click(); return true; })()`),
      text: (sel) => evaluate(`document.querySelector(${JSON.stringify(sel)})?.innerText ?? ''`),
      exists: (sel) => evaluate(`Boolean(document.querySelector(${JSON.stringify(sel)}))`),
      /** The check under the lighting its label names; Auto would otherwise follow the clock. */
      axe: async (label) => {
        await evaluate(`document.documentElement.setAttribute('data-light', ${JSON.stringify(/evening/i.test(label) ? 'evening' : 'day')}); true`);
        await evaluate(`(() => { if (!window.axe) { const s = document.createElement('script'); s.textContent = ${JSON.stringify(AXE)}; document.head.appendChild(s); } return true; })()`);
        const out = await evaluate(`axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'] } })
          .then((r) => r.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical').map((v) => ({ id: v.id, nodes: v.nodes.slice(0, 4).map((n) => n.target.join(' ')) })))`);
        check(`${label}: axe finds no serious or critical problems`, Array.isArray(out) && out.length === 0, out);
      },
      /** Sets Panna's lighting the way its settings do, for the next load. */
      light: (mode) => evaluate(`document.documentElement.setAttribute('data-light', ${JSON.stringify(mode)}); true`),
    };
    await body(t);
  } finally {
    try { socket?.close(); } catch {}
    edge.kill();
    await sleep(500);
    spawnSync('cmd', ['/c', 'rmdir', '/s', '/q', userData], { stdio: 'ignore' });
  }
  if (failures) { console.error(`\n${failures} failed`); process.exit(1); }
  console.log(`\n${name}: ${total}/${total} checks passed.`);
}
