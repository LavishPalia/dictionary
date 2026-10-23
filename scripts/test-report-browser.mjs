// "Report a problem": the form in the word card, what the server saves, offline reports, and what the endpoint
// refuses, at desktop and phone sizes.
// Usage: node scripts/test-report-browser.mjs   (needs the app running on localhost:3000)
import { spawn, spawnSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import Database from 'better-sqlite3';
// The page Calm is on: tests open it to use a known entry (page numbers change when the book grows).
const book = new Database('data/dictionary.db', { readonly: true });
const CALM_PAGE = book.prepare("SELECT page_number FROM entries WHERE normalized = 'calm'").get().page_number;

const EDGE_PATH = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const PORT = 9343;
const BASE = 'http://localhost:3000';
const USER_DATA = path.join(process.cwd(), 'scratch', `panna-report-edge-${process.pid}-${Date.now()}`);
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

    // The server's reports file (run-suite.sh points the server and this test at a scratch file). This run's reports
    // carry a token in their note and are removed again at the end.
    const REPORTS = process.env.REPORTS_FILE || path.join(process.cwd(), 'data', 'reports', 'reports.jsonl');
    const TOKEN = `[panna-test-${process.pid}]`;
    const mine = () => (fs.existsSync(REPORTS) ? fs.readFileSync(REPORTS, 'utf8').split(/\r?\n/).filter((l) => l.includes(TOKEN)).map((l) => JSON.parse(l)) : []);
    const setOffline = async (offline) => {
      await send('Network.enable');
      await send('Network.emulateNetworkConditions', { offline, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });
      await sleep(300);
    };
    const click = async (selector) => {
      for (let i = 0; i < 40; i++) { if (await evaluate(`(() => { const el = document.querySelector(${JSON.stringify(selector)}); if (!el) return false; el.click(); return true; })()`)) return true; await sleep(100); }
      return false;
    };
    const openCard = async (word) => {
      await evaluate(`[...document.querySelectorAll('.entry-text')].find((e) => e.textContent.startsWith(${JSON.stringify(word)}) && e.style.cursor === 'pointer').click(); true`);
      await sleep(700);
    };
    const typeNote = (text) => evaluate(`(() => { const t = document.querySelector('#report-note'); const set = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set; set.call(t, ${JSON.stringify(text)}); t.dispatchEvent(new Event('input', { bubbles: true })); return true; })()`);
    const quiet = { seen: { start: 1, word: 1, review: 1, settings: 1 }, tips: {}, welcomeDone: true, tipsOff: true, listOpened: true };

    try {
      // A build without NEXT_PUBLIC_REPORTS=1 (the first release) hides the feature: check that instead.
      await open(`/page/${CALM_PAGE}`, { width: 1440, height: 900, mobile: false });
      const reportsOn = (await evaluate(`fetch('/api/report', { method: 'POST', body: '{}' }).then((r) => r.status)`)) !== 404;
      if (!reportsOn) {
        console.log('Reports are switched off in this build (NEXT_PUBLIC_REPORTS is not 1).');
        for (const [sizeName, size] of [['desktop', { width: 1440, height: 900, mobile: false }], ['phone', { width: 390, height: 844, mobile: true }]]) {
          await evaluate(`localStorage.clear(); localStorage.setItem('panna_tours', ${JSON.stringify(JSON.stringify(quiet))}); true`);
          check(`${sizeName}: app hydrates`, await open(`/page/${CALM_PAGE}`, size));
          await openCard('Calm');
          check(`${sizeName}: the word card opens`, await evaluate(`document.querySelector('#word-sheet-title')?.textContent === 'Calm'`));
          check(`${sizeName}: reports off: no "Report a problem" on the card`, !(await evaluate(`Boolean(document.querySelector('#report-btn'))`)));
          check(`${sizeName}: reports off: the card keeps its other links`, await evaluate(`Boolean(document.querySelector('#word-tour-btn') && document.querySelector('#see-on-page-btn'))`));
        }
        check('reports off: the endpoint is not there', (await evaluate(`fetch('/api/report', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ headword: 'Calm', issues: ['other'] }) }).then((r) => r.status)`)) === 404);
      }
      for (const [sizeName, size] of reportsOn ? [['desktop', { width: 1440, height: 900, mobile: false }], ['phone', { width: 390, height: 844, mobile: true }]] : []) {
        await setOffline(false);
        check(`${sizeName}: app hydrates`, await open(`/page/${CALM_PAGE}`, size));
        await evaluate(`localStorage.clear(); localStorage.setItem('panna_tours', ${JSON.stringify(JSON.stringify(quiet))}); true`);
        await open(`/page/${CALM_PAGE}`, size);
        const version = (await evaluate(`fetch('/api/meta').then((r) => r.json())`)).data_version;

        await openCard('Calm');
        check(`${sizeName}: every word card has "Report a problem", reviewed entries too`, await visible('#report-btn')
          && !(await evaluate(`document.querySelector('#word-sheet').innerText.includes('Machine-written')`)));
        await click('#report-btn');
        await sleep(300);
        check(`${sizeName}: the form replaces the card's body, under the word's name`, await visible('#report-form') && !(await visible('#save-word-btn'))
          && await evaluate(`document.querySelector('#word-sheet-title').textContent === 'Calm'`));
        check(`${sizeName}: focus moves to the form's heading`, await evaluate(`document.activeElement?.id === 'report-title'`));
        check(`${sizeName}: every problem has a Hindi line`, await evaluate(`[...document.querySelectorAll('.report-issue')].length === 6 && [...document.querySelectorAll('.report-issue-hi')].every((e) => e.lang === 'hi' && e.textContent.length > 3)`));
        check(`${sizeName}: Send waits until a problem is chosen`, await evaluate(`document.querySelector('#report-send-btn').disabled && document.querySelector('.report-hint') !== null`));
        check(`${sizeName}: problem checkboxes are big enough to tap`, await evaluate(`[...document.querySelectorAll('.report-issue')].every((e) => e.getBoundingClientRect().height >= 44)`));
        await click('#report-issue-hindi');
        await click('#report-issue-pos');
        await typeNote(`शांत ठीक है, पर "स्थिर" नहीं ${TOKEN}`);
        await sleep(200);
        check(`${sizeName}: choosing a problem enables Send`, await evaluate(`!document.querySelector('#report-send-btn').disabled`));
        await click('#report-send-btn');
        await sleep(1200);
        check(`${sizeName}: sending thanks the reader, in Hindi too`, (await evaluate(`document.querySelector('#report-done')?.innerText ?? ''`)).includes('has been sent')
          && await evaluate(`document.querySelector('#report-done [lang="hi"]')?.textContent.includes('धन्यवाद')`));
        check(`${sizeName}: focus moves to "Back to the word"`, await evaluate(`document.activeElement?.id === 'report-done-btn'`));
        let saved = mine().filter((r) => r.headword === 'Calm');
        const last = saved[saved.length - 1];
        check(`${sizeName}: the server saved the report with the word, problems, note and book build`, saved.length >= 1
          && last.issues.join() === 'hindi,pos' && last.note.startsWith('शांत ठीक है, पर "स्थिर" नहीं') && last.seen_in === version && last.page_number === CALM_PAGE, last);
        check(`${sizeName}: no personal data is stored`, last && !Object.keys(last).some((k) => /ip|agent|address|user/i.test(k)), last && Object.keys(last));
        await click('#report-done-btn');
        await sleep(300);
        check(`${sizeName}: back to the word, focus on "Report a problem"`, await visible('#save-word-btn') && await evaluate(`document.activeElement?.id === 'report-btn'`));
        await click('#report-btn');
        await sleep(200);
        await key('Escape');
        await sleep(400);
        await openCard('Calm');
        check(`${sizeName}: Escape closes the card; reopening shows the word, not the form`, await visible('#save-word-btn') && !(await visible('#report-form')));
        await click('#report-btn');
        await click('#report-cancel-btn');
        await sleep(200);
        check(`${sizeName}: Cancel goes back to the word`, await visible('#save-word-btn'));

        // Offline: the report waits on the device and goes when the connection is back.
        const before = mine().length;
        await setOffline(true);
        await click('#report-btn');
        await click('#report-issue-other');
        await typeNote(`offline ${TOKEN}`);
        await click('#report-send-btn');
        await sleep(800);
        check(`${sizeName}: offline, the report is kept on this device`, (await evaluate(`document.querySelector('#report-done')?.innerText ?? ''`)).includes('saved on this device')
          && await evaluate(`JSON.parse(localStorage.getItem('panna_report_queue') || '[]').length === 1`));
        await setOffline(false);
        let sent = false;
        for (let i = 0; i < 30 && !sent; i++) { await sleep(200); sent = mine().length === before + 1; }
        check(`${sizeName}: and is sent when the connection returns`, sent && await evaluate(`localStorage.getItem('panna_report_queue') === null`), mine().length - before);
        await key('Escape');
        await sleep(300);
        check(`${sizeName}: nothing overflows sideways`, await evaluate(`document.documentElement.scrollWidth <= innerWidth`));

        if (sizeName === 'desktop') {
          // The endpoint refuses what it should.
          const post = (body) => evaluate(`fetch('/api/report', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: ${JSON.stringify(typeof body === 'string' ? body : JSON.stringify(body))} }).then((r) => r.status)`);
          check('the endpoint refuses a report without a problem', await post({ headword: 'Calm', issues: [], note: TOKEN }) === 400);
          check('the endpoint refuses unknown problems', await post({ headword: 'Calm', issues: ['bogus'], note: TOKEN }) === 400);
          check('the endpoint refuses words not in Panna', await post({ headword: 'Qqqzzz', issues: ['other'], note: TOKEN }) === 404);
          check('the endpoint refuses something that is not JSON', await post('hello') === 400);
          check('the endpoint refuses an oversized request', await post({ headword: 'Calm', issues: ['other'], note: 'x'.repeat(5000) }) === 413);
          check('only POST is accepted', await evaluate(`fetch('/api/report').then((r) => r.status)`) === 405);
        }
      }
    } finally {
      // Remove this run's reports from the file.
      if (fs.existsSync(REPORTS)) {
        const keep = fs.readFileSync(REPORTS, 'utf8').split(/\r?\n/).filter((l) => l && !l.includes(TOKEN));
        fs.writeFileSync(REPORTS, keep.length ? `${keep.join('\n')}\n` : '');
      }
    }
    await evaluate(`localStorage.clear(); true`);
  } finally {
    if (socket) { try { socket.send(JSON.stringify({ id: 999999, method: 'Browser.close' })); } catch {} socket.close(); }
    if (edge.pid) spawnSync('taskkill', ['/PID', String(edge.pid), '/T', '/F'], { stdio: 'ignore' });
    await sleep(500);
    try { fs.rmSync(USER_DATA, { recursive: true, force: true, maxRetries: 10, retryDelay: 250 }); } catch {}
  }
  console.log(`Report: ${checks - failures}/${checks} checks passed.`);
  if (failures) process.exitCode = 1;
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
