// Backup and restore from the ⋯ menu: download, restore by merging or replacing, and refusing a wrong file,
// at desktop and phone sizes.
// Usage: node scripts/test-backup-browser.mjs   (needs the app running on localhost:3000)
import { spawn, spawnSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import Database from 'better-sqlite3';
// The page Camel is on: tests open it to tap a known entry (page numbers change when the book grows).
const CAMEL_PAGE = new Database('data/dictionary.db', { readonly: true })
  .prepare("SELECT page_number FROM entries WHERE normalized = 'camel'").get().page_number;

const EDGE_PATH = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const PORT = 9331;
const BASE = 'http://localhost:3000';
const USER_DATA = path.join(process.cwd(), 'scratch', `panna-backup-edge-${process.pid}-${Date.now()}`);
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

    const DOWNLOADS = path.join(process.cwd(), 'scratch', `panna-backup-dl-${process.pid}`);
    fs.mkdirSync(DOWNLOADS, { recursive: true });
    await send('Page.setDownloadBehavior', { behavior: 'allow', downloadPath: DOWNLOADS });
    await send('Page.setInterceptFileChooserDialog', { enabled: true }); // the picker never opens in a headless test
    await send('DOM.enable');
    const chooseFile = async (file) => {
      const doc = await send('DOM.getDocument', { depth: -1 });
      const { nodeId } = await send('DOM.querySelector', { nodeId: doc.root.nodeId, selector: '#restore-file-input' });
      await send('DOM.setFileInputFiles', { nodeId, files: [file] });
      await sleep(500);
    };
    const state = () => evaluate(`({
      words: JSON.parse(localStorage.getItem('panna_saved_words') || '[]').map((w) => w.normalized).sort().join(),
      review: Object.keys(JSON.parse(localStorage.getItem('panna_review') || '{}')).sort().join(),
      dogEars: localStorage.getItem('panna_dog_ears'),
      notes: JSON.parse(localStorage.getItem('panna_marginalia') || '[]').length,
      settings: localStorage.getItem('panna_settings'),
    })`);
    const seed = (words, extra = {}) => evaluate(`(async () => {
      localStorage.clear();
      const list = [];
      for (const h of ${JSON.stringify(words)}) list.push({ ...(await (await fetch('/api/word/' + h)).json()).entry, saved_at: Date.now() });
      localStorage.setItem('panna_saved_words', JSON.stringify(list));
      for (const [k, v] of Object.entries(${JSON.stringify(extra)})) localStorage.setItem(k, JSON.stringify(v));
      return true;
    })()`);
    const waitHydrated = async () => {
      for (let i = 0; i < 60; i++) {
        await sleep(200);
        try { if (await evaluate(`(() => { const el = document.querySelector('#lookup-input'); return Boolean(el && document.querySelector('.entry-text') && Object.keys(el).some((k) => k.startsWith('__reactFiber$'))); })()`)) return true; } catch {}
      }
      return false;
    };

    for (const [sizeName, size] of [['desktop', { width: 1440, height: 900, mobile: false }], ['phone', { width: 390, height: 844, mobile: true }]]) {
      check(`${sizeName}: app hydrates`, await open(`/page/${CAMEL_PAGE}`, size));
      await seed(['Camel', 'Ceremony'], {
        panna_review: { camel: { box: 2, due_at: Date.now() + 86400000, right: 2, wrong: 0, last_at: Date.now() } },
        panna_dog_ears: [23],
        panna_marginalia: [{ id: 'n1', page_number: 18, text: 'remember this', color: 'blue', created_at: 1, anchor: 'ceremony' }],
        panna_settings: { evening: true, speed: 'instant', sounds: false },
      });
      await open(`/page/${CAMEL_PAGE}`, size);
      const before = await state();

      // Back up.
      await evaluate(`document.querySelector('#menu-btn').click(); true`);
      await sleep(250);
      check(`${sizeName}: the menu says there is no backup yet`, await evaluate(`document.querySelector('#backup-label')?.textContent === 'Never backed up'`));
      for (const f of fs.readdirSync(DOWNLOADS)) fs.rmSync(path.join(DOWNLOADS, f));
      await evaluate(`document.querySelector('#backup-btn').click(); true`);
      let file = null;
      for (let i = 0; i < 30 && !file; i++) { await sleep(200); file = fs.readdirSync(DOWNLOADS).find((f) => /^panna-backup-\d{4}-\d{2}-\d{2}\.json$/.test(f)); }
      check(`${sizeName}: "Back up my words" downloads a dated backup file`, Boolean(file), fs.readdirSync(DOWNLOADS));
      const saved = file && JSON.parse(fs.readFileSync(path.join(DOWNLOADS, file), 'utf8'));
      check(`${sizeName}: the backup holds words, review progress, marks, notes and settings`,
        saved?.app === 'panna' && saved.data.panna_saved_words.length === 2 && saved.data.panna_review.camel && saved.data.panna_dog_ears[0] === 23
        && saved.data.panna_marginalia.length === 1 && saved.data.panna_settings.speed === 'instant', saved && Object.keys(saved.data));
      await evaluate(`document.querySelector('#menu-btn').click(); true`);
      await sleep(250);
      check(`${sizeName}: the menu now shows the backup date`, await evaluate(`document.querySelector('#backup-label')?.textContent === 'Last backup today'`));
      await key('Escape');

      // Lose everything, then restore by merging.
      await evaluate(`localStorage.clear(); location.reload(); true`);
      await waitHydrated();
      check(`${sizeName}: a cleared browser has nothing saved`, (await state()).words === '');
      await evaluate(`document.querySelector('#menu-btn').click(); true`);
      await sleep(250);
      await evaluate(`document.querySelector('#restore-btn').click(); true`);
      await sleep(250);
      await chooseFile(path.join(DOWNLOADS, file));
      const sheet = await evaluate(`document.querySelector('#restore-sheet')?.innerText ?? ''`);
      check(`${sizeName}: choosing the file shows what it contains`, sheet.includes('2 saved words · 1 in review · 1 marked page · 1 note'), sheet);
      if (sizeName === 'phone') {
        const box = await evaluate(`(() => { const r = document.querySelector('#restore-sheet').getBoundingClientRect(); return { left: r.left, right: r.right, bottom: Math.round(r.bottom), h: innerHeight }; })()`);
        check('phone: the restore sheet fits the screen', box.left === 0 && box.right === 390 && box.bottom === box.h, box);
      }
      await evaluate(`document.querySelector('#restore-merge-btn').click(); true`);
      await sleep(1500);
      await waitHydrated();
      const after = await state();
      check(`${sizeName}: restoring brings back words, review progress, marks, notes and settings`,
        after.words === before.words && after.review === 'camel' && after.dogEars === '[23]' && after.notes === 1 && after.settings === before.settings, { before, after });
      const shown = await evaluate(`(async () => { document.querySelector(${JSON.stringify(sizeName === 'phone' ? '#nav-saved-btn' : '#open-bookmarks-btn')}).click(); await new Promise((r) => setTimeout(r, 300)); return document.querySelector('#saved-screen')?.innerText ?? ''; })()`);
      check(`${sizeName}: the restored words appear on the Saved screen`, shown.includes('Camel') && shown.includes('Ceremony'), shown);

      // Merge keeps what is already here; replace does not.
      await seed(['Abandon']);
      await open(`/page/${CAMEL_PAGE}`, size);
      await evaluate(`document.querySelector('#menu-btn').click(); true`);
      await sleep(250);
      await evaluate(`document.querySelector('#restore-btn').click(); true`);
      await chooseFile(path.join(DOWNLOADS, file));
      await evaluate(`document.querySelector('#restore-merge-btn').click(); true`);
      await sleep(1500);
      await waitHydrated();
      check(`${sizeName}: merging keeps this device’s own words too`, (await state()).words === 'abandon,camel,ceremony', await state());
      await seed(['Abandon']);
      await open(`/page/${CAMEL_PAGE}`, size);
      await evaluate(`document.querySelector('#menu-btn').click(); true`);
      await sleep(250);
      await evaluate(`document.querySelector('#restore-btn').click(); true`);
      await chooseFile(path.join(DOWNLOADS, file));
      await evaluate(`document.querySelector('#restore-replace-btn').click(); true`);
      await sleep(1500);
      await waitHydrated();
      check(`${sizeName}: replacing makes this device match the backup`, (await state()).words === 'camel,ceremony', await state());

      // A file that is not a backup changes nothing.
      const bad = path.join(DOWNLOADS, 'not-a-backup.json');
      fs.writeFileSync(bad, '{"hello": "world"}');
      const beforeBad = await state();
      await evaluate(`document.querySelector('#menu-btn').click(); true`);
      await sleep(250);
      await evaluate(`document.querySelector('#restore-btn').click(); true`);
      await chooseFile(bad);
      const err = await evaluate(`document.querySelector('#restore-sheet [role="alert"]')?.textContent ?? ''`);
      check(`${sizeName}: a wrong file is refused with a plain explanation`, err === 'This file isn’t a Panna backup.', err);
      check(`${sizeName}: and nothing changes`, JSON.stringify(await state()) === JSON.stringify(beforeBad));
      await key('Escape');
      await evaluate(`localStorage.clear(); true`);
    }
    fs.rmSync(DOWNLOADS, { recursive: true, force: true });
  } finally {
    if (socket) { try { socket.send(JSON.stringify({ id: 999999, method: 'Browser.close' })); } catch {} socket.close(); }
    if (edge.pid) spawnSync('taskkill', ['/PID', String(edge.pid), '/T', '/F'], { stdio: 'ignore' });
    await sleep(500);
    try { fs.rmSync(USER_DATA, { recursive: true, force: true, maxRetries: 10, retryDelay: 250 }); } catch {}
  }
  console.log(`Backup: ${checks - failures}/${checks} checks passed.`);
  if (failures) process.exitCode = 1;
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
