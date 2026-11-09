// The bookplate in the browser: Today's one-time offer (after the first saved word, never again after Not now), the
// sheet (Save and Cancel, the 30-character limit, Hindi names, Remove), the greeting and the ⋯ row, and the share tick
// sending and taking back the name, against a fake PostHog that answers every /relay request here. Also axe (contrast
// included) on the offer, the sheet and the menu row, in Day and Evening, on desktop and phone.
// Usage: node scripts/test-bookplate-browser.mjs   (needs the app running on localhost:3000, built off Vercel)
import { spawn, spawnSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import zlib from 'zlib';

const EDGE_PATH = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const BASE = 'http://localhost:3000';
const USER_DATA = path.join(process.cwd(), 'scratch', `panna-bookplate-edge-${process.pid}-${Date.now()}`);
const AXE = fs.readFileSync(path.join(process.cwd(), 'node_modules', 'axe-core', 'axe.min.js'), 'utf8');
const DESKTOP = { width: 1440, height: 900, mobile: false };
const PHONE = { width: 390, height: 844, mobile: true };

let checks = 0;
let failures = 0;
function check(label, ok, detail) {
  checks++;
  if (ok) console.log(`✓ ${label}`);
  else { failures++; console.error(`✗ ${label}${detail !== undefined ? ` — ${JSON.stringify(detail).slice(0, 600)}` : ''}`); }
}
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** A request body as PostHog sent it: gzip, base64 form data, or plain JSON. */
function decodeBody(request) {
  let buf = request.postDataEntries?.length
    ? Buffer.concat(request.postDataEntries.map((e) => Buffer.from(e.bytes ?? '', 'base64')))
    : Buffer.from(request.postData ?? '', 'utf8');
  if (buf[0] === 0x1f && buf[1] === 0x8b) buf = zlib.gunzipSync(buf);
  let text = buf.toString('utf8');
  if (text.startsWith('data=')) text = Buffer.from(decodeURIComponent(text.slice(5).split('&')[0]), 'base64').toString('utf8');
  return text;
}
function eventsIn(text) {
  try {
    const parsed = JSON.parse(text);
    return Array.isArray(parsed) ? parsed : Array.isArray(parsed?.batch) ? parsed.batch : parsed?.event ? [parsed] : [];
  } catch {
    return [];
  }
}

async function main() {
  const edge = spawn(EDGE_PATH, ['--headless=new', '--remote-debugging-port=0', `--user-data-dir=${USER_DATA}`,
    '--disable-gpu', '--window-size=1440,900', 'about:blank'], { stdio: 'ignore' });
  let socket;
  try {
    let endpoint;
    for (let i = 0; i < 60 && !endpoint; i++) {
      await sleep(250);
      try {
        const port = fs.readFileSync(path.join(USER_DATA, 'DevToolsActivePort'), 'utf8').split(/\s+/)[0];
        endpoint = (await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()).find((t) => t.type === 'page')?.webSocketDebuggerUrl;
      } catch {}
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
    const key = async (keyName, code = keyName) => {
      await send('Input.dispatchKeyEvent', { type: 'keyDown', key: keyName, code });
      await send('Input.dispatchKeyEvent', { type: 'keyUp', key: keyName, code });
    };

    // ── The fake PostHog ──
    const requests = [];
    socket.addEventListener('message', (event) => {
      const message = JSON.parse(event.data);
      if (message.method !== 'Fetch.requestPaused') return;
      const { requestId, request } = message.params;
      let body = '';
      try { body = decodeBody(request); } catch (e) { body = `UNDECODABLE ${e.message}`; }
      requests.push({ url: request.url, body });
      send('Fetch.fulfillRequest', { requestId, responseCode: 200, responseHeaders: [{ name: 'Content-Type', value: 'application/json' }],
        body: Buffer.from('{"status":1}').toString('base64') }).catch(() => {});
    });
    await send('Fetch.enable', { patterns: [{ urlPattern: '*/relay*' }] });
    const events = () => requests.flatMap((r) => eventsIn(r.body));
    const sets = (from = 0) => events().slice(from).map((e) => e.$set ?? e.properties?.$set).filter(Boolean);
    const waitFor = async (test, ms = 12000) => {
      for (let t = 0; t < ms; t += 200) { if (await test()) return true; await sleep(200); }
      return test();
    };

    const open = async (url, size) => {
      await send('Emulation.setDeviceMetricsOverride', { width: size.width, height: size.height, deviceScaleFactor: 1, mobile: size.mobile });
      await send('Page.navigate', { url: `${BASE}${url}` });
      for (let i = 0; i < 60; i++) {
        await sleep(250);
        try {
          if (await evaluate(`(() => { const el = document.querySelector('#lookup-input'); return Boolean(el && Object.keys(el).some((k) => k.startsWith('__reactFiber$'))); })()`)) {
            await sleep(400); // the effects that read storage
            return true;
          }
        } catch {}
      }
      return false;
    };
    const exists = (sel) => evaluate(`Boolean(document.querySelector(${JSON.stringify(sel)}))`);
    const click = (sel) => evaluate(`(() => { const el = document.querySelector(${JSON.stringify(sel)}); if (!el) return false; el.click(); return true; })()`);
    const text = (sel) => evaluate(`document.querySelector(${JSON.stringify(sel)})?.textContent ?? null`);
    const chipLabel = () => evaluate(`document.querySelector('#bookplate-btn')?.getAttribute('aria-label') ?? null`);
    const settings = () => evaluate(`JSON.parse(localStorage.getItem('panna_settings') || '{}')`);
    const setSettings = (change) => evaluate(`(() => { const s = JSON.parse(localStorage.getItem('panna_settings') || '{}'); const c = ${JSON.stringify(change)}; for (const [k, v] of Object.entries(c)) { if (v === null) delete s[k]; else s[k] = v; } localStorage.setItem('panna_settings', JSON.stringify(s)); return true; })()`);
    const typeName = (value) => evaluate(`(() => { const input = document.querySelector('#bookplate-name'); input.focus(); const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set; set.call(input, ${JSON.stringify(value)}); input.dispatchEvent(new Event('input', { bubbles: true })); return input.value; })()`);
    const nameValue = () => evaluate(`document.querySelector('#bookplate-name')?.value`);
    const openSheetFromMenu = async () => { await click('#menu-btn'); await sleep(500); await click('#bookplate-btn'); await sleep(500); };
    const axe = (sel) => evaluate(`(async () => {
      if (!window.axe) { const s = document.createElement('script'); s.textContent = ${JSON.stringify(AXE)}; document.head.appendChild(s); }
      const el = document.querySelector(${JSON.stringify(sel)}); if (!el) return 'missing';
      const r = await axe.run(el, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'] } });
      return r.violations.map((v) => ({ id: v.id, nodes: v.nodes.map((n) => n.target.join(' ')).slice(0, 3) }));
    })()`);

    await send('Page.enable');
    await send('Runtime.enable');

    // ── 1. The offer: not before a saved word, not under the reader's finger, once after ──
    check('desktop: app hydrates', await open('/', DESKTOP));
    await evaluate(`localStorage.clear(); localStorage.setItem('panna_tours', JSON.stringify({ welcomeDone: true, tipsOff: true })); localStorage.setItem('panna_analytics_test', '1'); localStorage.setItem('panna_settings', JSON.stringify({ lighting: 'day' })); true`);
    await open('/', DESKTOP);
    check('no saved word: no offer on Today', !(await exists('#today-bookplate')));
    check('no plate: no greeting', !(await exists('#today-greeting')));
    check("the ⋯ menu's bookplate chip invites a plate before there is one", await (async () => { await click('#menu-btn'); await sleep(500); const t = await text('#bookplate-sub'); await key('Escape'); await sleep(400); return t === 'Your bookplate'; })());
    await waitFor(() => exists('#today-word-save'));
    await click('#today-word-save');
    await sleep(800);
    check('saving the word of the day on Today doesn\'t pop the offer up there and then', !(await exists('#today-bookplate')));
    await open('/', DESKTOP);
    check('the next time Today opens, the offer shows', await waitFor(() => exists('#today-bookplate'), 4000));
    check('…with its Hindi line', /अपना नाम/.test((await text('#today-bookplate')) ?? ''));
    await click('#bookplate-not-now');
    await sleep(300);
    check('Not now hides it', !(await exists('#today-bookplate')));
    check('…and remembers that', (await settings()).bookplateOffer === 'done');
    await open('/', DESKTOP);
    check('…so it never comes back', !(await exists('#today-bookplate')));

    // ── 2. Writing the plate from the offer ──
    await setSettings({ bookplateOffer: null });
    await open('/', DESKTOP);
    await waitFor(() => exists('#today-bookplate'), 4000);
    await waitFor(() => events().length > 0); // PostHog has loaded
    await sleep(3500);
    let mark = events().length;
    await click('#bookplate-write');
    await sleep(500);
    check('Write my name opens the sheet', await exists('#bookplate-sheet'));
    check('the share box starts unticked', await evaluate(`document.querySelector('#bookplate-share').checked === false && !document.querySelector('#bookplate-share').disabled`));
    check('Save is off with no name', await evaluate(`document.querySelector('#bookplate-save').disabled`));
    await typeName('   ');
    check('…and with only spaces', await evaluate(`document.querySelector('#bookplate-save').disabled`));
    await typeName('x'.repeat(40));
    check('a name stops at 30 characters', (await nameValue())?.length === 30, await nameValue());
    check('…and the counter says so', /30 of 30/.test((await text('#bookplate-count')) ?? ''));
    for (const [size, name] of [[DESKTOP, 'desktop'], [PHONE, 'phone']]) {
      await send('Emulation.setDeviceMetricsOverride', { width: size.width, height: size.height, deviceScaleFactor: 1, mobile: size.mobile });
      await sleep(300);
      const v = await axe('#bookplate-sheet');
      check(`${name}, Day: axe finds nothing in the sheet`, Array.isArray(v) && v.length === 0, v);
    }
    await send('Emulation.setDeviceMetricsOverride', { width: DESKTOP.width, height: DESKTOP.height, deviceScaleFactor: 1, mobile: false });
    await click('#bookplate-cancel');
    await sleep(400);
    check('Cancel closes without saving', !(await exists('#bookplate-sheet')) && !(await settings()).bookplate);
    check('…and the offer is still there', await exists('#today-bookplate'));
    await click('#bookplate-write');
    await sleep(500);
    check('the sheet opens empty again', (await nameValue()) === '');
    await typeName('  Riya  ');
    await click('#bookplate-emblem-owl');
    await sleep(200);
    check('the picked emblem shows on the plate', await evaluate(`document.querySelector('#bookplate-emblem-owl').checked`));
    await click('#bookplate-save');
    await sleep(500);
    const stored = (await settings()).bookplate;
    check('Save stores the plate, trimmed, unshared', JSON.stringify(stored) === JSON.stringify({ name: 'Riya', emblem: 'owl', share: false }), stored);
    check('the sheet closes and the offer is gone', !(await exists('#bookplate-sheet')) && !(await exists('#today-bookplate')));
    const greeting = await text('#today-greeting');
    check('Today greets the reader by name', /^Good (morning|afternoon|evening), Riya$/.test(greeting ?? ''), greeting);
    check('saving sends bookplate: true, with the nickname as the name', await waitFor(() => sets(mark).some((s) => s.bookplate === true)));
    const nick = sets().find((s) => s.nickname)?.nickname;
    check('…the name stays the nickname while unshared', sets(mark).filter((s) => 'name' in s).every((s) => s.name === nick), { nick, sets: sets(mark) });
    await sleep(3500);
    check('unshared, "Riya" is in no payload', !requests.some((r) => r.body.includes('Riya')));

    // ── 3. The ⋯ row, and the tick ──
    await click('#menu-btn'); await sleep(500);
    check("the ⋯ menu's chip shows the name, and says it isn't shared", (await text('#bookplate-sub')) === 'Riya' && (await chipLabel()) === 'Your bookplate: Riya, not shared', await chipLabel());
    for (const [size, name] of [[DESKTOP, 'desktop'], [PHONE, 'phone']]) {
      await send('Emulation.setDeviceMetricsOverride', { width: size.width, height: size.height, deviceScaleFactor: 1, mobile: size.mobile });
      await sleep(300);
      const v = await axe('#reading-menu');
      check(`${name}, Day: axe finds nothing in the menu with the bookplate chip`, Array.isArray(v) && v.length === 0, v);
    }
    await send('Emulation.setDeviceMetricsOverride', { width: DESKTOP.width, height: DESKTOP.height, deviceScaleFactor: 1, mobile: false });
    await click('#bookplate-btn'); await sleep(500);
    check('editing opens the saved plate', (await nameValue()) === 'Riya' && await exists('#bookplate-remove'));
    mark = events().length;
    await click('#bookplate-share');
    await click('#bookplate-save');
    check('ticked: the name becomes "Riya · nickname" at once', await waitFor(() => sets(mark).some((s) => s.name === `Riya · ${nick}`), 6000), sets(mark));
    check('…and the plate is stored as shared', (await settings()).bookplate?.share === true);
    await click('#menu-btn'); await sleep(500);
    check('the chip says shared', (await chipLabel()) === 'Your bookplate: Riya, shared', await chipLabel());
    await click('#bookplate-btn'); await sleep(500);
    mark = events().length;
    await click('#bookplate-share');
    await click('#bookplate-save');
    check('unticked: the name goes back to the nickname at once', await waitFor(() => sets(mark).some((s) => s.name === nick), 6000), sets(mark));

    // ── 4. Usage counts off takes the name back and greys the box ──
    await openSheetFromMenu();
    await click('#bookplate-share');
    await click('#bookplate-save');
    await waitFor(() => sets().some((s) => s.name === `Riya · ${nick}`));
    await sleep(500);
    mark = events().length;
    await click('#menu-btn'); await sleep(500);
    await click('#usage-counts-switch'); await sleep(300);
    check('switching Usage counts off sends one last update: the name back to the nickname', await waitFor(() => sets(mark).some((s) => s.name === nick), 6000), sets(mark));
    check('…and unticks the plate', (await settings()).bookplate?.share === false && (await settings()).analytics === false);
    check('…and the chip says not shared', (await chipLabel()) === 'Your bookplate: Riya, not shared', await chipLabel());
    await click('#bookplate-btn'); await sleep(500);
    check('with Usage counts off, the box is unticked and can\'t be ticked, and says why',
      await evaluate(`(() => { const b = document.querySelector('#bookplate-share'); return !b.checked && b.disabled && /Usage counts is off/.test(document.querySelector('#bookplate-share-sub').textContent); })()`));
    const offAxe = await axe('#bookplate-sheet');
    check('axe finds nothing in the sheet with the box greyed out', Array.isArray(offAxe) && offAxe.length === 0, offAxe);
    await click('#bookplate-cancel'); await sleep(300);
    let count = requests.length;
    await click('#menu-btn'); await sleep(500);
    await click('#usage-counts-switch'); await sleep(2500);
    await key('Escape'); await sleep(300);
    check('on again: the name is not shared again by itself', !requests.slice(count).some((r) => r.body.includes('Riya')) && (await settings()).bookplate?.share === false);

    // ── 5. A Hindi name, the initial, Evening, the phone, Remove ──
    await setSettings({ lighting: 'evening' });
    await open('/', PHONE);
    await openSheetFromMenu();
    await typeName('रिया');
    await click('#bookplate-emblem-initial');
    await sleep(200);
    check('the initial of a Hindi name is its first letter', (await text('.bp-medallion')) === 'र', await text('.bp-medallion'));
    const eveningSheet = await axe('#bookplate-sheet');
    check('phone, Evening: axe finds nothing in the sheet', Array.isArray(eveningSheet) && eveningSheet.length === 0, eveningSheet);
    await click('#bookplate-save'); await sleep(500);
    check('a Hindi name saves', (await settings()).bookplate?.name === 'रिया');
    check('…and greets', /, रिया$/.test((await text('#today-greeting')) ?? ''), await text('#today-greeting'));
    const eveningToday = await axe('#today-greeting');
    check('phone, Evening: axe finds nothing in the greeting', Array.isArray(eveningToday) && eveningToday.length === 0, eveningToday);
    await click('#menu-btn'); await sleep(500);
    const eveningMenu = await axe('#reading-menu');
    check('phone, Evening: axe finds nothing in the menu', Array.isArray(eveningMenu) && eveningMenu.length === 0, eveningMenu);
    await key('Escape'); await sleep(300);
    await setSettings({ bookplateOffer: null, bookplate: null });
    await open('/', PHONE);
    await waitFor(() => exists('#today-bookplate'), 4000);
    const offerAxe = await axe('#today-bookplate');
    check('phone, Evening: axe finds nothing in the offer card', Array.isArray(offerAxe) && offerAxe.length === 0, offerAxe);
    await setSettings({ lighting: 'day' });
    await open('/', DESKTOP);
    await waitFor(() => exists('#today-bookplate'), 4000);
    const dayOffer = await axe('#today-bookplate');
    check('desktop, Day: axe finds nothing in the offer card', Array.isArray(dayOffer) && dayOffer.length === 0, dayOffer);
    await click('#bookplate-write'); await sleep(500);
    await typeName('Ankit');
    await click('#bookplate-save'); await sleep(500);
    await openSheetFromMenu();
    await click('#bookplate-remove'); await sleep(500);
    check('Remove clears the plate', !(await settings()).bookplate && !(await exists('#today-greeting')) && !(await exists('#bookplate-sheet')));
    check('…and the offer doesn\'t come back', (await settings()).bookplateOffer === 'done' && !(await exists('#today-bookplate')));

    // ── 6. The notice ──
    await click('#menu-btn'); await sleep(500);
    await click('#open-credits-btn'); await sleep(500);
    const notice = await text('#usage-counts-notice');
    check('the credits notice gives the deletion address and the share rule', /panna\.dictionary@gmail\.com/.test(notice ?? '') && /Share my name/.test(notice ?? ''), notice);
  } finally {
    socket?.close();
    if (edge.pid) spawnSync('taskkill', ['/PID', String(edge.pid), '/T', '/F'], { stdio: 'ignore' });
    spawnSync('powershell', ['-NoProfile', '-Command', `Get-CimInstance Win32_Process -Filter "Name='msedge.exe'" | Where-Object { $_.CommandLine -like '*${path.basename(USER_DATA)}*' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }`], { stdio: 'ignore' });
    await sleep(500);
    try { fs.rmSync(USER_DATA, { recursive: true, force: true }); } catch {}
  }
  console.log(`\n${checks - failures}/${checks} checks passed`);
  process.exit(failures ? 1 : 0);
}

main().catch((error) => { console.error(error); process.exit(1); });
