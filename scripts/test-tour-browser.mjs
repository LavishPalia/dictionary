// Guided tours and one-time tips: the welcome card, every tour step, Back/Escape/keys, tips, at desktop and phone sizes.
// Usage: node scripts/test-tour-browser.mjs   (needs the app running on localhost:3000)
import { spawn, spawnSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import Database from 'better-sqlite3';
// The page Camel is on: tests open it to tap a known entry (page numbers change when the book grows).
const CAMEL_PAGE = new Database('data/dictionary.db', { readonly: true })
  .prepare("SELECT page_number FROM entries WHERE normalized = 'camel'").get().page_number;

const EDGE_PATH = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const PORT = 9337;
const BASE = 'http://localhost:3000';
const USER_DATA = path.join(process.cwd(), 'scratch', `panna-tour-edge-${process.pid}-${Date.now()}`);
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

    const ALL_DONE = { seen: {}, tips: {}, welcomeDone: true, tipsOff: true };
    const reset = (tours, extra = {}) => evaluate(`(() => { localStorage.clear(); ${tours ? `localStorage.setItem('panna_tours', ${JSON.stringify(JSON.stringify(tours))});` : ''}
      ${Object.entries(extra).map(([k, v]) => `localStorage.setItem(${JSON.stringify(k)}, ${JSON.stringify(typeof v === 'string' ? v : JSON.stringify(v))});`).join('')} return true; })()`);
    const tours = () => evaluate(`JSON.parse(localStorage.getItem('panna_tours') || 'null')`);
    const where = () => evaluate(`({ path: location.pathname, screen: document.querySelector('#today-screen') ? 'today' : document.querySelector('#review-screen') ? 'review' : document.querySelector('#saved-screen') ? 'saved' : 'book' })`);
    // The tour tip and what its spotlight surrounds.
    const step = () => evaluate(`(() => {
      const tip = document.querySelector('#tour-tip');
      if (!tip) return null;
      const spot = document.querySelector('.tour-spot')?.getBoundingClientRect();
      const t = tip.getBoundingClientRect();
      return {
        count: document.querySelector('#tour-count')?.textContent, title: document.querySelector('#tour-tip-title')?.textContent,
        hi: tip.querySelector('.tour-hi')?.textContent ?? '', focused: tip.contains(document.activeElement),
        spot: spot ? { top: spot.top, left: spot.left, bottom: spot.bottom, right: spot.right } : null,
        tip: { top: t.top, left: t.left, bottom: t.bottom, right: t.right }, vw: innerWidth, vh: innerHeight,
        sheet: Boolean(document.querySelector('#word-sheet')), menu: Boolean(document.querySelector('#reading-menu')),
      };
    })()`);
    const surrounds = (s, selector) => evaluate(`(() => { const el = document.querySelector(${JSON.stringify(selector)}); if (!el) return false;
      const r = el.getBoundingClientRect(); const s = ${JSON.stringify(s?.spot ?? null)};
      return !!s && s.top <= r.top + 1 && s.left <= r.left + 1 && s.bottom >= r.bottom - 1 && s.right >= r.right - 1; })()`);
    // The step is showing and its spotlight has settled (sheets slide in, and the spotlight glides after them).
    const waitStep = async (count) => {
      let prev = null;
      for (let i = 0; i < 60; i++) {
        const s = await step();
        if (s?.count?.endsWith(count) && s.spot && prev && JSON.stringify(prev.spot) === JSON.stringify(s.spot)) return s;
        prev = s?.count?.endsWith(count) && s.spot ? s : null;
        await sleep(150);
      }
      return step();
    };
    // Clicks once the element is there (the welcome card and sheets appear a moment after the page).
    const click = async (selector) => {
      for (let i = 0; i < 40; i++) {
        if (await evaluate(`(() => { const el = document.querySelector(${JSON.stringify(selector)}); if (!el) return false; el.click(); return true; })()`)) return true;
        await sleep(100);
      }
      return false;
    };
    // The one-time tip on screen (it may take a moment), and whether it is beside a given control.
    const tipText = async () => {
      for (let i = 0; i < 30; i++) { const t = await evaluate(`document.querySelector('#tip-card')?.innerText ?? null`); if (t) return t; await sleep(150); }
      return null;
    };
    const tipAt = (selector) => evaluate(`(() => { const ring = document.querySelector('.tour-ring')?.getBoundingClientRect(); const r = document.querySelector(${JSON.stringify(selector)})?.getBoundingClientRect();
      return !!ring && !!r && ring.left <= r.left && ring.top <= r.top && ring.right >= r.right && ring.bottom >= r.bottom; })()`);
    const inView = (s) => s && s.tip.top >= 0 && s.tip.left >= 0 && s.tip.right <= s.vw + 0.5 && s.tip.bottom <= s.vh + 0.5;
    const overlaps = (s) => s && s.spot && !(s.tip.bottom <= s.spot.top || s.tip.top >= s.spot.bottom || s.tip.right <= s.spot.left || s.tip.left >= s.spot.right);

    for (const [sizeName, size] of [['desktop', { width: 1440, height: 900, mobile: false }], ['phone', { width: 390, height: 844, mobile: true }]]) {
      const phone = sizeName === 'phone';
      const reviewBtn = phone ? '#nav-review-btn' : '#open-review-btn';
      const savedBtn = phone ? '#nav-saved-btn' : '#open-bookmarks-btn';
      check(`${sizeName}: app hydrates`, await open(`/page/${CAMEL_PAGE}`, size));

      // ── Welcome card ──
      await reset(null);
      await open('/', size);
      check(`${sizeName}: a first visit offers the tour on Today`, await visible('#today-welcome')
        && (await evaluate(`document.querySelector('#today-welcome').innerText`)).includes('Take the one-minute tour'));
      check(`${sizeName}: the welcome card has a Hindi line`, await evaluate(`document.querySelector('#today-welcome [lang="hi"]')?.textContent.includes('टूर')`));
      await click('#today-not-now');
      await sleep(300);
      check(`${sizeName}: "Not now" hides the card`, !(await visible('#today-welcome')) && (await tours())?.welcomeDone === true);
      let here = await tipText();
      check(`${sizeName}: "Not now" then points at ⋯, where the tours are`, here?.includes('Tours are here any time') && await tipAt('#menu-btn'), here);
      await open('/', size);
      check(`${sizeName}: and it stays hidden after a reload`, !(await visible('#today-welcome')));

      // ── Getting started, from the welcome card ──
      await reset(null);
      await open('/', size);
      await click('#today-take-tour');
      let s = await waitStep('1 of 5');
      check(`${sizeName}: the tour starts at the search box`, s?.count === 'Getting started · 1 of 5' && await surrounds(s, '#lookup-input'), s);
      check(`${sizeName}: each step has an English and a Hindi line`, s?.title === 'Look up any word' && s.hi.includes('शब्द'), s);
      check(`${sizeName}: the tip has focus`, s?.focused, s);
      check(`${sizeName}: the tip is on screen and clear of what it points at`, inView(s) && !overlaps(s), s);
      check(`${sizeName}: the page behind cannot be clicked`, await evaluate(`(() => { const r = document.querySelector('#lookup-input').getBoundingClientRect();
        return document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2)?.classList.contains('tour-blocker'); })()`));
      check(`${sizeName}: the welcome card is answered once the tour starts`, (await tours())?.welcomeDone === true);
      await click('#tour-next-btn');
      s = await waitStep('2 of 5');
      check(`${sizeName}: step 2 opens the book at the page arrows`, (await where()).screen === 'book'
        && await surrounds(s, phone ? '[aria-label="Next page"]' : '[aria-label="Next spread"]'), { s, w: await where() });
      check(`${sizeName}: the text fits the layout`, phone ? !s.title.includes('keys') && (await evaluate(`document.querySelector('#tour-tip-text').innerText`)).includes('swipe')
        : (await evaluate(`document.querySelector('#tour-tip-text').innerText`)).includes('← →'));
      check(`${sizeName}: step 2 is on screen and clear of its target`, inView(s) && !overlaps(s), s);
      await click('#tour-next-btn');
      s = await waitStep('3 of 5');
      const firstWord = await evaluate(`(() => { const el = [...document.querySelectorAll('.entry-text')].find((e) => e.style.cursor === 'pointer' && e.getBoundingClientRect().width > 0); return el?.querySelector('.entry-headword')?.textContent.trim(); })()`);
      check(`${sizeName}: step 3 points at the first word on the page`, Boolean(firstWord) && s?.spot && inView(s), { firstWord, s });
      await click('#tour-next-btn');
      s = await waitStep('4 of 5');
      check(`${sizeName}: step 4 opens that word's card at Save`, s?.sheet && await surrounds(s, '#save-word-btn')
        && await evaluate(`document.querySelector('#word-sheet-title')?.textContent === ${JSON.stringify(firstWord)}`), s);
      check(`${sizeName}: the tip has focus even with the card open`, s?.focused, s);
      check(`${sizeName}: the tour does not save the word`, await evaluate(`!localStorage.getItem('panna_saved_words') || JSON.parse(localStorage.getItem('panna_saved_words')).length === 0`));
      await click('#tour-back-btn');
      s = await waitStep('3 of 5');
      check(`${sizeName}: Back returns to step 3 and closes the card`, s?.count?.endsWith('3 of 5') && !s.sheet, s);
      await key('ArrowRight', 'ArrowRight');
      s = await waitStep('4 of 5');
      check(`${sizeName}: → moves on`, s?.count?.endsWith('4 of 5') && s.sheet, s);
      await key('ArrowRight', 'ArrowRight');
      s = await waitStep('5 of 5');
      check(`${sizeName}: step 5 points at Review, with the card closed`, !s?.sheet && await surrounds(s, reviewBtn), s);
      check(`${sizeName}: the last step says Done and has no Skip`, await evaluate(`document.querySelector('#tour-next-btn').textContent === 'Done' && !document.querySelector('#tour-skip-btn')`));
      check(`${sizeName}: the page did not turn or change behind the tour`, (await where()).screen === 'book');
      await click('#tour-next-btn');
      await sleep(900);
      let w = await where();
      check(`${sizeName}: Done ends the tour back on Today`, !(await step()) && w.screen === 'today' && w.path === '/', w);
      check(`${sizeName}: the tour is remembered as seen`, Boolean((await tours())?.seen?.start));
      check(`${sizeName}: no welcome card after the tour`, !(await visible('#today-welcome')));
      here = await tipText();
      check(`${sizeName}: the end of a tour points at ⋯ (Hindi too)`, here?.includes('Tours are here any time') && here.includes('टूर') && await tipAt('#menu-btn'), here);
      await click('#tip-got-it-btn');

      // ── Escape ends a tour, from any step, putting everything back ──
      await reset(ALL_DONE);
      await open('/', size);
      await click('#menu-btn');
      await sleep(400);
      check(`${sizeName}: Guided tours is the first row of the menu, with how many are unseen`, await evaluate(`(() => {
        const first = document.querySelector('#reading-menu .menu-row'); return first?.id === 'guided-tours-btn' && first.textContent.includes('4 not seen yet'); })()`),
        await evaluate(`[document.querySelector('#reading-menu .menu-row')?.id, document.querySelector('#reading-menu .menu-row')?.textContent, Boolean(document.querySelector('#reading-menu'))]`));
      await click('#guided-tours-btn');
      await sleep(500);
      check(`${sizeName}: ⋯ → Guided tours lists the four tours`, await evaluate(`[...document.querySelectorAll('#tours-sheet .tours-item-title')].map((e) => e.textContent).join('|')`)
        === 'Getting started|The word card|Saving and Review|Settings and backup');
      check(`${sizeName}: every tour has a Hindi line`, await evaluate(`[...document.querySelectorAll('#tours-sheet .tours-item-hi')].every((e) => e.lang === 'hi' && e.textContent.length > 5)`));
      await click('#tour-start-start');
      s = await waitStep('1 of 5');
      check(`${sizeName}: a tour starts from the list, which closes`, s && !(await visible('#tours-sheet')), s);
      for (const n of [2, 3, 4]) { await click('#tour-next-btn'); s = await waitStep(`${n} of 5`); }
      await key('Escape', 'Escape');
      await sleep(900);
      w = await where();
      check(`${sizeName}: Escape ends the tour, closes the card and returns to Today`, !(await step()) && !(await visible('#word-sheet')) && w.screen === 'today', w);

      // ── The word card tour ──
      await click('#menu-btn'); await sleep(400); await click('#guided-tours-btn'); await sleep(500);
      check(`${sizeName}: the list ticks the tour already seen`, await evaluate(`document.querySelector('#tour-start-start').textContent.includes('Seen') && !document.querySelector('#tour-start-word').textContent.includes('Seen')`));
      await click('#tour-start-word');
      s = await waitStep('1 of 5');
      check(`${sizeName}: the word card tour opens a word at its Hindi meaning`, s?.sheet && await surrounds(s, '#word-sheet .word-hi'), s);
      await click('#tour-next-btn'); s = await waitStep('2 of 5');
      check(`${sizeName}: then the speak buttons`, await surrounds(s, '#speak-en-btn') && await surrounds(s, '#speak-hi-btn'), s);
      await click('#tour-next-btn'); s = await waitStep('3 of 5');
      check(`${sizeName}: then the similar and opposite words`, await surrounds(s, '#word-related'), s);
      await click('#tour-next-btn'); s = await waitStep('4 of 5');
      check(`${sizeName}: then Save`, await surrounds(s, '#save-word-btn'), s);
      await click('#tour-next-btn'); s = await waitStep('5 of 5');
      check(`${sizeName}: then "See on page"`, await surrounds(s, '#see-on-page-btn') && inView(s), s);
      await click('#tour-next-btn');
      await sleep(800);
      check(`${sizeName}: Done closes the card`, !(await step()) && !(await visible('#word-sheet')) && (await where()).screen === 'today');

      // ── Saving and Review, started from the book ──
      await open(`/page/${CAMEL_PAGE}`, size);
      await click('#menu-btn'); await sleep(400); await click('#guided-tours-btn'); await sleep(500);
      await click('#tour-start-review');
      s = await waitStep('1 of 4');
      check(`${sizeName}: Saving and Review opens Saved`, (await where()).screen === 'saved' && await surrounds(s, savedBtn), { s, w: await where() });
      await click('#tour-next-btn'); s = await waitStep('2 of 4');
      check(`${sizeName}: then the Words · Pages · Notes switch`, await surrounds(s, '#saved-screen [role="radiogroup"]'), s);
      await click('#tour-next-btn'); s = await waitStep('3 of 4');
      check(`${sizeName}: then Review`, await surrounds(s, reviewBtn), s);
      await click('#tour-next-btn'); s = await waitStep('4 of 4');
      check(`${sizeName}: then today's review on Today`, (await where()).screen === 'today' && await surrounds(s, '#today-review'), s);
      check(`${sizeName}: the keyboard sentence is for desktop only`, (await evaluate(`document.querySelector('#tour-tip-text').innerText`)).includes('1–4') === !phone);
      await click('#tour-next-btn');
      await sleep(1200);
      w = await where();
      check(`${sizeName}: Done returns to the book, where it started`, !(await step()) && w.screen === 'book' && w.path.startsWith('/page/'), w);

      // ── Back (the phone's button) ends a tour ──
      await click('#menu-btn'); await sleep(400); await click('#guided-tours-btn'); await sleep(500);
      await click('#tour-start-review');
      s = await waitStep('1 of 4');
      await sleep(1300);
      await evaluate(`history.back(); true`);
      await sleep(900);
      check(`${sizeName}: Back ends the tour`, !(await step()));

      // ── Settings and backup (with "Read without a connection" only where offline saving exists) ──
      await open('/', size);
      const canSave = await evaluate('Boolean(navigator.serviceWorker && navigator.serviceWorker.controller)');
      const n = canSave ? 5 : 4;
      await click('#menu-btn'); await sleep(400); await click('#guided-tours-btn'); await sleep(500);
      check(`${sizeName}: the list counts the steps this browser will show`, (await evaluate(`document.querySelector('#tour-start-settings').textContent`)).includes(`${n} steps`));
      await click('#tour-start-settings');
      s = await waitStep(`1 of ${n}`);
      check(`${sizeName}: Settings starts at ⋯ with the menu closed`, !s?.menu && await surrounds(s, '#menu-btn'), s);
      await click('#tour-next-btn'); s = await waitStep(`2 of ${n}`);
      check(`${sizeName}: then opens the menu at Desk lighting`, s?.menu && await surrounds(s, '#reading-menu [aria-label="Desk lighting"]'), s);
      check(`${sizeName}: the tip is drawn above the menu`, await evaluate(`(() => { const r = document.querySelector('#tour-next-btn').getBoundingClientRect(); return document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2)?.id === 'tour-next-btn'; })()`));
      if (canSave) {
        await click('#tour-next-btn'); s = await waitStep(`3 of ${n}`);
        check(`${sizeName}: then saving the book for offline`, s?.title === 'Read without a connection' && s.hi.includes('इंटरनेट') && await surrounds(s, '#offline-save-btn'), s);
      }
      await click('#tour-next-btn'); s = await waitStep(`${n - 1} of ${n}`);
      check(`${sizeName}: then backup`, await surrounds(s, '#backup-btn'), s);
      await click('#tour-next-btn'); s = await waitStep(`${n} of ${n}`);
      check(`${sizeName}: then Guided tours`, await surrounds(s, '#guided-tours-btn') && inView(s), s);
      check(`${sizeName}: no step about page-turn speed any more`, !(await evaluate(`document.querySelector('#tour-tip-title')?.textContent`)).includes('Page turns'));
      await key('Tab', 'Tab');
      check(`${sizeName}: Tab stays in the tip`, await evaluate(`document.querySelector('#tour-tip').contains(document.activeElement)`));
      await click('#tour-next-btn');
      await sleep(700);
      check(`${sizeName}: Done closes the menu`, !(await step()) && !(await visible('#reading-menu')));
      check(`${sizeName}: nothing was changed by the settings tour`, await evaluate(`localStorage.getItem('panna_settings') === null`));

      // ── "How this works" links start the tour for where the reader is, and return there ──
      await reset({ seen: {}, tips: {}, welcomeDone: true, tipsOff: true });
      await open(`/page/${CAMEL_PAGE}`, size);
      await click(reviewBtn);
      await click('#review-how-btn');
      s = await waitStep('1 of 4');
      check(`${sizeName}: Review's "How Review works" starts Saving and Review`, s?.count === 'Saving and Review · 1 of 4', s);
      await key('Escape', 'Escape');
      await sleep(1000);
      check(`${sizeName}: and ends back on Review`, !(await step()) && (await where()).screen === 'review', await where());
      await click(savedBtn);
      await click('#saved-how-btn');
      s = await waitStep('1 of 4');
      check(`${sizeName}: Saved's "How saving works" starts it too`, s?.count === 'Saving and Review · 1 of 4', s);
      await key('Escape', 'Escape');
      await sleep(1000);
      check(`${sizeName}: and ends back on Saved`, !(await step()) && (await where()).screen === 'saved', await where());
      await open(`/page/${CAMEL_PAGE}`, size);
      await evaluate(`[...document.querySelectorAll('.entry-text')].find((e) => e.style.cursor === 'pointer' && e.getBoundingClientRect().width > 0).click(); true`);
      await sleep(700);
      const cardWord = await evaluate(`document.querySelector('#word-sheet-title')?.textContent`);
      await click('#word-tour-btn');
      s = await waitStep('1 of 5');
      check(`${sizeName}: a word card's "Tour this card" tours that word`, s?.count === 'The word card · 1 of 5' && await evaluate(`document.querySelector('#word-sheet-title')?.textContent === ${JSON.stringify(cardWord)}`), { s, cardWord });
      await key('Escape', 'Escape');
      await sleep(800);
      check(`${sizeName}: and leaves the card open afterwards`, !(await step()) && await evaluate(`document.querySelector('#word-sheet-title')?.textContent === ${JSON.stringify(cardWord)}`));
      await key('Escape'); await sleep(300);
      // Someone who has opened the tours list knows where tours are: no pointer to ⋯.
      await reset({ seen: {}, tips: {}, welcomeDone: true, listOpened: true });
      await open(`/page/${CAMEL_PAGE}`, size);
      await click('#tip-got-it-btn');
      await click(reviewBtn);
      await click('#review-how-btn');
      await waitStep('1 of 4');
      await key('Escape', 'Escape');
      await sleep(1800);
      check(`${sizeName}: no ⋯ pointer for someone who has used the tours list`, !(await evaluate(`document.querySelector('#tip-card')?.innerText.includes('Tours are here') ?? false`)));
      if (!phone) {
        await key('?', 'Slash', '?');
        await sleep(500);
        check(`${sizeName}: ? opens Guided tours`, await visible('#tours-sheet'));
        await key('Escape'); await sleep(300);
        await evaluate(`document.querySelector('#lookup-input').focus(); true`);
        await key('?', 'Slash', '?');
        await sleep(400);
        check(`${sizeName}: but not while typing in the search box`, !(await visible('#tours-sheet')));
        await evaluate(`document.activeElement.blur(); true`);
      }

      // ── One-time tips ──
      await reset({ seen: {}, tips: {}, welcomeDone: true });
      await open(`/page/${CAMEL_PAGE}`, size);
      let tip = null;
      for (let i = 0; i < 30 && !tip; i++) { await sleep(150); tip = await evaluate(`document.querySelector('#tip-card')?.innerText ?? null`); }
      check(`${sizeName}: the first visit to the book shows a tip about tapping words`, tip?.includes('Tap any word') && tip.includes('शब्द'), tip);
      check(`${sizeName}: a tip does not take focus or block the page`, await evaluate(`!document.querySelector('#tip-card').contains(document.activeElement)
        && !document.querySelector('.tour-blocker')`));
      check(`${sizeName}: the tip is remembered once shown`, Boolean((await tours())?.tips?.book));
      if (!phone) {
        const before = (await where()).path;
        await key('ArrowRight', 'ArrowRight');
        await sleep(2000);
        check(`${sizeName}: page keys still work with a tip showing`, (await where()).path !== before, [before, (await where()).path]);
        await key('ArrowLeft', 'ArrowLeft');
        await sleep(2000);
      }
      await click('#tip-got-it-btn');
      await sleep(300);
      check(`${sizeName}: "Got it" closes it`, !(await visible('#tip-card')));
      await open(`/page/${CAMEL_PAGE}`, size);
      await sleep(1500);
      check(`${sizeName}: and it does not come back`, !(await visible('#tip-card')));
      await evaluate(`[...document.querySelectorAll('.entry-text')].find((e) => e.style.cursor === 'pointer' && e.getBoundingClientRect().width > 0).click(); true`);
      tip = null;
      for (let i = 0; i < 30 && !tip; i++) { await sleep(150); tip = await evaluate(`document.querySelector('#tip-card')?.innerText ?? null`); }
      check(`${sizeName}: the first word card shows a tip about saving`, tip?.includes('Save the words you want to learn'), tip);
      check(`${sizeName}: the sheet keeps focus with a tip showing`, await evaluate(`document.querySelector('#word-sheet').contains(document.activeElement)`));
      await click('#save-word-btn');
      await sleep(500);
      tip = await evaluate(`document.querySelector('#tip-card')?.innerText ?? null`);
      check(`${sizeName}: the first save says when the word comes back`, tip?.includes('Saved!') && tip.includes('tomorrow'), tip);
      await key('Escape');
      await sleep(400);
      check(`${sizeName}: Escape still closes the card (and its tip)`, !(await visible('#word-sheet')) && !(await visible('#tip-card')));
      await reset({ seen: {}, tips: {}, welcomeDone: true });
      await open(`/page/${CAMEL_PAGE}`, size);
      tip = null;
      for (let i = 0; i < 30 && !tip; i++) { await sleep(150); tip = await evaluate(`document.querySelector('#tip-card') ? 1 : null`); }
      await click('#tip-off-btn');
      await sleep(300);
      check(`${sizeName}: "Turn off tips" stops them`, (await tours())?.tipsOff === true && !(await visible('#tip-card')));
      await evaluate(`[...document.querySelectorAll('.entry-text')].find((e) => e.style.cursor === 'pointer' && e.getBoundingClientRect().width > 0).click(); true`);
      await sleep(1200);
      check(`${sizeName}: no tip once they are off`, !(await visible('#tip-card')));
      await key('Escape'); await sleep(300);
      await click('#menu-btn'); await sleep(400); await click('#guided-tours-btn'); await sleep(500);
      check(`${sizeName}: Guided tours says tips are off`, (await evaluate(`document.querySelector('#tours-sheet').innerText`)).includes('Tips are off'));
      await click('#tips-again-btn');
      await sleep(200);
      check(`${sizeName}: "Show tips again" turns them back on`, (await tours())?.tipsOff === false && Object.keys((await tours()).tips).length === 0);
      await key('Escape'); await sleep(300);
      await reset({ seen: { start: Date.now() }, tips: {}, welcomeDone: true });
      await open(`/page/${CAMEL_PAGE}`, size);
      await sleep(1800);
      check(`${sizeName}: no "tap a word" tip for someone who took Getting started`, !(await visible('#tip-card')));
      check(`${sizeName}: nothing overflows sideways`, await evaluate(`document.documentElement.scrollWidth <= innerWidth`));
    }

    // Reduced motion: the spotlight and tip jump instead of gliding.
    await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
    await reset(ALL_DONE);
    await open('/', { width: 1440, height: 900, mobile: false });
    await click('#menu-btn'); await sleep(400); await click('#guided-tours-btn'); await sleep(500);
    await click('#tour-start-settings');
    await waitStep('1 of 5');
    const still = await evaluate(`({ cls: document.querySelector('#tour-layer')?.className, spot: getComputedStyle(document.querySelector('.tour-spot')).transitionDuration,
      tip: getComputedStyle(document.querySelector('#tour-tip')).transitionDuration })`);
    check('reduced motion: the tour does not animate', still.cls?.includes('tour--still')
      && [still.spot, still.tip].every((t) => t.split(',').every((d) => parseFloat(d) < 0.001)), still);
    await key('Escape');
    await send('Emulation.setEmulatedMedia', { features: [] });
    await evaluate(`localStorage.clear(); true`);
  } finally {
    if (socket) { try { socket.send(JSON.stringify({ id: 999999, method: 'Browser.close' })); } catch {} socket.close(); }
    if (edge.pid) spawnSync('taskkill', ['/PID', String(edge.pid), '/T', '/F'], { stdio: 'ignore' });
    await sleep(500);
    try { fs.rmSync(USER_DATA, { recursive: true, force: true, maxRetries: 10, retryDelay: 250 }); } catch {}
  }
  console.log(`Tours: ${checks - failures}/${checks} checks passed.`);
  if (failures) process.exitCode = 1;
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
