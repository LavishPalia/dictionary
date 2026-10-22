// Search box and results panel (redesign step 3), at desktop and phone sizes.
// Usage: node scripts/test-search-browser.mjs   (needs the app running on localhost:3000)
import { spawn, spawnSync } from 'child_process';
import fs from 'fs';
import path from 'path';

const EDGE_PATH = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const PORT = 9317;
const BASE = 'http://localhost:3000';
const USER_DATA = path.join(process.cwd(), 'scratch', `panna-search-edge-${process.pid}-${Date.now()}`);
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

    const type = async (text) => {
      await evaluate(`(() => { const input = document.querySelector('#lookup-input'); input.focus(); const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set; set.call(input, ${JSON.stringify(text)}); input.dispatchEvent(new Event('input', { bubbles: true })); return true; })()`);
      for (let i = 0; i < 20; i++) {
        await sleep(150);
        const ready = await evaluate(`(() => { const p = document.querySelector('#lookup-panel'); return Boolean(p && (p.querySelector('[role="option"]') || p.querySelector('.noentry'))); })()`);
        if (ready) break;
      }
      await sleep(150);
    };
    const panel = () => evaluate(`(() => {
      const p = document.querySelector('#lookup-panel');
      if (!p) return null;
      const r = p.getBoundingClientRect();
      return {
        groups: [...p.querySelectorAll('.lookup-group')].map((g) => g.textContent),
        options: [...p.querySelectorAll('[role="option"]')].map((o) => o.querySelector('.lookup-hw, .lookup-recent-word')?.textContent),
        marks: [...p.querySelectorAll('mark')].map((m) => m.textContent),
        text: p.innerText, left: r.left, right: r.right, bottom: r.bottom,
      };
    })()`);

    for (const [sizeName, size] of [['desktop', { width: 1440, height: 900, mobile: false }], ['phone', { width: 390, height: 844, mobile: true }]]) {
      check(`${sizeName}: app hydrates`, await open('/page/16', size));
      await evaluate(`localStorage.removeItem('panna_recent_searches'); true`);

      await type('छोड़');
      let p = await panel();
      check(`${sizeName}: Hindi search is grouped under "from Hindi meanings"`, p?.groups[0]?.includes('from Hindi meanings'), p?.groups);
      check(`${sizeName}: Hindi match is highlighted`, p?.marks.length > 0 && p.marks.every((m) => m.startsWith('छोड़')), p?.marks);

      await type('ऊंट');
      p = await panel();
      check(`${sizeName}: variant spelling ऊंट finds Camel and highlights the printed ऊँट`, p?.options[0] === 'Camel' && p.marks[0] === 'ऊँट', p);

      await type('chhod');
      p = await panel();
      check(`${sizeName}: Hinglish "chhod" is grouped as Hindi in English letters`, p?.groups.some((g) => g.includes('Hindi in English letters')), p?.groups);
      check(`${sizeName}: Hinglish "chhod" finds Abandon and Quit and highlights छोड़ना`,
        ['Abandon', 'Quit'].every((w) => p?.options.includes(w)) && p.marks.includes('छोड़ना'), p);
      await type('kitab');
      await evaluate(`(() => { document.querySelector('#lookup-panel [role="option"]').click(); return true; })()`);
      await sleep(1500);
      check(`${sizeName}: choosing a Hinglish result opens the word`, await evaluate(`location.pathname === '/word/Book'`), await evaluate('location.pathname'));

      await type('mammal');
      p = await panel();
      check(`${sizeName}: definition matches are labelled and show the definition`, p?.groups.includes('Found in English definitions') && p.text.includes('long-necked mammal'), p?.groups);

      await type('ceremo');
      p = await panel();
      check(`${sizeName}: English prefix lists Ceremony under "English words"`, p?.groups[0] === 'English words' && p.options.includes('Ceremony'), p);
      check(`${sizeName}: results panel stays inside the screen`, p && p.left >= 0 && p.right <= size.width && p.bottom <= size.height, p && { left: p.left, right: p.right, bottom: p.bottom });
      const combobox = await evaluate(`(() => { const i = document.querySelector('#lookup-input'); return { role: i.getAttribute('role'), expanded: i.getAttribute('aria-expanded'), controls: Boolean(document.getElementById(i.getAttribute('aria-controls'))) }; })()`);
      check(`${sizeName}: search box is an expanded combobox wired to its list`, combobox.role === 'combobox' && combobox.expanded === 'true' && combobox.controls, combobox);

      await key('ArrowDown');
      const activeText = await evaluate(`(() => { const id = document.querySelector('#lookup-input').getAttribute('aria-activedescendant'); return id && document.getElementById(id)?.getAttribute('aria-selected') === 'true' ? document.getElementById(id).querySelector('.lookup-hw').textContent : null; })()`);
      check(`${sizeName}: arrow keys move the highlighted result`, typeof activeText === 'string' && activeText.length > 0, activeText);
      await key('Enter', 'Enter', '\r');
      await sleep(2000);
      check(`${sizeName}: Enter opens the chosen word`, await evaluate(`location.pathname === '/word/' + encodeURIComponent(${JSON.stringify(activeText)})`), await evaluate('location.pathname'));
      check(`${sizeName}: the word is remembered as a recent search`, await evaluate(`JSON.parse(localStorage.getItem('panna_recent_searches') || '[]')[0]?.headword === ${JSON.stringify(activeText)}`));

      await evaluate(`document.querySelector('.lookup-clear').click(); true`);
      await sleep(300);
      p = await panel();
      check(`${sizeName}: clearing the box shows recent searches`, p?.groups[0]?.startsWith('Recent') && p.options[0] === activeText, p);
      await key('Escape');
      await sleep(200);
      check(`${sizeName}: Escape closes the panel`, !(await panel()));

      await type('ceremonis');
      p = await panel();
      check(`${sizeName}: typo shows "No entry" with Ceremony suggested and its Hindi meaning`,
        p?.text.includes('No entry for “ceremonis”') && p.options[0] === 'Ceremony' && p.text.includes('समारोह'), p?.text);
      check(`${sizeName}: suggestion says which form it matched`, p?.text.includes('from ceremonies'), p?.text);
      await evaluate(`[...document.querySelectorAll('#lookup-panel button')].find((b) => b.textContent.startsWith('Browse C')).click(); true`);
      await sleep(2000);
      const browsed = await evaluate(`(async () => { const meta = await (await fetch('/api/meta')).json(); return { path: location.pathname, expected: '/page/' + meta.thumb_index.C }; })()`);
      check(`${sizeName}: "Browse C" turns to the first page of C`, browsed.path === browsed.expected, browsed);

      await type('zzzzqx');
      p = await panel();
      check(`${sizeName}: unknown word explains coverage and offers another way`, p?.text.includes('Try another spelling') && p.text.includes('common words') && p.options.length === 0, p?.text);
    }
  } finally {
    if (socket) { try { socket.send(JSON.stringify({ id: 999999, method: 'Browser.close' })); } catch {} socket.close(); }
    if (edge.pid) spawnSync('taskkill', ['/PID', String(edge.pid), '/T', '/F'], { stdio: 'ignore' });
    await sleep(500);
    try { fs.rmSync(USER_DATA, { recursive: true, force: true, maxRetries: 10, retryDelay: 250 }); } catch {}
  }
  console.log(`Search: ${checks - failures}/${checks} checks passed.`);
  if (failures) process.exitCode = 1;
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
