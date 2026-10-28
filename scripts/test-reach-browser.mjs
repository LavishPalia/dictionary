// Reach Panna fast: voice search in the search box (mic, listening overlay, English/Hindi, errors, offline), at
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
      check(`${sizeName}: the mic is a 44px target`, mic && mic.w >= 44 && mic.h >= 44, mic);

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

      // One English word goes to onVoiceWord; until the word card handles it (Task 5) it fills the box too.
      await speak({ transcripts: ['calm', 'come', 'Calm', 'kam lo'] });
      await tapMic();
      await waitFor(`document.querySelector('#lookup-input').value === 'calm'`);
      check(`${sizeName}: one heard English word fills the box for now`, await evaluate(`document.querySelector('#lookup-input').value === 'calm'`), await evaluate(`document.querySelector('#lookup-input').value`));
      await evaluate(`document.querySelector('.lookup-clear')?.click(); document.activeElement.blur(); true`);
      await key('Escape');

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
