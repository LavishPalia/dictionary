// Review (quiz): due count, questions, right/wrong answers and their schedule, practice rounds, statuses on
// saved words, at desktop and phone sizes.
// Usage: node scripts/test-review-browser.mjs   (needs the app running on localhost:3000)
import { spawn, spawnSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import Database from 'better-sqlite3';
// The page Camel is on: tests open it to tap a known entry (page numbers change when the book grows).
const CAMEL_PAGE = new Database('data/dictionary.db', { readonly: true })
  .prepare("SELECT page_number FROM entries WHERE normalized = 'camel'").get().page_number;

const EDGE_PATH = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const PORT = 9327;
const BASE = 'http://localhost:3000';
const USER_DATA = path.join(process.cwd(), 'scratch', `panna-review-edge-${process.pid}-${Date.now()}`);
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
    const seed = (headwords, records = null) => evaluate(`(async () => {
      const word = async (h) => (await (await fetch('/api/word/' + h)).json()).entry;
      const words = [];
      for (const h of ${JSON.stringify(headwords)}) words.push({ ...(await word(h)), saved_at: Date.now() - 60000 });
      localStorage.setItem('panna_saved_words', JSON.stringify(words));
      ['panna_bookmarks', 'panna_dog_ears', 'panna_marginalia'].forEach((k) => localStorage.removeItem(k));
      ${records ? `localStorage.setItem('panna_review', ${JSON.stringify(JSON.stringify(records))});` : `localStorage.removeItem('panna_review');`}
      return true;
    })()`);
    const screen = () => evaluate(`(() => {
      const s = document.querySelector('#review-screen');
      if (!s) return null;
      return {
        title: document.querySelector('#review-title')?.textContent,
        prompt: document.querySelector('.review-prompt')?.textContent,
        word: document.querySelector('.review-word, .review-hi-prompt, .review-def-prompt')?.textContent,
        options: [...s.querySelectorAll('.review-option')].map((o) => o.textContent.slice(1)),
        feedback: document.querySelector('.review-feedback')?.innerText ?? null,
        text: s.innerText,
      };
    })()`);
    const waitForCard = async () => { for (let i = 0; i < 40; i++) { if (await evaluate(`Boolean(document.querySelector('.review-option, #review-done, .review-empty'))`)) return; await sleep(100); } };
    // Index of the right option, worked out from the saved words (the page never reveals it before answering).
    const rightIndex = () => evaluate(`(() => {
      const prompt = document.querySelector('.review-word, .review-hi-prompt, .review-def-prompt').textContent;
      const w = JSON.parse(localStorage.getItem('panna_saved_words')).find((x) => x.headword === prompt || x.meaning_hi === prompt || '“' + x.definition_en + '”' === prompt);
      return [...document.querySelectorAll('.review-option')].findIndex((o) => [w.meaning_hi, w.headword].includes(o.textContent.slice(1)));
    })()`);
    const records = () => evaluate(`JSON.parse(localStorage.getItem('panna_review') || '{}')`);

    for (const [sizeName, size] of [['desktop', { width: 1440, height: 900, mobile: false }], ['phone', { width: 390, height: 844, mobile: true }]]) {
      const reviewBtn = sizeName === 'phone' ? '#nav-review-btn' : '#open-review-btn';
      check(`${sizeName}: app hydrates`, await open(`/page/${CAMEL_PAGE}`, size));
      await seed([]);
      await open(`/page/${CAMEL_PAGE}`, size);
      await evaluate(`document.querySelector('${reviewBtn}').click(); true`);
      await waitForCard();
      check(`${sizeName}: with nothing saved, Review explains how words get there`, (await screen())?.text.includes('Nothing to review yet'));
      await evaluate(`document.querySelector('#close-review-btn').click(); true`);
      await sleep(400);

      await seed(['Camel', 'Ceremony', 'Abandon']);
      await open(`/page/${CAMEL_PAGE}`, size);
      const badge = await evaluate(`document.querySelector('${reviewBtn} .ui-badge')?.textContent`);
      // The button's name is its text: "Review", the badge, and hidden "words due".
      check(`${sizeName}: Review shows 3 words due`, badge === '3' && await evaluate(`document.querySelector('${reviewBtn}').textContent.replace(/\\s+/g, ' ').trim() === 'Review 3 words due'`), badge);

      await evaluate(`document.querySelector('${reviewBtn}').click(); true`);
      await waitForCard();
      let s = await screen();
      check(`${sizeName}: a round of 3 starts with an English → Hindi question`, s?.title === 'Review · 1 of 3' && s.prompt === 'What does this mean?', s);
      check(`${sizeName}: four distinct options`, s?.options.length === 4 && new Set(s.options).size === 4, s?.options);
      check(`${sizeName}: Review is current and the book is hidden`, await evaluate(`document.querySelector('${reviewBtn}').getAttribute(${JSON.stringify(sizeName === 'phone' ? 'aria-current' : 'aria-pressed')}) === ${JSON.stringify(sizeName === 'phone' ? 'page' : 'true')}`) && !(await visible('.entry-text')));
      if (sizeName === 'phone') {
        const heights = await evaluate(`[...document.querySelectorAll('.review-option')].map((o) => o.getBoundingClientRect().height)`);
        check('phone: answer buttons are at least 44px tall', heights.every((h) => h >= 44), heights);
        check('phone: nothing overflows sideways', await evaluate(`document.documentElement.scrollWidth <= innerWidth`));
      }

      // First card: answer right with a number key.
      const first = s.word;
      await key(String((await rightIndex()) + 1), `Digit${(await rightIndex()) + 1}`, String((await rightIndex()) + 1));
      await sleep(250);
      s = await screen();
      let r = await records();
      const firstKey = first.toLowerCase();
      check(`${sizeName}: number keys answer, and a right answer says when it comes back`, s?.feedback?.startsWith('Right!') && s.feedback.includes('Comes back tomorrow'), s?.feedback);
      check(`${sizeName}: the answer is saved (box 1, due tomorrow)`, r[firstKey]?.box === 1 && r[firstKey].right === 1 && r[firstKey].due_at > Date.now() && r[firstKey].due_at <= Date.now() + 2 * DAY, r[firstKey]);
      check(`${sizeName}: focus moves to "Next word"`, await evaluate(`document.activeElement?.id === 'review-next-btn'`));
      if (sizeName === 'phone') {
        const nextBox = await evaluate(`(() => { const b = document.querySelector('#review-next-btn'); b.scrollIntoView({ block: 'nearest' }); const r = b.getBoundingClientRect(); return { bottom: r.bottom, bar: document.querySelector('.app-bottomnav').getBoundingClientRect().top }; })()`);
        check('phone: "Next word" can be scrolled clear of the bottom bar', nextBox.bottom <= nextBox.bar, nextBox);
      }
      await key('Enter', 'Enter', '\r');
      await sleep(250);

      // Second card: answer wrong.
      s = await screen();
      const second = s.word;
      const wrong = ((await rightIndex()) + 1) % 4;
      await evaluate(`document.querySelectorAll('.review-option')[${wrong}].click(); true`);
      await sleep(250);
      s = await screen();
      r = await records();
      check(`${sizeName}: a wrong answer shows the right meaning and adds the word to the end of the round`,
        s?.feedback?.startsWith('Not quite.') && s.feedback.includes('end of this round') && s.title === 'Review · 2 of 4', s);
      check(`${sizeName}: the wrong answer is saved`, r[second.toLowerCase()]?.wrong === 1 && r[second.toLowerCase()].box === 1);
      check(`${sizeName}: the right option is marked`, await evaluate(`Boolean(document.querySelector('.review-option--right')) && Boolean(document.querySelector('.review-option--wrong'))`));

      // Finish the round with right answers.
      for (let i = 0; i < 4; i++) {
        await evaluate(`document.querySelector('#review-next-btn')?.click(); true`);
        await sleep(250);
        if (await evaluate(`Boolean(document.querySelector('#review-done'))`)) break;
        const idx = await rightIndex();
        await evaluate(`document.querySelectorAll('.review-option')[${idx}].click(); true`);
        await sleep(200);
      }
      s = await screen();
      check(`${sizeName}: the round ends with a summary`, s?.text.includes('Round complete') && s.text.includes('2 of 3') && s.text.includes(`To practise again: ${second}`), s?.text);
      r = await records();
      check(`${sizeName}: the retry did not change the missed word's schedule`, r[second.toLowerCase()].right === 0 && r[second.toLowerCase()].wrong === 1, r[second.toLowerCase()]);
      check(`${sizeName}: nothing is due any more`, await evaluate(`!document.querySelector('${reviewBtn} .ui-badge')`));

      await evaluate(`document.querySelector('#review-finish-btn').click(); true`);
      await sleep(500);
      check(`${sizeName}: "Back to the book" leaves Review`, !(await screen()) && await visible('.entry-text'));

      await evaluate(`document.querySelector('${reviewBtn}').click(); true`);
      await waitForCard();
      s = await screen();
      check(`${sizeName}: with everything done, Review says when the next one is`, s?.text.includes('All caught up') && s.text.includes('tomorrow (3 words)'), s?.text);
      const before = JSON.stringify(await records());
      await evaluate(`document.querySelector('#practice-btn').click(); true`);
      await waitForCard();
      await evaluate(`document.querySelector('.review-option').click(); true`);
      await sleep(200);
      check(`${sizeName}: practice rounds leave the schedule alone`, (await screen())?.title.startsWith('Practice') && JSON.stringify(await records()) === before);
      await evaluate(`history.back(); true`);
      await sleep(500);
      check(`${sizeName}: the Back button closes Review`, !(await screen()) && await visible('.entry-text'));

      await evaluate(`document.querySelector(${JSON.stringify(sizeName === 'phone' ? '#nav-saved-btn' : '#open-bookmarks-btn')}).click(); true`);
      await sleep(400);
      check(`${sizeName}: Saved shows Learning on reviewed words`, (await evaluate(`[...document.querySelectorAll('#saved-screen .review-status')].map((t) => t.textContent)`)).join() === 'Learning,Learning,Learning');
      await evaluate(`[...document.querySelectorAll('#saved-screen .saved-open')].find((b) => b.textContent.startsWith('Camel')).click(); true`);
      await sleep(700);
      check(`${sizeName}: the word sheet says when a saved word comes back`, await evaluate(`document.querySelector('#word-review-note')?.textContent === 'In review · comes back tomorrow'`));
      await key('Escape');
      await sleep(300);

      // A word due long ago comes first, and a mastered word is labelled.
      await seed(['Camel', 'Ceremony'], {
        camel: { box: 4, due_at: Date.now() + 10 * DAY, right: 4, wrong: 0 },
        ceremony: { box: 2, due_at: Date.now() - 5 * DAY, right: 2, wrong: 0 },
      });
      await open(`/page/${CAMEL_PAGE}`, size);
      await evaluate(`document.querySelector(${JSON.stringify(sizeName === 'phone' ? '#nav-saved-btn' : '#open-bookmarks-btn')}).click(); true`);
      await sleep(400);
      const tags = await evaluate(`[...document.querySelectorAll('#saved-screen .saved-item')].map((i) => i.querySelector('.saved-hw').textContent + ':' + (i.querySelector('.review-status')?.textContent ?? '-'))`);
      check(`${sizeName}: Mastered and Learning tags`, tags.includes('Camel:Mastered') && tags.includes('Ceremony:Learning'), tags);
      check(`${sizeName}: Saved offers to review the due word`, await evaluate(`document.querySelector('#saved-review-btn')?.textContent.includes('Review 1 word now')`));
      await evaluate(`document.querySelector('#saved-review-btn').click(); true`);
      await waitForCard();
      s = await screen();
      check(`${sizeName}: only the overdue word is in the round`, s?.title === 'Review · 1 of 1', s?.title);
      await evaluate(`document.querySelector('#close-review-btn').click(); true`);
      await sleep(400);

      // Regression: browsers keep history state across a reload; closing Review afterwards must still reach the book.
      await evaluate(`document.querySelector('${reviewBtn}').click(); true`);
      await waitForCard();
      await evaluate(`location.reload(); true`);
      await sleep(600);
      for (let i = 0; i < 40 && !(await evaluate(`Boolean(document.querySelector('#lookup-input') && Object.keys(document.querySelector('#lookup-input')).some((k) => k.startsWith('__reactFiber$')))`)); i++) await sleep(150);
      await evaluate(`document.querySelector('${reviewBtn}').click(); true`);
      await waitForCard();
      await evaluate(`document.querySelector('#close-review-btn').click(); true`);
      await sleep(500);
      check(`${sizeName}: after a reload, closing Review still returns to the book`, !(await screen()) && await visible('.entry-text'));
    }
    await evaluate(`['panna_saved_words', 'panna_review'].forEach((k) => localStorage.removeItem(k)); true`);
  } finally {
    if (socket) { try { socket.send(JSON.stringify({ id: 999999, method: 'Browser.close' })); } catch {} socket.close(); }
    if (edge.pid) spawnSync('taskkill', ['/PID', String(edge.pid), '/T', '/F'], { stdio: 'ignore' });
    await sleep(500);
    try { fs.rmSync(USER_DATA, { recursive: true, force: true, maxRetries: 10, retryDelay: 250 }); } catch {}
  }
  console.log(`Review: ${checks - failures}/${checks} checks passed.`);
  if (failures) process.exitCode = 1;
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
