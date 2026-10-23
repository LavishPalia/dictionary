import { spawn, spawnSync } from 'child_process';
import fs from 'fs';
import path from 'path';

const EDGE_PATH = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const PORT = 9225;
const BASE = 'http://localhost:3000';
// Page numbers come from the API: they change whenever the book is rebuilt.
async function api(p) {
  const res = await fetch(`${BASE}${p}`);
  if (!res.ok) throw new Error(`GET ${p} -> ${res.status}`);
  return res.json();
}
const spreadLeft = (p) => (p % 2 === 0 ? p : p - 1);
const firstHeadword = (page) => [...page.column1, ...page.column2][0].headword;
const USER_DATA = path.join(process.cwd(), '.test_edge_suite');

async function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function portIsFree(port) {
  try {
    const res = await fetch(`http://127.0.0.1:${port}/json/version`);
    return !res.ok;
  } catch (e) {
    return true; // connection refused -> port is free
  }
}

async function killTree(child, port) {
  if (child && child.pid !== undefined) {
    if (process.platform === 'win32') {
      spawnSync('taskkill', ['/PID', String(child.pid), '/T', '/F'], { stdio: 'ignore' });
    } else {
      try { process.kill(-child.pid, 'SIGKILL'); } catch (e) { try { child.kill('SIGKILL'); } catch (e2) {} }
    }
  }
  for (let i = 0; i < 20 && !(await portIsFree(port)); i++) await sleep(250);
  // Edge hands over to a browser process outside the launched tree; stop whatever still listens on the port so
  // the next run can start.
  if (process.platform === 'win32' && !(await portIsFree(port))) {
    const listening = spawnSync('netstat', ['-ano'], { encoding: 'utf8' }).stdout.split(/\r?\n/)
      .filter((l) => l.includes(`:${port} `) && l.includes('LISTENING')).map((l) => l.trim().split(/\s+/).pop());
    for (const pid of new Set(listening)) spawnSync('taskkill', ['/PID', pid, '/T', '/F'], { stdio: 'ignore' });
    for (let i = 0; i < 20 && !(await portIsFree(port)); i++) await sleep(250);
  }
}

let checks = 0;
let failures = 0;
function check(label, condition, detail) {
  checks += 1;
  if (condition) {
    console.log(`  ✅ ${label}`);
  } else {
    failures += 1;
    console.error(`  ❌ ${label}${detail !== undefined ? ` — got ${JSON.stringify(detail)}` : ''}`);
  }
}

