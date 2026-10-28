// "How to learn with Panna": its address, every way in and back out, the next-step card for each rule, the tour it
// starts, accessibility and layout, at desktop and phone sizes.
// Usage: node scripts/test-learn-browser.mjs   (needs the app running on localhost:3000)
import { spawn, spawnSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import Database from 'better-sqlite3';
// The page Camel is on: tests open it to tap a known entry (page numbers change when the book grows).
const CAMEL_PAGE = new Database('data/dictionary.db', { readonly: true })
  .prepare("SELECT page_number FROM entries WHERE normalized = 'camel'").get().page_number;

const EDGE_PATH = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const PORT = 9361;
const BASE = 'http://localhost:3000';
const USER_DATA = path.join(process.cwd(), 'scratch', `panna-learn-edge-${process.pid}-${Date.now()}`);
const TITLE = 'How to learn with Panna';
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
    // Hydrated: React has attached to the search box, and the book (or, at /learn, the guide) is on the page.
    const open = async (url, size) => {
      await send('Emulation.setDeviceMetricsOverride', { width: size.width, height: size.height, deviceScaleFactor: 1, mobile: size.mobile });
      await send('Page.navigate', { url: `${BASE}${url}` });
      for (let i = 0; i < 60; i++) {
        await sleep(250);
        try {
          if (await evaluate(`(() => { const el = document.querySelector('#lookup-input'); return Boolean(el && document.querySelector('.entry-text, #learn-title') && Object.keys(el).some((k) => k.startsWith('__reactFiber$'))); })()`)) {
            await sleep(500);
            return true;
          }
        } catch {}
      }
      return false;
    };
    const visible = (selector) => evaluate(`(() => { const el = document.querySelector(${JSON.stringify(selector)}); if (!el) return false; const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== 'hidden'; })()`);
    await send('Page.enable');
    await send('Runtime.enable');

    const AXE = fs.readFileSync(path.join(process.cwd(), 'node_modules', 'axe-core', 'axe.min.js'), 'utf8');
    const loadAxe = () => evaluate(`(() => { if (!window.axe) { const s = document.createElement('script'); s.textContent = ${JSON.stringify(AXE)}; document.head.appendChild(s); } return true; })()`);
    const axe = async () => {
      await loadAxe();
      return evaluate(`axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'best-practice'] }, exclude: [['nextjs-portal']] }).then((r) => r.violations.map((v) => v.id + ': ' + v.nodes.map((n) => n.target.join(' ')).join(', ')))`);
    };
    const click = async (selector) => {
      for (let i = 0; i < 40; i++) { if (await evaluate(`(() => { const el = document.querySelector(${JSON.stringify(selector)}); if (!el) return false; el.click(); return true; })()`)) return true; await sleep(100); }
      return false;
    };
    const where = () => evaluate(`({
      path: location.pathname,
      screen: document.querySelector('#learn-screen') ? 'learn' : document.querySelector('#today-screen') ? 'today' : document.querySelector('#review-screen') ? 'review' : document.querySelector('#saved-screen') ? 'saved' : 'book',
    })`);
    const go = async (fn) => { await evaluate(`(() => { ${fn}; return true; })()`); await sleep(900); return where(); };
    const focused = () => evaluate(`(() => { const a = document.activeElement; return a ? (a.id || a.tagName.toLowerCase() + (a.className ? '.' + String(a.className).split(' ').join('.') : '') + ':' + a.textContent.trim().slice(0, 40)) : null; })()`);
    const nextText = () => evaluate(`document.querySelector('#learn-next')?.innerText ?? ''`);

    // Seeding. Tours are all seen and tips are off, so nothing covers the screen; the guide is not yet opened.
    const DAY = 24 * 60 * 60 * 1000;
    const quiet = { seen: { start: 1, word: 1, review: 1, settings: 1, marks: 1 }, tips: {}, welcomeDone: true, tipsOff: true, listOpened: true };
    // count words saved `savedAgo` ms ago; `due`: their reviews are due now (else in 5 days); `backupAgo`: the last
    // backup that long ago (null: never).
    const seed = ({ count = 0, savedAgo = 3 * DAY, due = false, backupAgo = null, lastPage = null, tours = quiet } = {}) => evaluate(`(async () => {
      localStorage.clear();
      localStorage.setItem('panna_tours', ${JSON.stringify(JSON.stringify(tours))});
      if (${lastPage !== null}) localStorage.setItem('panna_last_page', ${JSON.stringify(String(lastPage))});
      if (${backupAgo !== null}) localStorage.setItem('panna_last_backup', String(Date.now() - ${backupAgo ?? 0}));
      const count = ${count};
      if (!count) return true;
      const entries = [];
      for (let p = 5; entries.length < count; p++) {
        const page = await (await fetch('/api/page/' + p)).json();
        entries.push(...page.column1, ...page.column2);
      }
      const now = Date.now();
      const list = entries.slice(0, count).map((e) => ({ ...e, saved_at: now - ${savedAgo} }));
      localStorage.setItem('panna_saved_words', JSON.stringify(list));
      localStorage.setItem('panna_review', JSON.stringify(Object.fromEntries(list.map((e) => [e.normalized,
        { box: 1, due_at: ${due} ? 0 : now + 5 * ${DAY}, right: 1, wrong: 0, last_at: now - ${DAY} }]))));
      return true;
    })()`);

    // The server HTML of /learn has the guide's title before any script runs.
    const html = await (await fetch(`${BASE}/learn`)).text();
    check('the server HTML of /learn contains the title', html.includes(TITLE));

    for (const [sizeName, size] of [['desktop', { width: 1440, height: 900, mobile: false }], ['phone', { width: 390, height: 844, mobile: true }]]) {
      const phone = size.mobile;
      const reviewBtn = phone ? '#nav-review-btn' : '#open-review-btn';
      const savedBtn = phone ? '#nav-saved-btn' : '#open-bookmarks-btn';
      check(`${sizeName}: app hydrates`, await open(`/page/${CAMEL_PAGE}`, size));

      // ── The address ──
      await seed();
      check(`${sizeName}: /learn hydrates`, await open('/learn', size));
      check(`${sizeName}: /learn shows the guide's title`, await evaluate(`document.querySelector('#learn-title')?.textContent`) === TITLE);
      check(`${sizeName}: the tab title names the guide`, (await evaluate(`document.title`)).startsWith(TITLE));

      // ── The Today card, then the opened flag ──
      await seed();
      await open('/', size);
      check(`${sizeName}: Today shows the guide's card before it is opened`, await visible('#today-learn') && !(await visible('#today-learn-link')));
      let w = await go(`document.querySelector('#today-learn button').click()`);
      check(`${sizeName}: the Today card opens the guide`, w.screen === 'learn', w);
      check(`${sizeName}: focus moves to the guide's title`, await focused() === 'learn-title', await focused());
      check(`${sizeName}: Back says "Back to Today"`, (await evaluate(`document.querySelector('#learn-back').textContent`)).includes('Back to Today'));
      w = await go(`document.querySelector('#learn-back').click()`);
      check(`${sizeName}: Back returns to Today`, w.screen === 'today' && w.path === '/', w);
      check(`${sizeName}: once opened, Today shows the link, not the card`, await visible('#today-learn-link') && !(await evaluate(`Boolean(document.querySelector('#today-learn'))`)));
      check(`${sizeName}: the opened flag is stored`, await evaluate(`JSON.parse(localStorage.getItem('panna_tours')).guideOpened === true`));
      await open('/', size);
      check(`${sizeName}: the link stays after a reload`, await visible('#today-learn-link') && !(await evaluate(`Boolean(document.querySelector('#today-learn'))`)));
      w = await go(`document.querySelector('#today-learn-link').click()`);
      check(`${sizeName}: the Today link opens the guide`, w.screen === 'learn', w);
      w = await go(`document.querySelector('#learn-back').click()`);
      check(`${sizeName}: Back returns to Today (from the link)`, w.screen === 'today', w);
      w = await go(`document.querySelector('#today-learn-link').click()`);
      w = await go(`history.back()`);
      check(`${sizeName}: the browser's Back from the guide returns to Today`, w.screen === 'today' && w.path === '/', w);

      // ── The ⋯ menu, from the book ──
      await seed();
      await open(`/page/${CAMEL_PAGE}`, size);
      await click('#menu-btn');
      await sleep(500);
      check(`${sizeName}: the menu lists the guide after Guided tours`, await evaluate(`document.querySelector('#guided-tours-btn')?.nextElementSibling?.id === 'learn-btn'`));
      w = await go(`document.querySelector('#learn-btn').click()`);
      check(`${sizeName}: the menu row opens the guide`, w.screen === 'learn', w);
      check(`${sizeName}: focus moves to the title (from the menu)`, await focused() === 'learn-title', await focused());
      check(`${sizeName}: Back says "Back to the book"`, (await evaluate(`document.querySelector('#learn-back').textContent`)).includes('Back to the book'));
      w = await go(`document.querySelector('#learn-back').click()`);
      check(`${sizeName}: Back returns to the book at the same page`, w.screen === 'book' && w.path === `/page/${CAMEL_PAGE}`, w);

      // ── The Guided tours sheet ──
      await click('#menu-btn');
      await sleep(500);
      await click('#guided-tours-btn');
      await sleep(700);
      w = await go(`document.querySelector('#tours-learn-link').click()`);
      check(`${sizeName}: the tours sheet's link opens the guide`, w.screen === 'learn', w);
      check(`${sizeName}: the tours sheet is closed`, !(await visible('#tours-learn-link')));
      await sleep(400);
      check(`${sizeName}: focus lands on the guide's title (from the tours sheet)`, await focused() === 'learn-title', await focused());
      w = await go(`document.querySelector('#learn-back').click()`);
      check(`${sizeName}: Back returns to the book (from the tours sheet)`, w.screen === 'book', w);

      // ── Review, with nothing due ──
      await seed();
      await open(`/page/${CAMEL_PAGE}`, size);
      w = await go(`document.querySelector(${JSON.stringify(reviewBtn)}).click()`);
      w = await go(`document.querySelector('#review-learn-link').click()`);
      check(`${sizeName}: Review's link opens the guide`, w.screen === 'learn', w);
      check(`${sizeName}: Back says "Back to Review"`, (await evaluate(`document.querySelector('#learn-back').textContent`)).includes('Back to Review'));
      w = await go(`document.querySelector('#learn-back').click()`);
      check(`${sizeName}: Back returns to Review`, w.screen === 'review', w);

      // ── Saved, empty ──
      await open(`/page/${CAMEL_PAGE}`, size);
      w = await go(`document.querySelector(${JSON.stringify(savedBtn)}).click()`);
      w = await go(`document.querySelector('#saved-learn-link').click()`);
      check(`${sizeName}: Saved's link opens the guide`, w.screen === 'learn', w);
      check(`${sizeName}: Back says "Back to Saved"`, (await evaluate(`document.querySelector('#learn-back').textContent`)).includes('Back to Saved'));
      w = await go(`document.querySelector('#learn-back').click()`);
      check(`${sizeName}: Back returns to Saved`, w.screen === 'saved', w);

      // ── The next-step card, one rule at a time ──
      await seed();
      await open('/learn', size);
      check(`${sizeName}: nothing saved → "Save your first word"`, (await nextText()).includes('Save your first word'), await nextText());
      w = await go(`document.querySelector('.learn-next-btn').click()`);
      check(`${sizeName}: its button opens the book`, w.screen === 'book', w);

      await seed({ count: 3, due: true });
      await open('/learn', size);
      check(`${sizeName}: due words → "Review your 3 due words"`, (await nextText()).includes('Review your 3 due words'), await nextText());
      w = await go(`document.querySelector('.learn-next-btn').click()`);
      check(`${sizeName}: its button opens Review`, w.screen === 'review', w);

      await seed({ count: 25 });
      await open('/learn', size);
      check(`${sizeName}: 25 saved, no backup → "Back up your words"`, (await nextText()).includes('Back up your words'), await nextText());
      await evaluate(`document.querySelector('.learn-next-btn').click(); true`);
      await sleep(700);
      check(`${sizeName}: its button opens the ⋯ menu at Back up`, await visible('#backup-btn') && await focused() === 'backup-btn', await focused());

      await seed({ count: 3, savedAgo: 0, lastPage: 40 });
      await open('/learn', size);
      check(`${sizeName}: 3 saved today → "Add up to 7 new words today"`, (await nextText()).includes('Add up to 7 new words today'), await nextText());
      w = await go(`document.querySelector('.learn-next-btn').click()`);
      await sleep(600);
      w = await where();
      check(`${sizeName}: its button opens the book at the last page read`, w.screen === 'book' && w.path === '/page/40', w);

      await seed({ count: 10, savedAgo: 0 });
      await open('/learn', size);
      check(`${sizeName}: 10 saved today → "Done for today"`, (await nextText()).includes('Done for today'), await nextText());
      check(`${sizeName}: "Done for today" has no button`, !(await evaluate(`Boolean(document.querySelector('#learn-next button'))`)));

      // ── Accessibility ──
      await seed({ count: 3, due: true });
      await open('/learn', size);
      const violations = await axe();
      check(`${sizeName}: /learn has no accessibility violations`, Array.isArray(violations) && violations.length === 0, violations);
      check(`${sizeName}: every Hindi line is marked lang="hi"`, await evaluate(`(() => { const all = [...document.querySelectorAll('.learn-hi')]; return all.length > 20 && all.every((e) => e.getAttribute('lang') === 'hi'); })()`));
      // axe cannot measure text over the card's paper gradient ("incomplete"), so the worst gradient stop is measured too.
      const labelContrast = await evaluate(`axe.run(document.querySelector('.learn-next-label-hi'), { runOnly: ['color-contrast'] }).then((r) => ({ violations: r.violations.length,
        unknown: r.incomplete.flatMap((i) => i.nodes.flatMap((n) => n.any.map((a) => a.data?.messageKey))) }))`);
      check(`${sizeName}: axe finds no contrast problem in the next-step label's Hindi`, labelContrast?.violations === 0 && labelContrast.unknown.every((k) => k === 'bgGradient'), labelContrast);
      const worst = await evaluate(`(() => {
        const rgb = (c) => c.match(/[\\d.]+/g).slice(0, 3).map(Number);
        const lum = (c) => { const [r, g, b] = rgb(c).map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
        const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
        const fg = getComputedStyle(document.querySelector('.learn-next-label-hi')).color;
        const stops = getComputedStyle(document.querySelector('#learn-next')).backgroundImage.match(/rgba?\\([^)]*\\)/g) ?? [];
        return stops.length ? Math.min(...stops.map((s) => ratio(fg, s))) : 0; })()`);
      console.log(`  next-step label Hindi, worst contrast on the card: ${worst?.toFixed(2)}:1`);
      check(`${sizeName}: the next-step label's Hindi has 4.5:1 contrast on every part of the card`, worst >= 4.5, worst);

      // ── Layout ──
      const sizes = phone ? [size, { width: 320, height: 640, mobile: true }] : [size];
      for (const s of sizes) {
        const label = `${sizeName} ${s.width}×${s.height}`;
        await open('/learn', s);
        check(`${label}: nothing overflows sideways`, await evaluate(`document.documentElement.scrollWidth <= innerWidth`), await evaluate(`[document.documentElement.scrollWidth, innerWidth]`));
        if (phone) {
          const small = await evaluate(`[...document.querySelectorAll('button')].filter((b) => { const r = b.getBoundingClientRect(); return r.width > 0 && r.height > 0 && getComputedStyle(b).visibility !== 'hidden' && (r.width < 44 || r.height < 44); }).map((b) => (b.id || b.textContent.trim().slice(0, 30)) + ' ' + Math.round(b.getBoundingClientRect().width) + '×' + Math.round(b.getBoundingClientRect().height))`);
          check(`${label}: every button is 44px or more`, small.length === 0, small);
          check(`${label}: Back is on screen and 44px or more`, await evaluate(`(() => { const r = document.querySelector('#learn-back').getBoundingClientRect(); return r.width >= 44 && r.height >= 44 && r.top >= 0 && r.left >= 0 && r.right <= innerWidth && r.bottom <= innerHeight; })()`));
        }
      }

      // ── A tour from the guide, started by a click that focuses its button (Chrome, Edge) and one that does not
      // (Safari). Either way, focus comes back to the guide when the tour ends. ──
      for (const focusFirst of [true, false]) {
        const how = focusFirst ? '' : ' (a click that does not focus)';
        await seed();
        await open('/learn', size);
        const started = await evaluate(`(() => { const b = [...document.querySelectorAll('#learn-screen button')].find((x) => x.textContent.trim() === 'Take the word card tour');
          if (!b) return false; if (${focusFirst}) b.focus(); else document.activeElement?.blur(); b.click(); return true; })()`);
        check(`${sizeName}: the guide offers the word card tour${how}`, started);
        let step = '';
        for (let i = 0; i < 30 && !step.includes('1 of'); i++) { await sleep(200); step = await evaluate(`document.querySelector('#tour-count')?.textContent ?? ''`); }
        check(`${sizeName}: "Take the word card tour" starts the word card tour at step 1${how}`, step.startsWith('The word card · 1 of'), step);
        check(`${sizeName}: step 1 is shown${how}`, await visible('#tour-tip') && Boolean(await evaluate(`document.querySelector('#tour-tip-title')?.textContent`)));
        await click('#tour-close-btn');
        await sleep(1200);
        w = await where();
        check(`${sizeName}: ending the tour returns to the guide${how}`, w.screen === 'learn', w);
        const after = await focused();
        console.log(`  focus after the tour${how}: ${after}`);
        check(`${sizeName}: focus after the tour is on the guide's title or the tour button${how}`, after === 'learn-title' || /learn-btn.*Take the word card tour/.test(after ?? ''), after);
      }
    }
    await evaluate(`localStorage.clear(); true`);
  } finally {
    if (socket) { try { socket.send(JSON.stringify({ id: 999999, method: 'Browser.close' })); } catch {} socket.close(); }
    if (edge.pid) spawnSync('taskkill', ['/PID', String(edge.pid), '/T', '/F'], { stdio: 'ignore' });
    await sleep(500);
    try { fs.rmSync(USER_DATA, { recursive: true, force: true, maxRetries: 10, retryDelay: 250 }); } catch {}
  }
  console.log(`Learn: ${checks - failures}/${checks} checks passed.`);
  if (failures) process.exitCode = 1;
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
