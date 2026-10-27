// Similar and opposite words: chips in the word sheet, and the "opposite" card in Review, at desktop and phone sizes.
// Usage: node scripts/test-related-browser.mjs   (needs the app running on localhost:3000)
import { spawn, spawnSync } from 'child_process';
import fs from 'fs';
import path from 'path';

const EDGE_PATH = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const PORT = 9335;
const BASE = 'http://localhost:3000';
const USER_DATA = path.join(process.cwd(), 'scratch', `panna-related-edge-${process.pid}-${Date.now()}`);
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

    const sheet = () => evaluate(`(() => { const s = document.querySelector('#word-sheet'); if (!s) return null;
      const chips = (kind) => [...s.querySelectorAll('#word-' + kind + ' .ui-chip')].map((c) => c.textContent);
      return { name: document.querySelector('#word-sheet-title')?.textContent, similar: chips('similar'), opposite: chips('opposite') }; })()`);
    const clickEntry = (word) => evaluate(`(() => { const p = [...document.querySelectorAll('.entry-text')].find((p) => p.textContent.startsWith(${JSON.stringify(word)}) && p.style.cursor === 'pointer'); if (!p) return false; p.click(); return true; })()`);
    const chip = (kind, word) => evaluate(`(() => { const c = [...document.querySelectorAll('#word-${kind} .ui-chip')].find((c) => c.textContent === ${JSON.stringify(word)}); if (!c) return false; c.click(); return true; })()`);
    const pageOf = async (word) => (await evaluate(`fetch('/api/word/${word}').then((r) => r.json())`)).pageNumber;

    for (const [sizeName, size] of [['desktop', { width: 1440, height: 900, mobile: false }], ['phone', { width: 390, height: 844, mobile: true }]]) {
      check(`${sizeName}: app hydrates`, await open('/page/1', size));
      await evaluate(`localStorage.clear(); true`);

      // From the book: Above has an opposite and no similar words.
      const abovePage = await pageOf('Above');
      await open(`/page/${abovePage}`, size);
      check(`${sizeName}: Above is on its page`, await clickEntry('Above'));
      await sleep(700);
      let s = await sheet();
      check(`${sizeName}: the sheet lists Below as the opposite of Above`, s?.name === 'Above' && s.opposite.join() === 'Below', s);
      check(`${sizeName}: no empty "Similar" row`, s && s.similar.length === 0 && !(await evaluate(`Boolean(document.querySelector('#word-similar-label'))`)), s);
      check(`${sizeName}: chips are big enough to tap`, await evaluate(`[...document.querySelectorAll('#word-sheet .word-related .ui-chip')].every((c) => c.getBoundingClientRect().height >= 36)`));
      const historyLength = await evaluate('history.length');
      check(`${sizeName}: tapping a chip`, await chip('opposite', 'Below'));
      await sleep(700);
      s = await sheet();
      check(`${sizeName}: shows that word in the same sheet`, s?.name === 'Below' && s.opposite.includes('Above'), s);
      check(`${sizeName}: the address follows without a new Back step`,
        await evaluate(`location.pathname === '/word/Below' && history.length === ${historyLength}`), await evaluate('[location.pathname, history.length]'));
      check(`${sizeName}: focus moves to the sheet`, await evaluate(`document.activeElement?.id === 'word-sheet'`), await evaluate('document.activeElement?.outerHTML.slice(0, 80)'));
      check(`${sizeName}: the book stays at its page`, await evaluate(`[...document.querySelectorAll('.entry-text')].some((p) => p.textContent.startsWith('Above') && p.getBoundingClientRect().width > 0)`));
      await key('Escape');
      await sleep(500);
      check(`${sizeName}: closing returns the address to the page`, !(await sheet()) && await evaluate(`location.pathname.startsWith('/page/')`), await evaluate('location.pathname'));
      check(`${sizeName}: nothing overflows sideways`, await evaluate(`document.documentElement.scrollWidth <= innerWidth`));

      // Gemini-added similar words show up as chips too: "know" had none from WordNet.
      await open('/word/know', size);
      for (let t = 0; t < 40 && !(await sheet()); t++) await sleep(100);
      s = await sheet();
      check(`${sizeName}: Know lists similar words, including Understand`, s?.name === 'know' && s.similar.length >= 1 && s.similar.includes('understand'), s);

      // Hopping through chips leaves a trail: "‹ know" steps back, one word at a time, and closing forgets it.
      const back = () => evaluate(`document.querySelector('#word-back-btn')?.textContent.replace('‹', '').trim() ?? null`);
      check(`${sizeName}: a sheet opened directly has no back link`, (await back()) === null);
      await chip('similar', 'understand');
      for (let t = 0; t < 40 && (await sheet())?.name !== 'understand'; t++) await sleep(100);
      check(`${sizeName}: after a chip, the sheet offers a way back`, (await back()) === 'know', await back());
      const next = (await sheet())?.similar.find((w) => w !== 'know');
      await chip('similar', next);
      for (let t = 0; t < 40 && (await sheet())?.name !== next; t++) await sleep(100);
      check(`${sizeName}: a second hop points back one word`, (await back()) === 'understand', { next, back: await back() });
      check(`${sizeName}: the back link is big enough to tap`, await evaluate(`document.querySelector('#word-back-btn').getBoundingClientRect().height >= ${sizeName === 'phone' ? 44 : 24}`));
      await evaluate(`document.querySelector('#word-back-btn').click(); true`);
      for (let t = 0; t < 40 && (await sheet())?.name !== 'understand'; t++) await sleep(100);
      check(`${sizeName}: back returns to the previous word`, (await sheet())?.name === 'understand' && (await back()) === 'know', { s: await sheet(), back: await back() });
      check(`${sizeName}: the address follows the word`, await evaluate(`location.pathname === '/word/understand'`), await evaluate('location.pathname'));
      await evaluate(`document.querySelector('#word-back-btn').click(); true`);
      for (let t = 0; t < 40 && (await sheet())?.name !== 'know'; t++) await sleep(100);
      check(`${sizeName}: back again reaches the first word, with no back link left`, (await sheet())?.name === 'know' && (await back()) === null, { s: await sheet(), back: await back() });
      await chip('similar', 'understand');
      for (let t = 0; t < 40 && (await sheet())?.name !== 'understand'; t++) await sleep(100);
      await key('Escape');
      await sleep(400);
      await clickEntry('know');
      for (let t = 0; t < 40 && (await sheet())?.name !== 'know'; t++) await sleep(100);
      check(`${sizeName}: closing the sheet forgets the trail`, (await sheet())?.name === 'know' && (await back()) === null, { s: await sheet(), back: await back() });

      // From Saved: the address is left alone; similar words open too.
      await evaluate(`(async () => { localStorage.setItem('panna_saved_words', JSON.stringify([{ ...(await (await fetch('/api/word/also')).json()).entry, saved_at: Date.now() }])); return true; })()`);
      await open('/', size);
      await evaluate(`document.querySelector(${JSON.stringify(sizeName === 'phone' ? '#nav-saved-btn' : '#open-bookmarks-btn')}).click(); true`);
      await sleep(500);
      await evaluate(`document.querySelector('#saved-screen .saved-open').click(); true`);
      await sleep(700);
      s = await sheet();
      check(`${sizeName}: Also lists similar words`, s?.name === 'Also' && s.similar.includes('Too'), s);
      await chip('similar', 'Too');
      await sleep(700);
      s = await sheet();
      check(`${sizeName}: a similar word opens from Saved, which stays open behind`,
        s?.name === 'Too' && await evaluate(`location.pathname === '/' && Boolean(document.querySelector('#saved-screen'))`), s);
      await key('Escape');
      await sleep(400);

      // Review: well-known words with opposites get "Which word means the opposite?" among their cards.
      const words = ['above', 'below', 'up', 'down', 'here', 'there', 'inside', 'outside', 'first', 'last', 'more', 'less'];
      await evaluate(`(async () => {
        const list = [];
        for (const w of ${JSON.stringify(words)}) list.push({ ...(await (await fetch('/api/word/' + w)).json()).entry, saved_at: Date.now() });
        localStorage.setItem('panna_saved_words', JSON.stringify(list));
        localStorage.setItem('panna_review', JSON.stringify(Object.fromEntries(list.map((e) => [e.normalized, { box: 2, due_at: 0, right: 2, wrong: 0 }]))));
        return true;
      })()`);
      await open('/', size);
      await evaluate(`document.querySelector('#today-start-review').click(); true`);
      let seen = null;
      for (let i = 0; i < words.length && !seen; i++) {
        for (let t = 0; t < 40; t++) { if (await evaluate(`Boolean(document.querySelector('.review-option, #review-done'))`)) break; await sleep(100); }
        const card = await evaluate(`({ prompt: document.querySelector('.review-prompt')?.textContent, word: document.querySelector('.review-word')?.textContent, options: [...document.querySelectorAll('.review-option')].map((o) => o.textContent.slice(1)) })`);
        if (card.prompt === 'Which word means the opposite?') { seen = card; break; }
        await evaluate(`document.querySelector('.review-option').click(); true`);
        await sleep(200);
        await evaluate(`document.querySelector('#review-next-btn')?.click(); true`);
        await sleep(300);
      }
      check(`${sizeName}: Review asks for an opposite`, Boolean(seen), seen);
      if (seen) {
        const answer = (await evaluate(`fetch('/api/word/${seen.word}').then((r) => r.json())`)).entry.opposite[0].headword;
        check(`${sizeName}: the opposite card has four English options including ${answer}`, seen.options.length === 4 && seen.options.includes(answer)
          && !seen.options.includes(seen.word) && seen.options.every((o) => /^[A-Za-z]/.test(o)), seen);
        await evaluate(`[...document.querySelectorAll('.review-option')].find((o) => o.textContent.slice(1) === ${JSON.stringify(answer)}).click(); true`);
        await sleep(300);
        const feedback = await evaluate(`document.querySelector('.review-feedback')?.innerText ?? ''`);
        check(`${sizeName}: a right answer says what the opposite is`, feedback.startsWith('Right!') && feedback.includes(`opposite of ${seen.word}`) && feedback.includes(answer), feedback);
      }
      await evaluate(`localStorage.clear(); true`);
    }
  } finally {
    if (socket) { try { socket.send(JSON.stringify({ id: 999999, method: 'Browser.close' })); } catch {} socket.close(); }
    if (edge.pid) spawnSync('taskkill', ['/PID', String(edge.pid), '/T', '/F'], { stdio: 'ignore' });
    await sleep(500);
    try { fs.rmSync(USER_DATA, { recursive: true, force: true, maxRetries: 10, retryDelay: 250 }); } catch {}
  }
  console.log(`Related words: ${checks - failures}/${checks} checks passed.`);
  if (failures) process.exitCode = 1;
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
