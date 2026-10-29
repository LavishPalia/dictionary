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
// Two words from the book's last pages, which no part of this test opens: offline, the service worker can't load them.
const FAR_WORDS = new Database('data/dictionary.db', { readonly: true })
  .prepare('SELECT normalized, headword, meaning_hi FROM entries WHERE page_number >= (SELECT MAX(page_number) - 1 FROM entries) ORDER BY page_number DESC, normalized LIMIT 2').all();

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
    // Headless Edge can lose window focus, and then focus events never fire (the search box's panel opens on focus).
    await send('Emulation.setFocusEmulationEnabled', { enabled: true });
    // "Offline" must cover the service worker as well as the page, as in test-offline-browser.mjs.
    const workers = new Set();
    socket.addEventListener('message', (event) => {
      const m = JSON.parse(event.data);
      if (m.method === 'Target.attachedToTarget' && m.params.targetInfo.type === 'service_worker') workers.add(m.params.sessionId);
      if (m.method === 'Target.detachedFromTarget') workers.delete(m.params.sessionId);
    });
    const sendTo = (sessionId, method, params = {}) => new Promise((resolve) => {
      const id = 500000 + Math.floor(Math.random() * 400000);
      const done = (result) => { clearTimeout(timer); socket.removeEventListener('message', onMessage); resolve(result); };
      const onMessage = (event) => { const m = JSON.parse(event.data); if (m.id === id) done(m.result ?? null); };
      const timer = setTimeout(() => { workers.delete(sessionId); done(null); }, 2000);
      socket.addEventListener('message', onMessage);
      socket.send(JSON.stringify({ id, method, params, sessionId }));
    });
    const setOffline = async (offline) => {
      const conditions = { offline, latency: 0, downloadThroughput: -1, uploadThroughput: -1 };
      await send('Network.enable');
      await send('Network.emulateNetworkConditions', conditions);
      for (const s of workers) { await sendTo(s, 'Network.enable'); await sendTo(s, 'Network.emulateNetworkConditions', conditions); }
      await sleep(300);
    };
    await send('Target.setAutoAttach', { autoAttach: true, waitForDebuggerOnStart: false, flatten: true });
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
      // Look words up after the migration (a search pick, then a search-box recent): the old key stays as it was.
      const SEEDED = JSON.stringify([{ headword: 'Heal', page: 40 }]);
      await type('camel');
      await evaluate(`[...document.querySelectorAll('#lookup-panel [role="option"]')].find((o) => o.querySelector('.lookup-hw')?.textContent === 'Camel').click(); true`);
      await sleep(1500);
      await evaluate(`(() => { const input = document.querySelector('#lookup-input'); const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set; set.call(input, ''); input.dispatchEvent(new Event('input', { bubbles: true })); input.blur(); input.focus(); return true; })()`);
      await waitFor(`Boolean(document.querySelector('#lookup-panel .lookup-recent-word'))`, 20);
      const link = await evaluate(`(() => { const r = document.querySelector('#lookup-history-link')?.getBoundingClientRect(); return r ? { w: r.width, h: r.height } : null; })()`);
      check(`${sizeName}: "History ›" is a 44px target`, link && link.h >= 43.5 && link.w >= 43.5, link);
      await evaluate(`[...document.querySelectorAll('#lookup-panel [role="option"]')].find((o) => o.textContent.includes('Heal'))?.click(); true`);
      await sleep(1500);
      await evaluate(`document.activeElement?.blur(); true`);
      h = await history();
      const old = await evaluate(`localStorage.getItem('panna_recent_searches')`);
      check(`${sizeName}: lookups after the migration go to history`, h?.[0]?.normalized === 'heal' && h.some((x) => x.normalized === 'camel' && x.source === 'search'), h?.slice(0, 2));
      check(`${sizeName}: the old recents key is no longer written`, (old === null || old === SEEDED) && !String(old).toLowerCase().includes('camel'), old);

      // ── The History tab in Saved ──
      await reset();
      // Seeded in the page so "today" and "yesterday" use the browser's own clock and time zone.
      await evaluate(`(() => {
        const now = Date.now(); const d = new Date(); const today = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
        const word = (normalized, headword, meaning_hi, at, count, source, page = null) =>
          ({ normalized, headword, meaning_hi, first_at: at - 86400000 * 2, last_at: at, count, lookups: [at], source, page });
        localStorage.setItem('panna_history', JSON.stringify([
          word('camel', 'Camel', 'ऊँट', now - 60000, 3, 'share'),
          word('candid', 'candid', 'स्पष्टवादी', now - 120000, 1, 'voice'),
          word('ceremony', 'Ceremony', 'समारोह', today - 3600000, 1, 'search'),
          word('about', 'About', 'के बारे में', today - 10 * 86400000, 2, 'book', 3),
        ]));
        return true;
      })()`);
      await open(`/page/${CAMEL_PAGE}`, size);
      const reviewBtn = size.mobile ? '#nav-review-btn' : '#open-review-btn';
      const tabHist = () => evaluate(`(() => {
        const s = document.querySelector('#saved-screen'); if (!s) return null;
        return {
          groups: [...s.querySelectorAll('.history-group-name')].map((g) => g.textContent),
          rows: [...s.querySelectorAll('.history-row')].map((r) => ({ hw: r.querySelector('.history-hw')?.textContent, text: r.textContent, star: r.querySelector('.history-star')?.getAttribute('aria-pressed') ?? null, label: r.querySelector('.history-star')?.getAttribute('aria-label') ?? null, busy: r.querySelector('.history-star')?.getAttribute('aria-busy') ?? null })),
          summary: s.querySelector('.saved-summary')?.textContent,
          historyTab: document.querySelector('#saved-tab-history')?.getAttribute('aria-checked'),
        };
      })()`);
      // "History ›" in the search box opens Saved on the History tab.
      const openRecents = () => evaluate(`(() => { const input = document.querySelector('#lookup-input'); if (!input) return false; const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set; set.call(input, ''); input.dispatchEvent(new Event('input', { bubbles: true })); input.blur(); input.focus(); return true; })()`);
      // Focus can land before the page is ready for it: try a few times.
      let linkShown = false;
      for (let i = 0; i < 5 && !linkShown; i++) { await openRecents(); linkShown = await waitFor(`Boolean(document.querySelector('#lookup-history-link'))`, 10); }
      check(`${sizeName}: the search box shows "History ›"`, linkShown);
      await click('#lookup-history-link');
      await waitFor(`Boolean(document.querySelector('#saved-screen .history-row'))`, 30);
      let t = await tabHist();
      check(`${sizeName}: "History ›" opens Saved on the History tab`, t?.historyTab === 'true', t);
      check(`${sizeName}: History tab lists lookups newest first, grouped by day`, t?.groups.join('|') === 'Today|Yesterday|Earlier' && t.rows.map((r) => r.hw).join('|') === 'Camel|candid|Ceremony|About', t);
      check(`${sizeName}: the summary counts lookups`, /\b4 looked up\b/.test(t?.summary ?? ''), t?.summary);
      const camelRow = t?.rows[0];
      check(`${sizeName}: rows show Hindi, source and time`, camelRow?.text.includes('ऊँट') && camelRow.text.includes('shared') && /\d{1,2}:\d{2} (am|pm)/.test(camelRow.text)
        && t.rows[3].text.includes('on page 3'), t?.rows);
      check(`${sizeName}: 3× badge`, camelRow?.text.includes('3×') && !t.rows[1].text.includes('×') && !t.rows[3].text.includes('×'), t?.rows);
      const starBox = await evaluate(`(() => { const r = document.querySelector('.history-star')?.getBoundingClientRect(); return r ? { w: r.width, h: r.height } : null; })()`);
      check(`${sizeName}: stars are 44px buttons labelled "Save {headword}"`, starBox && starBox.w >= 43.5 && starBox.h >= 43.5 && t.rows[1].label === 'Save candid' && t.rows[1].star === 'false', { starBox, row: t?.rows[1] });

      // ── One-tap save; a double tap while the word loads still saves it ──
      const busy = await evaluate(`(async () => { const star = [...document.querySelectorAll('.history-row')].find((r) => r.querySelector('.history-hw')?.textContent === 'candid').querySelector('.history-star');
        let wasBusy = false; const seen = new MutationObserver(() => { if (star.getAttribute('aria-busy') === 'true') wasBusy = true; });
        seen.observe(star, { attributes: true, attributeFilter: ['aria-busy'] });
        star.click(); star.click(); await new Promise((r) => setTimeout(r, 1500)); seen.disconnect(); return String(wasBusy); })()`);
      await waitFor(`JSON.parse(localStorage.getItem('panna_saved_words') || '[]').some((w) => w.normalized === 'candid')`, 40);
      await sleep(200);
      t = await tabHist();
      const savedCandid = await evaluate(`JSON.parse(localStorage.getItem('panna_saved_words') || '[]').find((w) => w.normalized === 'candid') ?? null`);
      const badge = await evaluate(`document.querySelector('${reviewBtn} .ui-badge')?.textContent ?? null`);
      check(`${sizeName}: a double tap leaves the word saved, and the star shows it is busy`, busy === 'true' && Boolean(savedCandid) && t?.rows[1].star === 'true' && t.rows[1].busy === 'false', { savedCandid: Boolean(savedCandid), busy, row: t?.rows[1] });
      check(`${sizeName}: the star saves into Review`, Boolean(savedCandid?.definition_en) && t?.rows[1].star === 'true' && t.rows[1].label === 'Remove candid from saved' && badge === '1', { savedCandid, row: t?.rows[1], badge });
      await click('#history-filter-unsaved');
      await sleep(200);
      t = await tabHist();
      const chips = await evaluate(`[...document.querySelectorAll('#saved-screen .history-filter [role="radio"]')].map((b) => b.textContent)`);
      check(`${sizeName}: Not saved filter`, t?.rows.map((r) => r.hw).join('|') === 'Camel|Ceremony|About' && chips?.join('|') === 'All · 4|Not saved · 3', { rows: t?.rows.map((r) => r.hw), chips });
      await evaluate(`[...document.querySelectorAll('#saved-screen .history-filter [role="radio"]')].find((b) => b.textContent.startsWith('All')).click(); true`);
      await sleep(200);

      // ── Opening a row: not a lookup, but it moves to the top ──
      const ceremonyBefore = await find('ceremony');
      await evaluate(`[...document.querySelectorAll('.history-row')].find((r) => r.querySelector('.history-hw')?.textContent === 'Ceremony').querySelector('.history-open').click(); true`);
      await waitFor(`document.querySelector('#word-sheet-title')?.textContent === 'Ceremony'`, 40);
      h = await history();
      check(`${sizeName}: opening a row moves it to the top without counting`, (await title()) === 'Ceremony' && h?.[0]?.normalized === 'ceremony' && h[0].count === ceremonyBefore.count
        && JSON.stringify(h[0].lookups) === JSON.stringify(ceremonyBefore.lookups) && h[0].last_at > ceremonyBefore.last_at, { first: h?.[0], ceremonyBefore });
      await closeCard();
      t = await tabHist();
      check(`${sizeName}: the opened row is listed first`, t?.rows[0]?.hw === 'Ceremony' && t.groups[0] === 'Today', t);

      // ── Edit, Clear and Undo ──
      await click('#history-edit-btn');
      await sleep(200);
      await evaluate(`[...document.querySelectorAll('.history-row')].find((r) => r.querySelector('.history-hw')?.textContent === 'About').querySelector('.history-remove').click(); true`);
      await sleep(300);
      const afterRemove = (await history())?.map((x) => x.normalized);
      const toastText = await evaluate(`document.querySelector('.saved-toast')?.innerText ?? null`);
      t = await tabHist();
      const removedOk = !afterRemove?.includes('about') && !t?.rows.some((r) => r.hw === 'About') && toastText?.includes('Undo');
      await click('.saved-undo');
      await sleep(300);
      check(`${sizeName}: Edit removes one, with Undo`, removedOk && (await history())?.map((x) => x.normalized).join('|') === 'ceremony|camel|candid|about', { afterRemove, toastText, after: (await history())?.map((x) => x.normalized) });
      const beforeClear = (await history())?.map((x) => x.normalized).join('|');
      await click('#history-clear-btn');
      await sleep(300);
      const cleared = await history();
      const emptyShown = await evaluate(`Boolean(document.querySelector('#history-empty'))`);
      await click('.saved-undo');
      await sleep(300);
      check(`${sizeName}: Clear history, with Undo`, Array.isArray(cleared) && cleared.length === 0 && emptyShown && (await history())?.map((x) => x.normalized).join('|') === beforeClear
        && (await tabHist())?.rows.length === 4, { cleared, emptyShown, after: (await history())?.map((x) => x.normalized), beforeClear });
      for (let i = 0; i < 5; i++) { await openRecents(); if (await waitFor(`Boolean(document.querySelector('#lookup-panel .lookup-recent-word'))`, 10)) break; }
      const recentBeforeClear = await evaluate(`document.querySelectorAll('#lookup-panel .lookup-recent-word').length`);
      await evaluate(`document.activeElement?.blur(); true`);
      await sleep(300);
      await click('#history-edit-btn'); // clearing left Edit mode
      await sleep(200);
      await click('#history-clear-btn');
      await sleep(300);
      const inputThere = await openRecents();
      await sleep(500);
      const recentAfterClear = await evaluate(`document.querySelectorAll('#lookup-panel .lookup-recent-word').length`);
      check(`${sizeName}: Clear also empties search box recents`, inputThere && recentBeforeClear > 0 && recentAfterClear === 0 && (await history())?.length === 0, { recentBeforeClear, recentAfterClear });
      await evaluate(`document.activeElement?.blur(); true`);
      check(`${sizeName}: empty state copy`, await evaluate(`document.querySelector('#history-empty')?.textContent`) === 'Words you look up appear here, so you can come back to them, and save the ones worth learning.',
        await evaluate(`document.querySelector('#history-empty')?.textContent ?? null`));

      // Saved opened any other way starts on Words.
      await click(size.mobile ? '#nav-book-btn' : '#close-saved-btn');
      await sleep(500);
      await click(size.mobile ? '#nav-saved-btn' : '#open-bookmarks-btn');
      await sleep(500);
      check(`${sizeName}: Saved opened from the nav starts on Words`, await evaluate(`document.querySelector('#saved-screen [role="radio"][aria-checked="true"]')?.textContent.startsWith('Words')`));

      // ── Offline: a word whose page isn't saved can be neither saved nor opened ──
      await reset();
      await evaluate(`(() => { const now = Date.now(); const w = (x, at) => ({ ...x, first_at: at, last_at: at, count: 1, lookups: [at], source: 'search', page: null });
        localStorage.setItem('panna_history', JSON.stringify([w(${JSON.stringify(FAR_WORDS[0])}, now - 60000), w(${JSON.stringify(FAR_WORDS[1])}, now - 120000)])); return true; })()`);
      await open(`/page/${CAMEL_PAGE}`, size);
      await click(size.mobile ? '#nav-saved-btn' : '#open-bookmarks-btn');
      await sleep(500);
      await click('#saved-tab-history');
      await waitFor(`document.querySelectorAll('.history-row').length === 2`, 20);
      const order = JSON.stringify(await history());
      await setOffline(true);
      await evaluate(`document.querySelector('.history-row .history-star').click(); true`);
      await waitFor(`Boolean(document.querySelector('.saved-toast'))`, 50);
      const saveToast = await evaluate(`document.querySelector('.saved-toast')?.innerText ?? null`);
      const savedOffline = await evaluate(`localStorage.getItem('panna_saved_words')`);
      check(`${sizeName}: offline, the star saves nothing and says why`, saveToast?.includes(`Connect to the internet to save ${FAR_WORDS[0].headword}`) && !saveToast.includes('Undo')
        && !String(savedOffline).includes(FAR_WORDS[0].normalized) && await evaluate(`document.querySelector('.history-row .history-star').getAttribute('aria-pressed')`) === 'false', { saveToast, savedOffline });
      await evaluate(`document.querySelectorAll('.history-row')[1].querySelector('.history-open').click(); true`);
      await waitFor(`document.querySelector('.saved-toast')?.innerText.includes('Connect to the internet to open')`, 50);
      const openToast = await evaluate(`document.querySelector('.saved-toast')?.innerText ?? null`);
      check(`${sizeName}: offline, opening a row says why and leaves the order`, openToast?.includes(`Connect to the internet to open ${FAR_WORDS[1].headword}`)
        && JSON.stringify(await history()) === order && !(await evaluate(`Boolean(document.querySelector('#word-sheet-title'))`)), { openToast, first: (await history())?.[0]?.normalized });
      await setOffline(false);

      if (size.mobile) {
        await send('Emulation.setDeviceMetricsOverride', { width: 360, height: 780, deviceScaleFactor: 1, mobile: true });
        await sleep(400);
        const fit = await evaluate(`(() => { const seg = document.querySelector('#saved-screen .saved-tabs .ui-seg'); const btns = [...seg.querySelectorAll('button')];
          return { seg: [seg.scrollWidth, seg.clientWidth], over: btns.filter((b) => b.scrollWidth > b.clientWidth).map((b) => b.textContent), page: document.documentElement.scrollWidth <= innerWidth }; })()`);
        check('phone: the four tabs fit at 360 px', fit.seg[0] <= fit.seg[1] && fit.over.length === 0 && fit.page, fit);
      }
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
