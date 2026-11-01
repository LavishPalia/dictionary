// Panna Duel's game screen in a real browser: the board, play by tap, Continue after a reload, the desktop
// column and axe, at phone and desktop sizes.
// Usage: node scripts/test-duel-ui-browser.mjs   (needs the app running on localhost:3000)
import { spawn, spawnSync } from 'child_process';
import fs from 'fs';
import path from 'path';

const EDGE_PATH = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const PORT = 9331;
const BASE = 'http://localhost:3000';
const USER_DATA = path.join(process.cwd(), 'scratch', `panna-duel-edge-${process.pid}-${Date.now()}`);
const P0 = JSON.parse(fs.readFileSync('data/duel/puzzles/p0000.json', 'utf8'));
const GAME = '/play/game/2026-11-01';
const AXE = fs.readFileSync(path.join(process.cwd(), 'node_modules', 'axe-core', 'axe.min.js'), 'utf8');
let checks = 0;
let failures = 0;
function check(label, ok, detail) {
  checks++;
  if (ok) console.log(`✓ ${label}`);
  else { failures++; console.error(`✗ ${label}${detail !== undefined ? ` — ${JSON.stringify(detail).slice(0, 600)}` : ''}`); }
}
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** A correct empty cell for each tile in your rack (from the fixture's solution). */
function correctPlacements(state, count = 5) {
  const used = new Set(), out = [];
  state.racks.you.forEach((l, rackSlot) => {
    if (l == null || out.length >= count) return;
    const cell = Object.keys(P0.solution).map(Number).sort((a, b) => a - b)
      .find((c) => !state.filled[c] && !used.has(c) && P0.solution[c] === l);
    if (cell !== undefined) { used.add(cell); out.push({ rackSlot, cell }); }
  });
  return out;
}

/** Tiles from your rack on empty cells where they don't belong. */
function wrongPlacements(state, count, skip = new Set()) {
  const used = new Set(), out = [];
  state.racks.you.forEach((l, rackSlot) => {
    if (l == null || out.length >= count || skip.has(rackSlot)) return;
    const cell = Object.keys(P0.solution).map(Number).find((c) => !state.filled[c] && !used.has(c) && P0.solution[c] !== l);
    if (cell !== undefined) { used.add(cell); out.push({ rackSlot, cell }); }
  });
  return out;
}

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
    await send('Page.enable');
    await send('Runtime.enable');

    const phone = { width: 360, height: 740, mobile: true };
    const desktop = { width: 1280, height: 800, mobile: false };
    let size = phone;
    const setSize = async (s) => {
      size = s;
      await send('Emulation.setDeviceMetricsOverride', { width: s.width, height: s.height, deviceScaleFactor: 1, mobile: s.mobile });
      await send('Emulation.setTouchEmulationEnabled', { enabled: s.mobile, maxTouchPoints: s.mobile ? 5 : 1 });
    };
    const reduce = (on) => send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: on ? 'reduce' : 'no-preference' }] });
    const snap = () => evaluate('window.__duel ? JSON.parse(JSON.stringify(window.__duel.snapshot())) : null');
    const waitFor = async (expr, ms = 10000) => {
      for (let t = 0; t < ms; t += 50) { try { if (await evaluate(expr)) return true; } catch {} await sleep(50); }
      return false;
    };
    const open = async (url, { clear = false } = {}) => {
      if (clear) {
        await send('Page.navigate', { url: `${BASE}/icon.svg` });
        await sleep(200);
        await evaluate('localStorage.clear(); true');
      }
      await send('Page.navigate', { url: `${BASE}${url}` });
      return waitFor(`Boolean(window.__duel && document.querySelector('.duel-board [data-cell]'))`, 15000);
    };
    const center = (selector) => evaluate(`(() => { const el = document.querySelector(${JSON.stringify(selector)}); if (!el) return null;
      const r = el.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()`);
    /** A tap where the element is: a touch on phones, a mouse click on desktop. */
    const tap = async (selector) => {
      const at = await center(selector);
      if (!at) return false;
      if (size.mobile) {
        await send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: at.x, y: at.y }] });
        await send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      } else {
        await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: at.x, y: at.y, button: 'left', clickCount: 1 });
        await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: at.x, y: at.y, button: 'left', clickCount: 1 });
      }
      await sleep(30);
      return true;
    };
    const idle = () => waitFor('window.__duel && !window.__duel.snapshot().busy', 30000);
    /** One turn by tap: each tile, then its cell, then Submit. */
    const tapTurn = async (placements) => {
      const before = (await snap()).state.log.length;
      for (const t of placements) {
        await tap(`[data-rack="${t.rackSlot}"] .duel-tile`);
        await tap(`.duel-board [data-cell="${t.cell}"]`);
      }
      await tap('[data-act="submit"]');
      await waitFor(`window.__duel.snapshot().state.log.length > ${before}`, 5000);
      return idle();
    };
    const axe = async (label) => {
      await evaluate(`(() => { if (!window.axe) { const s = document.createElement('script'); s.textContent = ${JSON.stringify(AXE)}; document.head.appendChild(s); } return true; })()`);
      const out = await evaluate(`axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'] } })
        .then((r) => r.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical').map((v) => ({ id: v.id, nodes: v.nodes.slice(0, 4).map((n) => n.target.join(' ')) })))`);
      check(`${label}: axe finds no serious or critical problems`, Array.isArray(out) && out.length === 0, out);
    };

    // ── Phone: the screen ──
    await setSize(phone);
    await reduce(true);
    check('phone: /play lands on a game', await open('/play?seed=7', { clear: true }));
    check('phone: /play redirects to /play/game/<today>', /^\/play\/game\/\d{4}-\d{2}-\d{2}$/.test(await evaluate('location.pathname')), await evaluate('location.pathname'));
    check('phone: a future date goes to today', await open('/play/game/2099-01-01?seed=7') && !(await evaluate('location.pathname')).includes('2099'));
    check('phone: the game opens', await open(`${GAME}?seed=7`, { clear: true }));
    const screen = await evaluate(`(() => ({
      cells: document.querySelectorAll('.duel-board [data-cell]').length,
      given: ${JSON.stringify(P0.given)}.map((c) => document.querySelector('.duel-board [data-cell="' + c + '"]').textContent.trim()),
      tiles: document.querySelectorAll('.duel-rack [data-rack] .duel-tile').length,
      button: document.querySelector('[data-act="submit"]').textContent.trim(),
      clueBar: Boolean(document.querySelector('.cb, [aria-label="Clue bar"]')),
      font: getComputedStyle(document.querySelector('.duel-rack .duel-tile .lt')).fontFamily,
      pic: [...document.querySelectorAll('.duel-board img')].map((i) => i.getAttribute('src')),
    }))()`);
    check('phone: 80 cells on the board', screen.cells === 80, screen.cells);
    check('phone: the 3 given letters show', screen.given.join('') === P0.given.map((c) => P0.solution[c]).join(''), screen.given);
    check('phone: 5 tiles in the rack', screen.tiles === 5, screen.tiles);
    check('phone: the big button says Pass', screen.button === 'Pass', screen.button);
    check('phone: there is no clue bar', !screen.clueBar);
    check('phone: tile letters use Montserrat', /Duel Montserrat/.test(screen.font), screen.font);
    check('phone: pictures are self-hosted', screen.pic.length === 3 && screen.pic.every((s) => s.startsWith('/duel/pics/')), screen.pic);
    const fits = await evaluate(`(() => { const r = document.querySelector('.duel-board').getBoundingClientRect(), a = document.querySelector('.duel-actions').getBoundingClientRect();
      return r.left >= 0 && r.right <= innerWidth && a.bottom <= innerHeight; })()`);
    check('phone: the board and the buttons fit the screen', fits);

    // tap a tile, then a cell
    let s = await snap();
    const [first] = correctPlacements(s.state, 1);
    await tap(`[data-rack="${first.rackSlot}"] .duel-tile`);
    check('phone: a tapped tile lifts', (await snap()).lifted === first.rackSlot);
    await tap(`.duel-board [data-cell="${first.cell}"]`);
    s = await snap();
    check('phone: tapping a square places the lifted tile', s.pending.length === 1 && s.pending[0].cell === first.cell, s.pending);
    check('phone: the rack keeps a gap where the tile was', await evaluate(`!document.querySelector('[data-rack="${first.rackSlot}"] .duel-tile')`));
    check('phone: the button now says Submit', /Submit/.test(await evaluate(`document.querySelector('[data-act="submit"]').textContent`)));
    await tap(`.duel-board [data-cell="${first.cell}"]`);
    check('phone: tapping a pending tile sends it home', (await snap()).pending.length === 0);
    // a clue zoom stays until the next tap
    const clue = P0.slots[0];
    await tap(`[data-slot="${clue.id}"]`);
    check('phone: tapping a clue zooms it', await evaluate(`Boolean(document.querySelector('.duel-zoom'))`));
    await tap(`.duel-board [data-cell="${first.cell}"]`);
    check('phone: the next tap closes the zoom', await evaluate(`!document.querySelector('.duel-zoom')`));
    await axe('phone: the game screen');

    // a full game by tap
    let turns = 0;
    for (; turns < 60; turns++) {
      s = await snap();
      if (s.state.over) break;
      if (!(await tapTurn(correctPlacements(s.state)))) break;
    }
    s = await snap();
    check('phone: a full game by tap ends', s.state.over, { turns, log: s.state.log.length });
    const over = await evaluate(`document.querySelector('.duel-over')?.textContent ?? ''`);
    check('phone: the game-over card says who won and the score', /You (win|lose|tie)/.test(over) && over.includes(`${s.state.scores.you} to ${s.state.scores.quill}`), over);
    await tap('.duel-over button');
    s = await snap();
    check('phone: Play again deals a new game', !s.state.over && s.state.log.length === 0);

    // Continue after a reload
    await open(`${GAME}?seed=7`, { clear: true });
    for (let i = 0; i < 2; i++) await tapTurn(correctPlacements((await snap()).state, 2));
    const was = JSON.stringify((await snap()).state);
    await open(`${GAME}?seed=7`);
    check('phone: a reload gives the identical board', JSON.stringify((await snap()).state) === was);

    // ── Phone, normal motion: the order of the moments ──
    await reduce(false);
    await open(`${GAME}?seed=7`, { clear: true });
    await tapTurn(correctPlacements((await snap()).state));
    let trace = await evaluate('window.__duel.trace.slice()');
    const mine = trace.filter((t) => t.startsWith('you:'));
    check('normal: Empty hand comes first, then all tiles judged together', mine[0] === 'you:emptyHand' && mine[1] === 'you:judged', mine);
    const lens = mine.filter((t) => t.startsWith('you:word:')).map((t) => Number(t.split(':')[2]));
    check('normal: word bonuses come shortest first', lens.every((n, i) => i === 0 || lens[i - 1] <= n), lens);
    check("normal: Quill's tiles fly in", trace.includes('quill:botPlaced'), trace);
    check('normal: Quill gets no seals or chips', !trace.some((t) => t.startsWith('quill:word') || t.startsWith('quill:chip')), trace);
    check('normal: the fx layer is empty at rest', await evaluate(`document.querySelector('.duel-fx').children.length === 0`));
    s = await snap();
    const blue = await evaluate(`[...document.querySelectorAll('.duel-cell.last')].map((e) => Number(e.dataset.cell)).sort((a, b) => a - b)`);
    check("normal: Quill's last move shows as blue letters", JSON.stringify(blue) === JSON.stringify([...s.lastQuill].sort((a, b) => a - b)), { blue, last: s.lastQuill });
    {
      const [t] = correctPlacements(s.state, 1);
      await tap(`[data-rack="${t.rackSlot}"] .duel-tile`);
      await tap(`.duel-board [data-cell="${t.cell}"]`);
      await tap('[data-act="submit"]');
      await sleep(50);
      check('normal: the blue letters turn ink as Submit is tapped', s.lastQuill.length > 0 && await evaluate(`document.querySelectorAll('.duel-cell.last').length === 0`), s.lastQuill);
      await idle();
    }

    // the score never shows a negative number
    await open(`${GAME}?seed=7`, { clear: true });
    s = await snap();
    {
      const right = correctPlacements(s.state, 1);
      const wrong = wrongPlacements(s.state, 2, new Set(right.map((t) => t.rackSlot)));
      await evaluate('window.__duel.trace.length = 0; true');
      await tapTurn([...right, ...wrong]);
      trace = await evaluate('window.__duel.trace.slice()');
      const shown = trace.filter((t) => t.startsWith('score:you:')).map((t) => Number(t.split(':')[2]));
      check('normal: 1 right and 2 wrong from 0 never shows a negative score', shown.length > 0 && shown.every((n) => n >= 0), shown);
      check('normal: wrong tiles go back to the rack', (await snap()).state.racks.you.filter((l) => l).length === 5);
    }

    // a reload mid-sequence keeps the move
    await open(`${GAME}?seed=7`, { clear: true });
    {
      const [t] = correctPlacements((await snap()).state, 1);
      await tap(`[data-rack="${t.rackSlot}"] .duel-tile`);
      await tap(`.duel-board [data-cell="${t.cell}"]`);
      await tap('[data-act="submit"]');
      await sleep(400);
      await open(`${GAME}?seed=7`);
      s = await snap();
      check('normal: a reload mid-sequence keeps the submit, and it is your turn', s.state.log.length === 1 && s.state.log[0].t === 'submit' && s.state.turn === 'you' && !s.busy, s.state.log);
    }

    // a turn is no slower than the prototype's
    const timedTurn = async () => {
      await open(`${GAME}?seed=7`, { clear: true });
      const two = correctPlacements((await snap()).state, 2);
      for (const t of two) { await tap(`[data-rack="${t.rackSlot}"] .duel-tile`); await tap(`.duel-board [data-cell="${t.cell}"]`); }
      const t0 = Date.now();
      await tap('[data-act="submit"]');
      await sleep(200);
      const longest = await evaluate(`Math.max(0, ...document.getAnimations().filter((a) => a.effect?.target?.closest?.('.duel-fx')).map((a) => a.effect.getTiming().duration))`);
      await idle();
      return { ms: Date.now() - t0, longest };
    };
    const normal = await timedTurn();
    check('normal: two right tiles and Quill’s reply take under 9 s', normal.ms < 9000, normal);
    await reduce(true);
    const quick = await timedTurn();
    check('reduced motion: the same turn takes under 3.5 s', quick.ms < 3500, quick);
    check('reduced motion: no effect runs longer than 120 ms', quick.longest <= 120, quick);

    // ── Desktop ──
    await setSize(desktop);
    await open(`${GAME}?seed=7`, { clear: true });
    const col = await evaluate(`(() => { const r = document.querySelector('.duel-game').getBoundingClientRect(); return { w: r.width, l: r.left, r: innerWidth - r.right }; })()`);
    check('desktop: the game is a centred column at most 560 px wide', col.w <= 560 && Math.abs(col.l - col.r) <= 2, col);
    await axe('desktop: the game screen');
  } finally {
    if (socket) { try { socket.send(JSON.stringify({ id: 999999, method: 'Browser.close' })); } catch {} socket.close(); }
    if (edge.pid) spawnSync('taskkill', ['/PID', String(edge.pid), '/T', '/F'], { stdio: 'ignore' });
    await sleep(500);
    try { fs.rmSync(USER_DATA, { recursive: true, force: true, maxRetries: 10, retryDelay: 250 }); } catch {}
  }
  console.log(`Duel UI: ${checks - failures}/${checks} checks passed.`);
  if (failures) process.exitCode = 1;
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
