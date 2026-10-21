import { spawn, spawnSync } from 'child_process';
import fs from 'fs';
import path from 'path';

const EDGE_PATH = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const PORT = 9228;
const BASE = 'http://localhost:3000';
// Page numbers come from the API: they change whenever the book is rebuilt.
async function api(p) {
  const res = await fetch(`${BASE}${p}`);
  if (!res.ok) throw new Error(`GET ${p} -> ${res.status}`);
  return res.json();
}
const spreadLeft = (p) => (p % 2 === 0 ? p : p - 1);
const firstHeadword = (page) => [...page.column1, ...page.column2][0].headword;
const USER_DATA = path.join(process.cwd(), '.test_edge_suite_phase4');

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
  console.log('📖 STARTING PHASE 4 IN-BROWSER AUTOMATED TEST SUITE');
  console.log('=====================================================');

  if (!(await portIsFree(PORT))) {
    console.error(`❌ DevTools port ${PORT} is already in use — a previous run is still alive.`);
    process.exit(1);
  }

  if (fs.existsSync(USER_DATA)) {
    try {
      fs.rmSync(USER_DATA, { recursive: true, force: true });
    } catch (e) {}
  }

  const ceremony = await api('/api/word/Ceremony');
  const P = ceremony.pageNumber;
  const R = spreadLeft(P) + 1; // right-hand page of the opening spread
  const meta = await api('/api/meta');
  const D = meta.thumb_index.D;
  const dFirst = firstHeadword(await api(`/api/page/${D}`));
  const dNext = spreadLeft(D) + 2;
  const dNextFirst = firstHeadword(await api(`/api/page/${dNext}`));
  console.log(`Opening at page ${P}; letter D starts on page ${D} (${dFirst}); next spread ${dNext} (${dNextFirst})`);

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
  for (let i = 0; i < 25; i++) {
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

    console.log('\n[1/5] Waiting for Application Hydration ...');
    const hydrated = await waitForHydration();
    check('app hydrated successfully', hydrated === true);

    const title = await evaluate(`return document.title;`);
    check('document title includes Panna', typeof title === 'string' && title.includes('Panna'), title);

    // ─────────────────────────────────────────────────────────────
    // TEST 1: OPENING BOOK INTRO CINEMATIC
    // ─────────────────────────────────────────────────────────────
    console.log('\n[2/5] Testing Opening Book Intro Cinematic (Close & 3D Open Swing) ...');
    const closeBtn = await evaluate(`
      const btn = document.querySelector("#cover-toggle-btn");
      if (btn) {
        btn.click();
        return true;
      }
      return false;
    `);
    check('clicked "Close Book" button', closeBtn === true);
    await sleep(600);

    const hasCoverContainer = await evaluate(`return Boolean(document.querySelector("#cover-cinematic-container"));`);
    check('Closed Hardcover Cinematic Container visible', hasCoverContainer === true);
    await takeScreenshot('phase4_1_cover_closed.png');

    // Click front cover to trigger 3D opening cinematic swing
    const openedCover = await evaluate(`
      const cover = document.querySelector("#book-front-cover");
      if (cover) {
        cover.click();
        return true;
      }
      return false;
    `);
    check('clicked front cover to swing open', openedCover === true);
    // Wait for the 0.95s 3D swing-open animation and spread mount
    await sleep(1400);

    const spreadOpenAgain = await evaluate(`return Boolean(document.querySelector("#book-spread-container"));`);
    check('3D Cinematic Opening complete, spread visible', spreadOpenAgain === true);
    await takeScreenshot('phase4_2_cover_opened.png');

    // ─────────────────────────────────────────────────────────────
    // TEST 2: DOG-EARING (PAGE FOLD CORNERS)
    // ─────────────────────────────────────────────────────────────
    console.log('\n[3/5] Testing Dog-Earing (Page Fold Corners) ...');
    const dogEarClicked = await evaluate(`
      const trigger = document.querySelector("#dog-ear-trigger-${R}");
      if (trigger) {
        trigger.click();
        return true;
      }
      return false;
    `);
    check(`clicked Dog-Ear trigger on Page ${R}`, dogEarClicked === true);
    await sleep(600);

    const isFolded = await evaluate(`
      const folded = document.querySelector("#dog-ear-corner-${R}");
      const saved = localStorage.getItem('panna_dog_ears');
      return {
        hasElement: Boolean(folded),
        localStorage: saved,
      };
    `);
    check('Dog-Ear corner fold created', isFolded?.hasElement === true);
    check(`localStorage "panna_dog_ears" includes ${R}`, typeof isFolded?.localStorage === 'string' && JSON.parse(isFolded.localStorage).includes(R), isFolded?.localStorage);
    await takeScreenshot('phase4_3_dog_ear_folded.png');

    // ─────────────────────────────────────────────────────────────
    // TEST 3: MARGINALIA (HANDWRITTEN PENCIL NOTES)
    // ─────────────────────────────────────────────────────────────
    console.log('\n[4/5] Testing Marginalia (Handwritten Pencil Notes) ...');
    const noteBtnClicked = await evaluate(`
      const btn = document.querySelector("#add-note-trigger-p${R}");
      if (btn) {
        btn.click();
        return true;
      }
      return false;
    `);
    check(`clicked Add Marginalia Note trigger on Page ${R}`, noteBtnClicked === true);
    await sleep(500);

    // Fill in pencil note text and click save
    const noteSaved = await evaluate(`
      const input = document.querySelector("#margin-note-textarea");
      const blueBtn = document.querySelector("#pencil-color-blue");
      const saveBtn = document.querySelector("#save-margin-note-btn");
      if (input && saveBtn) {
        if (blueBtn) blueBtn.click();
        const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value').set;
        nativeSetter.call(input, "key reference note: ceremony");
        input.dispatchEvent(new Event('input', { bubbles: true }));
        saveBtn.click();
        return true;
      }
      return false;
    `);
    check('submitted handwritten blue pencil note', noteSaved === true);
    await sleep(600);

    const marginaliaVerification = await evaluate(`
      const cards = Array.from(document.querySelectorAll('[id^="margin-note-"]'));
      const textMatches = cards.some(c => c.textContent.includes('key reference note: ceremony'));
      const saved = localStorage.getItem('panna_marginalia');
      return {
        cardFound: textMatches,
        localStorage: saved,
      };
    `);
    check('cursive handwritten margin note card rendered', marginaliaVerification?.cardFound === true);
    check('localStorage "panna_marginalia" saved note', typeof marginaliaVerification?.localStorage === 'string' && marginaliaVerification.localStorage.includes('key reference note'), marginaliaVerification?.localStorage);
    await takeScreenshot('phase4_4_marginalia_saved.png');

    // ─────────────────────────────────────────────────────────────
    // TEST 4: BOOKMARKS MODAL INTEGRATION
    // ─────────────────────────────────────────────────────────────
    console.log('\n[5/5] Testing Bookmarks Modal (Dog-Ears & Marginalia List) ...');
    await evaluate(`
      const btn = document.querySelector("#open-bookmarks-btn");
      if (btn) btn.click();
      return true;
    `);
    await sleep(600);

    const modalVerification = await evaluate(`
      const text = document.body.textContent;
      return {
        hasDogEarSection: text.includes('DOG-EARED PAGES') && text.includes('Folded Page ${R}'),
        hasNotesSection: text.includes('HANDWRITTEN MARGIN NOTES') && text.includes('key reference note: ceremony'),
      };
    `);
    check(`Bookmarks Modal lists Dog-Eared Page ${R}`, modalVerification?.hasDogEarSection === true);
    check('Bookmarks Modal lists Marginalia note', modalVerification?.hasNotesSection === true);
    await takeScreenshot('phase4_5_bookmarks_modal.png');

    // Close Bookmarks Modal
    await evaluate(`
      const closeBtn = document.querySelector("#close-bookmarks-btn");
      if (closeBtn) closeBtn.click();
      return true;
    `);
    await sleep(500);

    // ─────────────────────────────────────────────────────────────
    // TEST 5: DATA SCALE EXPANSION (Letter D Jump)
    // ─────────────────────────────────────────────────────────────
    console.log('\n[Bonus] Testing Data Scale Expansion (Navigating to Letter D via the thumb index) ...');
    await evaluate(`
      const thumbD = Array.from(document.querySelectorAll('button')).find(b => b.textContent.trim() === 'D');
      if (thumbD) {
        thumbD.click();
        return true;
      }
      return false;
    `);
    await sleep(2200); // Riffle jump to letter D

    const dPageVerification = await evaluate(`
      const body = document.body.textContent;
      return {
        url: window.location.pathname,
        hasFirst: body.includes(${JSON.stringify(dFirst)}),
      };
    `);
    check(`URL after jumping to Letter D is /page/${D}`, dPageVerification?.url === `/page/${D}`, dPageVerification?.url);
    check(`Letter D page ${D} rendered (${dFirst})`, dPageVerification?.hasFirst === true);

    // Turn to the following spread
    await evaluate(`
      const nextBtn = document.querySelector('button[aria-label="Next spread"]');
      if (nextBtn) nextBtn.click();
      return true;
    `);
    await sleep(1500);

    const dNextVerification = await evaluate(`
      const body = document.body.textContent;
      return {
        url: window.location.pathname,
        hasFirst: body.includes(${JSON.stringify(dNextFirst)}),
      };
    `);
    check(`URL after turning to the next spread is /page/${dNext}`, dNextVerification?.url === `/page/${dNext}`, dNextVerification?.url);
    check(`next spread rendered (${dNextFirst})`, dNextVerification?.hasFirst === true);
    await takeScreenshot('phase4_6_expanded_letter_d.png');

    console.log('\n=====================================================');
    console.log(`🏁 PHASE 4: ${checks - failures}/${checks} checks passed`);
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
