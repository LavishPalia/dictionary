// Ribbons, folded corners and pencil notes keep their place when the book is rebuilt (src/lib/marks.ts).
// Usage: node scripts/test-marks-browser.mjs   (needs the app running on localhost:3000)
import { spawn, spawnSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import Database from 'better-sqlite3';
// The page Camel is on: tests open it to tap a known entry (page numbers change when the book grows).
const CAMEL_PAGE = new Database('data/dictionary.db', { readonly: true })
  .prepare("SELECT page_number FROM entries WHERE normalized = 'camel'").get().page_number;

const EDGE_PATH = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const PORT = 9329;
const BASE = 'http://localhost:3000';
const USER_DATA = path.join(process.cwd(), 'scratch', `panna-marks-edge-${process.pid}-${Date.now()}`);
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

    const desktop = { width: 1440, height: 900, mobile: false };
    const phone = { width: 390, height: 844, mobile: true };
    const store = (data) => evaluate(`(() => { const d = ${JSON.stringify(data)}; for (const k of ['panna_bookmarks', 'panna_dog_ears', 'panna_marginalia', 'panna_mark_anchors', 'panna_saved_words']) localStorage.removeItem(k); for (const [k, v] of Object.entries(d)) localStorage.setItem(k, JSON.stringify(v)); return true; })()`);
    const read = () => evaluate(`({ ribbons: JSON.parse(localStorage.getItem('panna_bookmarks') || '[]'), dogEars: JSON.parse(localStorage.getItem('panna_dog_ears') || '[]'), notes: JSON.parse(localStorage.getItem('panna_marginalia') || '[]'), anchors: JSON.parse(localStorage.getItem('panna_mark_anchors') || 'null') })`);
    // 1. Marks saved before anchors existed get anchors on the next visit, without moving.
    check('desktop: app hydrates', await open(`/page/${CAMEL_PAGE}`, desktop));
    // What the current book says, looked up from a loaded page.
    const facts = await evaluate(`(async () => {
      const meta = await (await fetch('/api/meta')).json();
      const page = async (n) => (await fetch('/api/page/' + n)).json();
      const [p16, p23] = await Promise.all([page(16), page(23)]);
      const first = (p) => [...p.column1, ...p.column2][0].normalized;
      const where = async (w) => (await (await fetch('/api/word/' + w)).json()).pageNumber;
      // The word at 30% of page 16, where the older note sits (noteAnchor in src/lib/marks.ts).
      const all16 = [...p16.column1, ...p16.column2];
      const at30 = all16[Math.floor(0.3 * all16.length)].normalized;
      return { version: meta.data_version, first16: first(p16), first23: first(p23), at30, camel: await where('camel'), century: await where('century'), ceremony: await where('ceremony') };
    })()`);

    await store({
      panna_bookmarks: [16], panna_dog_ears: [23],
      panna_marginalia: [{ id: 'n1', page_number: 16, text: 'remember', color: 'blue', created_at: 1, top_pct: 30 }],
    });
    await open(`/page/${CAMEL_PAGE}`, desktop);
    let m;
    for (let i = 0; i < 20; i++) { await sleep(250); m = await read(); if (m.anchors?.dogEars?.[23] && m.notes[0]?.anchor) break; }
    check('older marks keep their pages', m.ribbons.join() === '16' && m.dogEars.join() === '23' && m.notes[0].page_number === 16, m);
    check('older marks get anchor words for this build', m.anchors?.data_version === facts.version
      && m.anchors.ribbons[16] === facts.first16 && m.anchors.dogEars[23] === facts.first23, m.anchors);
    check('an older note is anchored to the word beside it', m.notes[0].anchor === facts.at30, { note: m.notes[0], expected: facts.at30 });

    // 2. Marks from an older build of the book move to where their words are now.
    await store({
      panna_bookmarks: [2], panna_dog_ears: [5],
      panna_marginalia: [{ id: 'n2', page_number: 3, text: 'learn', color: 'blue', created_at: 2, top_pct: 10, anchor: 'ceremony' }],
      panna_mark_anchors: { data_version: 'an-older-build', ribbons: { 2: 'century' }, dogEars: { 5: 'camel' } },
    });
    await open(`/page/${CAMEL_PAGE}`, desktop);
    for (let i = 0; i < 20; i++) { await sleep(250); m = await read(); if (m.anchors?.data_version === facts.version) break; }
    const left = (p) => (p % 2 === 0 ? p : p - 1);
    check('after a rebuild, a fold moves to its word’s new page', m.dogEars.join() === String(facts.camel), { got: m.dogEars, camel: facts.camel });
    check('after a rebuild, a ribbon moves to the spread holding its word', m.ribbons.join() === String(left(facts.century)), { got: m.ribbons, century: facts.century });
    check('after a rebuild, a note follows its word', m.notes[0].page_number === facts.ceremony, m.notes[0]);
    check('anchors are re-recorded for the current build', m.anchors?.data_version === facts.version && m.anchors.dogEars[facts.camel] === 'camel', m.anchors);
    await evaluate(`document.querySelector('#open-bookmarks-btn').click(); true`);
    await sleep(300);
    await evaluate(`[...document.querySelectorAll('#saved-screen [role="radio"]')].find((r) => r.textContent.startsWith('Pages')).click(); true`);
    await sleep(300);
    const pagesText = await evaluate(`document.querySelector('#saved-screen').innerText`);
    check('the Saved screen lists the moved pages', pagesText.includes(`Page ${facts.camel}`) && pagesText.includes(`Pages ${left(facts.century)}–${left(facts.century) + 1}`), pagesText);

    // 3. New marks are anchored as they are made.
    await store({});
    await open('/page/16', desktop);
    await evaluate(`document.querySelector('#dog-ear-trigger-17')?.click(); document.querySelector('#silk-ribbon')?.click(); true`);
    await sleep(600);
    m = await read();
    check('folding a page and marking a spread record anchors at once', m.dogEars.includes(17) && m.ribbons.includes(16) && m.anchors?.dogEars[17] && m.anchors.ribbons[16] === facts.first16, m);

    // 4. Phone: the same marks show on the Saved screen.
    await store({ panna_dog_ears: [5], panna_mark_anchors: { data_version: 'an-older-build', ribbons: {}, dogEars: { 5: 'camel' } } });
    check('phone: app hydrates', await open(`/page/${CAMEL_PAGE}`, phone));
    for (let i = 0; i < 20; i++) { await sleep(250); m = await read(); if (m.anchors?.data_version === facts.version) break; }
    await evaluate(`document.querySelector('#nav-saved-btn').click(); true`);
    await sleep(300);
    await evaluate(`[...document.querySelectorAll('#saved-screen [role="radio"]')].find((r) => r.textContent.startsWith('Pages')).click(); true`);
    await sleep(300);
    check('phone: a moved fold is listed on its new page', (await evaluate(`document.querySelector('#saved-screen').innerText`)).includes(`Page ${facts.camel}`));
    await store({});
  } finally {
    if (socket) { try { socket.send(JSON.stringify({ id: 999999, method: 'Browser.close' })); } catch {} socket.close(); }
    if (edge.pid) spawnSync('taskkill', ['/PID', String(edge.pid), '/T', '/F'], { stdio: 'ignore' });
    await sleep(500);
    try { fs.rmSync(USER_DATA, { recursive: true, force: true, maxRetries: 10, retryDelay: 250 }); } catch {}
  }
  console.log(`Marks: ${checks - failures}/${checks} checks passed.`);
  if (failures) process.exitCode = 1;
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
