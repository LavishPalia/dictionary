// Word sheet (redesign step 4): side panel on desktop, bottom sheet on phones.
// Usage: node scripts/test-word-browser.mjs   (needs the app running on localhost:3000)
import { spawn, spawnSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import Database from 'better-sqlite3';
// The page Camel is on: tests open it to tap a known entry (page numbers change when the book grows).
const CAMEL_PAGE = new Database('data/dictionary.db', { readonly: true })
  .prepare("SELECT page_number FROM entries WHERE normalized = 'camel'").get().page_number;

// Example sentences: present only when the build has them (before generation there are none).
const book = new Database('data/dictionary.db', { readonly: true });
// Skip only when the build has no examples table; any other database error is a real failure.
const rowOf = (sql, ...args) => { try { return book.prepare(sql).get(...args); } catch (e) { if (/no such table: examples/.test(e.message)) return undefined; throw e; } };
const CEREMONY = rowOf('SELECT e.en, e.hi, e.exact, n.reviewed FROM examples e JOIN entries n ON n.id = e.entry_id WHERE n.normalized = ?', 'ceremony');
const INEXACT = rowOf('SELECT n.headword, e.en FROM examples e JOIN entries n ON n.id = e.entry_id WHERE e.exact = 0 LIMIT 1');
const UNREVIEWED = rowOf('SELECT n.headword, e.en FROM examples e JOIN entries n ON n.id = e.entry_id WHERE n.reviewed = 0 LIMIT 1');
const NO_EXAMPLE = rowOf('SELECT headword FROM entries WHERE id NOT IN (SELECT entry_id FROM examples) LIMIT 1')?.headword ?? 'About';

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

      check(`${sizeName}: page 16 loads`, await open(`/page/${CAMEL_PAGE}`, size));
      // The desktop spread also renders non-interactive copies of pages for the page-turn animation.
      await evaluate(`[...document.querySelectorAll('.entry-text')].find((p) => p.textContent.startsWith('Camel') && p.style.cursor === 'pointer').click(); true`);
      await sleep(600);
      s = await sheet();
      check(`${sizeName}: tapping an entry opens its sheet`, s?.name === 'Camel' && await evaluate(`location.pathname === '/word/Camel'`), s?.name);
      check(`${sizeName}: reviewed entry has no "not yet checked by a reviewer" note`, s && !s.text.includes('not yet checked by a reviewer'));
      check(`${sizeName}: Hindi meaning is shown large`, await evaluate(`parseFloat(getComputedStyle(document.querySelector('.word-hi')).fontSize) >= 28`));
      await evaluate(`document.querySelector('#see-on-page-btn').click(); true`);
      await sleep(800);
      check(`${sizeName}: "See on page" closes the sheet and marks the word on the page`,
        !(await sheet()) && await evaluate(`[...document.querySelectorAll('.pencil-underlined')].some((e) => e.textContent.trim() === 'Camel')`));
      check(`${sizeName}: nothing overflows sideways`, await evaluate(`document.documentElement.scrollWidth <= innerWidth`));

      // ── The example sentence ──
      const exampleCard = () => evaluate(`(() => {
        const ex = document.querySelector('#word-example');
        if (!ex) return null;
        const hi = ex.querySelector('.word-example-hi');
        const r = document.querySelector('#word-sheet').getBoundingClientRect();
        return { text: ex.querySelector('p').textContent, bold: [...ex.querySelectorAll('p:first-child b')].map((b) => b.textContent), hi: hi && { text: hi.textContent, lang: hi.getAttribute('lang') },
          hiLangs: [...ex.querySelectorAll('*')].filter((n) => /[\u0900-\u097F]/.test(n.textContent) && n.children.length === 0).every((n) => n.closest('[lang="hi"]')),
          fits: ex.scrollWidth <= ex.clientWidth + 1 && ex.getBoundingClientRect().right <= r.right + 1 };
      })()`);
      await open(`/word/${NO_EXAMPLE}`, size);
      await sleep(600);
      check(`${sizeName}: a word with no example shows no example section`, await evaluate(`Boolean(document.querySelector('#word-sheet')) && !document.querySelector('#word-example') && !document.querySelector('.word-example-hi')`), NO_EXAMPLE);
      if (!CEREMONY) console.log(`${sizeName}: skipped: no example in this build (ceremony)`);
      else {
        await open('/word/Ceremony', size);
        await sleep(600);
        const ex = await exampleCard();
        check(`${sizeName}: Ceremony shows its example sentence`, ex?.text === CEREMONY.en, ex);
        check(`${sizeName}: the headword in the sentence is bold`, CEREMONY.exact ? ex?.bold.length === 1 && ex.bold[0].toLowerCase() === 'ceremony' : ex?.bold.length === 0, ex?.bold);
        check(`${sizeName}: the Hindi translation sits below it, marked as Hindi`, ex?.hi?.text === CEREMONY.hi && ex.hi.lang === 'hi' && ex.hiLangs, ex?.hi);
        check(`${sizeName}: the example fits inside the card`, ex?.fits === true, ex);
        check(`${sizeName}: the example comes after the meaning`, await evaluate(`Boolean(document.querySelector('.word-def').compareDocumentPosition(document.querySelector('#word-example')) & Node.DOCUMENT_POSITION_FOLLOWING)`));
      }
      if (!CEREMONY) console.log(`${sizeName}: skipped: no example in this build (provenance note)`);
      else {
        const note = (word) => evaluate(`({ example: document.querySelector('#word-example-note')?.textContent ?? null, card: document.querySelector('#word-sheet').innerText.includes('Machine-written · not yet checked by a reviewer'), count: (document.querySelector('#word-sheet').innerText.match(/not yet checked/g) || []).length })`);
        await open('/word/Ceremony', size);
        await sleep(600);
        const r = await note();
        check(`${sizeName}: a reviewed entry labels its example as machine-written`, CEREMONY.reviewed === 1 ? r.example === 'Example machine-written · not yet checked' && !r.card : r.example === null, r);
        if (!UNREVIEWED) console.log(`${sizeName}: skipped: no unreviewed entry with an example in this build`);
        else {
          await open(`/word/${UNREVIEWED.headword}`, size);
          await sleep(600);
          const u = await note();
          check(`${sizeName}: an unreviewed entry is labelled once, by the card's own note`, u.example === null && u.card && u.count === 1, u);
        }
      }
      if (!INEXACT) console.log(`${sizeName}: skipped: no inexact example in this build`);
      else {
        await open(`/word/${INEXACT.headword}`, size);
        await sleep(600);
        const ex = await exampleCard();
        check(`${sizeName}: an inexact example shows the plain sentence, no bold`, ex?.text === INEXACT.en && ex.bold.length === 0, ex);
      }
    }
    // The narrowest phone: nothing overflows with the example open.
    {
      await open('/word/Ceremony', { width: 320, height: 640, mobile: true });
      await sleep(600);
      if (!CEREMONY) console.log('320px: skipped: no example in this build (ceremony)');
      else check('320px: the word card with an example does not overflow', await evaluate(`document.documentElement.scrollWidth <= innerWidth && document.querySelector('#word-sheet').scrollWidth <= document.querySelector('#word-sheet').clientWidth + 1`),
        await evaluate(`({ doc: document.documentElement.scrollWidth, w: innerWidth, sheet: [document.querySelector('#word-sheet').scrollWidth, document.querySelector('#word-sheet').clientWidth] })`));
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
