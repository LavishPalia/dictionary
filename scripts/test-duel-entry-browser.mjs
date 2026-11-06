// Panna's way into the Duel in a real browser: the Play tab (phones), the Play header item (desktop) and the Today
// card in its states, with axe on Today. A stand-in schedule is served through CDP for the dated states.
// Usage: node scripts/test-duel-entry-browser.mjs   (needs the app running on localhost:3000)
import { spawn, spawnSync } from 'child_process';
import fs from 'fs';
import path from 'path';

const EDGE_PATH = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const PORT = 9333;
const BASE = 'http://localhost:3000';
const USER_DATA = path.join(process.cwd(), 'scratch', `panna-duel-entry-edge-${process.pid}-${Date.now()}`);
const AXE = fs.readFileSync(path.join(process.cwd(), 'node_modules', 'axe-core', 'axe.min.js'), 'utf8');
const P0 = JSON.parse(fs.readFileSync('data/duel/puzzles/p0001.json', 'utf8'));
const IST_MS = (5 * 60 + 30) * 60 * 1000;
const istDay = (offset = 0) => new Date(Date.now() + IST_MS + offset * 86400000).toISOString().slice(0, 10);
const TODAY = istDay(), YESTERDAY = istDay(-1), TWO_AGO = istDay(-2);
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const dayMonth = (d) => `${Number(d.slice(8))} ${MONTHS[Number(d.slice(5, 7)) - 1]}`;
// p0000 stands in for today's and two earlier days' puzzles. (A run across IST midnight, 18:30 UTC, can fail the dates.)
const FIXTURE = { dates: { [TWO_AGO]: 'p0000.v1', [YESTERDAY]: 'p0000.v1', [TODAY]: 'p0000.v1' }, files: { 'p0000.v1': 'p0000.v1.test0000.json' } };

