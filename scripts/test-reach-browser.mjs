// Reach Panna fast: voice search in the search box (mic, listening overlay, English/Hindi, errors, offline), a heard
// word opening its card with a Heard strip, launches (share target, icon shortcuts) and the sentence sheet, at
// desktop and phone sizes. Speech is faked: window.__pannaRecognition is a test stand-in for SpeechRecognition.
// Usage: node scripts/test-reach-browser.mjs   (needs a production build running on localhost:3000)
import { spawn, spawnSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import Database from 'better-sqlite3';
// The page Calm is on: tests open it to use a known entry (page numbers change when the book grows).
const CALM_PAGE = new Database('data/dictionary.db', { readonly: true })
  .prepare("SELECT page_number FROM entries WHERE normalized = 'calm'").get().page_number;

const EDGE_PATH = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const PORT = 9351;
const BASE = 'http://localhost:3000';
const USER_DATA = path.join(process.cwd(), 'scratch', `panna-reach-edge-${process.pid}-${Date.now()}`);
let checks = 0;
let failures = 0;
function check(label, ok, detail) {
  checks++;
  if (ok) console.log(`✓ ${label}`);
  else { failures++; console.error(`✗ ${label}${detail !== undefined ? ` — ${JSON.stringify(detail)}` : ''}`); }
}
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// The fake recogniser. start() reads window.__fakeSpeech = { transcripts?, error?, hold? } and, 50 ms later, fires
// onresult or onerror and then onend. hold: true keeps it listening (nothing fires) so the overlay can be inspected.
const FAKE_SPEECH = `
  window.__pannaRecognition = class FakeRecognition {
    constructor() { this.lang = ''; this.maxAlternatives = 1; this.interimResults = true; this.continuous = true; this.onresult = null; this.onerror = null; this.onend = null; this.stopped = false; }
    start() {
      window.__fakeSpeechLang = this.lang;
      window.__fakeSpeechStarts = (window.__fakeSpeechStarts || 0) + 1;
      window.__fakeSpeechSettings = { maxAlternatives: this.maxAlternatives, interimResults: this.interimResults, continuous: this.continuous };
      const speech = window.__fakeSpeech || {};
      if (speech.hold) return;
      setTimeout(() => {
        if (this.stopped) return;
        if (speech.error) this.onerror?.({ error: speech.error });
        else if (speech.transcripts) this.onresult?.({ resultIndex: 0, results: [speech.transcripts.map((t) => ({ transcript: t, confidence: 0 }))] });
        this.onend?.();
      }, 50);
    }
    abort() { this.stopped = true; window.__fakeSpeechAborts = (window.__fakeSpeechAborts || 0) + 1; }
    stop() { this.abort(); }
  };`;
// No speech at all: the fake is null and the browser's own API is removed (headless Edge may have one).
const NO_SPEECH = `window.__pannaRecognition = null; delete window.SpeechRecognition; delete window.webkitSpeechRecognition;`;

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
    const click = async (selector) => {
      for (let i = 0; i < 40; i++) { if (await evaluate(`(() => { const el = document.querySelector(${JSON.stringify(selector)}); if (!el) return false; el.click(); return true; })()`)) return true; await sleep(100); }
      return false;
    };
    const setOffline = async (offline) => {
      await send('Network.enable');
      await send('Network.emulateNetworkConditions', { offline, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });
      await sleep(300);
    };
    await send('Page.enable');
    await send('Runtime.enable');

    const DIALOG = '[role="dialog"][aria-label="Voice search"]';
    const dialog = () => evaluate(`(() => { const d = document.querySelector(${JSON.stringify(DIALOG)}); return d ? { text: d.innerText, modal: d.getAttribute('aria-modal') } : null; })()`);
    const waitFor = async (expression, tries = 30) => { for (let i = 0; i < tries; i++) { if (await evaluate(expression)) return true; await sleep(100); } return false; };
    const speak = (speech) => evaluate(`window.__fakeSpeech = ${JSON.stringify(speech)}; true`);
    const tapMic = async () => { await click('#voice-btn'); await sleep(150); };
    const results = () => evaluate(`(() => { const p = document.querySelector('#lookup-panel'); return p ? [...p.querySelectorAll('[role="option"]')].map((o) => o.querySelector('.lookup-hw')?.textContent) : null; })()`);
    const strip = () => evaluate(`(() => { const s = document.querySelector('#word-heard'); if (!s) return null; const sheet = document.querySelector('#word-sheet');
      return { text: s.innerText.replace(/\\s+/g, ' ').trim(), role: s.getAttribute('role'), italic: s.querySelector('i')?.textContent,
        first: [...sheet.children].find((c) => !c.classList.contains('ui-sheet-grab')) === s,
        buttons: [...s.querySelectorAll('button')].map((b) => ({ text: b.textContent, h: b.getBoundingClientRect().height })) }; })()`);
    const quiet = { seen: { start: 1, word: 1, review: 1, settings: 1 }, tips: {}, welcomeDone: true, tipsOff: true, listOpened: true };
    const AXE = fs.readFileSync(path.join(process.cwd(), 'node_modules', 'axe-core', 'axe.min.js'), 'utf8');

    // The header allows the microphone for Panna itself, and nothing else.
    const policy = (await fetch(`${BASE}/`)).headers.get('permissions-policy') ?? '';
    check('Permissions-Policy allows the microphone for this site only', policy.includes('microphone=(self)') && policy.includes('camera=()') && policy.includes('geolocation=()'), policy);
    // Words the search finds more than 3 results for (definition matches), so "only 3" is a real limit.
    const MANY = 'the act of';
    const typed = ((await (await fetch(`${BASE}/api/search?q=${encodeURIComponent(MANY)}`)).json()).results ?? []).map((r) => r.headword);

    for (const [sizeName, size] of [['desktop', { width: 1440, height: 900, mobile: false }], ['phone', { width: 390, height: 844, mobile: true }]]) {
      const { identifier: fake } = await send('Page.addScriptToEvaluateOnNewDocument', { source: FAKE_SPEECH });
      check(`${sizeName}: app hydrates`, await open(`/page/${CALM_PAGE}`, size));
      await evaluate(`localStorage.clear(); localStorage.setItem('panna_tours', ${JSON.stringify(JSON.stringify(quiet))}); true`);
      await open(`/page/${CALM_PAGE}`, size);

      const mic = await evaluate(`(() => { const b = document.querySelector('#voice-btn'); if (!b) return null; const r = b.getBoundingClientRect(); return { label: b.getAttribute('aria-label'), w: r.width, h: r.height, inBox: Boolean(b.closest('.app-lookup')) }; })()`);
      check(`${sizeName}: the mic shows in the search box when speech recognition exists`, mic?.label === 'Search by voice' && mic.inBox, mic);
      check(`${sizeName}: the mic is a 44px target`, mic && mic.w >= 43.5 && mic.h >= 43.5, mic);

      // Listening: the overlay, its words and the language switch.
      await speak({ hold: true });
      await tapMic();
      let d = await dialog();
      check(`${sizeName}: tapping the mic opens a modal "Voice search" dialog`, d?.modal === 'true', d);
      check(`${sizeName}: the overlay says "Say a word" with its Hindi line`, d?.text.includes('Say a word') && d.text.includes('कोई शब्द बोलिए'), d);
      check(`${sizeName}: every Hindi text in the overlay is marked lang="hi"`, await evaluate(`(() => { const d = document.querySelector(${JSON.stringify(DIALOG)}); const w = document.createTreeWalker(d, NodeFilter.SHOW_TEXT); let n; while ((n = w.nextNode())) { if (/[\\u0900-\\u097F]/.test(n.textContent) && !n.parentElement.closest('[lang="hi"]')) return false; } return true; })()`));
      check(`${sizeName}: it listens in Indian English with 5 guesses, one final result`, await evaluate(`window.__fakeSpeechLang === 'en-IN' && window.__fakeSpeechSettings.maxAlternatives === 5 && !window.__fakeSpeechSettings.interimResults && !window.__fakeSpeechSettings.continuous`), await evaluate('[window.__fakeSpeechLang, window.__fakeSpeechSettings]'));
      check(`${sizeName}: the listening ring pulses`, await evaluate(`(() => { const r = document.querySelector('.voice-ring'); return Boolean(r) && getComputedStyle(r).animationName !== 'none'; })()`));
      const segs = await evaluate(`[...document.querySelectorAll('${DIALOG} [role="radio"]')].map((b) => ({ text: b.textContent, checked: b.getAttribute('aria-checked'), hi: Boolean(b.querySelector('[lang="hi"]') || b.closest('[lang="hi"]')) }))`);
      check(`${sizeName}: an English / हिंदी switch, English chosen, Hindi label marked lang="hi"`, segs?.length === 2 && segs[0].text === 'English' && segs[0].checked === 'true' && segs[1].text === 'हिंदी' && segs[1].hi, segs);
      await evaluate(`(() => { if (!window.axe) { const s = document.createElement('script'); s.textContent = ${JSON.stringify(AXE)}; document.head.appendChild(s); } return true; })()`);
      const axe = await evaluate(`axe.run(document.querySelector(${JSON.stringify(DIALOG)}), { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'] } }).then((r) => r.violations.map((v) => v.id + ': ' + v.nodes.map((n) => n.target).join(' ')))`);
      check(`${sizeName}: axe finds nothing wrong in the overlay`, Array.isArray(axe) && axe.length === 0, axe);

      const starts = await evaluate('window.__fakeSpeechStarts');
      await click(`${DIALOG} [role="radio"]:last-child`);
      await sleep(200);
      check(`${sizeName}: switching to हिंदी listens again in hi-IN`, await evaluate(`window.__fakeSpeechLang === 'hi-IN' && window.__fakeSpeechStarts === ${starts + 1} && window.__fakeSpeechAborts >= 1`), await evaluate('[window.__fakeSpeechLang, window.__fakeSpeechStarts, window.__fakeSpeechAborts]'));
      await key('Escape');
      await sleep(200);
      check(`${sizeName}: Escape cancels listening`, !(await dialog()) && (await evaluate('window.__fakeSpeechAborts')) >= 2);

      await open(`/page/${CALM_PAGE}`, size);
      await speak({ hold: true });
      await tapMic();
      check(`${sizeName}: हिंदी is still chosen after a reload, and it listens in hi-IN`, await evaluate(`document.querySelector('${DIALOG} [role="radio"][aria-checked="true"]')?.textContent === 'हिंदी' && window.__fakeSpeechLang === 'hi-IN'`));
      // Hindi speech always fills the search box (path B), even a single word.
      await speak({ transcripts: ['प्यार'] });
      await click(`${DIALOG} [role="radio"]:last-child`); // already chosen: no restart
      await evaluate(`document.querySelector('.ui-scrim').dispatchEvent(new MouseEvent('mousedown', { bubbles: true })); true`);
      await sleep(200);
      check(`${sizeName}: tapping outside the overlay cancels`, !(await dialog()));
      await tapMic();
      await waitFor(`document.querySelector('#lookup-input').value === 'प्यार'`);
      check(`${sizeName}: Hindi speech fills the search box`, await evaluate(`document.querySelector('#lookup-input').value === 'प्यार'`), await evaluate(`document.querySelector('#lookup-input').value`));
      await speak({ hold: true });
      await tapMic();
      await click(`${DIALOG} [role="radio"]:first-child`);
      await key('Escape');
      await sleep(200);
      check(`${sizeName}: switching back to English is remembered`, await evaluate(`localStorage.getItem('panna-voice-lang') === 'en'`));

      // Path B: a sentence fills the box, and only the 3 closest matches show.
      await speak({ transcripts: ['so many words here', 'so many word here'] });
      await tapMic();
      await waitFor(`Boolean(document.querySelector('#lookup-panel'))`, 40);
      await sleep(400);
      const value = await evaluate(`document.querySelector('#lookup-input').value`);
      let list = await results();
      check(`${sizeName}: a heard sentence fills the search box`, value === 'so many words here', value);
      const wantFocus = size.mobile ? 'voice-btn' : 'lookup-input';
      await waitFor(`document.activeElement?.id === '${wantFocus}'`, 20);
      const focused = await evaluate('document.activeElement?.id');
      check(`${sizeName}: after hearing, focus is ${size.mobile ? 'on the mic (no keyboard)' : 'in the search box'}`, focused === (size.mobile ? 'voice-btn' : 'lookup-input'), focused);
      check(`${sizeName}: it shows at most 3 options`, list && list.length <= 3, list);
      check(`${sizeName}: the overlay closed after hearing`, !(await dialog()));
      await evaluate(`document.querySelector('.lookup-clear')?.click(); document.activeElement.blur(); true`);
      await key('Escape');
      await speak({ transcripts: [MANY] });
      await tapMic();
      await waitFor(`document.querySelectorAll('#lookup-panel [role="option"]').length > 0`, 40);
      await sleep(400);
      list = await results();
      check(`${sizeName}: heard words with many matches show only the first 3, best first (typed, the search finds ${typed.length})`,
        typed.length > 3 && JSON.stringify(list) === JSON.stringify(typed.slice(0, 3)), { list, typed: typed.slice(0, 4) });
      check(`${sizeName}: the 3 are one flat list, without group headings`, await evaluate(`document.querySelectorAll('#lookup-panel .lookup-group').length === 0`));
      // Typing the same words is not voice: the full grouped list comes back.
      await evaluate(`(() => { const input = document.querySelector('#lookup-input'); input.focus(); const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set; set.call(input, ${JSON.stringify(MANY + ' ')}); input.dispatchEvent(new Event('input', { bubbles: true })); set.call(input, ${JSON.stringify(MANY)}); input.dispatchEvent(new Event('input', { bubbles: true })); return true; })()`);
      await sleep(900);
      list = await results();
      check(`${sizeName}: the same words typed show the full list`, list && list.length > 3, list);
      await evaluate(`document.querySelector('.lookup-clear')?.click(); document.activeElement.blur(); true`);
      await key('Escape');

      // Path A: one heard book word opens its card, with a "Heard …" strip offering other words it could have been.
      await speak({ transcripts: ['ceremonies', 'serenities'] });
      await tapMic();
      await waitFor(`document.querySelector('#word-sheet-title')?.textContent === 'Ceremony'`, 40);
      await sleep(200);
      check(`${sizeName}: one heard book word opens its card (ceremonies → Ceremony)`, await evaluate(`document.querySelector('#word-sheet-title')?.textContent === 'Ceremony'`), await evaluate(`document.querySelector('#word-sheet-title')?.textContent`));
      let s = await strip();
      check(`${sizeName}: the card starts with a "Heard ceremonies" status strip`, s?.role === 'status' && s.first && s.text.startsWith('Heard ceremonies') && s.italic === 'ceremonies', s);
      check(`${sizeName}: it offers a heard alternate that is a book word, then the closest spelling`, s?.text === 'Heard ceremonies · Did you mean serenity, ceremonial?' && JSON.stringify(s.buttons.map((b) => b.text)) === '["serenity","ceremonial"]', s);
      if (size.mobile) check(`${sizeName}: the strip's buttons are 44px targets`, s?.buttons.every((b) => b.h >= 43.5), s?.buttons);
      check(`${sizeName}: the search box stays empty`, await evaluate(`document.querySelector('#lookup-input').value === ''`));
      await evaluate(`(() => { if (!window.axe) { const s = document.createElement('script'); s.textContent = ${JSON.stringify(AXE)}; document.head.appendChild(s); } return true; })()`);
      const sheetAxe = await evaluate(`axe.run(document.querySelector('#word-sheet'), { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'] } }).then((r) => r.violations.map((v) => v.id + ': ' + v.nodes.map((n) => n.target).join(' ')))`);
      check(`${sizeName}: axe finds nothing wrong in the card with its strip`, Array.isArray(sheetAxe) && sheetAxe.length === 0, sheetAxe);
      await evaluate(`document.querySelector('#word-heard button').click(); true`);
      await waitFor(`document.querySelector('#word-sheet-title')?.textContent === 'serenity'`, 40);
      s = await strip();
      check(`${sizeName}: tapping an alternate swaps the card, and the strip stays`, await evaluate(`document.querySelector('#word-sheet-title')?.textContent === 'serenity'`) && s?.text.startsWith('Heard ceremonies'), { title: await evaluate(`document.querySelector('#word-sheet-title')?.textContent`), s });
      await click('#close-word-drawer');
      await sleep(300);
      await evaluate(`[...document.querySelectorAll('.entry-text')].find((p) => p.textContent.startsWith('Calm') && p.style.cursor === 'pointer')?.click(); true`);
      await waitFor(`document.querySelector('#word-sheet-title')?.textContent === 'Calm'`, 40);
      check(`${sizeName}: a word opened from the book has no Heard strip`, await evaluate(`document.querySelector('#word-sheet-title')?.textContent === 'Calm' && !document.querySelector('#word-heard')`));
      await click('#close-word-drawer');
      await sleep(300);
      // Spoken twice quickly, the first look-up answering late: the second word's card wins.
      await evaluate(`(() => { const real = window.fetch; window.__realFetch = real; window.fetch = (input, init) => String(input).includes('/api/word/ceremon') ? new Promise((ok) => setTimeout(ok, 900)).then(() => real(input, init)) : real(input, init); return true; })()`);
      await speak({ transcripts: ['ceremonies'] });
      await tapMic();
      await sleep(250);
      await speak({ transcripts: ['calm'] });
      await tapMic();
      await sleep(1600);
      const raced = await evaluate(`({ title: document.querySelector('#word-sheet-title')?.textContent, heard: document.querySelector('#word-heard i')?.textContent })`);
      check(`${sizeName}: a slow first look-up does not replace the word spoken after it`, raced.title === 'Calm' && raced.heard === 'calm', raced);
      await evaluate(`window.fetch = window.__realFetch; true`);
      await click('#close-word-drawer');
      await sleep(300);
      // A heard word that isn't in the book: it goes into the search box (path B).
      await speak({ transcripts: ['zzxqvw'] });
      await tapMic();
      await waitFor(`document.querySelector('#lookup-input').value === 'zzxqvw'`, 40);
      await sleep(300);
      await waitFor(`document.activeElement?.id === '${size.mobile ? 'voice-btn' : 'lookup-input'}'`, 20);
      const missed = await evaluate(`({ value: document.querySelector('#lookup-input').value, sheet: Boolean(document.querySelector('#word-sheet')), focus: document.activeElement?.id })`);
      check(`${sizeName}: a heard word not in the book fills the search box, no card`, missed.value === 'zzxqvw' && !missed.sheet, missed);
      check(`${sizeName}: then focus is ${size.mobile ? 'on the mic (no keyboard)' : 'in the search box'}`, missed.focus === (size.mobile ? 'voice-btn' : 'lookup-input'), missed);
      await evaluate(`document.querySelector('.lookup-clear')?.click(); document.activeElement.blur(); true`);
      await key('Escape');

      // Launches: the "Speak a word" shortcut, the Review shortcut, and the share target.
      await open('/?voice=1', size);
      await waitFor(`Boolean(document.querySelector(${JSON.stringify(DIALOG)}))`, 40);
      d = await dialog();
      const launched = await evaluate(`({ lang: window.__fakeSpeechLang, address: location.pathname + location.search, orb: Boolean(document.querySelector('${DIALOG} .voice-orb--ready')) })`);
      check(`${sizeName}: /?voice=1 opens voice search with the big mic, not listening yet`, Boolean(d) && launched.orb && launched.lang === undefined, { d, launched });
      check(`${sizeName}: the launch address becomes /`, launched.address === '/', launched);
      await click(`${DIALOG} .voice-orb--ready`);
      await sleep(200);
      check(`${sizeName}: tapping the big mic starts listening`, await evaluate(`window.__fakeSpeechLang === 'en-IN'`), await evaluate('window.__fakeSpeechLang'));
      await key('Escape');
      await sleep(200);
      await open('/?open=review', size);
      check(`${sizeName}: /?open=review shows Review, at /`, await waitFor(`Boolean(document.querySelector('#review-screen')) && location.search === ''`, 40));
      await open('/?share_text=calm', size);
      check(`${sizeName}: sharing one book word opens its card`, await waitFor(`document.querySelector('#word-sheet-title')?.textContent === 'Calm'`, 40) && (await evaluate(`!document.querySelector('#word-heard') && location.search === ''`)));
      await open('/?share_text=zzxqvw', size);
      check(`${sizeName}: sharing a word not in the book puts it in the search box`, await waitFor(`document.querySelector('#lookup-input').value === 'zzxqvw' && !document.querySelector('#word-sheet')`, 40));
      await open('/?share_url=https%3A%2F%2Fx.com', size);
      const NOTE = `[...document.querySelectorAll('#share-note')].some((n) => n.textContent === 'Share a word or sentence, not a link')`;
      check(`${sizeName}: sharing only a link says to share a word or sentence`, await waitFor(NOTE, 40) && (await evaluate(`document.querySelector('#lookup-input').value === ''`)));
      await evaluate(`document.querySelector('#lookup-input').focus(); true`);
      await key('a', 'KeyA', 'a');
      await sleep(200);
      check(`${sizeName}: the note goes at the next keystroke`, await evaluate(`!document.querySelector('#share-note')`));

      // The sentence sheet: a shared sentence on a paper card, its rarest book word chosen, with the meaning below.
      const SENTENCE = "The government's plan deepened and obfuscated the facts.";
      const SHEET = '#sentence-sheet';
      const sentence = () => evaluate(`(() => { const s = document.querySelector('${SHEET}'); if (!s) return null; const card = s.querySelector('.sentence-card');
        const title = s.querySelector('#sentence-entry-title'); const hi = s.querySelector('.sentence-entry .word-hi'); const save = s.querySelector('#sentence-save-btn');
        return { title: s.querySelector('.ui-sheet-title')?.textContent, card: card?.innerText, whiteSpace: card && getComputedStyle(card).whiteSpace,
          words: [...s.querySelectorAll('button.sentence-word')].map((b) => ({ text: b.textContent, pressed: b.getAttribute('aria-pressed'), cls: b.className, h: b.getBoundingClientRect().height })),
          heading: title?.textContent, headingTag: title?.tagName, hi: hi?.textContent, hiLang: hi?.getAttribute('lang'),
          def: s.querySelector('.sentence-entry .word-def')?.textContent, save: save?.textContent, savePressed: save?.getAttribute('aria-pressed'), text: s.innerText }; })()`);
      const openSentence = async (text, selector = 'button.sentence-word') => {
        await open(`/?share_text=${encodeURIComponent(text)}`, size);
        await waitFor(`Boolean(document.querySelector('${SHEET} ${selector}'))`, 40);
        await sleep(200);
        return sentence();
      };
      let sv = await openSentence(SENTENCE);
      check(`${sizeName}: a shared sentence opens the sheet "Words in this sentence"`, sv?.title === 'Words in this sentence', sv);
      check(`${sizeName}: the card holds the sentence as shared`, sv?.card?.replace(/\s+/g, ' ').trim() === SENTENCE, sv?.card);
      check(`${sizeName}: the card keeps line breaks (white-space: pre-line)`, sv?.whiteSpace === 'pre-line', sv?.whiteSpace);
      const pressed = sv?.words.filter((w) => w.pressed === 'true') ?? [];
      check(`${sizeName}: the rarest word, obfuscated, is pressed and its entry shown`, pressed.length === 1 && pressed[0].text === 'obfuscated' && pressed[0].cls.includes('sentence-word--on') && sv.heading === 'obfuscate', { pressed, heading: sv?.heading });
      check(`${sizeName}: the entry has a heading, its Hindi (lang="hi") and its definition`, /^H[2-4]$/.test(sv?.headingTag ?? '') && Boolean(sv.hi) && sv.hiLang === 'hi' && Boolean(sv.def), sv);
      const thes = sv?.words.filter((w) => w.text.toLowerCase() === 'the') ?? [];
      check(`${sizeName}: obfuscated has the dotted underline and "the" doesn't`, pressed[0]?.cls.includes('sentence-word--uncommon') && thes.length === 2 && thes.every((w) => !w.cls.includes('sentence-word--uncommon')), sv?.words);
      check(`${sizeName}: government's is a button; the full stop and spaces are not`, sv?.words.some((w) => w.text === "government's") && sv.words.every((w) => /^[A-Za-z']+$/.test(w.text)), sv?.words.map((w) => w.text));
      check(`${sizeName}: Save shows "Save word"`, sv?.save === 'Save word' && sv.savePressed === 'false', sv?.save);
      check(`${sizeName}: the launch address becomes / for a sentence too`, await evaluate(`location.search === ''`));
      if (size.mobile) check(`${sizeName}: every word in the sentence is a 44px target`, sv?.words.every((w) => w.h >= 43.5), sv?.words.map((w) => [w.text, w.h]));
      await evaluate(`(() => { if (!window.axe) { const s = document.createElement('script'); s.textContent = ${JSON.stringify(AXE)}; document.head.appendChild(s); } return true; })()`);
      const sentenceAxe = await evaluate(`axe.run(document.querySelector('${SHEET}'), { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'] } }).then((r) => r.violations.map((v) => v.id + ': ' + v.nodes.map((n) => n.target).join(' ')))`);
      check(`${sizeName}: axe finds nothing wrong in the sentence sheet`, Array.isArray(sentenceAxe) && sentenceAxe.length === 0, sentenceAxe);
      check(`${sizeName}: every Hindi text in the sentence sheet is marked lang="hi"`, await evaluate(`(() => { const d = document.querySelector('${SHEET}'); const w = document.createTreeWalker(d, NodeFilter.SHOW_TEXT); let n; while ((n = w.nextNode())) { if (/[\\u0900-\\u097F]/.test(n.textContent) && !n.parentElement.closest('[lang="hi"]')) return false; } return true; })()`));
      await sleep(300);
      const shot = await send('Page.captureScreenshot', { format: 'png' });
      fs.writeFileSync(path.join(process.cwd(), 'scratch', `sentence-${sizeName}.png`), Buffer.from(shot.data, 'base64'));
      // Tapping another word shows it at once, without asking the server again.
      await evaluate(`window.__fetches = 0; window.__plainFetch = window.fetch; window.fetch = (...a) => { window.__fetches++; return window.__plainFetch(...a); }; true`);
      await evaluate(`[...document.querySelectorAll('${SHEET} button.sentence-word')].find((b) => b.textContent === "government's").click(); true`);
      await waitFor(`document.querySelector('#sentence-entry-title')?.textContent === 'government'`, 20);
      sv = await sentence();
      check(`${sizeName}: tapping government's shows government, and only it is pressed`, sv?.heading === 'government' && JSON.stringify(sv.words.filter((w) => w.pressed === 'true').map((w) => w.text)) === `["government's"]`, sv);
      check(`${sizeName}: switching words fetches nothing`, (await evaluate('window.__fetches')) === 0, await evaluate('window.__fetches'));
      await evaluate(`window.fetch = window.__plainFetch; true`);
      // Save word works as in the word card, and the word is in Saved afterwards.
      await click('#sentence-save-btn');
      await sleep(200);
      sv = await sentence();
      check(`${sizeName}: Save word toggles to Saved`, sv?.save === 'Saved' && sv.savePressed === 'true', sv?.save);
      await click('#close-sentence-sheet');
      await sleep(300);
      check(`${sizeName}: the close button closes the sentence sheet`, !(await sentence()));
      await evaluate(`document.querySelector(${JSON.stringify(size.mobile ? '#nav-saved-btn' : '#open-bookmarks-btn')}).click(); true`);
      await waitFor(`Boolean(document.querySelector('#saved-screen'))`, 30);
      const savedRows = await evaluate(`[...document.querySelectorAll('#saved-screen .saved-hw')].map((e) => e.textContent)`);
      check(`${sizeName}: the saved word is in the Saved list`, savedRows?.includes('government'), savedRows);
      // "Open the full card": this sheet closes and the word sheet opens on the word.
      await openSentence(SENTENCE);
      await click('#sentence-open-card');
      await waitFor(`document.querySelector('#word-sheet-title')?.textContent === 'obfuscate'`, 30);
      check(`${sizeName}: "Open the full card" closes the sentence sheet and opens the word sheet`, await evaluate(`!document.querySelector('${SHEET}') && document.querySelector('#word-sheet-title')?.textContent === 'obfuscate'`),
        await evaluate(`({ sheet: Boolean(document.querySelector('${SHEET}')), title: document.querySelector('#word-sheet-title')?.textContent })`));
      await click('#close-word-drawer');
      await sleep(300);
      // Names and words not in the book are plain text.
      sv = await openSentence('Ram met Zxqv', '.sentence-card');
      check(`${sizeName}: Zxqv is plain text, not a button`, Boolean(sv) && !sv.words.some((w) => w.text === 'Zxqv') && sv.card.includes('Zxqv'), sv);
      // Line breaks (WhatsApp) survive on the card.
      sv = await openSentence('calm plan\ndeepened facts');
      check(`${sizeName}: a line break in the shared text shows as a new line`, sv?.card?.trim() === 'calm plan\ndeepened facts', sv?.card);
      // Long text: cut to 40 words, ending with an ellipsis.
      sv = await openSentence(Array(45).fill('calm').join(' '));
      check(`${sizeName}: a long text shows its first 40 words and ends with …`, sv?.words.length === 40 && sv.card.trim().endsWith('…'), sv && { n: sv.words.length, end: sv.card.slice(-12) });
      // No book words at all: the plain sentence, a note, and a Search button for the first word.
      sv = await openSentence('Zxqv Qwrtz', '#sentence-search-btn');
      check(`${sizeName}: with no book words it says so, and the sentence is plain`, sv?.words.length === 0 && sv.card.trim() === 'Zxqv Qwrtz' && sv.text.includes('None of these words are in Panna yet.'), sv);
      await click('#sentence-search-btn');
      await waitFor(`document.querySelector('#lookup-input').value === 'Zxqv'`, 30);
      check(`${sizeName}: its Search button closes the sheet and puts the first word in the search box`, await evaluate(`!document.querySelector('${SHEET}') && document.querySelector('#lookup-input').value === 'Zxqv'`), await evaluate(`document.querySelector('#lookup-input').value`));
      await evaluate(`document.querySelector('.lookup-clear')?.click(); document.activeElement.blur(); true`);
      await key('Escape');
      // A reduced (offline) analysis says so in one line under the card.
      const { identifier: reduced } = await send('Page.addScriptToEvaluateOnNewDocument', { source: `(() => { const real = window.fetch; window.fetch = (input, init) => String(input).includes('/api/sentence') ? real(input, init).then((r) => r.json()).then((a) => new Response(JSON.stringify({ ...a, offline: true }), { headers: { 'content-type': 'application/json' } })) : real(input, init); })();` });
      sv = await openSentence(SENTENCE);
      check(`${sizeName}: an offline analysis notes "Connect for the full sentence view"`, sv?.text.includes('Connect for the full sentence view'), sv?.text);
      await send('Page.removeScriptToEvaluateOnNewDocument', { identifier: reduced });
      sv = await openSentence(SENTENCE);
      check(`${sizeName}: online, there is no offline note`, Boolean(sv) && !sv.text.includes('Connect for the full sentence view'), sv?.text);
      await key('Escape');
      await sleep(200);
      check(`${sizeName}: Escape closes the sentence sheet`, !(await sentence()));
      // An emoji across the 2,000-character cut must not leave half an emoji to break the look-up.
      sv = await openSentence('a '.repeat(999) + 'a😀 calm', '.sentence-card:not([aria-busy])');
      check(`${sizeName}: an emoji across the 2,000-character cut still opens the sentence sheet`, Boolean(sv) && sv.card.trim().endsWith('…') && !sv.text.includes('Connect for the full sentence view')
        && (await evaluate(`Boolean(document.querySelector('#lookup-input'))`)), sv && { end: sv.card.slice(-20), text: sv.text.slice(-80) });
      // If the picked word's entry is missing, the first word with an entry is shown instead.
      const { identifier: gap } = await send('Page.addScriptToEvaluateOnNewDocument', { source: `(() => { const real = window.fetch; window.fetch = (input, init) => String(input).includes('/api/sentence') ? real(input, init).then((r) => r.json()).then((a) => { delete a.entries[a.tokens[a.picked].headword]; return new Response(JSON.stringify(a), { headers: { 'content-type': 'application/json' } }); }) : real(input, init); })();` });
      sv = await openSentence(SENTENCE);
      check(`${sizeName}: a picked word without an entry falls back to the first word with one`, sv?.heading === 'The' && JSON.stringify(sv.words.filter((w) => w.pressed === 'true').map((w) => w.text)) === '["The"]' && !sv.words.some((w) => w.text === 'obfuscated'), sv && { heading: sv.heading, words: sv.words.map((w) => [w.text, w.pressed]) });
      await send('Page.removeScriptToEvaluateOnNewDocument', { identifier: gap });
      await open(`/page/${CALM_PAGE}`, size);

      // Errors.
      await speak({ error: 'not-allowed' });
      await tapMic();
      await sleep(300);
      d = await dialog();
      check(`${sizeName}: a blocked microphone explains how to allow it`, d?.text.includes("Microphone is blocked. Allow it for this site in your browser's settings."), d);
      check(`${sizeName}: the error has a Close button, which closes the overlay`, await click(`${DIALOG} button.voice-close`) && (await sleep(200), !(await dialog())));
      await speak({ error: 'audio-capture' });
      await tapMic();
      await sleep(300);
      d = await dialog();
      check(`${sizeName}: no microphone says voice isn't available`, d?.text.includes("Voice isn't available here"), d);
      await key('Escape');
      await sleep(200);
      await speak({ error: 'network' });
      await tapMic();
      await sleep(300);
      d = await dialog();
      check(`${sizeName}: a network error says voice needs a connection`, d?.text.includes('Voice needs a connection') && d.text.includes('आवाज़ के लिए इंटरनेट चाहिए'), d);
      await key('Escape');
      await sleep(200);
      for (const quietEnd of [{ error: 'no-speech' }, {}]) {
        await speak(quietEnd);
        await tapMic();
        await sleep(400);
        const after = await evaluate(`({ open: Boolean(document.querySelector(${JSON.stringify(DIALOG)})), focus: document.activeElement?.id })`);
        check(`${sizeName}: ${quietEnd.error ? 'no speech' : 'ending without a result'} closes quietly, focus back on the mic`, !after.open && after.focus === 'voice-btn', after);
      }

      // Reduced motion: the ring stands still.
      await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
      await speak({ hold: true });
      await tapMic();
      check(`${sizeName}: under reduced motion the ring does not pulse`, await evaluate(`(() => { const r = document.querySelector('.voice-ring'); return Boolean(r) && (getComputedStyle(r).animationName === 'none' || parseFloat(getComputedStyle(r).animationDuration) < 0.01); })()`));
      await key('Escape');
      await send('Emulation.setEmulatedMedia', { features: [] });
      await sleep(200);

      // Offline: recognition needs a connection, so the mic says so instead of listening.
      await setOffline(true);
      await speak({ transcripts: ['calm'] });
      const startsBefore = await evaluate('window.__fakeSpeechStarts');
      await tapMic();
      await sleep(300);
      d = await dialog();
      check(`${sizeName}: offline, the mic says voice needs a connection, without listening`, d?.text.includes('Voice needs a connection') && (await evaluate('window.__fakeSpeechStarts')) === startsBefore, d);
      await key('Escape');
      await setOffline(false);
      check(`${sizeName}: nothing overflows sideways`, await evaluate(`document.documentElement.scrollWidth <= innerWidth`));

      // Without speech recognition there is no mic at all.
      await send('Page.removeScriptToEvaluateOnNewDocument', { identifier: fake });
      const { identifier: none } = await send('Page.addScriptToEvaluateOnNewDocument', { source: NO_SPEECH });
      await open(`/page/${CALM_PAGE}`, size);
      await sleep(300);
      check(`${sizeName}: without speech recognition the mic is hidden`, await evaluate(`!document.querySelector('#voice-btn') && !('webkitSpeechRecognition' in window)`));
      await send('Page.removeScriptToEvaluateOnNewDocument', { identifier: none });
    }

    // iPhone: the "Look up from any app" row and study guide button show only on an iPhone with a Shortcut link.
    {
      const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';
      const LINK = 'https://www.icloud.com/shortcuts/test';
      const phone = { width: 390, height: 844, mobile: true };
      const hydrated = async (url) => {
        await send('Emulation.setDeviceMetricsOverride', { width: phone.width, height: phone.height, deviceScaleFactor: 1, mobile: true });
        await send('Page.navigate', { url: `${BASE}${url}` });
        await waitFor(`(() => { const b = document.querySelector('#menu-btn'); return Boolean(b && Object.keys(b).some((k) => k.startsWith('__reactFiber$'))); })()`, 80);
        await sleep(400);
      };
      const menuRow = async () => {
        await hydrated('/');
        await evaluate(`localStorage.setItem('panna_tours', ${JSON.stringify(JSON.stringify(quiet))}); true`);
        await hydrated('/');
        await click('#menu-btn');
        await waitFor(`Boolean(document.querySelector('#backup-btn'))`);
        return evaluate(`(() => { const a = document.querySelector('#ios-shortcut-row'); return a ? { href: a.getAttribute('href'), tag: a.tagName, text: a.innerText, after: Boolean(document.querySelector('#backup-btn')) } : null; })()`);
      };
      const guideButton = async () => {
        await hydrated('/learn');
        await waitFor(`Boolean(document.querySelector('#learn-last'))`);
        return evaluate(`[...document.querySelectorAll('#learn-last button')].filter((b) => b.textContent.trim() === 'Look up from any app').length`);
      };
      const guideTip = () => evaluate(`(() => { const t = document.querySelector('#learn-last').innerText; return t.includes('Look up words from any app with a Shortcut.') || t.includes('शॉर्टकट से किसी भी ऐप में शब्द देखें।'); })()`);

      check('default browser: no iPhone Shortcut row in the menu', (await menuRow()) === null);
      check('default browser: the study guide has neither the Shortcut tip nor its button', !(await guideTip()) && (await guideButton()) === 0);
      await send('Emulation.setUserAgentOverride', { userAgent: IPHONE });
      check('iPhone without a Shortcut link: no row in the menu', (await menuRow()) === null);
      check('iPhone without a Shortcut link: no button and no tip in the study guide', (await guideButton()) === 0 && !(await guideTip()));
      const { identifier: link } = await send('Page.addScriptToEvaluateOnNewDocument', { source: `window.__pannaIosShortcutUrl = ${JSON.stringify(LINK)};` });
      const row = await menuRow();
      check('iPhone with a Shortcut link: the row is a link to it', row?.tag === 'A' && row.href === LINK && row.text.includes('Look up from any app') && row.text.includes('Add a Shortcut to look up words from WhatsApp, Safari or Siri.'), row);
      check('iPhone with a Shortcut link: the study guide has the button and the tip', (await guideButton()) === 1 && (await guideTip()));
      check('iPhone with a Shortcut link: the Hindi tip is marked lang="hi"', await evaluate(`[...document.querySelectorAll('#learn-last [lang="hi"]')].some((e) => e.textContent.includes('शॉर्टकट से किसी भी ऐप में शब्द देखें।'))`));
      await send('Page.removeScriptToEvaluateOnNewDocument', { identifier: link });
      await send('Emulation.setUserAgentOverride', { userAgent: '' });
      await send('Page.addScriptToEvaluateOnNewDocument', { source: `window.__pannaIosShortcutUrl = ${JSON.stringify(LINK)};` });
      check('not an iPhone, even with a link: no row', (await menuRow()) === null);
      check('not an iPhone, even with a link: no tip or button in the study guide', (await guideButton()) === 0 && !(await guideTip()));
      await send('Emulation.setUserAgentOverride', { userAgent: IPHONE });
      await send('Page.addScriptToEvaluateOnNewDocument', { source: `window.__pannaIosShortcutUrl = 'javascript:alert(1)';` });
      check('iPhone with a javascript: link: no row (https only)', (await menuRow()) === null);
    }
  } finally {
    if (socket) { try { socket.send(JSON.stringify({ id: 999999, method: 'Browser.close' })); } catch {} socket.close(); }
    if (edge.pid) spawnSync('taskkill', ['/PID', String(edge.pid), '/T', '/F'], { stdio: 'ignore' });
    await sleep(500);
    try { fs.rmSync(USER_DATA, { recursive: true, force: true, maxRetries: 10, retryDelay: 250 }); } catch {}
  }
  console.log(`Reach: ${checks - failures}/${checks} checks passed.`);
  if (failures) process.exitCode = 1;
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
