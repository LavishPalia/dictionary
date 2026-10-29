// Renders the app icons from src/app/icon.svg with headless Edge: public/icons/*.png for the web app manifest, and
// src/app/apple-icon.png for iOS (Next links it). Run after changing the icon: node scripts/make-app-icons.mjs
//   icon-192.png, icon-512.png   the icon as drawn (rounded corners, transparent outside)
//   maskable-512.png             full-bleed red with the letter inside the central 80% safe zone (Android crops it)
//   src/app/apple-icon.png       180×180 full-bleed (iOS rounds the corners itself)
//   shortcut-*-96.png            96×96 icons for the manifest's shortcuts (Speak a word, Review)
import { spawn, spawnSync } from 'child_process';
import fs from 'fs';
import path from 'path';

const EDGE_PATH = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const PORT = 9339;
const USER_DATA = path.join(process.cwd(), 'scratch', `panna-icons-edge-${process.pid}`);
const OUT = path.join(process.cwd(), 'public', 'icons');
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const svg = fs.readFileSync(path.join(process.cwd(), 'src', 'app', 'icon.svg'), 'utf8').replace(/<!--[\s\S]*?-->/g, '');
const glyph = svg.match(/<path[\s\S]*?\/>/)[0];
// Full bleed: no rounded corners or border; the letter shrunk towards the centre to sit in the safe zone.
const fullBleed = (scale) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" fill="#5b1f19"/>
  <g transform="translate(32 32) scale(${scale}) translate(-32 -32)">${glyph}</g></svg>`;
// Icon shortcuts (long press on the app icon): a cream line glyph on the full-bleed red, small enough for Android's
// round mask. Drawn on the 24-unit grid of the app's line icons (src/components/ui/icons.tsx).
const shortcut = (glyph) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><rect width="24" height="24" fill="#5b1f19"/>
  <g transform="translate(12 12) scale(0.62) translate(-12 -12)" fill="none" stroke="#f3e6cf" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${glyph}</g></svg>`;
const ICONS = [
  { file: 'icon-192.png', size: 192, svg },
  { file: 'icon-512.png', size: 512, svg },
  { file: 'maskable-512.png', size: 512, svg: fullBleed(0.72) },
  { file: '../../src/app/apple-icon.png', size: 180, svg: fullBleed(0.86) },
  // "Speak a word": a microphone.
  { file: 'shortcut-voice-96.png', size: 96, svg: shortcut('<rect x="9" y="3.5" width="6" height="11" rx="3"/><path d="M5.5 11.5a6.5 6.5 0 0 0 13 0M12 18v2.5M9 20.5h6"/>') },
  // "Review": stacked review cards with a tick.
  { file: 'shortcut-review-96.png', size: 96, svg: shortcut('<rect x="4" y="6" width="13" height="15" rx="2"/><path d="M8 3h10a2 2 0 0 1 2 2v12"/><path d="M7.5 13.5l2.5 2.5 4-4.5"/>') },
];

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  const edge = spawn(EDGE_PATH, ['--headless=new', `--remote-debugging-port=${PORT}`, `--user-data-dir=${USER_DATA}`, '--disable-gpu', 'about:blank'], { stdio: 'ignore' });
  let socket;
  try {
    let endpoint;
    for (let i = 0; i < 40 && !endpoint; i++) {
      await sleep(250);
      try { endpoint = (await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json()).find((t) => t.type === 'page')?.webSocketDebuggerUrl; } catch {}
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
    await send('Page.enable');
    await send('Emulation.setDefaultBackgroundColorOverride', { color: { r: 0, g: 0, b: 0, a: 0 } });
    for (const icon of ICONS) {
      await send('Emulation.setDeviceMetricsOverride', { width: icon.size, height: icon.size, deviceScaleFactor: 1, mobile: false });
      const html = `<!doctype html><html><body style="margin:0;background:transparent">${icon.svg.replace('<svg ', `<svg width="${icon.size}" height="${icon.size}" style="display:block" `)}</body></html>`;
      await send('Page.navigate', { url: `data:text/html;base64,${Buffer.from(html).toString('base64')}` });
      await sleep(400);
      const shot = await send('Page.captureScreenshot', { format: 'png', clip: { x: 0, y: 0, width: icon.size, height: icon.size, scale: 1 } });
      fs.writeFileSync(path.join(OUT, icon.file), Buffer.from(shot.data, 'base64'));
      console.log(`✓ ${path.relative(process.cwd(), path.join(OUT, icon.file))}`);
    }
  } finally {
    if (socket) { try { socket.send(JSON.stringify({ id: 999999, method: 'Browser.close' })); } catch {} socket.close(); }
    if (edge.pid) spawnSync('taskkill', ['/PID', String(edge.pid), '/T', '/F'], { stdio: 'ignore' });
    await sleep(500);
    try { fs.rmSync(USER_DATA, { recursive: true, force: true, maxRetries: 10, retryDelay: 250 }); } catch {}
  }
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
