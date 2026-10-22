// Saved screen: words grouped by date, marked pages, pencil notes, remove with Undo, Back, at desktop and phone sizes.
// Usage: node scripts/test-saved-browser.mjs   (needs the app running on localhost:3000)
import { spawn, spawnSync } from 'child_process';
import fs from 'fs';
import path from 'path';

const EDGE_PATH = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const PORT = 9325;
const BASE = 'http://localhost:3000';
const USER_DATA = path.join(process.cwd(), 'scratch', `panna-saved-edge-${process.pid}-${Date.now()}`);
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

    const DAY = 24 * 60 * 60 * 1000;
    // Saved items as the app stores them, with known save times.
    const seed = () => evaluate(`(async () => {
      const word = async (h) => (await (await fetch('/api/word/' + h)).json()).entry;
      const now = Date.now();
      const words = [
        { ...(await word('Camel')), saved_at: now - 60000 },
        { ...(await word('Ceremony')), saved_at: now - ${DAY} - 60000 },
        { ...(await word('About')) },
      ];
      localStorage.setItem('panna_saved_words', JSON.stringify(words));
      localStorage.setItem('panna_bookmarks', JSON.stringify([16]));
      localStorage.setItem('panna_dog_ears', JSON.stringify([23]));
      localStorage.setItem('panna_marginalia', JSON.stringify([{ id: 'n1', page_number: 18, text: 'learn this one', color: 'blue', created_at: now }]));
      return true;
    })()`);
    const saved = () => evaluate(`(() => {
      const s = document.querySelector('#saved-screen');
      if (!s) return null;
      return {
        text: s.innerText,
        groups: [...s.querySelectorAll('.ui-list-group')].map((g) => g.textContent),
        tabs: [...s.querySelectorAll('[role="radio"]')].map((r) => r.textContent),
        rows: [...s.querySelectorAll('.saved-hw, .saved-note')].map((e) => e.textContent),
      };
    })()`);
    const tab = async (name) => { await evaluate(`[...document.querySelectorAll('#saved-screen [role="radio"]')].find((r) => r.textContent.startsWith('${name}')).click(); true`); await sleep(200); };
    const openSaved = async (sizeName) => {
      await evaluate(`document.querySelector(${JSON.stringify(sizeName === 'phone' ? '#nav-saved-btn' : '#open-bookmarks-btn')}).click(); true`);
      await sleep(400);
    };

    for (const [sizeName, size] of [['desktop', { width: 1440, height: 900, mobile: false }], ['phone', { width: 390, height: 844, mobile: true }]]) {
      check(`${sizeName}: app hydrates`, await open('/page/16', size));
      await seed();
      check(`${sizeName}: reloads with saved items`, await open('/page/16', size));

      await openSaved(sizeName);
      let s = await saved();
      check(`${sizeName}: Saved opens as a screen and the book is hidden`, Boolean(s) && !(await visible('.entry-text')));
      check(`${sizeName}: tabs show counts`, s?.tabs.join('|') === 'Words · 3|Pages · 2|Notes · 1', s?.tabs);
      check(`${sizeName}: words are grouped by when they were saved`, s?.groups.join('|') === 'Today|Yesterday|Earlier' && s.rows.join('|') === 'Camel|Ceremony|About', s);
      check(`${sizeName}: each word shows its Hindi meaning`, s?.text.includes('ऊँट') && s.text.includes('समारोह'));
      check(`${sizeName}: nothing overflows sideways`, await evaluate(`document.documentElement.scrollWidth <= innerWidth`));
      if (sizeName === 'phone') check('phone: Saved tab is current', await evaluate(`document.querySelector('#nav-saved-btn').getAttribute('aria-current') === 'page'`));
      else check('desktop: header Saved button shows it is active', await evaluate(`document.querySelector('#open-bookmarks-btn').getAttribute('aria-pressed') === 'true'`));

      await evaluate(`document.querySelector('[aria-label="Remove Camel from saved words"]').click(); true`);
      await sleep(200);
      s = await saved();
      const toastBox = await evaluate(`(() => { const t = document.querySelector('.saved-toast'); if (!t) return null; const r = t.getBoundingClientRect(); const bar = document.querySelector('.app-bottomnav'); const b = bar && getComputedStyle(bar).display !== 'none' ? bar.getBoundingClientRect().top : innerHeight; return { text: t.innerText, bottom: r.bottom, limit: b }; })()`);
      check(`${sizeName}: removing a word shows an Undo message`, !s?.rows.includes('Camel') && toastBox?.text.includes('Removed “Camel”') && toastBox.text.includes('Undo'), toastBox);
      check(`${sizeName}: the Undo message is not hidden behind the bottom bar`, toastBox && toastBox.bottom <= toastBox.limit, toastBox);
      await evaluate(`document.querySelector('.saved-undo').click(); true`);
      await sleep(200);
      check(`${sizeName}: Undo puts the word back, in its group`, (await saved())?.rows[0] === 'Camel'
        && await evaluate(`JSON.parse(localStorage.getItem('panna_saved_words')).some((w) => w.headword === 'Camel')`));

      await tab('Pages');
      s = await saved();
      check(`${sizeName}: Pages lists the ribbon spread and the folded page`, s?.text.includes('Pages 16–17') && s.text.includes('Ribbon') && s.text.includes('Page 23') && s.text.includes('Folded corner'), s?.text);
      await sleep(600);
      const covers = await evaluate(`[...document.querySelectorAll('#saved-screen .saved-sub')].map((e) => e.textContent)`);
      const spread = await evaluate(`(async () => { const [l, r] = await Promise.all([16, 17].map(async (n) => (await fetch('/api/page/' + n)).json())); return l.first_headword + ' – ' + r.last_headword; })()`);
      check(`${sizeName}: each page shows the words it covers (a ribbon spans both pages)`, covers[0] === spread && covers.every((c) => / – /.test(c)), { covers, spread });
      await tab('Notes');
      s = await saved();
      check(`${sizeName}: Notes shows the pencil note and its page`, s?.text.includes('learn this one') && s.text.includes('on page 18'), s?.text);

      await tab('Words');
      await evaluate(`document.activeElement?.blur(); true`);
      await key('ArrowRight');
      await sleep(600);
      check(`${sizeName}: arrow keys do not turn the hidden book's pages`, await evaluate(`location.pathname`) === '/page/16', await evaluate('location.pathname'));
      await evaluate(`[...document.querySelectorAll('#saved-screen .saved-open')].find((b) => b.textContent.startsWith('Ceremony')).click(); true`);
      await sleep(700);
      check(`${sizeName}: tapping a saved word opens its sheet over Saved`,
        await evaluate(`document.querySelector('#word-sheet-title')?.textContent === 'Ceremony' && Boolean(document.querySelector('#saved-screen'))`));
      await evaluate(`document.querySelector('#see-on-page-btn').click(); true`);
      await sleep(1800);
      check(`${sizeName}: "See on page" goes back to the book at that word`,
        !(await saved()) && await evaluate(`[...document.querySelectorAll('.pencil-underlined')].some((e) => e.textContent.trim() === 'Ceremony')`));

      await openSaved(sizeName);
      await evaluate(`history.back(); true`);
      await sleep(500);
      check(`${sizeName}: the Back button closes Saved`, !(await saved()) && await visible('.entry-text'));

      await openSaved(sizeName);
      await tab('Pages');
      await evaluate(`[...document.querySelectorAll('#saved-screen .saved-open')].find((b) => b.textContent.startsWith('Page 23')).click(); true`);
      await sleep(1800);
      check(`${sizeName}: tapping a saved page turns the book to it`, !(await saved()) && await evaluate(`location.pathname === '/page/23'`), await evaluate('location.pathname'));

      await evaluate(`['panna_saved_words', 'panna_bookmarks', 'panna_dog_ears', 'panna_marginalia'].forEach((k) => localStorage.removeItem(k)); true`);
      await open('/page/16', size);
      await openSaved(sizeName);
      s = await saved();
      check(`${sizeName}: empty Saved explains how to save words`, s?.text.includes('Nothing saved yet') && s.text.includes('Save word'), s?.text);
      await evaluate(`document.querySelector(${JSON.stringify(sizeName === 'phone' ? '#nav-book-btn' : '#close-saved-btn')}).click(); true`);
      await sleep(400);
      check(`${sizeName}: ${sizeName === 'phone' ? 'Book tab' : '"Back to the book"'} returns to the page`, !(await saved()) && await visible('.entry-text'));
    }
  } finally {
    if (socket) { try { socket.send(JSON.stringify({ id: 999999, method: 'Browser.close' })); } catch {} socket.close(); }
    if (edge.pid) spawnSync('taskkill', ['/PID', String(edge.pid), '/T', '/F'], { stdio: 'ignore' });
    await sleep(500);
    try { fs.rmSync(USER_DATA, { recursive: true, force: true, maxRetries: 10, retryDelay: 250 }); } catch {}
  }
  console.log(`Saved screen: ${checks - failures}/${checks} checks passed.`);
  if (failures) process.exitCode = 1;
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
