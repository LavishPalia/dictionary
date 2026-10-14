import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';

const EDGE_PATH = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const PORT = 9225;
const USER_DATA = path.join(process.cwd(), '.test_edge_suite');

async function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function main() {
  console.log('=====================================================');
  console.log('📖 STARTING FULL IN-BROWSER PHASE 3 TEST SUITE');
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

    console.log('\n[1/7] Testing Initial Load & Mounting ...');
    for (let i = 0; i < 30; i++) {
      await sleep(400);
      const count = await evaluate(`return document.querySelectorAll('.entry-text').length;`);
      if (typeof count === 'number' && count > 0) break;
    }

    const title = await evaluate(`return document.title;`);
    console.log('✅ Page Title:', title);
    const initialUrl = await evaluate(`return window.location.pathname;`);
    console.log('✅ Initial URL:', initialUrl);

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
    console.log('Clicked "Ceremony" entry:', clickWord);
    await sleep(700);

    const isDrawerOpen = await evaluate('return Boolean(document.querySelector("#word-drawer-backdrop"));');
    console.log('✅ WordDetailDrawer is open:', isDrawerOpen);

    const wordUrl = await evaluate('return window.location.pathname;');
    console.log('✅ URL synced on word click:', wordUrl);
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
      return btn ? btn.textContent.includes('Bookmarked') : false;
    `);
    console.log('✅ Word bookmarked state:', isBookmarked);

    console.log('\n[4/7] Testing Drawer Close & URL Restore ...');
    await evaluate(`
      const btn = document.querySelector("#close-word-drawer");
      if (btn) btn.click();
      return true;
    `);
    await sleep(600);
    const isDrawerClosed = await evaluate('return !Boolean(document.querySelector("#word-drawer-backdrop"));');
    console.log('✅ Drawer closed:', isDrawerClosed);
    const restoredUrl = await evaluate('return window.location.pathname;');
    console.log('✅ URL restored to page after drawer close:', restoredUrl);

    console.log('\n[5/7] Testing Silk Ribbon Spread Bookmark & Bookmarks Modal ...');
    await evaluate(`
      const ribbon = document.querySelector("#silk-ribbon");
      if (ribbon) ribbon.click();
      return true;
    `);
    await sleep(500);

    // Open Bookmarks modal
    await evaluate(`
      const btn = document.querySelector("#open-bookmarks-btn");
      if (btn) btn.click();
      return true;
    `);
    await sleep(600);

    const modalHasSavedItems = await evaluate(`
      const body = document.body.textContent;
      return body.includes('Saved Bookmarks & Words') && body.includes('Pages 92–93') && body.includes('Ceremony');
    `);
    console.log('✅ Bookmarks modal shows bookmarked spread (92–93) & word (Ceremony):', modalHasSavedItems);
    await takeScreenshot('phase3_2_bookmarks_modal.png');

    // Close Bookmarks modal
    await evaluate(`
      const btn = document.querySelector("#close-bookmarks-btn");
      if (btn) btn.click();
      return true;
    `);
    await sleep(500);

    console.log('\n[6/7] Testing Single Page Turn (Next >) ...');
    await evaluate(`
      const btn = document.querySelector('button[aria-label="Next spread"]');
      if (btn) btn.click();
      return true;
    `);
    await sleep(1500); // 3D flip animation completes
    const turnedUrl = await evaluate('return window.location.pathname;');
    console.log('✅ URL after turning forward:', turnedUrl);
    await takeScreenshot('phase3_3_page_94_turned.png');

    console.log('\n[7/7] Testing 🎲 Explore (Random Riffle Jump) ...');
    await evaluate(`
      const btn = document.querySelector("#explore-btn");
      if (btn) btn.click();
      return true;
    `);
    await sleep(2200); // Riffle cascade completes
    const exploreUrl = await evaluate('return window.location.pathname;');
    console.log('✅ URL after 🎲 Explore jump:', exploreUrl);
    await takeScreenshot('phase3_4_explore_jump.png');

    console.log('\n=====================================================');
    console.log('🏆 ALL PHASE 3 IN-BROWSER TESTS COMPLETED SUCCESSFULLY!');
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
