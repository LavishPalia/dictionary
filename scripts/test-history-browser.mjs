// Lookup history: every route records the word whose meaning was shown (search, book, share, voice, related, a
// /word/ link), the routes that must not record don't, the search box's recents come from history, and the old
// recent-searches list migrates. At desktop and phone sizes. Speech is faked as in test-reach-browser.mjs.
// Usage: node scripts/test-history-browser.mjs   (needs the app running on localhost:3000)
import { spawn, spawnSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import Database from 'better-sqlite3';
// The page Camel is on: tests open it to tap a known entry (page numbers change when the book grows).
const CAMEL_PAGE = new Database('data/dictionary.db', { readonly: true })
  .prepare("SELECT page_number FROM entries WHERE normalized = 'camel'").get().page_number;

const EDGE_PATH = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const PORT = 9363;
const BASE = 'http://localhost:3000';
const USER_DATA = path.join(process.cwd(), 'scratch', `panna-history-edge-${process.pid}-${Date.now()}`);
let checks = 0;
let failures = 0;
function check(label, ok, detail) {
  checks++;
  if (ok) console.log(`✓ ${label}`);
  else { failures++; console.error(`✗ ${label}${detail !== undefined ? ` — ${JSON.stringify(detail)}` : ''}`); }
}
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// The fake recogniser, as in test-reach-browser.mjs: start() reads window.__fakeSpeech = { transcripts?, error?, hold? }.
const FAKE_SPEECH = `
  window.__pannaRecognition = class FakeRecognition {
    constructor() { this.lang = ''; this.maxAlternatives = 1; this.interimResults = true; this.continuous = true; this.onresult = null; this.onerror = null; this.onend = null; this.stopped = false; }
    start() {
      const speech = window.__fakeSpeech || {};
      if (speech.hold) return;
      setTimeout(() => {
        if (this.stopped) return;
        if (speech.error) this.onerror?.({ error: speech.error });
        else if (speech.transcripts) this.onresult?.({ resultIndex: 0, results: [speech.transcripts.map((t) => ({ transcript: t, confidence: 0 }))] });
        this.onend?.();
      }, 50);
    }
    abort() { this.stopped = true; }
    stop() { this.abort(); }
  };`;

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
    const click = async (selector) => {
      for (let i = 0; i < 40; i++) { if (await evaluate(`(() => { const el = document.querySelector(${JSON.stringify(selector)}); if (!el) return false; el.click(); return true; })()`)) return true; await sleep(100); }
      return false;
    };
    const waitFor = async (expression, tries = 30) => { for (let i = 0; i < tries; i++) { if (await evaluate(expression)) return true; await sleep(100); } return false; };
    const type = async (text) => {
      await evaluate(`(() => { const input = document.querySelector('#lookup-input'); input.focus(); const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set; set.call(input, ${JSON.stringify(text)}); input.dispatchEvent(new Event('input', { bubbles: true })); return true; })()`);
      await waitFor(`Boolean(document.querySelector('#lookup-panel [role="option"]'))`, 30);
      await sleep(150);
    };
    const history = () => evaluate(`JSON.parse(localStorage.getItem('panna_history') || 'null')`);
    const find = async (normalized) => (await history())?.find((w) => w.normalized === normalized);
    const title = () => evaluate(`document.querySelector('#word-sheet-title')?.textContent`);
    const closeCard = async () => { await click('#close-word-drawer'); await sleep(400); };
    const quiet = { seen: { start: 1, word: 1, review: 1, settings: 1 }, tips: {}, welcomeDone: true, tipsOff: true, listOpened: true };
    const reset = (tours = quiet) => evaluate(`localStorage.clear(); localStorage.setItem('panna_tours', ${JSON.stringify(JSON.stringify(tours))}); true`);
    await send('Page.enable');
    await send('Runtime.enable');
    await send('Page.addScriptToEvaluateOnNewDocument', { source: FAKE_SPEECH });

    for (const [sizeName, size] of [['desktop', { width: 1440, height: 900, mobile: false }], ['phone', { width: 390, height: 844, mobile: true }]]) {
      check(`${sizeName}: app hydrates`, await open(`/page/${CAMEL_PAGE}`, size));
      await reset();
      await open(`/page/${CAMEL_PAGE}`, size);

      // ── Search ──
      await type('camel');
      await evaluate(`[...document.querySelectorAll('#lookup-panel [role="option"]')].find((o) => o.querySelector('.lookup-hw')?.textContent === 'Camel').click(); true`);
      await sleep(1500);
      let h = await history();
      check(`${sizeName}: search records a lookup`, h?.[0]?.normalized === 'camel' && h[0].source === 'search' && h[0].count === 1 && h[0].meaning_hi.length > 0, h?.[0]);

      // ── A tap on the book, within 10 minutes ──
      await evaluate(`[...document.querySelectorAll('.entry-text')].find((p) => p.textContent.startsWith('Camel') && p.style.cursor === 'pointer' && p.getBoundingClientRect().width > 0)?.click(); true`);
      await waitFor(`document.querySelector('#word-sheet-title')?.textContent === 'Camel'`, 40);
      let w = await find('camel');
      check(`${sizeName}: a tap within 10 minutes is the same lookup`, w?.count === 1 && w.source === 'book' && w.page === CAMEL_PAGE && w.lookups.length === 1, w);
      await closeCard();

      // ── Search box recents ──
      await evaluate(`(() => { const input = document.querySelector('#lookup-input'); const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set; set.call(input, ''); input.dispatchEvent(new Event('input', { bubbles: true })); input.blur(); input.focus(); return true; })()`);
      await waitFor(`Boolean(document.querySelector('#lookup-panel .lookup-recent-word'))`, 20);
      h = await history();
      const recents = await evaluate(`(() => { const p = document.querySelector('#lookup-panel'); return p ? { words: [...p.querySelectorAll('.lookup-recent-word')].map((e) => e.textContent), link: document.querySelector('#lookup-history-link')?.textContent ?? null, clear: [...p.querySelectorAll('button')].some((b) => b.textContent.trim() === 'Clear') } : null; })()`);
      check(`${sizeName}: search box recents come from history`, recents?.words[0] === h?.[0]?.headword && recents.link?.includes('History') && !recents.clear, { recents, first: h?.[0]?.headword });
      await evaluate(`[...document.querySelectorAll('#lookup-panel [role="option"]')][0].click(); true`);
      await sleep(1500);
      w = await find('camel');
      check(`${sizeName}: picking a recent word records it as a search`, w?.source === 'search' && w.count === 1, w);
      await evaluate(`document.activeElement?.blur(); true`);

      // ── Voice ──
      await evaluate(`window.__fakeSpeech = ${JSON.stringify({ transcripts: ['candid'] })}; true`);
      await click('#voice-btn');
      await waitFor(`document.querySelector('#word-sheet-title')?.textContent === 'candid'`, 40);
      w = await find('candid');
      check(`${sizeName}: voice records`, w?.source === 'voice' && w.count === 1, w);

      // ── Related word ──
      await waitFor(`Boolean(document.querySelector('#word-similar button'))`, 20);
      const related = await evaluate(`document.querySelector('#word-similar button')?.textContent`);
      await click('#word-similar button');
      await waitFor(`document.querySelector('#word-sheet-title')?.textContent === ${JSON.stringify(related)}`, 40);
      w = await find(String(related).toLowerCase());
      check(`${sizeName}: related word records as other`, Boolean(related) && w?.source === 'other', { related, w });
      // The card's back link reopens the card already showing: not a lookup.
      let before = await find('candid');
      await click('#word-back-btn');
      await waitFor(`document.querySelector('#word-sheet-title')?.textContent === 'candid'`, 20);
      check(`${sizeName}: going back to the previous card does not record`, JSON.stringify(await find('candid')) === JSON.stringify(before) && (await title()) === 'candid', await find('candid'));

      // ── Saved does not record ──
      await click('#save-word-btn');
      await sleep(300);
      await closeCard();
      before = await find('candid');
      await click(size.mobile ? '#nav-saved-btn' : '#open-bookmarks-btn');
      await sleep(500);
      await evaluate(`[...document.querySelectorAll('#saved-screen .saved-open')].find((b) => b.textContent.startsWith('candid'))?.click(); true`);
      await waitFor(`document.querySelector('#word-sheet-title')?.textContent === 'candid'`, 40);
      w = await find('candid');
      check(`${sizeName}: opening from Saved does not record`, (await title()) === 'candid' && JSON.stringify(w) === JSON.stringify(before), { w, before });
      await closeCard();

      // ── The tour does not record ──
      await evaluate(`localStorage.setItem('panna_tours', ${JSON.stringify(JSON.stringify({ ...quiet, seen: {} }))}); true`);
      await open(`/page/${CAMEL_PAGE}`, size);
      const beforeTour = JSON.stringify(await history());
      await click('#menu-btn');
      await sleep(400);
      await click('#guided-tours-btn');
      await sleep(500);
      await click('#tour-start-start');
      for (const n of [2, 3, 4]) { await waitFor(`Boolean(document.querySelector('#tour-next-btn'))`, 30); await sleep(300); await click('#tour-next-btn'); await waitFor(`document.querySelector('#tour-count')?.textContent.endsWith('${n} of 5')`, 40); }
      await waitFor(`Boolean(document.querySelector('#word-sheet-title'))`, 30);
      const tourWord = await title();
      check(`${sizeName}: the tour does not record`, Boolean(tourWord) && JSON.stringify(await history()) === beforeTour, { tourWord, after: (await history())?.slice(0, 2) });
      await evaluate(`document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); true`);
      await sleep(900);

      // ── A /word/ link ──
      await reset();
      await open('/word/Calm', size);
      await waitFor(`Boolean(localStorage.getItem('panna_history'))`, 20);
      w = await find('calm');
      check(`${sizeName}: opening a /word/ link records it as other`, w?.source === 'other' && w.count === 1, w);

      // ── Share ──
      await reset();
      await open(`/?share_text=${encodeURIComponent('the ostensible reason was candid')}`, size);
      await waitFor(`Boolean(document.querySelector('#sentence-entry-title'))`, 40);
      await sleep(300);
      const picked = await evaluate(`document.querySelector('#sentence-entry-title')?.textContent`);
      w = picked ? await find(picked.toLowerCase()) : null;
      check(`${sizeName}: share sentence records the pre-selected word`, Boolean(picked) && w?.source === 'share', { picked, w });
      const other = await evaluate(`(() => { const b = [...document.querySelectorAll('#sentence-sheet button.sentence-word')].find((b) => b.getAttribute('aria-pressed') !== 'true'); b?.click(); return b?.textContent ?? null; })()`);
      await waitFor(`document.querySelector('#sentence-entry-title')?.textContent?.toLowerCase() === ${JSON.stringify(String(other).toLowerCase())}`, 20);
      await sleep(200);
      const otherTitle = await evaluate(`document.querySelector('#sentence-entry-title')?.textContent`);
      w = otherTitle ? await find(otherTitle.toLowerCase()) : null;
      check(`${sizeName}: tapping another shared word records it too`, Boolean(other) && w?.source === 'share', { other, otherTitle, w });
      const raw = await evaluate(`localStorage.getItem('panna_history') || ''`);
      check(`${sizeName}: share sentence records shown words, not the sentence`, raw.length > 0 && !raw.includes('the ostensible reason') && !raw.includes('ostensible'), raw.slice(0, 200));

      // ── Migration ──
      await evaluate(`localStorage.setItem('panna_recent_searches', JSON.stringify([{ headword: 'Heal', page: 40 }])); localStorage.removeItem('panna_history'); true`);
      await open(`/page/${CAMEL_PAGE}`, size);
      await waitFor(`Boolean(localStorage.getItem('panna_history'))`, 20);
      h = await history();
      check(`${sizeName}: old recents migrate`, h?.[0]?.normalized === 'heal' && h[0].source === 'search', h?.[0]);
      check(`${sizeName}: the old recents key is no longer written`, await evaluate(`localStorage.getItem('panna_recent_searches')`) === JSON.stringify([{ headword: 'Heal', page: 40 }]));
    }
  } finally {
    if (socket) { try { socket.send(JSON.stringify({ id: 999999, method: 'Browser.close' })); } catch {} socket.close(); }
    if (edge.pid) spawnSync('taskkill', ['/PID', String(edge.pid), '/T', '/F'], { stdio: 'ignore' });
    await sleep(500);
    try { fs.rmSync(USER_DATA, { recursive: true, force: true, maxRetries: 10, retryDelay: 250 }); } catch {}
  }
  console.log(`Lookup history: ${checks - failures}/${checks} checks passed.`);
  if (failures) process.exitCode = 1;
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
