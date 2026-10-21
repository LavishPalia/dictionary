import { spawn, spawnSync } from 'child_process';
import fs from 'fs';
import path from 'path';

const EDGE_PATH = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const PORT = 9295;
const BASE = 'http://localhost:3000';
const USER_DATA = path.join(process.cwd(), 'scratch', `panna-phase5-edge-${process.pid}-${Date.now()}`);
let checks = 0;
let failures = 0;
function check(label, ok, detail) {
  checks++;
  if (ok) console.log(`✓ ${label}`);
  else { failures++; console.error(`✗ ${label}${detail ? ` — ${JSON.stringify(detail)}` : ''}`); }
}
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function main() {
  if (fs.existsSync(USER_DATA)) throw new Error(`Refusing to reuse browser profile ${USER_DATA}`);
  try {
    if ((await fetch(`http://127.0.0.1:${PORT}/json/version`)).ok) throw new Error(`DevTools port ${PORT} is already in use`);
  } catch (error) {
    if (error instanceof Error && error.message.includes('already in use')) throw error;
  }
  const edge = spawn(EDGE_PATH, [
    '--headless=new', `--remote-debugging-port=${PORT}`, `--user-data-dir=${USER_DATA}`,
    '--disable-gpu', '--window-size=1440,900', `${BASE}/`,
  ], { stdio: 'ignore' });
  let socket;
  try {
    let endpoint;
    for (let i = 0; i < 40 && !endpoint; i++) {
      await sleep(250);
      try {
        const tabs = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
        endpoint = tabs.find((tab) => tab.type === 'page' && tab.url.includes('localhost:3000'))?.webSocketDebuggerUrl;
      } catch {}
    }
    if (!endpoint) throw new Error('Could not connect to isolated Edge DevTools session');
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
    const evaluate = async (expression) => {
      const result = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
      return result.result?.value;
    };
    await send('Runtime.enable');
    await send('Page.enable');
    let hydrated = false;
    for (let i = 0; i < 30 && !hydrated; i++) {
      try { hydrated = await evaluate(`Boolean(document.querySelector('#lookup-input') && document.querySelector('.entry-text'))`); }
      catch {}
      if (!hydrated) await sleep(500);
    }
    if (!hydrated) throw new Error('Application did not hydrate in isolated Edge');
    check('desktop app hydrates', hydrated);

    const typeQuery = async (query) => {
      const keyboardType = async () => {
        await evaluate(`(() => { const input = document.querySelector('#lookup-input'); input.focus(); input.setSelectionRange(0, input.value.length); })()`);
        await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Control', code: 'ControlLeft', modifiers: 2 });
        await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'a', code: 'KeyA', modifiers: 2 });
        await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'a', code: 'KeyA', modifiers: 2 });
        await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Control', code: 'ControlLeft' });
        await send('Input.insertText', { text: query });
      };
      await keyboardType();
      let value = await evaluate(`document.querySelector('#lookup-input').value`);
      if (value !== query) {
        // CDP can deliver the first key before React hydration/focus settles in headless Edge.
        await evaluate(`(() => { const input = document.querySelector('#lookup-input'); input.focus(); const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set; setter.call(input, ${JSON.stringify(query)}); input.dispatchEvent(new Event('input', { bubbles: true })); })()`);
        for (let i = 0; i < 10 && value !== query; i++) {
          await sleep(100);
          value = await evaluate(`document.querySelector('#lookup-input').value`);
        }
      }
      let body = '';
      for (let i = 0; i < 15; i++) {
        await sleep(200);
        body = await evaluate('document.body.innerText');
        if (body.includes(`No direct entry found for “${query}”`)) break;
      }
      return { body, value };
    };
    let { body } = await typeQuery('ceremonis');
    const typoDebug = await evaluate(`(async () => ({ value: document.querySelector('#lookup-input').value, response: await (await fetch('/api/search?q=ceremonis')).json() }))()`);
    check('desktop typo search shows recovery suggestion', body.includes('No direct entry found for “ceremonis”') && body.includes('Did you mean?') && body.includes('Ceremony'), { value: typoDebug?.value, api: typoDebug?.response?.results, didYouMean: body.includes('Did you mean?'), ceremony: body.includes('Ceremony') });
    ({ body } = await typeQuery('zzzzqx'));
    check('desktop unknown word shows useful empty state', body.includes('No direct entry found for “zzzzqx”') && body.includes('Try another spelling'));

    await evaluate(`document.querySelector('#open-credits-btn').click()`);
    body = await evaluate('document.body.innerText');
    check('Credits dialog shows sources and current review status', body.includes('Sources & acknowledgements') && body.includes('Phase 4 review') && body.includes('20 generated gloss records'));
    await evaluate(`document.querySelector('[aria-label="Close credits"]').click()`);

    await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
    await evaluate(`document.querySelector('#open-credits-btn').click()`);
    const mobile = await evaluate(`(() => { const dialog = document.querySelector('[role="dialog"]'); const r = dialog.getBoundingClientRect(); return { width: innerWidth, left: r.left, right: r.right, scrollWidth: document.documentElement.scrollWidth, hasAttribution: dialog.innerText.includes('Princeton WordNet 3.1') }; })()`);
    check('mobile Credits dialog fits viewport and retains attribution', mobile && mobile.width === 390 && mobile.left >= 0 && mobile.right <= mobile.width && mobile.scrollWidth <= mobile.width && mobile.hasAttribution, mobile);
    check('mobile lookup controls remain in the viewport', await evaluate(`document.querySelector('#lookup-input').getBoundingClientRect().width > 0`));
  } finally {
    if (socket) {
      try { socket.send(JSON.stringify({ id: 999999, method: 'Browser.close' })); } catch {}
      socket.close();
    }
    if (edge.pid) spawnSync('taskkill', ['/PID', String(edge.pid), '/T', '/F'], { stdio: 'ignore' });
    for (let i = 0; i < 40; i++) {
      try {
        const response = await fetch(`http://127.0.0.1:${PORT}/json/version`);
        if (!response.ok) break;
        await sleep(250);
      } catch { break; }
    }
    if (fs.existsSync(USER_DATA)) {
      try { fs.rmSync(USER_DATA, { recursive: true, force: true, maxRetries: 10, retryDelay: 250 }); }
      catch (error) { console.warn(`Could not remove temporary Edge profile ${USER_DATA}: ${error.message}`); }
    }
  }
  console.log(`Phase 5 browser: ${checks - failures}/${checks} checks passed.`);
  if (failures) process.exitCode = 1;
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
