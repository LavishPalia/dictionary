// Today screen and moving between Today, Book, Saved and Review (tabs, close buttons and Back), at desktop
// and phone sizes.
// Usage: node scripts/test-today-browser.mjs   (needs the app running on localhost:3000)
import { spawn, spawnSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import Database from 'better-sqlite3';
// The page Camel is on: tests open it to tap a known entry (page numbers change when the book grows).
const CAMEL_PAGE = new Database('data/dictionary.db', { readonly: true })
  .prepare("SELECT page_number FROM entries WHERE normalized = 'camel'").get().page_number;

const EDGE_PATH = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const PORT = 9333;
const BASE = 'http://localhost:3000';
const USER_DATA = path.join(process.cwd(), 'scratch', `panna-today-edge-${process.pid}-${Date.now()}`);
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
    const seed = (data) => evaluate(`(async () => {
      localStorage.clear();
      const d = ${JSON.stringify(data)};
      if (d.words) {
        const list = [];
        for (const h of d.words) list.push({ ...(await (await fetch('/api/word/' + h)).json()).entry, saved_at: Date.now() });
        localStorage.setItem('panna_saved_words', JSON.stringify(list));
      }
      for (const [k, v] of Object.entries(d.raw ?? {})) localStorage.setItem(k, typeof v === 'string' ? v : JSON.stringify(v));
      return true;
    })()`);
    const where = () => evaluate(`({
      path: location.pathname,
      screen: document.querySelector('#learn-screen') ? 'learn' : document.querySelector('#today-screen') ? 'today' : document.querySelector('#review-screen') ? 'review' : document.querySelector('#saved-screen') ? 'saved' : 'book',
    })`);
    const type = async (text) => {
      await evaluate(`(() => { const input = document.querySelector('#lookup-input'); input.focus(); const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set; set.call(input, ${JSON.stringify(text)}); input.dispatchEvent(new Event('input', { bubbles: true })); return true; })()`);
      for (let i = 0; i < 20; i++) {
        await sleep(150);
        if (await evaluate(`Boolean(document.querySelector('#lookup-panel [role="option"], #lookup-panel .noentry'))`)) break;
      }
      await sleep(150);
    };
    const go = async (fn) => { await evaluate(`(() => { ${fn}; return true; })()`); await sleep(900); return where(); };
    const day = (offset) => evaluate(`(() => { const d = new Date(Date.now() + ${offset} * ${DAY}); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); })()`);

    for (const [sizeName, size] of [['desktop', { width: 1440, height: 900, mobile: false }], ['phone', { width: 390, height: 844, mobile: true }]]) {
      const todayBtn = sizeName === 'phone' ? '#nav-today-btn' : '#open-today-btn';
      const bookBtn = sizeName === 'phone' ? '#nav-book-btn' : '#open-today-btn'; // desktop: the Today button toggles back
      check(`${sizeName}: app hydrates`, await open(`/page/${CAMEL_PAGE}`, size));
      await seed({ words: ['Camel', 'Ceremony', 'Abandon'], raw: { panna_last_page: '40', panna_review_days: [await day(-2), await day(-1)] } });
      check(`${sizeName}: the front page opens`, await open('/', size));
      let w = await where();
      check(`${sizeName}: the front page is Today`, w.screen === 'today' && w.path === '/', w);
      const text = await evaluate(`document.querySelector('#today-screen').innerText`);
      check(`${sizeName}: Today shows the due review with a time estimate`, text.includes('3 words are due') && text.includes('About 1 minute'), text);
      check(`${sizeName}: Today shows the streak`, text.includes('2 days in a row'), text);
      check(`${sizeName}: Today offers to continue at the last page read`, text.includes('Continue reading') && text.includes('Page 40'), text);
      await sleep(400);
      const wod = await evaluate(`(async () => { const d = new Date(); const date = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); return (await (await fetch('/api/today?date=' + date)).json()).word.headword; })()`);
      check(`${sizeName}: Today shows the word of the day`, (await evaluate(`document.querySelector('#today-word')?.innerText ?? ''`)).includes(wod), wod);
      check(`${sizeName}: Today is the current tab`, await evaluate(`document.querySelector('${todayBtn}').getAttribute(${JSON.stringify(sizeName === 'phone' ? 'aria-current' : 'aria-pressed')}) === ${JSON.stringify(sizeName === 'phone' ? 'page' : 'true')}`));
      check(`${sizeName}: nothing overflows sideways`, await evaluate(`document.documentElement.scrollWidth <= innerWidth`));

      // The study guide: a card on Today until it has been opened, then a quiet link.
      check(`${sizeName}: Today shows the study guide card before it is opened`, await visible('#today-learn') && !(await evaluate(`Boolean(document.querySelector('#today-learn-link'))`)));
      w = await go(`document.querySelector('#today-learn button').click()`);
      check(`${sizeName}: the card opens the study guide`, w.screen === 'learn', w);
      w = await go(`document.querySelector('#learn-back').click()`);
      check(`${sizeName}: the guide's Back returns to Today`, w.screen === 'today' && w.path === '/', w);
      check(`${sizeName}: once opened, Today shows the guide as a link, not a card`, await visible('#today-learn-link') && !(await evaluate(`Boolean(document.querySelector('#today-learn'))`)));

      // Word of the day: save it, and open it.
      await evaluate(`document.querySelector('#today-word-save').click(); true`);
      await sleep(200);
      check(`${sizeName}: the word of the day can be saved from Today`, await evaluate(`JSON.parse(localStorage.getItem('panna_saved_words')).some((x) => x.headword === ${JSON.stringify(wod)})`));
      await evaluate(`document.querySelector('#today-word-open').click(); true`);
      await sleep(600);
      check(`${sizeName}: the word of the day opens in its word sheet`, await evaluate(`document.querySelector('#word-sheet-title')?.textContent === ${JSON.stringify(wod)}`));
      await key('Escape');
      await sleep(300);

      // Continue reading, then Back returns to Today.
      w = await go(`document.querySelector('#today-continue-btn').click()`);
      check(`${sizeName}: "Open book" goes to the last page read`, w.screen === 'book' && w.path === '/page/40', w);
      w = await go(`history.back()`);
      check(`${sizeName}: Back from the book returns to Today`, w.screen === 'today' && w.path === '/', w);

      // Review opened from Today closes back to Today (✕, then Back).
      w = await go(`document.querySelector('#today-start-review').click()`);
      check(`${sizeName}: Start review opens Review`, w.screen === 'review', w);
      w = await go(`document.querySelector('#close-review-btn').click()`);
      check(`${sizeName}: closing Review returns to Today`, w.screen === 'today' && w.path === '/', w);
      w = await go(`document.querySelector(${JSON.stringify(sizeName === 'phone' ? '#nav-saved-btn' : '#open-bookmarks-btn')}).click()`);
      check(`${sizeName}: Saved opens over Today`, w.screen === 'saved', w);
      check(`${sizeName}: Saved offers to go back to Today`, sizeName === 'phone' || await evaluate(`document.querySelector('#close-saved-btn').textContent.includes('Back to Today')`));
      w = await go(`history.back()`);
      check(`${sizeName}: Back from Saved returns to Today`, w.screen === 'today', w);

      // Book ↔ Today with tabs and Back.
      w = await go(`document.querySelector(${JSON.stringify(sizeName === 'phone' ? '#nav-book-btn' : '#open-today-btn')}).click()`);
      check(`${sizeName}: the Book ${sizeName === 'phone' ? 'tab' : 'button'} shows the book with its page in the address`, w.screen === 'book' && w.path.startsWith('/page/'), w);
      const bookPath = w.path;
      w = await go(`document.querySelector('${todayBtn}').click()`);
      check(`${sizeName}: Today from the book`, w.screen === 'today' && w.path === '/', w);
      w = await go(`history.back()`);
      check(`${sizeName}: Back from Today returns to the same page of the book`, w.screen === 'book' && w.path === bookPath, { w, bookPath });
      w = await go(`document.querySelector('${todayBtn}').click()`);
      w = await go(`document.querySelector(${JSON.stringify(bookBtn)}).click()`);
      check(`${sizeName}: and the ${sizeName === 'phone' ? 'Book tab' : 'Today button again'} returns to the book`, w.screen === 'book' && w.path === bookPath, w);
      w = await go(`document.querySelector(${JSON.stringify(sizeName === 'phone' ? '#nav-review-btn' : '#open-review-btn')}).click()`);
      w = await go(`document.querySelector('#close-review-btn').click()`);
      check(`${sizeName}: Review opened from the book closes back to the book`, w.screen === 'book' && w.path === bookPath, w);

      // The search box works from every screen: a result, a recent search or "Browse" shows the book.
      w = await go(`document.querySelector('${todayBtn}').click()`);
      await type('Camel');
      w = await go(`document.querySelector('#lookup-panel [role="option"]').click()`);
      check(`${sizeName}: a search from Today shows the book at the word`, w.screen === 'book' && w.path === '/word/Camel', w);
      check(`${sizeName}: the found word is on the open page`, await evaluate(`[...document.querySelectorAll('.entry-headword')].some((el) => el.textContent.trim() === 'Camel' && el.getBoundingClientRect().width > 0)`));
      w = await go(`history.back()`);
      check(`${sizeName}: Back from the found word returns to Today`, w.screen === 'today' && w.path === '/', w);
      w = await go(`document.querySelector(${JSON.stringify(sizeName === 'phone' ? '#nav-saved-btn' : '#open-bookmarks-btn')}).click()`);
      await evaluate(`(() => { const i = document.querySelector('#lookup-input'); i.focus(); i.click(); return true; })()`);
      await sleep(400);
      w = await go(`[...document.querySelectorAll('#lookup-panel [role="option"]')].find((o) => o.textContent.includes('Camel')).click()`);
      check(`${sizeName}: a recent search from Saved shows the book at the word`, w.screen === 'book' && w.path === '/word/Camel', w);
      w = await go(`document.querySelector(${JSON.stringify(sizeName === 'phone' ? '#nav-review-btn' : '#open-review-btn')}).click()`);
      await type('ceremonis'); // "Browse C" is offered on the No entry card
      const browsePage = await evaluate(`(async () => '/page/' + (await (await fetch('/api/meta')).json()).thumb_index.C)()`);
      w = await go(`[...document.querySelectorAll('#lookup-panel button')].find((b) => b.textContent.startsWith('Browse C')).click()`);
      check(`${sizeName}: "Browse C" from Review shows the book at C`, w.screen === 'book' && w.path === browsePage, { w, browsePage });

      // Reading moves "Continue reading" along (once the desktop page turn has finished).
      await sleep(1500);
      // The desktop spread pairs pages 2n and 2n+1, and either may be the one stored.
      const stored = Number(await evaluate(`localStorage.getItem('panna_last_page')`));
      const browsed = Number(browsePage.replace('/page/', ''));
      const spreadLeft = browsed % 2 === 0 ? browsed : browsed - 1;
      check(`${sizeName}: the last page read is remembered`, sizeName === 'phone' ? stored === browsed : stored === spreadLeft || stored === spreadLeft + 1, { stored, browsed });

      // A first visit: nothing saved, nothing read.
      await seed({});
      await open('/', size);
      const first = await evaluate(`document.querySelector('#today-screen')?.innerText ?? ''`);
      check(`${sizeName}: a first visit explains Review and starts reading at page 1`, first.includes('Nothing to review yet') && first.includes('Start reading') && first.includes('Page 1'), first);
      check(`${sizeName}: no streak is shown without one`, !first.includes('in a row'));
    }
    await evaluate(`localStorage.clear(); true`);
  } finally {
    if (socket) { try { socket.send(JSON.stringify({ id: 999999, method: 'Browser.close' })); } catch {} socket.close(); }
    if (edge.pid) spawnSync('taskkill', ['/PID', String(edge.pid), '/T', '/F'], { stdio: 'ignore' });
    await sleep(500);
    try { fs.rmSync(USER_DATA, { recursive: true, force: true, maxRetries: 10, retryDelay: 250 }); } catch {}
  }
  console.log(`Today: ${checks - failures}/${checks} checks passed.`);
  if (failures) process.exitCode = 1;
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
