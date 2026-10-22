// Word sheet (redesign step 4): side panel on desktop, bottom sheet on phones.
// Usage: node scripts/test-word-browser.mjs   (needs the app running on localhost:3000)
import { spawn, spawnSync } from 'child_process';
import fs from 'fs';
import path from 'path';

const EDGE_PATH = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const PORT = 9319;
const BASE = 'http://localhost:3000';
const USER_DATA = path.join(process.cwd(), 'scratch', `panna-word-edge-${process.pid}-${Date.now()}`);
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

    const sheet = () => evaluate(`(() => {
      const d = document.querySelector('#word-sheet');
      if (!d) return null;
      const r = d.getBoundingClientRect();
      const name = document.getElementById(d.getAttribute('aria-labelledby'))?.textContent;
      const speak = ['en', 'hi'].map((l) => { const b = document.querySelector('#speak-' + l + '-btn'); return b && { disabled: b.disabled, title: b.title }; });
      return { name, role: d.getAttribute('role'), text: d.innerText, left: r.left, right: r.right, top: r.top, bottom: Math.round(r.bottom), width: r.width, height: Math.round(r.height),
        focusInside: d.contains(document.activeElement), speak, scrim: Boolean(document.querySelector('#word-drawer-backdrop')) };
    })()`);

    for (const [sizeName, size] of [['desktop', { width: 1440, height: 900, mobile: false }], ['phone', { width: 390, height: 844, mobile: true }]]) {
      check(`${sizeName}: deep link /word/About hydrates`, await open('/word/About', size));
      await sleep(600);
      let s = await sheet();
      check(`${sizeName}: word sheet is a dialog named after the word`, s?.role === 'dialog' && s.name === 'About' && s.scrim, s && { role: s.role, name: s.name });
      check(`${sizeName}: focus moves into the sheet`, s?.focusInside === true);
      check(`${sizeName}: part of speech in plain English`, s?.text.includes('preposition or adverb'), s?.text);
      check(`${sizeName}: machine-written entry says it is not yet checked`, s?.text.includes('not yet checked by a reviewer'));
      check(`${sizeName}: speak buttons are enabled, or disabled with a reason`,
        s?.speak.every((b) => b && (!b.disabled || /No (Hindi|English) voice|cannot speak/.test(b.title))), s?.speak);
      if (sizeName === 'desktop') {
        check('desktop: sheet is a full-height side panel on the right', s && s.right === size.width && s.top === 0 && s.height === size.height && s.width <= 460, s);
      } else {
        check('phone: sheet is a full-width bottom sheet', s && s.left === 0 && s.right === size.width && s.bottom === size.height && s.top > 0, s);
      }

      await evaluate(`localStorage.removeItem('panna_saved_words'); true`);
      await evaluate(`document.querySelector('#save-word-btn').click(); true`);
      await sleep(200);
      const saved = await evaluate(`({ pressed: document.querySelector('#save-word-btn').getAttribute('aria-pressed'), text: document.querySelector('#save-word-btn').textContent, stored: localStorage.getItem('panna_saved_words') || '' })`);
      check(`${sizeName}: Save word toggles to Saved and is stored`, saved.pressed === 'true' && saved.text.includes('Saved') && saved.stored.includes('"About"'), saved);
      await evaluate(`document.querySelector('#save-word-btn').click(); true`);
      await sleep(200);
      check(`${sizeName}: Save word toggles back`, await evaluate(`document.querySelector('#save-word-btn').getAttribute('aria-pressed') === 'false'`));

      await key('Escape');
      await sleep(400);
      check(`${sizeName}: Escape closes the sheet and the URL returns to the page`,
        !(await sheet()) && await evaluate(`location.pathname.startsWith('/page/')`), await evaluate('location.pathname'));

      check(`${sizeName}: page 16 loads`, await open('/page/16', size));
      // The desktop spread also renders non-interactive copies of pages for the page-turn animation.
      await evaluate(`[...document.querySelectorAll('.entry-text')].find((p) => p.textContent.startsWith('Camel') && p.style.cursor === 'pointer').click(); true`);
      await sleep(600);
      s = await sheet();
      check(`${sizeName}: tapping an entry opens its sheet`, s?.name === 'Camel' && await evaluate(`location.pathname === '/word/Camel'`), s?.name);
      check(`${sizeName}: reviewed entry has no "not yet checked" note`, s && !s.text.includes('not yet checked'));
      check(`${sizeName}: Hindi meaning is shown large`, await evaluate(`parseFloat(getComputedStyle(document.querySelector('.word-hi')).fontSize) >= 28`));
      await evaluate(`document.querySelector('#see-on-page-btn').click(); true`);
      await sleep(800);
      check(`${sizeName}: "See on page" closes the sheet and marks the word on the page`,
        !(await sheet()) && await evaluate(`[...document.querySelectorAll('.pencil-underlined')].some((e) => e.textContent.trim() === 'Camel')`));
      check(`${sizeName}: nothing overflows sideways`, await evaluate(`document.documentElement.scrollWidth <= innerWidth`));
    }
  } finally {
    if (socket) { try { socket.send(JSON.stringify({ id: 999999, method: 'Browser.close' })); } catch {} socket.close(); }
    if (edge.pid) spawnSync('taskkill', ['/PID', String(edge.pid), '/T', '/F'], { stdio: 'ignore' });
    await sleep(500);
    try { fs.rmSync(USER_DATA, { recursive: true, force: true, maxRetries: 10, retryDelay: 250 }); } catch {}
  }
  console.log(`Word sheet: ${checks - failures}/${checks} checks passed.`);
  if (failures) process.exitCode = 1;
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
