// App chrome (redesign step 2): header, ⋯ menu and phone bottom bar, at desktop and phone sizes.
// Usage: node scripts/test-shell-browser.mjs   (needs the app running on localhost:3000)
import { spawn, spawnSync } from 'child_process';
import fs from 'fs';
import path from 'path';

const EDGE_PATH = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const PORT = 9315;
const BASE = 'http://localhost:3000';
const USER_DATA = path.join(process.cwd(), 'scratch', `panna-shell-edge-${process.pid}-${Date.now()}`);
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

    // ── Desktop ──────────────────────────────────────────────
    const desktop = { width: 1440, height: 900, mobile: false };
    check('desktop: app hydrates', await open('/page/16', desktop));
    check('desktop: wordmark, search, Saved and ⋯ are visible',
      (await visible('.app-wordmark')) && (await visible('#lookup-input')) && (await visible('#open-bookmarks-btn')) && (await visible('#menu-btn')));
    check('desktop: no bottom bar', !(await visible('.app-bottomnav')));

    await evaluate(`document.activeElement?.blur(); document.body.focus(); true`);
    await key('/', 'Slash', '/');
    check('desktop: "/" focuses the search box', await evaluate(`document.activeElement?.id === 'lookup-input'`));
    check('desktop: "/" is not typed into the box', await evaluate(`document.querySelector('#lookup-input').value === ''`));
    await evaluate(`document.activeElement.blur(); true`);

    await evaluate(`document.querySelector('#menu-btn').click(); true`);
    await sleep(300);
    check('desktop: ⋯ opens the reading settings dialog', await evaluate(`Boolean(document.querySelector('#reading-menu[role="dialog"]'))`));
    check('desktop: focus moves into the menu', await evaluate(`Boolean(document.activeElement?.closest('#reading-menu'))`));
    await evaluate(`document.querySelector('[role="radio"][aria-checked="true"]').focus(); true`);
    await key('ArrowRight');
    await sleep(800);
    check('desktop: arrow keys inside the menu do not turn the page', await evaluate(`location.pathname === '/page/16'`), await evaluate('location.pathname'));
    check('desktop: arrow keys move the lighting choice to Evening',
      await evaluate(`[...document.querySelectorAll('[role="radio"][aria-checked="true"]')].some((r) => r.textContent === 'Evening')`));
    await key('Escape');
    await sleep(300);
    check('desktop: Escape closes the menu and returns focus to ⋯',
      await evaluate(`!document.querySelector('#reading-menu') && document.activeElement?.id === 'menu-btn'`));

    await evaluate(`document.querySelector('#menu-btn').click(); true`);
    await sleep(300);
    await evaluate(`(() => { const input = document.querySelector('#goto-page-input'); const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set; set.call(input, '40'); input.dispatchEvent(new Event('input', { bubbles: true })); return true; })()`);
    await sleep(100);
    await evaluate(`document.querySelector('#goto-page-form').requestSubmit(); true`);
    await sleep(2500);
    check('desktop: Go to page in the menu turns to page 40', await evaluate(`location.pathname === '/page/40' && !document.querySelector('#reading-menu')`), await evaluate('location.pathname'));

    await evaluate(`document.querySelector('#menu-btn').click(); true`);
    await sleep(300);
    await evaluate(`document.querySelector('#sounds-switch').click(); true`);
    check('desktop: Page sounds switch toggles', await evaluate(`document.querySelector('#sounds-switch').getAttribute('aria-checked') === 'false'`));
    await key('Escape');

    // ── Phone ────────────────────────────────────────────────
    const phone = { width: 390, height: 844, mobile: true };
    check('phone: app hydrates', await open('/page/16', phone));
    check('phone: search and ⋯ visible, wordmark and header Saved hidden',
      (await visible('#lookup-input')) && (await visible('#menu-btn')) && !(await visible('.app-wordmark')) && !(await visible('#open-bookmarks-btn')));
    check('phone: bottom bar shows Book (current) and Saved',
      (await visible('#nav-book-btn')) && (await visible('#nav-saved-btn')) && await evaluate(`document.querySelector('#nav-book-btn').getAttribute('aria-current') === 'page'`));
    check('phone: nothing overflows sideways', await evaluate(`document.documentElement.scrollWidth <= innerWidth`), await evaluate('document.documentElement.scrollWidth'));
    const covered = await evaluate(`(async () => {
      window.scrollTo(0, document.documentElement.scrollHeight);
      await new Promise((r) => setTimeout(r, 300));
      const bar = document.querySelector('.app-bottomnav').getBoundingClientRect();
      const turn = [...document.querySelectorAll('button')].find((b) => b.textContent.trim() === '→').getBoundingClientRect();
      return { barTop: bar.top, turnBottom: turn.bottom };
    })()`);
    check('phone: bottom bar never covers the page-turn buttons', covered && covered.turnBottom <= covered.barTop, covered);
    const tapTargets = await evaluate(`[...document.querySelectorAll('#menu-btn, #nav-book-btn, #nav-saved-btn')].map((b) => { const r = b.getBoundingClientRect(); return Math.min(r.width, r.height); })`);
    check('phone: header and bar buttons are at least 44px', tapTargets.every((s) => s >= 44), tapTargets);

    await evaluate(`document.querySelector('#nav-saved-btn').click(); true`);
    await sleep(400);
    check('phone: Saved tab opens saved items and becomes current',
      await evaluate(`Boolean(document.querySelector('#bookmarks-modal-card')) && document.querySelector('#nav-saved-btn').getAttribute('aria-current') === 'page'`));
    const barOnTop = await evaluate(`(() => { const r = document.querySelector('#nav-book-btn').getBoundingClientRect(); return Boolean(document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2)?.closest('.app-bottomnav')); })()`);
    check('phone: bottom bar stays usable while Saved is open', barOnTop);
    await evaluate(`document.querySelector('#nav-book-btn').click(); true`);
    await sleep(300);
    check('phone: Book tab returns to the page', await evaluate(`!document.querySelector('#bookmarks-modal-card')`));

    await evaluate(`document.querySelector('#menu-btn').click(); true`);
    await sleep(300);
    const sheet = await evaluate(`(() => { const r = document.querySelector('#reading-menu').getBoundingClientRect(); return { left: r.left, right: r.right, bottom: Math.round(r.bottom), top: r.top, h: innerHeight }; })()`);
    check('phone: menu is a full-width sheet anchored to the bottom', sheet && sheet.left === 0 && sheet.right === 390 && sheet.bottom === sheet.h && sheet.top > 0, sheet);
    await evaluate(`document.querySelector('#open-credits-btn').click(); true`);
    await sleep(300);
    check('phone: Sources & credits opens from the menu', await evaluate(`Boolean(document.querySelector('[aria-labelledby="credits-title"]')) && !document.querySelector('#reading-menu')`));
  } finally {
    if (socket) { try { socket.send(JSON.stringify({ id: 999999, method: 'Browser.close' })); } catch {} socket.close(); }
    if (edge.pid) spawnSync('taskkill', ['/PID', String(edge.pid), '/T', '/F'], { stdio: 'ignore' });
    await sleep(500);
    try { fs.rmSync(USER_DATA, { recursive: true, force: true, maxRetries: 10, retryDelay: 250 }); } catch {}
  }
  console.log(`App chrome: ${checks - failures}/${checks} checks passed.`);
  if (failures) process.exitCode = 1;
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
