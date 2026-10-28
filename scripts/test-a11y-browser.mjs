// Accessibility (WCAG 2.1 AA): an axe-core scan of every screen and state, plus keyboard, focus, zoom and Hindi
// language checks that axe cannot make, at desktop and phone sizes.
// Usage: node scripts/test-a11y-browser.mjs   (needs the app running on localhost:3000)
import { spawn, spawnSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import Database from 'better-sqlite3';
// The page Calm is on: tests open it to use a known entry (page numbers change when the book grows).
const book = new Database('data/dictionary.db', { readonly: true });
const CALM_PAGE = book.prepare("SELECT page_number FROM entries WHERE normalized = 'calm'").get().page_number;
// The first word on that page, which Tab reaches first.
const FIRST_WORD = book.prepare('SELECT headword FROM entries WHERE page_number = ? ORDER BY col_idx, position_in_col LIMIT 1').get(CALM_PAGE).headword;

// Example sentences exist only in builds that have them (skipped otherwise).
const HAS_EXAMPLE = (() => { try { return Boolean(book.prepare("SELECT 1 FROM examples e JOIN entries n ON n.id = e.entry_id WHERE n.normalized = 'ceremony'").get()); } catch (e) { if (/no such table: examples/.test(e.message)) return false; throw e; } })();

const EDGE_PATH = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const PORT = 9345;
const BASE = 'http://localhost:3000';
const USER_DATA = path.join(process.cwd(), 'scratch', `panna-a11y-edge-${process.pid}-${Date.now()}`);
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
          if (await evaluate(`(() => { const el = document.querySelector('#lookup-input'); return Boolean(el && document.querySelector('.entry-text, #learn-title') && Object.keys(el).some((k) => k.startsWith('__reactFiber$'))); })()`)) return true;
        } catch {}
      }
      return false;
    };
    const visible = (selector) => evaluate(`(() => { const el = document.querySelector(${JSON.stringify(selector)}); if (!el) return false; const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== 'hidden'; })()`);
    await send('Page.enable');
    await send('Runtime.enable');

    const AXE = fs.readFileSync(path.join(process.cwd(), 'node_modules', 'axe-core', 'axe.min.js'), 'utf8');
    const click = async (selector) => {
      for (let i = 0; i < 40; i++) { if (await evaluate(`(() => { const el = document.querySelector(${JSON.stringify(selector)}); if (!el) return false; el.click(); return true; })()`)) return true; await sleep(100); }
      return false;
    };
    const type = async (text) => {
      await evaluate(`(() => { const input = document.querySelector('#lookup-input'); input.focus(); const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set; set.call(input, ${JSON.stringify(text)}); input.dispatchEvent(new Event('input', { bubbles: true })); return true; })()`);
      await sleep(1200);
    };
    const quiet = { seen: { start: 1, word: 1, review: 1, settings: 1 }, tips: {}, welcomeDone: true, tipsOff: true, listOpened: true };
    const seed = (tours, extra = '') => evaluate(`(async () => { localStorage.clear(); ${tours ? `localStorage.setItem('panna_tours', ${JSON.stringify(JSON.stringify(tours))});` : ''} ${extra}; return true; })()`);
    const saveWords = `{ const list = []; for (const h of ['camel', 'ceremony', 'abandon', 'calm']) list.push({ ...(await (await fetch('/api/word/' + h)).json()).entry, saved_at: Date.now() });
      localStorage.setItem('panna_saved_words', JSON.stringify(list));
      localStorage.setItem('panna_review', JSON.stringify(Object.fromEntries(list.map((e) => [e.normalized, { box: 1, due_at: 0, right: 1, wrong: 0 }])))); }`;
    const openEntry = (word) => evaluate(`[...document.querySelectorAll('.entry-text')].find((e) => e.textContent.startsWith(${JSON.stringify(word)}) && e.style.cursor === 'pointer').click(); true`);

    // Each view: how to reach it. Run in order per size.
    const VIEWS = [
      { name: 'today (first visit)', go: async (size) => { await open(`/page/${CALM_PAGE}`, size); await seed(null); await open('/', size); await sleep(1200); } },
      // A returning reader: the guide has been opened, so Today shows its small link on the desk.
      { name: 'today (guide opened)', go: async (size) => { await seed({ ...quiet, guideOpened: true }, saveWords); await open('/', size); await sleep(1200);
        if (!(await visible('#today-learn-link'))) throw new Error('Today shows no #today-learn-link'); } },
      { name: 'book', go: async (size) => { await seed(quiet, saveWords); await open(`/page/${CALM_PAGE}`, size); await sleep(800); } },
      { name: 'book tip', go: async (size) => { await seed({ seen: {}, tips: {}, welcomeDone: true }); await open(`/page/${CALM_PAGE}`, size); await sleep(2000); } },
      { name: 'word card', go: async (size) => { await seed(quiet); await open(`/page/${CALM_PAGE}`, size); await openEntry('Calm'); await sleep(900); } },
      ...(HAS_EXAMPLE ? [{ name: 'word card with an example', go: async (size) => { await seed(quiet); await open('/word/Ceremony', size); await sleep(900);
        if (!(await evaluate(`Boolean(document.querySelector('#word-example'))`))) throw new Error('Ceremony has no #word-example'); } }] : []),
      { name: 'report form', go: async () => { await click('#report-btn'); await sleep(400); } },
      { name: 'search results', go: async (size) => { await open(`/page/${CALM_PAGE}`, size); await type('cam'); } },
      { name: 'search no entry', go: async () => { await type('ceremonis'); } },
      { name: 'search hindi', go: async () => { await type('छोड़'); } },
      { name: 'learn', go: async (size) => { await seed(quiet, saveWords); await open('/learn', size); await sleep(800); } },
      { name: 'saved', go: async (size) => { await seed(quiet, saveWords); await open(`/page/${CALM_PAGE}`, size); await click(size.mobile ? '#nav-saved-btn' : '#open-bookmarks-btn'); await sleep(900); } },
      { name: 'review question', go: async (size) => { await open(`/page/${CALM_PAGE}`, size); await click(size.mobile ? '#nav-review-btn' : '#open-review-btn'); await sleep(1500); } },
      { name: 'review answered', go: async () => { await click('.review-option'); await sleep(600); } },
      { name: 'menu', go: async (size) => { await open(`/page/${CALM_PAGE}`, size); await click('#menu-btn'); await sleep(600); } },
      { name: 'guided tours list', go: async () => { await click('#guided-tours-btn'); await sleep(700); } },
      { name: 'tour step', go: async () => { await click('#tour-start-start'); await sleep(1500); } },
      { name: 'credits', go: async (size) => { await open(`/page/${CALM_PAGE}`, size); await click('#menu-btn'); await sleep(400); await click('#open-credits-btn'); await sleep(800); } },
      { name: 'offline notice', go: async (size) => {
        await open(`/page/${CALM_PAGE}`, size);
        await send('Network.enable'); await send('Network.emulateNetworkConditions', { offline: true, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });
        await sleep(600);
      } },
    ];

    if (!HAS_EXAMPLE) console.log('skipped: no example in this build (word card with an example)');
    const results = [];
    for (const [sizeName, size] of [['desktop', { width: 1440, height: 900, mobile: false }], ['phone', { width: 390, height: 844, mobile: true }]]) {
      check(`${sizeName}: app hydrates`, await open(`/page/${CALM_PAGE}`, size));
      for (const view of VIEWS) {
        await view.go(size);
        await evaluate(`(() => { if (!window.axe) { const s = document.createElement('script'); s.textContent = ${JSON.stringify(AXE)}; document.head.appendChild(s); } return true; })()`);
        const out = await evaluate(`axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'best-practice'] }, exclude: [['nextjs-portal']] })
          .then((r) => r.violations.map((v) => ({ id: v.id, impact: v.impact, help: v.help, tags: v.tags.filter((t) => /^wcag\\d/.test(t)),
            nodes: v.nodes.slice(0, 6).map((n) => ({ target: n.target.join(' '), html: n.html.slice(0, 140), summary: n.failureSummary.slice(0, 300) })), count: v.nodes.length })))`);
        results.push({ size: sizeName, view: view.name, violations: out ?? [] });
        check(`${sizeName}: ${view.name} has no WCAG 2.1 A/AA or best-practice violations`, Array.isArray(out) && out.length === 0,
          out?.map((v) => ({ id: v.id, nodes: v.nodes.map((n) => n.target) })));
        if (view.name === 'today (guide opened)') {
          // axe leaves text over the desk's gradient "incomplete", so the link is also measured against every colour
          // stop of the first background behind it.
          const link = await evaluate(`axe.run(document.querySelector('#today-learn-link'), { runOnly: ['color-contrast'] }).then((r) => ({ violations: r.violations.length,
            unknown: r.incomplete.flatMap((i) => i.nodes.flatMap((n) => n.any.map((a) => a.data?.messageKey))) }))`);
          check(`${sizeName}: axe finds no contrast problem in Today's guide link`, link?.violations === 0, link);
          const worst = await evaluate(`(() => {
            const rgb = (c) => c.match(/[\\d.]+/g).slice(0, 3).map(Number);
            const lum = (c) => { const [r, g, b] = rgb(c).map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
            const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
            const el = document.querySelector('#today-learn-link');
            const fg = getComputedStyle(el).color;
            for (let n = el; n; n = n.parentElement) {
              const cs = getComputedStyle(n);
              const stops = (cs.backgroundImage.match(/rgba?\\([^)]*\\)/g) ?? []).filter((c) => !/,\\s*0\\)$/.test(c));
              const solid = /rgba\\(.*,\\s*0\\)$/.test(cs.backgroundColor) ? [] : [cs.backgroundColor];
              const all = [...stops, ...solid];
              if (all.length) return Math.min(...all.map((c) => ratio(fg, c)));
            }
            return 0; })()`);
          console.log(`  Today's guide link, worst contrast on the desk: ${worst?.toFixed(2)}:1`);
          check(`${sizeName}: Today's guide link has 4.5:1 contrast on every part of the desk behind it`, worst >= 4.5, worst);
          check(`${sizeName}: Today's guide link ends with ›, like Saved's`, (await evaluate(`document.querySelector('#today-learn-link').textContent`)).trim().endsWith('›'));
        }
        if (view.name === 'offline notice') await send('Network.emulateNetworkConditions', { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });
      }
    }

    // ── Keyboard and screen-reader basics, beyond what axe checks ──
    for (const [sizeName, size] of [['desktop', { width: 1440, height: 900, mobile: false }], ['phone', { width: 390, height: 844, mobile: true }]]) {
      await seed(quiet);
      await open(`/page/${CALM_PAGE}`, size);
      await sleep(600);
      check(`${sizeName}: pinch-zoom is allowed`, await evaluate(`!/maximum-scale|user-scalable=no/.test(document.querySelector('meta[name="viewport"]').content)`));
      check(`${sizeName}: the book view has a level-one heading`, await evaluate(`document.querySelector('#book-title')?.textContent.startsWith('Page')`));
      check(`${sizeName}: all Hindi on the page is marked as Hindi`, await evaluate(`(() => {
        const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
        for (let t = w.nextNode(); t; t = w.nextNode()) {
          if (!/[\\u0900-\\u097F]/.test(t.textContent) || !t.parentElement || t.parentElement.closest('script, title, [aria-hidden="true"]')) continue;
          if (t.parentElement.closest('[lang]')?.getAttribute('lang') !== 'hi') return false;
        }
        return true; })()`));
      // Tab to the first headword, open its card with Enter, close with Escape: focus comes back to the headword.
      await evaluate(`document.activeElement?.blur(); true`);
      let reached = null;
      for (let i = 0; i < 25 && !reached; i++) {
        await key('Tab', 'Tab');
        reached = await evaluate(`document.activeElement?.classList.contains('entry-open') ? document.activeElement.textContent : null`);
      }
      check(`${sizeName}: Tab reaches the words on the page`, reached === FIRST_WORD, reached);
      check(`${sizeName}: a headword is a button that opens a dialog`, await evaluate(`document.activeElement.tagName === 'BUTTON' && document.activeElement.getAttribute('aria-haspopup') === 'dialog'`));
      await key('Enter', 'Enter', '\r');
      await sleep(900);
      check(`${sizeName}: Enter opens its word card, with focus in it`, await evaluate(`document.querySelector('#word-sheet-title')?.textContent === '${FIRST_WORD}' && document.querySelector('#word-sheet').contains(document.activeElement)`));
      await key('Escape');
      await sleep(500);
      check(`${sizeName}: Escape closes it and focus returns to the headword`, await evaluate(`!document.querySelector('#word-sheet') && document.activeElement?.textContent === '${FIRST_WORD}'`),
        await evaluate(`document.activeElement?.outerHTML.slice(0, 80)`));
      if (!size.mobile) {
        check('desktop: the letter tabs are one tab stop', await evaluate(`[...document.querySelectorAll('.thumb-tab')].filter((b) => b.tabIndex === 0).length === 1 && document.querySelectorAll('.thumb-tab').length === 26`));
        await evaluate(`document.querySelector('.thumb-tab[tabindex="0"]').focus(); true`);
        const from = await evaluate(`document.activeElement.getAttribute('aria-label')`);
        await key('ArrowDown', 'ArrowDown');
        check('desktop: ↓ moves to the next letter', await evaluate(`document.activeElement.classList.contains('thumb-tab') && document.activeElement.getAttribute('aria-label') !== ${JSON.stringify(from)}`), from);
        check('desktop: each letter says where it goes', /^Letter [A-Z], page \d+$/.test(await evaluate(`document.activeElement.getAttribute('aria-label')`)));
        await evaluate(`document.querySelector('#silk-ribbon').focus(); true`);
        const before = await evaluate(`document.querySelector('#silk-ribbon').getAttribute('aria-pressed')`);
        await key('Enter', 'Enter', '\r');
        await sleep(500);
        check('desktop: Enter places the ribbon, and the button says so', before === 'false' && await evaluate(`document.querySelector('#silk-ribbon').getAttribute('aria-pressed') === 'true'`));
        await evaluate(`document.querySelector('[id^="dog-ear-trigger-"]').focus(); true`);
        await key('Enter', 'Enter', '\r');
        await sleep(400);
        check('desktop: Enter folds a page corner', await evaluate(`Boolean(document.querySelector('[id^="dog-ear-corner-"][aria-pressed="true"]'))`));
        await evaluate(`document.querySelector('[id^="add-note-trigger-"]').focus(); true`);
        await sleep(400); // it fades in
        check('desktop: the margin-note button shows when focused', await evaluate(`getComputedStyle(document.activeElement).opacity === '1'`));
        await key('Enter', 'Enter', '\r');
        await sleep(400);
        check('desktop: Enter opens the margin-note editor', await evaluate(`Boolean(document.querySelector('#margin-note-editor'))`));
      } else {
        const ribbon = 'button.book-control[aria-label*="ribbon"]';
        await evaluate(`document.querySelector(${JSON.stringify(ribbon)}).focus(); true`);
        await key('Enter', 'Enter', '\r');
        await sleep(400);
        check('phone: Enter places the ribbon, and the button says so', await evaluate(`document.querySelector(${JSON.stringify(ribbon)}).getAttribute('aria-pressed') === 'true'`));
        check('phone: page arrows are 44 px', await evaluate(`[...document.querySelectorAll('button[aria-label="Previous page"], button[aria-label="Next page"]')].every((b) => b.getBoundingClientRect().height >= 44 && b.getBoundingClientRect().width >= 44)`));
      }
    }
    await evaluate(`localStorage.clear(); true`);
  } finally {
    if (socket) { try { socket.send(JSON.stringify({ id: 999999, method: 'Browser.close' })); } catch {} socket.close(); }
    if (edge.pid) spawnSync('taskkill', ['/PID', String(edge.pid), '/T', '/F'], { stdio: 'ignore' });
    await sleep(500);
    try { fs.rmSync(USER_DATA, { recursive: true, force: true, maxRetries: 10, retryDelay: 250 }); } catch {}
  }
  console.log(`Accessibility: ${checks - failures}/${checks} checks passed.`);
  if (failures) process.exitCode = 1;
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