let failures = 0;
function check(label, ok, detail) {
  if (ok) console.log(`✓ ${label}`);
  else { failures++; console.error(`✗ ${label}${detail !== undefined ? ` — ${JSON.stringify(detail).slice(0, 600)}` : ''}`); }
}
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function main() {
  const edge = spawn(EDGE_PATH, ['--headless=new', `--remote-debugging-port=${PORT}`, `--user-data-dir=${USER_DATA}`,
    '--disable-gpu', '--window-size=1280,800', 'about:blank'], { stdio: 'ignore' });
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
    const evaluate = async (expression) => {
      const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
      if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description ?? r.exceptionDetails.text);
      return r.result?.value;
    };
    const waitFor = async (expr, ms = 10000) => {
      for (let t = 0; t < ms; t += 100) { try { if (await evaluate(expr)) return true; } catch {} await sleep(100); }
      return false;
    };
    const visible = (selector) => evaluate(`(() => { const el = document.querySelector(${JSON.stringify(selector)}); if (!el) return false; const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0 && getComputedStyle(el).display !== 'none'; })()`);
    await send('Page.enable');
    await send('Network.enable');
    // The stand-in schedule only reaches requests the page itself makes, not ones a service worker makes for it.
    await send('Network.setBypassServiceWorker', { bypass: true });
    await send('Runtime.enable');

    // A stand-in schedule through CDP's Fetch domain: the fixture, or with route(false) an empty one (no puzzle today).
    let routing = false;
    socket.addEventListener('message', (event) => {
      const m = JSON.parse(event.data);
      if (m.method !== 'Fetch.requestPaused') return;
      const { requestId, request } = m.params;
      const b64 = (x) => Buffer.from(typeof x === 'string' ? x : JSON.stringify(x)).toString('base64');
      const ok = (body) => send('Fetch.fulfillRequest', { requestId, responseCode: 200, responseHeaders: [{ name: 'Content-Type', value: 'application/json' }], body: b64(body) });
      if (request.url.includes('/duel/schedule.json')) void ok(routing ? FIXTURE : { dates: {}, files: {} });
      else if (routing && request.url.includes('/duel/p/p0000.v1.test0000.json')) void ok(fs.readFileSync('data/duel/puzzles/p0000.json', 'utf8'));
      else void send('Fetch.continueRequest', { requestId });
    });
    const route = (on) => { routing = on; };
    await send('Fetch.enable', { patterns: [{ urlPattern: '*/duel/*' }] });

    const setSize = (s) => send('Emulation.setDeviceMetricsOverride', { width: s.width, height: s.height, deviceScaleFactor: 1, mobile: s.mobile });
    /** Today with the given storage (cleared first); the Duel card is awaited unless none is expected. */
    const today = async (store = {}, { card = true } = {}) => {
      await send('Page.navigate', { url: `${BASE}/icon.svg` });
      await waitFor(`location.pathname === '/icon.svg' && document.readyState === 'complete'`);
      await evaluate(`localStorage.clear(); ${Object.entries(store).map(([k, v]) => `localStorage.setItem(${JSON.stringify(k)}, ${JSON.stringify(JSON.stringify(v))});`).join(' ')} true`);
      await send('Page.navigate', { url: `${BASE}/` });
      await waitFor(`Boolean(document.querySelector('#today-screen'))`, 20000);
      return card ? waitFor(`Boolean(document.querySelector('#today-duel'))`) : true;
    };
    const cardText = () => evaluate(`document.querySelector('#today-duel')?.innerText ?? ''`);
    const button = () => evaluate(`(() => { const a = document.querySelector('#today-duel-btn'); return a ? { text: a.textContent, href: a.getAttribute('href') } : null; })()`);
    const axe = async (label) => {
      await evaluate(`(() => { if (!window.axe) { const s = document.createElement('script'); s.textContent = ${JSON.stringify(AXE)}; document.head.appendChild(s); } return true; })()`);
      const out = await evaluate(`axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'] } })
        .then((r) => r.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical').map((v) => ({ id: v.id, nodes: v.nodes.slice(0, 4).map((n) => n.target.join(' ')) })))`);
      check(`${label}: axe finds no serious or critical problems`, Array.isArray(out) && out.length === 0, out);
    };
    let rules; // the engine's RULES_ID, read from the game saved below
    const save = (puzzleId, you, quill, over = false) => ({ puzzleId, puzzleVersion: 1, rules, seed: 7, log: [], startedAt: '', score: { you, quill }, over });

    // ── Phone ──
    await setSize({ width: 412, height: 915, mobile: true });
    check('phone: Today opens with the Duel card', await today());
    const bar = await evaluate(`[...document.querySelectorAll('.app-bottomnav > *')].map((el) => ({ id: el.id, w: el.getBoundingClientRect().width }))`);
    check('phone: five bar items, Play last', bar.length === 5 && bar[4].id === 'nav-play-btn', bar);
    check('phone: every bar item is at least 44 px wide', bar.every((b) => b.w >= 44), bar);
    check('phone: the Duel card comes before the review card', await evaluate(`(() => { const d = document.querySelector('#today-duel'), r = document.querySelector('#today-review'); return Boolean(d && r && (d.compareDocumentPosition(r) & Node.DOCUMENT_POSITION_FOLLOWING)); })()`));
    let text = await cardText();
    check('phone: no puzzle today → the practice duel', text.includes('Practice duel') && (await button())?.text === 'Play practice duel', text);
    check("phone: its button goes to today's game", (await button())?.href === `/play/game/${TODAY}`, await button());
    await axe('phone Today');

    await evaluate(`document.querySelector('#nav-play-btn').click(); true`);
    check('phone: the Play tab opens the game home', await waitFor(`location.pathname === '/play' && Boolean(document.querySelector('#duel-hero'))`, 20000));
    // One correct tile and Submit, then back to Today.
    await send('Page.navigate', { url: `${BASE}/play/game/${TODAY}?seed=7` });
    await waitFor(`Boolean(window.__duel && document.querySelector('.duel-board [data-cell]'))`, 20000);
    const move = await evaluate(`(() => {
      const st = window.__duel.snapshot().state, sol = ${JSON.stringify(P0.solution)};
      const slot = st.racks.you.findIndex((l) => l != null);
      const cell = Object.keys(sol).map(Number).find((c) => !st.filled[c] && sol[c] === st.racks.you[slot]);
      return { slot, cell };
    })()`);
    await evaluate(`document.querySelector('[data-rack="${move.slot}"] .duel-tile').click(); true`);
    await sleep(100);
    await evaluate(`document.querySelector('.duel-board [data-cell="${move.cell}"]').click(); true`);
    await waitFor(`window.__duel.snapshot().pending.length === 1`, 3000);
    await evaluate(`document.querySelector('[data-act="submit"]').click(); true`);
    check('phone: a move is made', await waitFor(`window.__duel.snapshot().state.log.length >= 1 && !window.__duel.snapshot().busy`, 30000));
    await send('Page.navigate', { url: `${BASE}/` });
    await waitFor(`Boolean(document.querySelector('#today-duel'))`, 20000);
    text = await cardText();
    check('phone: a game under way → Continue and the score', /You lead|Quill leads|Level at/.test(text) && (await button())?.text === 'Continue', text);
    rules = await evaluate(`JSON.parse(localStorage.getItem('panna_duel_game:${TODAY}')).rules`);
    check('phone: the save names its rules', typeof rules === 'string' && rules.length > 0, rules);

    route(true);
    await today({ [`panna_duel_game:${TODAY}`]: save('p0000', 55, 41, true), panna_duel_results: [{ date: TODAY, puzzle: 'p0000.v1', you: 55, quill: 41, at: 'x' }] });
    text = await cardText();
    check('phone: won today → "Won 55 to 41 ★" and the latest open day', text.includes('Won 55 to 41 ★') && (await button())?.text === `Play ${dayMonth(YESTERDAY)}`
      && (await button())?.href === `/play/game/${YESTERDAY}`, { text, b: await button() });
    await today({ [`panna_duel_game:${TODAY}`]: save('p0000', 38, 41, true) });
    text = await cardText();
    check('phone: lost today → Replay', text.includes('Quill won 41 to 38') && (await button())?.text === 'Replay', text);
    await today({ [`panna_duel_game:${TODAY}`]: save('p0000', 40, 40, true) });
    text = await cardText();
    check('phone: a tie → "A tie at 40" and Replay', text.includes('A tie at 40') && (await button())?.text === 'Replay', text);
    await today({ [`panna_duel_game:${TODAY}`]: { ...save('p0000', 24, 19), rules: 'older' } });
    check('phone: a save from other rules → a new game, not Continue', (await button())?.text === 'Play today’s duel', await button());
    await today();
    check("phone: a scheduled day → today's puzzle", (await cardText()).includes('Today’s puzzle is ready') && (await button())?.text === 'Play today’s duel');
    route(false);

    // ── Desktop ──
    await setSize({ width: 1280, height: 800, mobile: false });
    await today();
    check('desktop: a Play item in the header', await visible('#open-play-btn') && (await evaluate(`document.querySelector('#open-play-btn').getAttribute('href')`)) === '/play');
    check('desktop: no bottom bar', !(await visible('.app-bottomnav')));
    await axe('desktop Today');
  } finally {
    try { socket?.close(); } catch {}
    edge.kill();
    await sleep(500);
    spawnSync('cmd', ['/c', 'rmdir', '/s', '/q', USER_DATA], { stdio: 'ignore' });
  }
  if (failures) { console.error(`\n${failures} failed`); process.exit(1); }
  console.log('\nAll duel entry checks passed.');
}
main().catch((e) => { console.error(e); process.exit(1); });