async function main() {
  console.log('=====================================================');
  console.log('📖 STARTING FULL IN-BROWSER PHASE 3 TEST SUITE');
  console.log('=====================================================');

  if (!(await portIsFree(PORT))) {
    console.error(`❌ DevTools port ${PORT} is already in use — a previous run is still alive.`);
    process.exit(1);
  }

  const ceremony = await api('/api/word/Ceremony');
  const P = ceremony.pageNumber;
  const L = spreadLeft(P);
  const nextFirst = firstHeadword(await api(`/api/page/${L + 2}`));
  console.log(`Ceremony is on page ${P} (spread ${L}–${L + 1}); next spread starts with ${nextFirst}`);

  if (fs.existsSync(USER_DATA)) {
    try {
      fs.rmSync(USER_DATA, { recursive: true, force: true });
    } catch (e) {}
  }

  const edgeProcess = spawn(
    EDGE_PATH,
    [
      '--headless=new',
      `--remote-debugging-port=${PORT}`,
      `--user-data-dir=${USER_DATA}`,
      '--disable-gpu',
      '--window-size=1440,900',
      `${BASE}/page/${P}`,
    ],
    { stdio: 'ignore' }
  );

  let endpoint = null;
  for (let i = 0; i < 20; i++) {
    await sleep(500);
    try {
      const res = await fetch(`http://127.0.0.1:${PORT}/json/list`);
      if (res.ok) {
        const pages = await res.json();
        const mainPage = pages.find((p) => p.type === 'page' && p.url.includes('localhost:3000')) || pages[0];
        if (mainPage && mainPage.webSocketDebuggerUrl) {
          endpoint = mainPage.webSocketDebuggerUrl;
          break;
        }
      }
    } catch (e) {}
  }

  if (!endpoint) {
    console.error('❌ Could not connect to Edge DevTools port');
    await killTree(edgeProcess, PORT);
    process.exit(1);
  }

  console.log('🔗 Connected to Edge DevTools Protocol');

  const ws = new WebSocket(endpoint);
  await new Promise((resolve) => (ws.onopen = resolve));

  let callId = 1;
  const send = (method, params = {}) =>
    new Promise((resolve) => {
      const curId = callId++;
      const handler = (event) => {
        const msg = JSON.parse(event.data);
        if (msg.id === curId) {
          ws.removeEventListener('message', handler);
          resolve(msg.result);
        }
      };
      ws.addEventListener('message', handler);
      ws.send(JSON.stringify({ id: curId, method, params }));
    });

  async function evaluate(code) {
    const wrapped = `(() => {
      try {
        ${code}
      } catch (err) {
        return { __evalError: err.message };
      }
    })()`;
    const res = await send('Runtime.evaluate', {
      expression: wrapped,
      returnByValue: true,
      awaitPromise: true,
    });
    const val = res ? res.result?.value : undefined;
    if (val && typeof val === 'object' && val.__evalError) {
      console.error('Runtime eval error:', val.__evalError);
    }
    return val;
  }

  async function takeScreenshot(name) {
    const res = await send('Page.captureScreenshot', { format: 'png' });
    const data = res?.data;
    if (data) {
      const outPath = path.join(process.env.TEMP || process.cwd(), name);
      fs.writeFileSync(outPath, Buffer.from(data, 'base64'));
      console.log(`📸 Screenshot saved: ${outPath}`);
    }
  }

  async function waitForHydration(timeoutMs = 20000) {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      const ready = await evaluate(`
        const el = document.getElementById('lookup-input');
        if (!el) return false;
        const hydrated = Object.keys(el).some(k => k.startsWith('__reactFiber$'));
        return hydrated && document.querySelectorAll('.entry-text').length > 0;
      `);
      if (ready === true) return true;
      await sleep(250);
    }
    return false;
  }

  try {
    await send('Page.enable');
    await send('Runtime.enable');

    console.log('\n[1/7] Waiting for React Hydration & Initial Render ...');
    const hydrated = await waitForHydration();
    check('app hydrated successfully', hydrated === true);

    const title = await evaluate(`return document.title;`);
    check('document title includes Panna', typeof title === 'string' && title.includes('Panna'), title);
    const initialUrl = await evaluate(`return window.location.pathname;`);
    check(`initial URL is /page/${P}`, initialUrl === `/page/${P}`, initialUrl);

    console.log('\n[2/7] Testing Word Click & WordDetailDrawer ...');
    const clickWord = await evaluate(`
      const items = Array.from(document.querySelectorAll('.entry-text'));
      const ceremony = items.find(p => p.textContent.includes('Ceremony') && p.style.cursor === 'pointer');
      if (ceremony) {
        ceremony.click();
        return true;
      }
      return false;
    `);
    check('clicked "Ceremony" entry', clickWord === true);
    await sleep(700);

    const isDrawerOpen = await evaluate('return Boolean(document.querySelector("#word-drawer-backdrop"));');
    check('WordDetailDrawer is open', isDrawerOpen === true);

    // Voice lists load asynchronously; give the browser a moment before reading button state.
    await sleep(500);
    const speakButtons = await evaluate(`
      return ['en', 'hi'].map((lang) => {
        const b = document.querySelector('#speak-' + lang + '-btn');
        return b ? { lang, disabled: b.disabled, title: b.title } : null;
      });
    `);
    check('speak buttons are enabled, or disabled with a reason',
      Array.isArray(speakButtons) && speakButtons.every((b) => b && (!b.disabled || /No (Hindi|English) voice|cannot speak/.test(b.title))),
      speakButtons);
    console.log(`  ℹ️  speech: ${JSON.stringify(speakButtons)}`);

    const wordUrl = await evaluate('return window.location.pathname;');
    check('URL synced to /word/Ceremony', wordUrl === '/word/Ceremony', wordUrl);
    await takeScreenshot('phase3_1_drawer_open.png');

    console.log('\n[3/7] Testing Word Bookmarking in Drawer ...');
    await evaluate(`
      const btn = document.querySelector("#save-word-btn");
      if (btn) btn.click();
      return true;
    `);
    await sleep(500);
    const isBookmarked = await evaluate(`
      const btn = document.querySelector("#save-word-btn");
      return btn ? btn.getAttribute('aria-pressed') === 'true' && btn.textContent.includes('Saved') : false;
    `);
    check('word bookmarked state toggled', isBookmarked === true);

    console.log('\n[4/7] Testing Drawer Close & URL Restore ...');
    await evaluate(`
      const btn = document.querySelector("#close-word-drawer");
      if (btn) btn.click();
      return true;
    `);
    await sleep(600);
    const isDrawerClosed = await evaluate('return !Boolean(document.querySelector("#word-drawer-backdrop"));');
    check('WordDetailDrawer closed', isDrawerClosed === true);
    const restoredUrl = await evaluate('return window.location.pathname;');
    check('URL restored after drawer close', restoredUrl === `/page/${P}`, restoredUrl);

    console.log('\n[5/7] Testing Silk Ribbon Spread Bookmark & Bookmarks Modal ...');
    await evaluate(`
      const ribbon = document.querySelector("#silk-ribbon");
      if (ribbon) ribbon.click();
      return true;
    `);
    await sleep(500);

    // Open the Saved screen
    await evaluate(`
      const btn = document.querySelector("#open-bookmarks-btn");
      if (btn) btn.click();
      return true;
    `);
    await sleep(600);

    const savedWordsText = await evaluate(`return document.querySelector('#saved-screen')?.innerText ?? '';`);
    await evaluate(`[...document.querySelectorAll('#saved-screen [role="radio"]')].find((r) => r.textContent.startsWith('Pages')).click(); return true;`);
    await sleep(200);
    const savedPagesText = await evaluate(`return document.querySelector('#saved-screen')?.innerText ?? '';`);
    check(`Saved screen shows Ceremony and spread ${L}–${L + 1}`,
      savedWordsText.includes('Ceremony') && savedPagesText.includes(`Pages ${L}–${L + 1}`), { savedWordsText, savedPagesText });
    await takeScreenshot('phase3_2_saved_screen.png');

    // Back to the book
    await evaluate(`
      const btn = document.querySelector("#close-saved-btn");
      if (btn) btn.click();
      return true;
    `);
    await sleep(500);
    check('Back to the book leaves the Saved screen', await evaluate(`return !document.querySelector('#saved-screen');`));

    console.log('\n[6/7] Testing Single Page Turn (Next >) ...');
    await evaluate(`
      const btn = document.querySelector('button[aria-label="Next spread"]');
      if (btn) btn.click();
      return true;
    `);
    await sleep(1500); // 3D flip animation completes
    const turnedUrl = await evaluate('return window.location.pathname;');
    check(`URL after turning forward is /page/${L + 2}`, turnedUrl === `/page/${L + 2}`, turnedUrl);
    const turnedFirst = await evaluate(`
      const el = document.querySelector('.entry-text b');
      return el ? el.textContent.trim() : null;
    `);
    check(`target spread rendered ${nextFirst}`, turnedFirst === nextFirst, turnedFirst);
    await takeScreenshot('phase3_3_next_spread_turned.png');

    console.log('\n[7/7] Testing 🎲 Explore (Random Riffle Jump) ...');
    // Random page lives in the ⋯ menu.
    await evaluate(`document.querySelector("#menu-btn")?.click(); return true;`);
    await sleep(300);
    const exploreInMenu = await evaluate(`
      const btn = document.querySelector("#explore-btn");
      if (btn) btn.click();
      return Boolean(btn);
    `);
    check('⋯ menu offers "Open a random page"', exploreInMenu === true);
    await sleep(2200); // Riffle cascade completes
    const exploreUrl = await evaluate('return window.location.pathname;');
    check('URL after Explore jump changed', typeof exploreUrl === 'string' && exploreUrl !== `/page/${L + 2}`, exploreUrl);
    await takeScreenshot('phase3_4_explore_jump.png');

    console.log('\n=====================================================');
    console.log(`🏁 PHASE 3: ${checks - failures}/${checks} checks passed`);
    console.log('=====================================================');
    process.exitCode = failures > 0 ? 1 : 0;
  } finally {
    ws.close();
    await killTree(edgeProcess, PORT);
    try {
      fs.rmSync(USER_DATA, { recursive: true, force: true });
    } catch (e) {}
  }
}

main().catch(async (err) => {
  console.error('Test error:', err);
  process.exit(1);
});
