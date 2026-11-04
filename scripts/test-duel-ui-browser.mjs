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
const P0 = JSON.parse(fs.readFileSync('data/duel/puzzles/p0001.json', 'utf8'));
const GAME = '/play/game/2026-11-01';
const FIXTURE_SCHEDULE = { dates: { '2026-10-30': 'p0000.v1', '2026-10-31': 'p0000.v1' }, files: { 'p0000.v1': 'p0000.v1.test0000.json' } };
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

/** Empty, non-pending cells where a letter still in your hand belongs (what Hint lights). */
function hintCellsOf(snap) {
  const used = new Set(snap.pending.map((t) => t.rackSlot)), taken = new Set(snap.pending.map((t) => t.cell));
  const hand = new Set(snap.state.racks.you.filter((l, i) => l && !used.has(i)));
  return Object.keys(P0.solution).map(Number).filter((c) => !snap.state.filled[c] && !taken.has(c) && hand.has(P0.solution[c])).sort((a, b) => a - b);
}
const candidatesOf = (state) => P0.slots.filter((sl) => !state.ghosts.includes(sl.id) && sl.cells.some((c) => !state.filled[c])).map((sl) => sl.id);

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
    /** Tap a rack tile, then a cell; waits until the tile has flown in. */
    const tapPlace = async (t) => {
      await tap(`[data-rack="${t.rackSlot}"] .duel-tile`);
      await tap(`.duel-board [data-cell="${t.cell}"]`);
      return waitFor(`window.__duel.snapshot().pending.some((x) => x.cell === ${t.cell})`, 2000);
    };
    /** Drags with a finger (phone) or the mouse (desktop) from an element's centre to a point, in small steps. */
    const drag = async (fromSel, to, { steps = 20, end = true } = {}) => {
      const a = await center(fromSel);
      if (!a) return false;
      const point = (x, y) => (size.mobile ? { touchPoints: [{ x, y }] } : { x, y, button: 'left', buttons: 1 });
      const type = size.mobile ? 'Input.dispatchTouchEvent' : 'Input.dispatchMouseEvent';
      await send(type, { type: size.mobile ? 'touchStart' : 'mousePressed', ...point(a.x, a.y), clickCount: 1 });
      for (let i = 1; i <= steps; i++) {
        await send(type, { type: size.mobile ? 'touchMove' : 'mouseMoved', ...point(a.x + (to.x - a.x) * i / steps, a.y + (to.y - a.y) * i / steps) });
        await sleep(16);
      }
      if (end) await send(type, size.mobile ? { type: 'touchEnd', touchPoints: [] } : { type: 'mouseReleased', x: to.x, y: to.y, button: 'left', clickCount: 1 });
      return true;
    };
    /** Where to aim so the dragged tile lands on a cell: on touch the tile rides 30 px above the finger. */
    const aimAt = async (cell) => { const c = await center(`.duel-board [data-cell="${cell}"]`); return { x: c.x, y: c.y + (size.mobile ? 30 : 0) }; };
    const key = async (k, code = k, text) => {
      await send('Input.dispatchKeyEvent', { type: 'keyDown', key: k, code, text, windowsVirtualKeyCode: k.length === 1 ? k.toUpperCase().charCodeAt(0) : { Tab: 9, Enter: 13, Backspace: 8, Escape: 27 }[k] });
      await send('Input.dispatchKeyEvent', { type: 'keyUp', key: k, code });
    };
    /** One turn by tap: each tile, then its cell, then Submit. */
    const tapTurn = async (placements) => {
      const before = (await snap()).state.log.length;
      for (const t of placements) {
        await tapPlace(t);
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

    /**
     * Serves a stand-in schedule (p0000 on 30 and 31 Oct) or fails the schedule request, through CDP's Fetch domain,
     * so dated puzzles are tested without publishing anything. route(null) goes back to the real files.
     */
    let routing = null;
    socket.addEventListener('message', (event) => {
      const m = JSON.parse(event.data);
      if (m.method !== 'Fetch.requestPaused' || !routing) return;
      const { requestId, request } = m.params;
      const b64 = (x) => Buffer.from(typeof x === 'string' ? x : JSON.stringify(x)).toString('base64');
      const ok = (body) => send('Fetch.fulfillRequest', { requestId, responseCode: 200, responseHeaders: [{ name: 'Content-Type', value: 'application/json' }], body: b64(body) });
      if (request.url.includes('/duel/schedule.json')) {
        if (routing === 'fail') void send('Fetch.failRequest', { requestId, errorReason: 'InternetDisconnected' });
        else void ok(FIXTURE_SCHEDULE);
      } else if (request.url.includes('/duel/p/p0000.v1.test0000.json')) void ok(fs.readFileSync('data/duel/puzzles/p0000.json', 'utf8'));
      else void send('Fetch.continueRequest', { requestId });
    });
    const route = async (mode) => {
      // Turning routing off disables Fetch first, so no request is paused while nothing answers it.
      if (mode) { routing = mode; await send('Fetch.enable', { patterns: [{ urlPattern: '*/duel/*' }] }); }
      else { await send('Fetch.disable'); routing = null; }
    };

    // ── Phone: the screen ──
    await setSize(phone);
    await reduce(true);
    check('phone: /play lands on a game', await open('/play?seed=7', { clear: true }));
    check('phone: /play redirects to /play/game/<today>', /^\/play\/game\/\d{4}-\d{2}-\d{2}$/.test(await evaluate('location.pathname')), await evaluate('location.pathname'));
    check('phone: a future date goes to today', await open('/play/game/2099-01-01?seed=7') && !(await evaluate('location.pathname')).includes('2099'));
    check('phone: the game opens', await open(`${GAME}?seed=7`, { clear: true }));
    check('phone: an unscheduled date plays the labelled practice puzzle', await evaluate(`window.__duel.puzzle.id === 'p0001'
      && document.querySelector('.duel-top .ttl b').textContent === 'Practice duel'`), await evaluate(`document.querySelector('.duel-top .ttl')?.textContent`));

    // ── Phone: the dated schedule (a stand-in schedule served through CDP) ──
    await route('fixture');
    check('schedule: a scheduled date plays its puzzle', await open('/play/game/2026-10-31?seed=7', { clear: true })
      && await evaluate(`window.__duel.puzzle.id === 'p0000' && document.querySelector('.duel-top .ttl b').textContent === 'Daily Duel'`));
    await evaluate(`localStorage.setItem('panna_duel_results', JSON.stringify([{ date: '2026-10-31', puzzle: 'p0000.v1', you: 50, quill: 40, at: '2026-10-31T10:00:00Z' }])); true`);
    await open('/play?seed=7');
    check('schedule: /play opens the latest open scheduled day when today has none', (await evaluate('location.pathname')) === '/play/game/2026-10-30', await evaluate('location.pathname'));
    const before = await evaluate(`localStorage.getItem('panna_duel_game:2026-10-30')`);
    await route('fail');
    await send('Page.navigate', { url: `${BASE}/play/game/2026-10-30?seed=7` });
    check('schedule: a failed load shows an error with Try again', await waitFor(`Boolean(document.querySelector('.duel-load-error[role="alert"]')) && [...document.querySelectorAll('.duel-load-error button')].some((b) => b.textContent === 'Try again')`));
    check('schedule: a failed load leaves the save untouched', before !== null && (await evaluate(`localStorage.getItem('panna_duel_game:2026-10-30')`)) === before);
    await route('fixture');
    await evaluate(`document.querySelector('.duel-load-error button').click(); true`);
    check('schedule: Try again loads the game', await waitFor(`Boolean(window.__duel && window.__duel.puzzle.id === 'p0000' && document.querySelector('.duel-board [data-cell]'))`));
    await route(null);
    await open(`${GAME}?seed=7`, { clear: true });
    const screen = await evaluate(`(() => ({
      cells: document.querySelectorAll('.duel-board [data-cell]').length,
      given: ${JSON.stringify(P0.given)}.map((c) => document.querySelector('.duel-board [data-cell="' + c + '"]').textContent.trim()),
      tiles: document.querySelectorAll('.duel-rack [data-rack] .duel-tile').length,
      button: document.querySelector('[data-act="submit"]').textContent.trim(),
      clueBar: Boolean(document.querySelector('.cb, [aria-label="Clue bar"]')),
      font: getComputedStyle(document.querySelector('.duel-rack .duel-tile .lt')).fontFamily,
      clueFont: getComputedStyle(document.querySelector('.duel-cl .t')).fontFamily,
      clueCase: getComputedStyle(document.querySelector('.duel-cl .t')).textTransform,
      pic: [...document.querySelectorAll('.duel-board img')].map((i) => i.getAttribute('src')),
    }))()`);
    check('phone: 80 cells on the board', screen.cells === 80, screen.cells);
    check('phone: the 3 given letters show', screen.given.join('') === P0.given.map((c) => P0.solution[c]).join(''), screen.given);
    check('phone: 5 tiles in the rack', screen.tiles === 5, screen.tiles);
    check('phone: the big button says Pass', screen.button === 'Pass', screen.button);
    check('phone: there is no clue bar', !screen.clueBar);
    check('phone: tile letters use Montserrat', /Duel Montserrat/.test(screen.font), screen.font);
    check('phone: clues use the tile font, in capitals', /Duel Montserrat/.test(screen.clueFont) && screen.clueCase === 'uppercase', [screen.clueFont, screen.clueCase]);
    check('phone: pictures are self-hosted', screen.pic.length === P0.slots.filter((s) => s.clue.img).length && screen.pic.every((s) => s.startsWith('/duel/pics/')), screen.pic);
    const fits = await evaluate(`(() => { const r = document.querySelector('.duel-board').getBoundingClientRect(), a = document.querySelector('.duel-actions').getBoundingClientRect();
      return r.left >= 0 && r.right <= innerWidth && a.bottom <= innerHeight; })()`);
    check('phone: the board and the buttons fit the screen', fits);

    // tap a tile, then a cell
    let s = await snap();
    const [first] = correctPlacements(s.state, 1);
    await tap(`[data-rack="${first.rackSlot}"] .duel-tile`);
    check('phone: a tapped tile lifts', (await snap()).lifted === first.rackSlot);
    await tap(`.duel-board [data-cell="${first.cell}"]`);
    await waitFor(`window.__duel.snapshot().pending.length === 1`, 2000);
    await sleep(100);
    s = await snap();
    check('phone: tapping a square places the lifted tile', s.pending.length === 1 && s.pending[0].cell === first.cell, s.pending);
    check('phone: the rack keeps a gap where the tile was', await evaluate(`!document.querySelector('[data-rack="${first.rackSlot}"] .duel-tile')`));
    check('phone: the button now says Submit', /Submit/.test(await evaluate(`document.querySelector('[data-act="submit"]').textContent`)));
    await tap(`.duel-board [data-cell="${first.cell}"]`);
    await sleep(30);
    const home = await evaluate(`[...document.querySelectorAll('.duel-fx .fx-tile')].map((e) => e.textContent).join('|')`);
    // the tile is taken back at once, so wait for its flight home to end
    const settled = await waitFor(`window.__duel.snapshot().pending.length === 0 && Boolean(document.querySelector('[data-rack="${first.rackSlot}"] .duel-tile')) && !document.querySelector('.duel-fx .fx-tile') && !document.querySelector('[data-fx-hidden], [data-fx-homing]')`, 2000);
    check('phone: tapping a pending tile arcs it home', home === s.state.racks.you[first.rackSlot] && settled, home);
    // a clue zoom stays until the next tap
    const clue = P0.slots[0];
    await tap(`[data-slot="${clue.id}"]`);
    check('phone: tapping a clue zooms it', await evaluate(`Boolean(document.querySelector('.duel-zoom'))`));
    await tap(`.duel-board [data-cell="${first.cell}"]`);
    check('phone: the next tap closes the zoom', await evaluate(`!document.querySelector('.duel-zoom')`));
    await axe('phone: the game screen');

    // a full game by tap
    let turns = 0, emptyRack = 0;
    for (; turns < 60; turns++) {
      s = await snap();
      if (s.state.over) break;
      if (s.state.racks.you.every((l) => l === null)) emptyRack++;
      if (!(await tapTurn(correctPlacements(s.state)))) break;
    }
    s = await snap();
    check('phone: a full game by tap ends', s.state.over, { turns, log: s.state.log.length });
    check('round 3: you never get a turn with an empty rack, so you never have to pass', emptyRack === 0 && s.state.log.every((a) => a.t === 'submit'), { emptyRack, kinds: s.state.log.map((a) => a.t) });
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
    // watch the screen through the turn: the boxes, the Empty hand card, and the rack while Quill moves
    await evaluate(`(() => {
      const o = window.__obs = { wordbox: 0, oldFx: 0, settled: 0, heldWhileQuill: -1, shownWhileQuill: -1, emptyBg: '', emo: '', okTint: 0, okTintBg: '', wordTint: 0, tintNoBox: 0 };
      window.__obsT = setInterval(() => {
        // round 3: letter squares under a green box are tinted green, and only while a box shows
        const tinted = document.querySelectorAll('.duel-cell[data-fx-tint="ok"]');
        const boxes = document.querySelectorAll('.duel-fx .fx-tile.ok, .duel-fx .fx-tile.bad, .duel-fx .wordbox').length;
        if (tinted.length && document.querySelector('.duel-fx .fx-tile.ok')) { o.okTint++; o.okTintBg = getComputedStyle(tinted[0]).boxShadow; }
        if (document.querySelector('.duel-fx .wordbox') && tinted.length >= 2) o.wordTint++;
        if (document.querySelector('.duel-cell[data-fx-tint]') && !boxes) o.tintNoBox++;
        if (document.querySelector('.duel-fx .wordbox')) o.wordbox++;
        if (document.querySelector('.duel-fx .seal, .duel-fx .glow, .duel-fx .chip.gold')) o.oldFx++;
        if (document.querySelector('.duel-fx .fx-settled')) o.settled++;
        if (document.querySelector('[data-fx-thinking]')) {
          o.heldWhileQuill = Math.max(o.heldWhileQuill, document.querySelectorAll('.duel-rack .duel-tile[data-held]').length);
          o.shownWhileQuill = Math.max(o.shownWhileQuill, [...document.querySelectorAll('.duel-rack .duel-tile')].filter((t) => getComputedStyle(t).opacity !== '0').length);
        }
        const e = document.querySelector('.duel-fx .fx-card.empty');
        if (e) { const cs = getComputedStyle(e); o.emptyBg = cs.backgroundImage + '|' + cs.backgroundColor; o.emo = e.querySelector('.emo')?.textContent ?? ''; }
      }, 25);
      return true;
    })()`);
    await tapTurn(correctPlacements((await snap()).state));
    let trace = await evaluate('window.__duel.trace.slice()');
    const firstSteps = trace.filter((t) => t.startsWith('score:you:')).map((t) => Number(t.split(':')[2])).filter((v, i, a) => i === 0 || v !== a[i - 1]);
    // more full turns until one finishes a word, so the word box is seen
    for (let i = 0; i < 6 && !(await evaluate(`window.__duel.trace.some((t) => t.startsWith('you:word:'))`)); i++) {
      const st = (await snap()).state;
      if (st.over) break;
      await tapTurn(correctPlacements(st));
    }
    const wordSeen = await evaluate(`window.__duel.trace.some((t) => t.startsWith('you:word:'))`);
    const obs = await evaluate('clearInterval(window.__obsT); window.__obs');
    check('normal: the Empty hand card is see-through, with 🎉', obs.emptyBg === 'none|rgba(0, 0, 0, 0)' && obs.emo === '🎉', obs);
    check('normal: right tiles lose their box once their point lands', obs.settled > 0, obs);
    check('normal: a finished word gets a green box (no gold glow or wax seal)', wordSeen && obs.wordbox > 0 && obs.oldFx === 0, { wordSeen, ...obs });
    check("round 3: a right tile's letter square is tinted green while its box shows", obs.okTint > 0 && obs.okTintBg.includes('rgba(47, 158, 68'), obs);
    check("round 3: a finished word's letter squares are tinted green while its box shows", obs.wordTint > 0, obs);
    check('round 3: no square stays tinted once its badge has landed', obs.tintNoBox === 0, obs);
    check('normal: while Quill moves, your 5 new tiles are held out of sight', obs.heldWhileQuill === 5 && obs.shownWhileQuill === 0, obs);
    check('normal: your score moves badge by badge (+5, then +1 per tile)', firstSteps[0] === 5 && firstSteps.slice(1, 6).join() === '6,7,8,9,10', firstSteps);
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
      await tapPlace(t);
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
      await evaluate(`(() => { const o = window.__bad = { tint: 0, bg: '', tile: '' }; window.__badT = setInterval(() => {
        const c = document.querySelector('.duel-cell[data-fx-tint="bad"]'), t = document.querySelector('.duel-fx .fx-tile.bad');
        if (c && t) { o.tint++; o.bg = getComputedStyle(c).boxShadow; o.tile = getComputedStyle(t, '::after').backgroundColor; }
      }, 25); return true; })()`);
      await tapTurn([...right, ...wrong]);
      const bad = await evaluate('clearInterval(window.__badT); window.__bad');
      check("round 3: a wrong tile's letter square and tile are tinted red while its box shows", bad.tint > 0 && bad.bg.includes('rgba(224, 49, 49') && bad.tile.includes('224, 49, 49'), bad);
      check('round 3: every tint is gone at rest', await evaluate(`document.querySelectorAll('.duel-cell[data-fx-tint]').length === 0`));
      trace = await evaluate('window.__duel.trace.slice()');
      const shown = trace.filter((t) => t.startsWith('score:you:')).map((t) => Number(t.split(':')[2]));
      check('normal: 1 right and 2 wrong from 0 never shows a negative score', shown.length > 0 && shown.every((n) => n >= 0), shown);
      check('normal: wrong tiles go back to the rack', (await snap()).state.racks.you.filter((l) => l).length === 5);
    }

    // a reload mid-sequence keeps the move
    await open(`${GAME}?seed=7`, { clear: true });
    {
      const [t] = correctPlacements((await snap()).state, 1);
      await tapPlace(t);
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
      for (const t of two) { await tapPlace(t); }
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

    // ── Phone: drag ──
    await reduce(false);
    await open(`${GAME}?seed=7`, { clear: true });
    s = await snap();
    {
      const [t0] = correctPlacements(s.state, 1);
      await drag(`[data-rack="${t0.rackSlot}"] .duel-tile`, await aimAt(t0.cell));
      await sleep(500);
      s = await snap();
      check('phone: a drag places the tile in the cell under it', s.pending.length === 1 && s.pending[0].cell === t0.cell && s.pending[0].rackSlot === t0.rackSlot, s.pending);
      check('phone: the dragged tile shows in the cell', await evaluate(`Boolean(document.querySelector('.duel-board [data-cell="${t0.cell}"] .duel-tile.pend'))`));
      check('phone: the rack keeps a gap', await evaluate(`!document.querySelector('[data-rack="${t0.rackSlot}"] .duel-tile')`));
      check('phone: no drag clone is left behind', await evaluate(`document.querySelectorAll('.duel-fx .fx-tile').length === 0`));
      const other = s.state.racks.you.findIndex((l, i) => l && i !== t0.rackSlot);
      await drag(`[data-rack="${other}"] .duel-tile`, await aimAt(t0.cell));
      await sleep(500);
      s = await snap();
      check('phone: a drop on a pending tile slides back', s.pending.length === 1 && s.pending[0].rackSlot === t0.rackSlot && await evaluate(`Boolean(document.querySelector('[data-rack="${other}"] .duel-tile'))`), s.pending);
      const bar = await center('.duel-rackbar');
      await drag(`.duel-board [data-cell="${t0.cell}"] .duel-tile`, { x: bar.x, y: bar.y + (size.mobile ? 30 : 0) });
      await sleep(500);
      check('phone: a pending tile dragged to the rack goes home', (await snap()).pending.length === 0 && await evaluate(`Boolean(document.querySelector('[data-rack="${t0.rackSlot}"] .duel-tile'))`));

      // the phone turns mid-drag: the tile goes home, and then drops land where the cells now are
      await drag(`[data-rack="${t0.rackSlot}"] .duel-tile`, await aimAt(t0.cell), { end: false });
      await setSize({ width: 740, height: 360, mobile: true });
      await sleep(300);
      await send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      await sleep(500);
      check('phone: turning the phone mid-drag sends the tile home', (await snap()).pending.length === 0 && await evaluate(`Boolean(document.querySelector('[data-rack="${t0.rackSlot}"] .duel-tile'))`));
      check('phone: on its side, the phone asks to be turned upright', await evaluate(`getComputedStyle(document.querySelector('.duel-rotate')).display !== 'none'`));
      await setSize({ width: 412, height: 860, mobile: true });
      await sleep(400);
      check('phone: upright again, the note goes', await evaluate(`getComputedStyle(document.querySelector('.duel-rotate')).display === 'none'`));
      await drag(`[data-rack="${t0.rackSlot}"] .duel-tile`, await aimAt(t0.cell));
      await sleep(500);
      s = await snap();
      check('phone: after a size change, a drop lands on the cell under it', s.pending.length === 1 && s.pending[0].cell === t0.cell, s.pending);
      await setSize(phone);
      await sleep(300);
      // The tile is back in the rack the moment it leaves the board: Enter during its flight home passes, never submits it.
      await evaluate(`document.activeElement?.blur(), true`);
      const rackbar = await center('.duel-rackbar');
      await drag(`.duel-board [data-cell="${t0.cell}"] .duel-tile`, { x: rackbar.x, y: rackbar.y + 30 }, { end: false });
      await send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      await key('Enter');
      await idle();
      const landed = await waitFor(`Boolean(document.querySelector('[data-rack="${t0.rackSlot}"] .duel-tile')) && !document.querySelector('[data-fx-hidden], [data-fx-homing]') && !document.querySelector('.duel-fx .fx-tile')`, 2000);
      s = await snap();
      check('phone: Enter during a flight home passes, and the tile is home', s.state.log.at(-1)?.t === 'pass' && landed, s.state.log.at(-1));
    }

    // a drag during a sequence does nothing
    await open(`${GAME}?seed=7`, { clear: true });
    s = await snap();
    {
      const [a, b] = correctPlacements(s.state, 2);
      await tapPlace(a);
      await sleep(400);
      await tap('[data-act="submit"]');
      await sleep(60);
      await drag(`[data-rack="${b.rackSlot}"] .duel-tile`, await aimAt(b.cell), { steps: 6 });
      await idle();
      s = await snap();
      check('phone: a drag while the turn plays out is ignored', s.state.log.length === 1 && s.pending.length === 0, { log: s.state.log.length, pending: s.pending });
    }

    // tap-to-place flies the tile in
    {
      s = await snap();
      const [t] = correctPlacements(s.state, 1);
      await tap(`[data-rack="${t.rackSlot}"] .duel-tile`);
      await tap(`.duel-board [data-cell="${t.cell}"]`);
      await sleep(30);
      const flying = await evaluate(`[...document.querySelectorAll('.duel-fx .fx-tile')].map((e) => e.className + ':' + e.textContent).join('|')`);
      await sleep(500);
      check('phone: tap-to-place flies the tile along an arc', flying.split('|').length === 1 && flying.includes('lifted') && (await snap()).pending.some((x) => x.cell === t.cell), flying);
    }

    // ── Phone: Hint, Word, Swap, Pass ──
    await reduce(true);
    await open(`${GAME}?seed=7`, { clear: true });
    const lit = () => evaluate(`[...document.querySelectorAll('.duel-cell.hint')].map((e) => Number(e.dataset.cell)).sort((a, b) => a - b)`);
    const toastText = () => evaluate(`[...document.querySelectorAll('.duel-fx .fx-toast')].map((e) => e.textContent).join('|')`);
    await tap('[data-act="hint"]');
    s = await snap();
    check('hint: tapping Hint spends one', s.hintOn && s.balance.hint === 0, s.balance);
    check('hint: the glowing cells are where your letters belong', JSON.stringify(await lit()) === JSON.stringify(hintCellsOf(s)), { lit: await lit(), want: hintCellsOf(s) });
    {
      const rack = s.state.racks.you;
      const i = rack.findIndex((l) => l && rack.filter((x) => x === l).length === 1);
      const [t] = correctPlacements({ ...s.state, racks: { ...s.state.racks, you: rack.map((l, k) => (k === i ? l : null)) } }, 1);
      await tapPlace(t);
      const after = await lit();
      check("hint: placing a letter's only copy takes its glows away", !after.some((c) => P0.solution[c] === rack[i]) && JSON.stringify(after) === JSON.stringify(hintCellsOf(await snap())), after);
      await tap(`.duel-board [data-cell="${t.cell}"]`);
      await sleep(100);
      check('hint: taking it back brings them back', (await lit()).some((c) => P0.solution[c] === rack[i]));
    }
    await tap('[data-act="hint"]');
    await sleep(100);
    check('hint: a second tap only reminds you', /Hint is on until you end this turn/.test(await toastText()) && (await snap()).balance.hint === 0);
    await tap('[data-act="submit"]'); // a pass ends the turn and the hint
    await idle();
    check('hint: the glow ends with the turn', (await lit()).length === 0 && !(await snap()).hintOn);
    await tap('[data-act="hint"]');
    await sleep(200);
    const help = await evaluate(`document.querySelector('[role="dialog"].duel-sheet')?.textContent ?? ''`);
    check('hint: with none left, Hint opens the help sheet', /Free every day/.test(help) && /\d+ h \d+ m/.test(help) && /Coming soon/.test(help), help.slice(0, 200));
    await axe('the help sheet');
    await key('Escape');
    await sleep(200);
    check('sheets: Escape closes the sheet and focus goes back to its button', await evaluate(`!document.querySelector('.duel-sheet') && document.activeElement?.dataset.act === 'hint'`));

    // Word
    await tap('[data-act="word"]');
    await sleep(100);
    s = await snap();
    const lights = await evaluate(`document.querySelectorAll('.duel-clue.cand').length`);
    check('word: every answer it can reveal lights up', s.wordMode && lights === candidatesOf(s.state).length, { lights, want: candidatesOf(s.state).length });
    await tap('.duel-top .ttl');
    await sleep(100);
    check('word: a tap elsewhere leaves Word mode', !(await snap()).wordMode);
    await tap('[data-act="word"]');
    await sleep(100);
    const target = candidatesOf((await snap()).state).map((id) => P0.slots.find((x) => x.id === id)).find((x) => x.cells.length >= 3);
    await tap(`[data-slot="${target.id}"]`);
    await sleep(200);
    const confirm = await evaluate(`document.querySelector('[role="dialog"].duel-confirm')?.textContent ?? ''`);
    check('word: a lit clue asks before revealing', /Reveal this word\?/.test(confirm) && confirm.includes(target.clue.full) && confirm.includes(`${target.cells.length} letters`), confirm);
    await axe('the reveal dialog');
    await tap('.duel-confirm [data-ok]');
    await idle();
    s = await snap();
    const ghosts = await evaluate(`[...document.querySelectorAll('.duel-cell .gl')].map((e) => Number(e.closest('[data-cell]').dataset.cell)).sort((a, b) => a - b)`);
    const emptyIn = target.cells.filter((c) => !s.state.filled[c]).sort((a, b) => a - b);
    check('word: the answer’s empty cells show faint letters', JSON.stringify(ghosts) === JSON.stringify(emptyIn), { ghosts, emptyIn });
    check('word: it costs one Word and keeps your turn', s.balance.word === 0 && s.state.turn === 'you' && s.state.ghosts.includes(target.id));
    await tap('[data-act="word"]');
    await sleep(200);
    check('word: with none left, Word opens the help sheet', /Free every day/.test(await evaluate(`document.querySelector('.duel-sheet')?.textContent ?? ''`)));
    await tap('.duel-sheet [data-close]');
    await sleep(200);

    // Pass: a remark on the first pass of a streak only
    await open(`${GAME}?seed=7`, { clear: true });
    await tap('[data-act="submit"]');
    check('pass: Professor Quill remarks on your first pass', await waitFor(`Boolean(document.querySelector('.duel-fx .fx-card.remark'))`, 1500));
    await idle();
    await tap('[data-act="submit"]');
    let seen = false;
    for (let i = 0; i < 20; i++) { if (await evaluate(`Boolean(document.querySelector('.duel-fx .fx-card.remark'))`)) seen = true; await sleep(50); }
    await idle();
    check('pass: not on a second pass in a row', !seen);

    // Swap
    await open(`${GAME}?seed=7`, { clear: true });
    await tap('[data-act="swap"]');
    await sleep(200);
    check('swap: the sheet opens', /Swap tiles/.test(await evaluate(`document.querySelector('.duel-sheet')?.textContent ?? ''`)));
    await axe('the swap sheet');
    await tap('.duel-sheet [data-pick="1"]');
    await tap('.duel-sheet [data-pick="3"]');
    const label = await evaluate(`document.querySelector('.duel-sheet [data-confirm]').textContent`);
    check('swap: the button counts the tiles', /Swap 2 and pass/.test(label), label);
    await tap('.duel-sheet [data-confirm]');
    await idle();
    s = await snap();
    const lastSwap = s.state.log.at(-1);
    check('swap: those two tiles are swapped and Quill played', lastSwap?.t === 'swap' && JSON.stringify(lastSwap.rackSlots) === '[1,3]' && s.state.turn === 'you', lastSwap);

    // a nearly empty bag
    for (let turn = 0; turn < 60; turn++) {
      s = await snap();
      if (s.state.over || s.state.bag.length <= 4) break;
      await tapTurn(correctPlacements(s.state, s.state.bag.length > 8 ? 5 : 1));
    }
    s = await snap();
    if (!s.state.over && s.state.bag.length > 0) {
      const k = s.state.bag.length;
      await tap('[data-act="swap"]');
      await sleep(200);
      await tap('.duel-sheet [data-all]');
      const picked = await evaluate(`document.querySelectorAll('.duel-sheet [data-pick][aria-pressed="true"]').length`);
      const note = await evaluate(`document.querySelector('.duel-sheet').textContent`);
      check('swap: with few tiles in the bag, Select all picks only that many', picked === k && note.includes(`Only ${k} tile${k === 1 ? '' : 's'} left in the bag`), { picked, k });
      await tap('.duel-sheet [data-close]');
      await sleep(200);
    } else check('swap: reached a nearly empty bag', false, s.state.bag.length);
    for (let turn = 0; turn < 60; turn++) {
      s = await snap();
      if (s.state.over || s.state.bag.length === 0) break;
      await tapTurn(correctPlacements(s.state, 1));
    }
    s = await snap();
    // One tile a turn empties the bag long before the board fills, so a game over here means the check didn't run.
    check('swap: with an empty bag, Swap is off', !s.state.over && s.state.bag.length === 0 && await evaluate(`document.querySelector('[data-act="swap"]').disabled && document.querySelector('[data-act="swap"]').getAttribute('aria-label') === 'Swap: the bag is empty'`), { over: s.state.over, bag: s.state.bag.length });

    // the ?quill= playtest flag is gone
    await open(`${GAME}?seed=7&quill=b`, { clear: true });
    check('round 3: ?quill=b no longer shows a playtest label', (await evaluate(`document.querySelector('.duel-variant') === null`)));

    // ── Desktop ──
    await setSize(desktop);
    await open(`${GAME}?seed=7`, { clear: true });
    const col = await evaluate(`(() => { const r = document.querySelector('.duel-game').getBoundingClientRect(); return { w: r.width, l: r.left, r: innerWidth - r.right }; })()`);
    check('desktop: the game is a centred column at most 560 px wide', col.w <= 560 && Math.abs(col.l - col.r) <= 2, col);
    await axe('desktop: the game screen');

    // mouse drag
    s = await snap();
    {
      const [t] = correctPlacements(s.state, 1);
      await drag(`[data-rack="${t.rackSlot}"] .duel-tile`, await aimAt(t.cell));
      await sleep(500);
      check('desktop: a mouse drag places the tile', (await snap()).pending.some((x) => x.cell === t.cell));
      await tap(`.duel-board [data-cell="${t.cell}"]`);
      await sleep(400);
    }

    // keyboard: Tab reaches every control (no trap), the board is one stop, Tab inside it moves between answers
    const focusBoard = () => evaluate(`(() => { const el = document.querySelector('.duel-board [tabindex="0"]'); el?.focus(); return Boolean(el); })()`);
    await evaluate(`document.querySelector('.duel-top a').focus(); true`); // start at the top of the page
    const stops = [];
    for (let i = 0; i < 60; i++) { // the board takes one Tab per open answer (27 in the fixture)
      await key('Tab');
      stops.push(await evaluate(`(() => { const a = document.activeElement; return a?.dataset?.act ?? (a?.closest?.('.duel-board') ? 'board' : a?.tagName); })()`));
      if (stops.at(-1) === 'hint') break;
    }
    const firstSwap = stops.indexOf('swap');
    check('desktop: Tab from the top reaches the board and then every button (no trap)', stops.includes('board') && ['swap', 'submit', 'word', 'hint'].every((b) => stops.includes(b)), stops);
    check('desktop: once Tab leaves the board, focus never jumps back into it', firstSwap > 0 && !stops.slice(firstSwap).includes('board'), stops);
    check('desktop: the board has exactly one tab stop', await evaluate(`document.querySelectorAll('.duel-board [tabindex="0"], .duel-board button:not([tabindex="-1"])').length === 1`));
    // Focusing the first letter cell selects the first answer (the Tab walk above left the last one selected).
    await evaluate(`document.querySelector('.duel-board .duel-l').focus(); true`);
    s = await snap();
    const firstSel = s.selected;
    await key('Tab');
    s = await snap();
    const sel = P0.slots.find((x) => x.id === s.selected);
    check('desktop: Tab on the board moves to the next answer', Boolean(sel) && s.selected !== firstSel && await evaluate(`Boolean(document.activeElement?.closest('.duel-board'))`), { firstSel, now: s.selected });
    {
      const rack = s.state.racks.you;
      const l1 = rack.find((l) => l);
      await key(l1.toLowerCase(), `Key${l1}`, l1.toLowerCase());
      await sleep(450);
      check('desktop: a typed letter goes into the answer', (await snap()).pending.length === 1 && sel.cells.includes((await snap()).pending[0].cell));
      await key('Backspace');
      await sleep(100);
      check('desktop: Backspace takes it back', (await snap()).pending.length === 0);
      await key(l1.toLowerCase(), `Key${l1}`, l1.toLowerCase());
      await sleep(450);
      const placed = (await snap()).pending.map((x) => x.cell);
      await key('Enter');
      await sleep(200);
      await idle();
      const last = (await snap()).state.log.at(-1);
      check('desktop: Enter submits the typed tiles', last?.t === 'submit' && JSON.stringify(last.place.map((x) => x.cell)) === JSON.stringify(placed), last);
    }

    // fast typing: three letters and Enter with no pause all land and are submitted
    {
      await focusBoard();
      for (let i = 0; i < P0.slots.length; i++) {
        const now = await snap();
        const sl = P0.slots.find((x) => x.id === now.selected);
        if (sl && sl.cells.filter((c) => !now.state.filled[c]).length >= 3) break;
        await key('Tab');
        if (!(await evaluate(`Boolean(document.activeElement?.closest('.duel-board'))`))) await focusBoard();
      }
      const now = await snap();
      const three = now.state.racks.you.filter((l) => l).slice(0, 3);
      const before = now.state.log.length;
      for (const l of three) await key(l.toLowerCase(), `Key${l}`, l.toLowerCase());
      await key('Enter');
      await waitFor(`window.__duel.snapshot().state.log.length > ${before}`, 5000);
      await idle();
      const last = (await snap()).state.log.at(-1);
      check('desktop: three fast letters and Enter submit all three tiles', last?.t === 'submit' && last.place.length === 3, last);
    }

    // a full game by keyboard (reduced motion)
    await reduce(true);
    await open(`${GAME}?seed=11`, { clear: true });
    for (let turn = 0; turn < 80; turn++) {
      s = await snap();
      if (s.state.over) break;
      await focusBoard();
      for (let tabs = 0; tabs < P0.slots.length; tabs++) {
        if (tabs > 0) await key('Tab');
        if (!(await evaluate(`Boolean(document.activeElement?.closest('.duel-board'))`))) break;
        for (let typed = 0; typed < 5; typed++) {
          const now = await snap();
          const slot = P0.slots.find((x) => x.id === now.selected);
          const next = slot?.cells.find((c) => !now.state.filled[c] && !now.pending.some((t) => t.cell === c));
          const want = next === undefined ? null : P0.solution[next];
          const free = now.state.racks.you.some((l, i) => l === want && !now.pending.some((t) => t.rackSlot === i));
          if (!want || !free) break;
          await key(want.toLowerCase(), `Key${want}`, want.toLowerCase());
          await sleep(140);
        }
      }
      await focusBoard();
      await key('Enter');
      await sleep(100);
      await idle();
    }
    s = await snap();
    check('desktop: a full game by keyboard ends', s.state.over, { log: s.state.log.length });
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
