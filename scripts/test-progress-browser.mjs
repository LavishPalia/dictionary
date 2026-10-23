// Progress on Today and Saved: saved words by status, the 30-day review calendar, the best streak, and the Saved
// filter by status, at desktop and phone sizes.
// Usage: node scripts/test-progress-browser.mjs   (needs the app running on localhost:3000)
import { spawn, spawnSync } from 'child_process';
import fs from 'fs';
import path from 'path';

const EDGE_PATH = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const PORT = 9349;
const BASE = 'http://localhost:3000';
const USER_DATA = path.join(process.cwd(), 'scratch', `panna-progress-edge-${process.pid}-${Date.now()}`);
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

    const AXE = fs.readFileSync(path.join(process.cwd(), 'node_modules', 'axe-core', 'axe.min.js'), 'utf8');
    const axe = async () => {
      await evaluate(`(() => { if (!window.axe) { const s = document.createElement('script'); s.textContent = ${JSON.stringify(AXE)}; document.head.appendChild(s); } return true; })()`);
      return evaluate(`axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'best-practice'] }, exclude: [['nextjs-portal']] }).then((r) => r.violations.map((v) => v.id + ': ' + v.nodes.map((n) => n.target.join(' ')).join(', ')))`);
    };
    const click = async (selector) => {
      for (let i = 0; i < 40; i++) { if (await evaluate(`(() => { const el = document.querySelector(${JSON.stringify(selector)}); if (!el) return false; el.click(); return true; })()`)) return true; await sleep(100); }
      return false;
    };
    // 10 saved words: Camel and Ceremony mastered, four being learned, four new; 16 review days in the last 30,
    // the longest run 5 days (9–13 days ago), the current one 4 days.
    const seed = (withWords = true, mastered = true) => evaluate(`(async () => {
      localStorage.clear();
      localStorage.setItem('panna_tours', JSON.stringify({ seen: { start: 1, word: 1, review: 1, settings: 1 }, tips: {}, welcomeDone: true, tipsOff: true, listOpened: true }));
      if (!${withWords}) return true;
      const words = ['camel', 'ceremony', 'abandon', 'calm', 'camera', 'canal', 'candle', 'captain', 'card', 'care'];
      const list = [];
      for (const h of words) list.push({ ...(await (await fetch('/api/word/' + h)).json()).entry, saved_at: Date.now() - 3 * 86400000 });
      localStorage.setItem('panna_saved_words', JSON.stringify(list));
      const day = 86400000, now = Date.now();
      const rec = (box, r) => ({ box, due_at: now + 5 * day, right: r, wrong: 0, last_at: now });
      const top = ${mastered} ? 4 : 2; // without mastered words, the top two are still being learned (box 2 and 3)
      localStorage.setItem('panna_review', JSON.stringify({ camel: rec(top, 4), ceremony: rec(top + 1, 5), abandon: rec(2, 2), calm: rec(1, 1), camera: rec(3, 3), canal: rec(2, 1) }));
      const days = [0, 1, 2, 3, 5, 6, 9, 10, 11, 12, 13, 17, 20, 21, 24, 28].map((off) => { const d = new Date(now - off * day); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); });
      localStorage.setItem('panna_review_days', JSON.stringify(days.sort()));
      return true;
    })()`);
    const words = () => evaluate(`[...document.querySelectorAll('#saved-screen .saved-hw')].map((e) => e.textContent).sort().join()`);
    const filter = async (name) => { await evaluate(`[...document.querySelectorAll('.saved-filter [role="radio"]')].find((b) => b.textContent.startsWith(${JSON.stringify(name)})).click(); true`); await sleep(300); };

    for (const [sizeName, size] of [['desktop', { width: 1440, height: 900, mobile: false }], ['phone', { width: 390, height: 844, mobile: true }]]) {
      check(`${sizeName}: app hydrates`, await open('/page/16', size));

      // ── Today ──
      await seed(false);
      await open('/', size);
      await sleep(800);
      check(`${sizeName}: no progress card before any word is saved`, !(await visible('#today-progress')));
      await seed();
      await open('/', size);
      await sleep(1200);
      check(`${sizeName}: Today shows "Your progress" after Continue reading`, await evaluate(`(() => { const ids = [...document.querySelectorAll('#today-screen > .today-card')].map((c) => c.id); return ids.indexOf('today-progress') === ids.indexOf('today-continue') + 1; })()`));
      check(`${sizeName}: the bar says the counts to a screen reader`, await evaluate(`document.querySelector('#today-progress .progress-bar').getAttribute('aria-label') === 'Saved words: 2 mastered, 4 learning, 4 new'`));
      check(`${sizeName}: the bar's parts are in proportion`, await evaluate(`(() => { const w = (k) => document.querySelector('#today-progress .progress-seg--' + k).getBoundingClientRect().width; return Math.abs(w('learning') / w('mastered') - 2) < 0.25 && Math.abs(w('new') - w('learning')) < 3; })()`));
      check(`${sizeName}: the counts are shown as text`, (await evaluate(`document.querySelector('#today-progress .progress-legend').innerText.replace(/\\s+/g, ' ')`)).includes('2 mastered 4 learning 4 new'));
      check(`${sizeName}: the calendar marks 16 of the last 30 days, with today outlined`, await evaluate(`(() => {
        const days = [...document.querySelectorAll('#today-progress .calendar-day')];
        return days.length === 30 && days.filter((d) => d.classList.contains('calendar-day--on')).length === 16 && days[29].classList.contains('calendar-day--today') && days[29].classList.contains('calendar-day--on'); })()`));
      check(`${sizeName}: the calendar is described in words`, await evaluate(`document.querySelector('#today-progress .calendar-days').getAttribute('aria-label') === 'Reviewed on 16 of the last 30 days, including today'`));
      check(`${sizeName}: the best streak is shown`, (await evaluate(`document.querySelector('#today-progress').innerText`)).includes('Best streak: 5 days'));
      check(`${sizeName}: Today with progress has no accessibility violations`, (await axe()).length === 0, await axe());
      check(`${sizeName}: nothing overflows sideways on Today`, await evaluate(`document.documentElement.scrollWidth <= innerWidth`));

      // ── Saved ──
      await click(size.mobile ? '#nav-saved-btn' : '#open-bookmarks-btn');
      await sleep(900);
      check(`${sizeName}: Saved shows the same bar`, await evaluate(`document.querySelector('#saved-progress .progress-bar')?.getAttribute('aria-label') === 'Saved words: 2 mastered, 4 learning, 4 new'`));
      check(`${sizeName}: the filter offers All, New, Learning and Mastered with counts`, await evaluate(`[...document.querySelectorAll('.saved-filter [role="radio"]')].map((b) => b.textContent).join('|') === 'All · 10|New · 4|Learning · 4|Mastered · 2'`));
      check(`${sizeName}: All shows every saved word`, (await words()).split(',').length === 10);
      await filter('Learning');
      check(`${sizeName}: Learning shows only the words being learned`, await words() === 'Abandon,Calm,Camera,Canal', await words());
      await filter('Mastered');
      check(`${sizeName}: Mastered shows only mastered words`, await words() === 'Camel,Ceremony', await words());
      await filter('New');
      check(`${sizeName}: New shows only words not yet reviewed`, await words() === 'Candle,Captain,Card,Care', await words());
      check(`${sizeName}: Saved with the filter has no accessibility violations`, (await axe()).length === 0, await axe());
      check(`${sizeName}: nothing overflows sideways on Saved`, await evaluate(`document.documentElement.scrollWidth <= innerWidth`));
      await seed(true, false);
      await open('/page/16', size);
      await click(size.mobile ? '#nav-saved-btn' : '#open-bookmarks-btn');
      await sleep(900);
      await filter('Mastered');
      check(`${sizeName}: an empty filter explains how a word is mastered`, (await evaluate(`document.querySelector('#saved-filter-empty')?.innerText ?? ''`)).includes('four right answers in a row'));
    }
    await evaluate(`localStorage.clear(); true`);
  } finally {
    if (socket) { try { socket.send(JSON.stringify({ id: 999999, method: 'Browser.close' })); } catch {} socket.close(); }
    if (edge.pid) spawnSync('taskkill', ['/PID', String(edge.pid), '/T', '/F'], { stdio: 'ignore' });
    await sleep(500);
    try { fs.rmSync(USER_DATA, { recursive: true, force: true, maxRetries: 10, retryDelay: 250 }); } catch {}
  }
  console.log(`Progress: ${checks - failures}/${checks} checks passed.`);
  if (failures) process.exitCode = 1;
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
