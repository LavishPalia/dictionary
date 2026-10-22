// Screenshots every main view at desktop and phone sizes, and optionally diffs them against an earlier run.
// Used during the redesign to prove a step changed only what it meant to change.
// Usage: node scripts/snap-views.mjs <outDir> [compareDir]   (needs the app running on localhost:3000)
import { spawn, spawnSync } from 'child_process';
import fs from 'fs';
import path from 'path';

const EDGE_PATH = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const PORT = 9305;
const BASE = 'http://localhost:3000';
const [outDir, compareDir] = process.argv.slice(2);
if (!outDir) { console.error('Usage: node scripts/snap-views.mjs <outDir> [compareDir]'); process.exit(1); }
const USER_DATA = path.join(process.cwd(), 'scratch', `panna-snap-edge-${process.pid}-${Date.now()}`);
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const SIZES = {
  desktop: { width: 1440, height: 900, mobile: false },
  phone: { width: 390, height: 844, mobile: true },
};

// Each view starts from a fresh navigation, so one failing view cannot leave state behind for the next.
const VIEWS = [
  { name: 'page', path: '/page/16' },
  { name: 'word', path: '/word/Ceremony' },
  { name: 'typo-search', path: '/page/16', type: 'ceremonis' },
  { name: 'hindi-search', path: '/page/16', type: 'ऊंट' },
  { name: 'menu', path: '/page/16', click: ['#menu-btn'] },
  { name: 'credits', path: '/page/16', click: ['#menu-btn', '#open-credits-btn'] },
  { name: 'saved', path: '/page/16', click: ['#nav-saved-btn'] }, // a script click works even where the tab is hidden (desktop)
];

async function main() {
  fs.mkdirSync(outDir, { recursive: true });
  const edge = spawn(EDGE_PATH, ['--headless=new', `--remote-debugging-port=${PORT}`, `--user-data-dir=${USER_DATA}`,
    '--disable-gpu', '--hide-scrollbars', '--window-size=1440,900', 'about:blank'], { stdio: 'ignore' });
  let socket;
  let differences = 0;
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
    await send('Page.enable');
    await send('Runtime.enable');

    for (const [sizeName, size] of Object.entries(SIZES)) {
      await send('Emulation.setDeviceMetricsOverride', { width: size.width, height: size.height, deviceScaleFactor: 1, mobile: size.mobile });
      await send('Emulation.setTouchEmulationEnabled', { enabled: size.mobile });
      for (const view of VIEWS) {
        await send('Page.navigate', { url: `${BASE}${view.path}` });
        let ready = false;
        for (let i = 0; i < 60 && !ready; i++) {
          await sleep(250);
          try { ready = await evaluate(`(() => { const el = document.querySelector('#lookup-input'); return Boolean(el && document.querySelector('.entry-text') && Object.keys(el).some((k) => k.startsWith('__reactFiber$'))); })()`); }
          catch {}
        }
        if (!ready) { console.error(`✗ ${sizeName}/${view.name}: app did not hydrate`); differences++; continue; }
        await evaluate('document.fonts.ready.then(() => true)');
        if (view.type) {
          await evaluate(`(() => { const input = document.querySelector('#lookup-input'); input.focus(); const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set; set.call(input, ${JSON.stringify(view.type)}); input.dispatchEvent(new Event('input', { bubbles: true })); })()`);
          await sleep(1200);
        }
        for (const selector of [view.click ?? []].flat()) {
          const clicked = await evaluate(`(() => { const b = document.querySelector(${JSON.stringify(selector)}); if (!b) return false; b.click(); return true; })()`);
          if (!clicked) console.warn(`  ! ${sizeName}/${view.name}: ${selector} not found`);
          await sleep(300);
        }
        // Let drawers, page loads and the caret settle; hide the caret so it cannot cause a diff.
        await evaluate(`(() => { const s = document.createElement('style'); s.textContent = '*{caret-color:transparent !important}'; document.head.appendChild(s); return true; })()`);
        await sleep(1500);
        const file = `${sizeName}-${view.name}.png`;
        const shot = await send('Page.captureScreenshot', { format: 'png' });
        fs.writeFileSync(path.join(outDir, file), Buffer.from(shot.data, 'base64'));
        if (!compareDir) { console.log(`• ${file}`); continue; }
        const before = path.join(compareDir, file);
        if (!fs.existsSync(before)) { console.log(`? ${file}: nothing to compare against`); continue; }
        // Diff in the page itself, which already has a PNG decoder.
        const diff = await evaluate(`(async () => {
          const load = (b64) => new Promise((ok, fail) => { const i = new Image(); i.onload = () => ok(i); i.onerror = fail; i.src = 'data:image/png;base64,' + b64; });
          const [a, b] = await Promise.all([load(${JSON.stringify(fs.readFileSync(before).toString('base64'))}), load(${JSON.stringify(shot.data)})]);
          if (a.width !== b.width || a.height !== b.height) return { sizeMismatch: true };
          const pixels = (img) => { const c = document.createElement('canvas'); c.width = img.width; c.height = img.height; const x = c.getContext('2d'); x.drawImage(img, 0, 0); return x.getImageData(0, 0, c.width, c.height).data; };
          const [pa, pb] = [pixels(a), pixels(b)];
          // Highlight image: the new screenshot faded, with changed pixels in red.
          const c = document.createElement('canvas'); c.width = b.width; c.height = b.height;
          const x = c.getContext('2d'); const out = x.createImageData(c.width, c.height);
          let changed = 0;
          for (let i = 0; i < pa.length; i += 4) {
            const hit = Math.abs(pa[i] - pb[i]) + Math.abs(pa[i + 1] - pb[i + 1]) + Math.abs(pa[i + 2] - pb[i + 2]) > 24;
            if (hit) changed++;
            out.data[i] = hit ? 255 : 255 - (255 - pb[i]) * 0.25;
            out.data[i + 1] = hit ? 0 : 255 - (255 - pb[i + 1]) * 0.25;
            out.data[i + 2] = hit ? 0 : 255 - (255 - pb[i + 2]) * 0.25;
            out.data[i + 3] = 255;
          }
          x.putImageData(out, 0, 0);
          return { changed, total: pa.length / 4, image: changed ? c.toDataURL('image/png').split(',')[1] : null };
        })()`);
        const share = diff?.total ? (100 * diff.changed / diff.total) : 100;
        const same = diff && !diff.sizeMismatch && share < 0.5;
        if (!same) differences++;
        if (diff?.image) fs.writeFileSync(path.join(outDir, file.replace('.png', '.diff.png')), Buffer.from(diff.image, 'base64'));
        console.log(`${same ? '✓' : '✗'} ${file}: ${diff?.sizeMismatch ? 'size differs' : `${share.toFixed(2)}% of pixels changed`}`);
      }
    }
  } finally {
    if (socket) { try { socket.send(JSON.stringify({ id: 999999, method: 'Browser.close' })); } catch {} socket.close(); }
    if (edge.pid) spawnSync('taskkill', ['/PID', String(edge.pid), '/T', '/F'], { stdio: 'ignore' });
    await sleep(500);
    try { fs.rmSync(USER_DATA, { recursive: true, force: true, maxRetries: 10, retryDelay: 250 }); } catch {}
  }
  if (compareDir) console.log(differences ? `${differences} view(s) differ.` : 'All views match.');
  if (differences) process.exitCode = 1;
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
