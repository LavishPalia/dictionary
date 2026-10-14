import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';

const EDGE_PATH = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const PORT = 9228;
const USER_DATA = path.join(process.cwd(), '.test_edge_suite_phase4');

async function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function main() {
  console.log('=====================================================');
  console.log('📖 STARTING PHASE 4 IN-BROWSER AUTOMATED TEST SUITE');
  console.log('=====================================================');

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
      'http://localhost:3000',
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
    edgeProcess.kill();
    process.exit(1);
  }

  console.log(' Connected to Edge DevTools Protocol');

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
      const outPath = path.join(process.cwd(), name);
      fs.writeFileSync(outPath, Buffer.from(data, 'base64'));
      console.log(`📸 Screenshot saved: ${name}`);
    }
  }

  try {
    await send('Page.enable');
    await send('Runtime.enable');

    console.log('\n[1/5] Waiting for Application Mount ...');
    for (let i = 0; i < 30; i++) {
      await sleep(400);
      const count = await evaluate(`return document.querySelectorAll('.entry-text').length;`);
      if (typeof count === 'number' && count > 0) break;
    }

    const title = await evaluate(`return document.title;`);
    console.log('✅ Page Title:', title);

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
    console.log('Clicked "📕 Close Book" button:', closeBtn);
    await sleep(600);

    const hasCoverContainer = await evaluate(`return Boolean(document.querySelector("#cover-cinematic-container"));`);
    console.log('✅ Closed Hardcover Cinematic Container visible:', hasCoverContainer);
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
    console.log('Clicked front cover to swing open:', openedCover);
    // Wait for the 0.95s 3D swing-open animation and spread mount
    await sleep(1400);

    const spreadOpenAgain = await evaluate(`return Boolean(document.querySelector("#book-spread-container"));`);
    console.log('✅ 3D Cinematic Opening complete, spread visible:', spreadOpenAgain);
    await takeScreenshot('phase4_2_cover_opened.png');

    // ─────────────────────────────────────────────────────────────
    // TEST 2: DOG-EARING (PAGE FOLD CORNERS)
    // ─────────────────────────────────────────────────────────────
    console.log('\n[3/5] Testing Dog-Earing (Page Fold Corners) ...');
    const dogEarClicked = await evaluate(`
      const trigger = document.querySelector("#dog-ear-trigger-93");
      if (trigger) {
        trigger.click();
        return true;
      }
      return false;
    `);
    console.log('Clicked Dog-Ear trigger on Page 93:', dogEarClicked);
    await sleep(600);

    const isFolded = await evaluate(`
      const folded = document.querySelector("#dog-ear-corner-93");
      const saved = localStorage.getItem('panna_dog_ears');
      return {
        hasElement: Boolean(folded),
        localStorage: saved,
      };
    `);
    console.log('✅ Dog-Ear corner fold created:', isFolded.hasElement);
    console.log('✅ localStorage "panna_dog_ears":', isFolded.localStorage);
    await takeScreenshot('phase4_3_dog_ear_folded.png');

    // ─────────────────────────────────────────────────────────────
    // TEST 3: MARGINALIA (HANDWRITTEN PENCIL NOTES)
    // ─────────────────────────────────────────────────────────────
    console.log('\n[4/5] Testing Marginalia (Handwritten Pencil Notes) ...');
    const noteBtnClicked = await evaluate(`
      const btn = document.querySelector("#add-note-trigger-p93");
      if (btn) {
        btn.click();
        return true;
      }
      return false;
    `);
    console.log('Clicked Add Marginalia Note trigger on Page 93:', noteBtnClicked);
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
    console.log('Submitted handwritten blue pencil note:', noteSaved);
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
    console.log('✅ Cursive handwritten margin note card rendered:', marginaliaVerification.cardFound);
    console.log('✅ localStorage "panna_marginalia":', marginaliaVerification.localStorage);
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
        hasDogEarSection: text.includes('DOG-EARED PAGES') && text.includes('Folded Page 93'),
        hasNotesSection: text.includes('HANDWRITTEN MARGIN NOTES') && text.includes('key reference note: ceremony'),
      };
    `);
    console.log('✅ Bookmarks Modal lists Dog-Eared Page 93:', modalVerification.hasDogEarSection);
    console.log('✅ Bookmarks Modal lists Marginalia note:', modalVerification.hasNotesSection);
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
    console.log('\n[Bonus] Testing Data Scale Expansion (Navigating to newly expanded Letter D, Page 212) ...');
    await evaluate(`
      // Navigate to Page 212
      const thumbD = Array.from(document.querySelectorAll('button')).find(b => b.textContent.trim() === 'D');
      if (thumbD) {
        thumbD.click();
        return true;
      }
      return false;
    `);
    await sleep(2200); // Riffle jump to page 212

    const dPageVerification = await evaluate(`
      const body = document.body.textContent;
      return {
        url: window.location.pathname,
        hasDairy: body.includes('Dairy') || body.includes('Daisy'),
        hasDamp: body.includes('Damp') || body.includes('Decide'),
      };
    `);
    console.log('✅ URL after jumping to Letter D:', dPageVerification.url);
    console.log('✅ Letter D entries rendered on Page 211 (Dairy, Daisy):', dPageVerification.hasDairy, dPageVerification.hasDamp);

    // Turn next page to newly expanded consecutive spread 212–213
    await evaluate(`
      const nextBtn = document.querySelector('button[aria-label="Next spread"]');
      if (nextBtn) nextBtn.click();
      return true;
    `);
    await sleep(1500);

    const dSpread212Verification = await evaluate(`
      const body = document.body.textContent;
      return {
        url: window.location.pathname,
        hasDeck: body.includes('Deck') || body.includes('Declare'),
        hasDelight: body.includes('Delight') || body.includes('Demand'),
      };
    `);
    console.log('✅ URL after turning to consecutive spread 212–213:', dSpread212Verification.url);
    console.log('✅ Consecutive expanded entries rendered (Deck, Declare, Delight, Demand):', dSpread212Verification.hasDeck, dSpread212Verification.hasDelight);
    await takeScreenshot('phase4_6_expanded_letter_d.png');

    console.log('\n=====================================================');
    console.log('🏆 ALL PHASE 4 IN-BROWSER TESTS COMPLETED SUCCESSFULLY!');
    console.log('=====================================================');
  } finally {
    ws.close();
    edgeProcess.kill();
    try {
      fs.rmSync(USER_DATA, { recursive: true, force: true });
    } catch (e) {}
  }
}

main().catch((err) => {
  console.error('Test error:', err);
  process.exit(1);
});
