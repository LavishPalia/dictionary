// Find a saved word: the field shows from 10 saved words, matches English, Hindi and Hinglish, best first, works with
// the status filter, and hands an unmatched word to the main search. Desktop in Day, phone in Evening.
// Usage: node scripts/test-saved-search-browser.mjs   (needs the app running on localhost:3000)
import { spawn, spawnSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import Database from 'better-sqlite3';
// The page Camel is on: tests open it to tap a known entry (page numbers change when the book grows).
const CAMEL_PAGE = new Database('data/dictionary.db', { readonly: true })
  .prepare("SELECT page_number FROM entries WHERE normalized = 'camel'").get().page_number;

const EDGE_PATH = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const PORT = 9369;
const BASE = 'http://localhost:3000';
const USER_DATA = path.join(process.cwd(), 'scratch', `panna-savedsearch-edge-${process.pid}-${Date.now()}`);
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
    const saved = () => evaluate(`Boolean(document.querySelector('#saved-screen'))`);
    await send('Page.enable');
    await send('Runtime.enable');

    const WORDS = ['love', 'lovely', 'glove', 'beloved', 'darling', 'water', 'camel', 'ceremony', 'about', 'apple', 'book', 'candle'];
    // Saved words as the app stores them (the first `n`), plus the lighting mode.
    const seed = (n, lighting) => evaluate(`(async () => {
      const words = await Promise.all(${JSON.stringify(WORDS)}.slice(0, ${n}).map(async (h, i) => ({ ...(await (await fetch('/api/word/' + h)).json()).entry, saved_at: Date.now() - i * 60000 })));
      localStorage.setItem('panna_saved_words', JSON.stringify(words));
      localStorage.setItem('panna_settings', JSON.stringify({ ...JSON.parse(localStorage.getItem('panna_settings') || '{}'), lighting: '${lighting}' }));
      return true;
    })()`);
    const openSaved = async (sizeName) => {
      await evaluate(`document.querySelector(${JSON.stringify(sizeName === 'phone' ? '#nav-saved-btn' : '#open-bookmarks-btn')}).click(); true`);
      await sleep(400);
    };
    const type = async (text) => {
      await evaluate(`(() => { const i = document.querySelector('#saved-search'); i.focus(); i.select(); return true; })()`);
      await send('Input.insertText', { text });
      await sleep(250);
    };
    const results = () => evaluate(`(() => {
      const list = document.querySelector('#saved-search-results');
      return {
        rows: list ? [...list.querySelectorAll('.saved-hw')].map((e) => e.textContent) : [],
        marks: list ? [...list.querySelectorAll('.saved-mark')].map((e) => e.textContent) : [],
        count: document.querySelector('#saved-search-count')?.textContent ?? null,
        empty: document.querySelector('#saved-search-empty')?.innerText ?? null,
        review: Boolean(document.querySelector('#saved-review-btn')), progress: Boolean(document.querySelector('#saved-progress')),
        groups: document.querySelectorAll('#saved-screen .ui-list-group').length,
      };
    })()`);
    const tabTo = (name) => evaluate(`[...document.querySelectorAll('#saved-screen .saved-tabs [role="radio"]')].find((r) => r.textContent.startsWith('${name}')).click(); true`);

    for (const [sizeName, size, lighting] of [
      ['desktop', { width: 1440, height: 900, mobile: false }, 'day'],
      ['phone', { width: 390, height: 844, mobile: true }, 'evening'],
    ]) {
      const tag = `${sizeName} (${lighting})`;
      check(`${tag}: app hydrates`, await open(`/page/${CAMEL_PAGE}`, size));
      await seed(9, lighting);
      await open(`/page/${CAMEL_PAGE}`, size);
      await openSaved(sizeName);
      check(`${tag}: no search field with 9 saved words`, !(await evaluate(`Boolean(document.querySelector('#saved-search'))`)));

      await seed(12, lighting);
      // "glove" is in Learning: one right answer.
      await evaluate(`localStorage.setItem('panna_review', JSON.stringify({ glove: { box: 1, due_at: Date.now() + 86400000, last_at: Date.now(), right: 1, wrong: 0 } })); true`);
      await open(`/page/${CAMEL_PAGE}`, size);
      check(`${tag}: lighting is ${lighting}`, await evaluate(`document.documentElement.dataset.light`) === lighting, await evaluate(`document.documentElement.dataset.light`));
      await openSaved(sizeName);
      check(`${tag}: search field shows with 12 saved words`, await visible('#saved-search'));
      const order = await evaluate(`[...document.querySelectorAll('#saved-screen > *')].map((e) => e.id || e.className.split(' ')[0])`);
      check(`${tag}: field sits between the progress bar and the status filter`,
        order.indexOf('saved-progress') >= 0 && order.indexOf('saved-progress') < order.indexOf('saved-search') && order.indexOf('saved-search') < order.indexOf('saved-filter'), order);

      await type('lov');
      let r = await results();
      check(`${tag}: English: starts-with first (shorter first), then contains`, r.rows.join() === 'love,lovely,beloved,glove', r);
      check(`${tag}: the match is highlighted`, r.marks.length === 4 && r.marks.every((m) => m === 'lov'), r.marks);
      check(`${tag}: one ranked list with a count; Review and progress hidden`, r.groups === 0 && r.count === '4 of 12 words' && !r.progress && !r.review, r);

      await type('pyaar');
      r = await results();
      check(`${tag}: Hinglish "pyaar" puts love first`, r.rows[0] === 'love' && r.rows.slice(1).sort().join() === 'beloved,darling,lovely', r.rows);
      check(`${tag}: Hinglish marks the Hindi word`, r.marks[0] === 'प्यार' && r.marks.slice(1).every((m) => m === 'प्यारा'), r.marks);

      await type('पानी');
      r = await results();
      check(`${tag}: Hindi text`, r.rows.join() === 'water' && r.marks[0] === 'पानी', r);

      await evaluate(`[...document.querySelectorAll('#saved-screen .saved-filter [role="radio"]')].find((b) => b.textContent.startsWith('Learning')).click(); true`);
      await type('lov');
      r = await results();
      check(`${tag}: search works inside the status filter`, r.rows.join() === 'glove' && r.count === '1 of 1 learning word', r);
      await type('water');
      r = await results();
      check(`${tag}: no match in the filter offers all saved words`, r.empty?.includes('No learning saved word matches “water”') && r.empty.includes('Show all saved words · 1 match'), r.empty);
      await evaluate(`document.querySelector('#saved-search-all').click(); true`);
      await sleep(200);
      r = await results();
      check(`${tag}: "Show all" switches the filter to All, keeping the search`, r.rows.join() === 'water', r);

      await evaluate(`document.querySelector('#saved-search').focus(); true`);
      await key('Escape');
      await sleep(200);
      r = await results();
      check(`${tag}: Esc clears the search and the date groups return`,
        await evaluate(`document.querySelector('#saved-search').value`) === '' && r.groups > 0 && r.progress && await saved(), r);

      await type('lov');
      await evaluate(`document.querySelector('#saved-search-clear').click(); true`);
      await sleep(200);
      check(`${tag}: ✕ clears and keeps focus in the field`, await evaluate(`document.querySelector('#saved-search').value === '' && document.activeElement?.id === 'saved-search'`));

      await type('lov');
      await evaluate(`document.querySelector('[aria-label="Remove glove from saved words"]').click(); true`);
      await sleep(200);
      r = await results();
      check(`${tag}: removing a result shows Undo and drops it from the results`,
        !r.rows.includes('glove') && (await evaluate(`document.querySelector('.saved-toast')?.innerText ?? ''`)).includes('Undo'), r);
      await evaluate(`document.querySelector('.saved-undo').click(); true`);
      await sleep(200);
      check(`${tag}: Undo puts it back in the results`, (await results()).rows.includes('glove'));

      await type('serendipity');
      r = await results();
      check(`${tag}: no match offers to look it up in the book`, r.empty?.includes('No saved word matches “serendipity”') && r.empty.includes('Look it up in the book'), r.empty);
      check(`${tag}: nothing overflows sideways`, await evaluate(`document.documentElement.scrollWidth <= innerWidth`));
      await evaluate(`document.querySelector('#saved-search-lookup').click(); true`);
      await sleep(1200);
      const box = await evaluate(`({ value: document.querySelector('#lookup-input').value, expanded: document.querySelector('#lookup-input').getAttribute('aria-expanded') })`);
      check(`${tag}: "Look it up" puts the word in the main search box and opens its list`, box.value === 'serendipity' && box.expanded === 'true', box);

      await tabTo('Pages');
      await sleep(200);
      await tabTo('Words');
      await sleep(200);
      check(`${tag}: switching tabs clears the search`, await evaluate(`document.querySelector('#saved-search')?.value === ''`));
      await evaluate(`['panna_saved_words', 'panna_review', 'panna_settings'].forEach((k) => localStorage.removeItem(k)); true`);
    }
  } finally {
    if (socket) { try { socket.send(JSON.stringify({ id: 999999, method: 'Browser.close' })); } catch {} socket.close(); }
    if (edge.pid) spawnSync('taskkill', ['/PID', String(edge.pid), '/T', '/F'], { stdio: 'ignore' });
    await sleep(500);
    try { fs.rmSync(USER_DATA, { recursive: true, force: true, maxRetries: 10, retryDelay: 250 }); } catch {}
  }
  console.log(`Saved search: ${checks - failures}/${checks} checks passed.`);
  if (failures) process.exitCode = 1;
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
