// "Go to" panel: the page number opens it; type a page, pick a letter or a marked page. Desktop and phone sizes.
// Usage: node scripts/test-goto-browser.mjs   (needs the app running on localhost:3000)
import { spawn, spawnSync } from 'child_process';
import fs from 'fs';
import path from 'path';

const EDGE_PATH = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const PORT = 9365;
const BASE = 'http://localhost:3000';
const USER_DATA = path.join(process.cwd(), 'scratch', `panna-goto-edge-${process.pid}-${Date.now()}`);
const START = 400; // a page part-way into C
let checks = 0;
let failures = 0;
function check(label, ok, detail) {
  checks++;
  if (ok) console.log(`✓ ${label}`);
  else { failures++; console.error(`✗ ${label}${detail !== undefined ? ` — ${JSON.stringify(detail)}` : ''}`); }
}
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const fmt = (n) => n.toLocaleString('en-IN');

async function main() {
  const meta = await (await fetch(`${BASE}/api/meta`)).json();
  const total = meta.total_pages;
  const thumb = meta.thumb_index;
  const letterFor = (p) => Object.entries(thumb).filter(([, first]) => first <= p).map(([l]) => l).pop();

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
    const where = () => evaluate('location.pathname');
    const waitFor = async (pathname, ms = 4000) => {
      for (let t = 0; t < ms; t += 100) { if ((await where()) === pathname) break; await sleep(100); }
      return where();
    };
    const sheetOpen = () => evaluate(`Boolean(document.querySelector('#goto-sheet[role="dialog"]'))`);
    const openGoTo = async () => { await evaluate(`document.querySelector('#page-number-btn')?.click(); true`); await sleep(300); };
    const typePage = (text) => evaluate(`(() => { const input = document.querySelector('#goto-page-input'); if (!input) return false; const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set; set.call(input, ${JSON.stringify(text)}); input.dispatchEvent(new Event('input', { bubbles: true })); return true; })()`);
    const quiet = () => evaluate(`localStorage.clear(); localStorage.setItem('panna_tours', JSON.stringify({ seen: { start: 1, word: 1, review: 1, settings: 1 }, tips: {}, welcomeDone: true, tipsOff: true, listOpened: true })); true`);
    await send('Page.enable');
    await send('Runtime.enable');

    for (const [sizeName, size] of [['desktop', { width: 1440, height: 900, mobile: false }], ['phone', { width: 390, height: 844, mobile: true }]]) {
      const phone = sizeName === 'phone';
      check(`${sizeName}: app hydrates`, await open(`/page/${START}`, size));
      await quiet();
      check(`${sizeName}: reloads quietly`, await open(`/page/${START}`, size));

      // ── Opening ──
      const btn = await evaluate(`(() => { const b = document.querySelector('#page-number-btn'); const css = (p) => { const c = getComputedStyle(b, p).content; return c && c !== 'none' && c !== 'normal' ? JSON.parse(c).replace(/\u00a0/g, ' ') : ''; }; return b && { tag: b.tagName, text: (css('::before') + b.textContent.trim() + css('::after')).replace(/\u00a0/g, ' '), label: b.getAttribute('aria-label') || '', h: b.getBoundingClientRect().height }; })()`);
      const wantText = phone ? `p. ${fmt(START)} ▾` : `Pages ${fmt(START)}–${fmt(START + 1)} of ${fmt(total)} ▾`;
      const labelOk = btn && btn.tag === 'BUTTON' && btn.text === wantText
        && (phone ? btn.label === `Page ${fmt(START)}. Go to another page` : btn.label.startsWith(`Pages ${fmt(START)}–${fmt(START + 1)} of ${fmt(total)}`));
      check(`${sizeName}: the page number is a button that opens Go to (label)`, labelOk, { btn, wantText });
      if (phone) check('phone: the page-number button is at least 44 px tall', btn && btn.h >= 44, btn);
      // (The phone's "p." and "▾" are drawn by CSS so that the label contains the button's text; the a11y suite checks it.)
      await openGoTo();
      check(`${sizeName}: clicking it opens #goto-sheet`, await sheetOpen());
      const field = await evaluate(`(() => { const i = document.querySelector('#goto-page-input'); return i && { value: i.value, focused: document.activeElement === i, selected: i.selectionStart === 0 && i.selectionEnd === i.value.length, mode: i.getAttribute('inputmode') }; })()`);
      check(`${sizeName}: the field holds the current page, focused and selected`, field && field.value === String(START) && field.focused && field.selected && field.mode === 'numeric', field);
      const texts = await evaluate(`(() => { const s = document.querySelector('#goto-sheet'); return s && { title: s.querySelector('h2')?.textContent, text: s.innerText }; })()`);
      check(`${sizeName}: titled "Go to", with the hint line`, texts?.title === 'Go to' && texts.text.includes(`of ${fmt(total)} pages · or pick a letter`), texts);

      // ── The letter grid ──
      const grid = await evaluate(`[...document.querySelectorAll('#goto-sheet .goto-letter')].map((b) => ({ tag: b.tagName, label: b.getAttribute('aria-label'), current: b.getAttribute('aria-current'), h: b.getBoundingClientRect().height }))`);
      const labelsOk = grid?.length === 26 && grid.every((g, i) => {
        const l = String.fromCharCode(65 + i);
        return g.tag === 'BUTTON' && g.label === `Letter ${l}, page ${fmt(thumb[l])}`;
      });
      check(`${sizeName}: letter grid has 26 labelled buttons`, labelsOk, grid?.slice(0, 3));
      const cur = letterFor(START);
      check(`${sizeName}: the current letter (${cur}) is marked`, grid?.filter((g) => g.current === 'true').length === 1 && grid[cur.charCodeAt(0) - 65]?.current === 'true', grid?.map((g) => g.current));
      const columns = await evaluate(`getComputedStyle(document.querySelector('#goto-sheet .goto-grid')).gridTemplateColumns.split(' ').length`);
      check(`${sizeName}: the grid has 7 columns`, columns === 7, columns);
      if (phone) check('phone: letter tiles are at least 44 px tall', grid?.every((g) => g.h >= 44), grid?.map((g) => g.h));
      check(`${sizeName}: with no marks, #goto-marks is absent`, await evaluate(`!document.querySelector('#goto-marks')`));

      // ── Bad input ──
      for (const bad of ['0', String(total + 1), 'abc', '', '-5', '12.5']) {
        await typePage(bad);
        await evaluate(`document.querySelector('#goto-go-btn').click(); true`);
        await sleep(200);
        const err = await evaluate(`document.querySelector('#goto-error')?.textContent`);
        check(`${sizeName}: bad input "${bad}" says so and stays open`, err === `Pick a page from 1 to ${fmt(total)}` && await sheetOpen() && (await where()) === `/page/${START}`, { err, path: await where() });
      }

      // ── Closing ──
      await key('Escape');
      await sleep(300);
      check(`${sizeName}: Esc closes and returns focus`, !(await sheetOpen()) && await evaluate(`document.activeElement?.id === 'page-number-btn'`), await evaluate('document.activeElement?.id'));
      await openGoTo();
      await evaluate(`(() => { const s = document.querySelector('.ui-scrim'); s.dispatchEvent(new MouseEvent('mousedown', { bubbles: true })); return true; })()`);
      await sleep(300);
      check(`${sizeName}: the scrim closes it`, !(await sheetOpen()));
      await openGoTo();
      check(`${sizeName}: reopening clears the old error`, await evaluate(`!document.querySelector('#goto-error')`));

      // ── Typing a page and Enter ──
      await typePage('40');
      await evaluate(`document.querySelector('#goto-page-input').focus(); true`);
      await key('Enter', 'Enter', '\r');
      const at40 = await waitFor('/page/40');
      await sleep(300);
      check(`${sizeName}: typing a page and Enter jumps`, at40 === '/page/40' && !(await sheetOpen()), at40);
      check(`${sizeName}: focus is back on the page-number button`, await evaluate(`document.activeElement?.id === 'page-number-btn'`), await evaluate('document.activeElement?.id'));

      await openGoTo();
      await typePage('007');
      await evaluate(`document.querySelector('#goto-go-btn').click(); true`);
      check(`${sizeName}: "007" jumps to page 7`, (await waitFor('/page/7')) === '/page/7', await where());
      await sleep(400);

      // ── A letter ──
      await openGoTo();
      await evaluate(`[...document.querySelectorAll('#goto-sheet .goto-letter')].find((b) => b.textContent.trim() === 'M').click(); true`);
      check(`${sizeName}: a letter jumps`, (await waitFor(`/page/${thumb.M}`)) === `/page/${thumb.M}` && !(await sheetOpen()), await where());
      await sleep(400);

      // ── The menu ──
      await evaluate(`document.querySelector('#menu-btn').click(); true`);
      await sleep(300);
      check(`${sizeName}: the ⋯ menu no longer has Go to page`, await evaluate(`Boolean(document.querySelector('#reading-menu')) && !document.querySelector('#goto-page-form')`));
      await key('Escape');
      await sleep(300);

      // ── Marked pages ──
      await evaluate(`(() => {
        localStorage.setItem('panna_bookmarks', JSON.stringify([12]));
        localStorage.setItem('panna_dog_ears', JSON.stringify([30]));
        localStorage.setItem('panna_marginalia', JSON.stringify([{ id: 'n1', page_number: 50, text: 'a note', color: 'blue', created_at: Date.now() }]));
        return true;
      })()`);
      check(`${sizeName}: reloads with marks`, await open(`/page/${START}`, size));
      await openGoTo();
      const marks = await evaluate(`(() => { const m = document.querySelector('#goto-marks'); return m && { text: m.innerText, chips: [...m.querySelectorAll('.goto-mark')].map((c) => ({ tag: c.tagName, label: c.getAttribute('aria-label'), h: c.getBoundingClientRect().height })) }; })()`);
      check(`${sizeName}: #goto-marks shows three chips, newest note first`, marks?.chips.length === 3 && marks.text.includes('Your marked pages')
        && marks.chips.map((c) => c.label).join('|') === 'Note, page 50|Ribbon, page 12|Folded corner, page 30' && marks.chips.every((c) => c.tag === 'BUTTON'), marks);
      if (phone) check('phone: mark chips are at least 44 px tall', marks?.chips.every((c) => c.h >= 44), marks?.chips);
      await evaluate(`[...document.querySelectorAll('#goto-marks .goto-mark')].find((c) => c.getAttribute('aria-label') === 'Folded corner, page 30').click(); true`);
      check(`${sizeName}: clicking a marked page jumps`, (await waitFor('/page/30')) === '/page/30' && !(await sheetOpen()), await where());
      await evaluate(`['panna_bookmarks', 'panna_dog_ears', 'panna_marginalia'].forEach((k) => localStorage.removeItem(k)); true`);

      // ── During a turn (desktop: the flip animates) ──
      if (!phone) {
        check('desktop: back at the start page', await open(`/page/${START}`, size));
        await evaluate(`document.querySelector('[aria-label="Next spread"]').click(); document.querySelector('#page-number-btn').click(); true`);
        await sleep(50);
        await typePage('60');
        await evaluate(`document.querySelector('#goto-go-btn').click(); true`);
        const landed = await waitFor('/page/60', 6000);
        await sleep(2500);
        const end = { path: await where(), open: await sheetOpen(), title: await evaluate(`document.querySelector('#book-title')?.textContent`) };
        check('desktop: submit during a page turn ends on the target', (end.path === '/page/60' && !end.open && end.title === 'Pages 60–61') || (end.open && end.path !== '/page/60'), { landed, end });
      }
    }
  } finally {
    if (socket) { try { socket.send(JSON.stringify({ id: 999999, method: 'Browser.close' })); } catch {} socket.close(); }
    if (edge.pid) spawnSync('taskkill', ['/PID', String(edge.pid), '/T', '/F'], { stdio: 'ignore' });
    await sleep(500);
    try { fs.rmSync(USER_DATA, { recursive: true, force: true, maxRetries: 10, retryDelay: 250 }); } catch {}
  }
  console.log(`Go to panel: ${checks - failures}/${checks} checks passed.`);
  if (failures) process.exitCode = 1;
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
