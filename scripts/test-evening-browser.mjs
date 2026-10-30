// Evening theme: the lighting mode is decided before first paint, from panna_settings and the (faked) clock; the
// menu offers Auto · Day · Evening; Auto follows the clock while the app is open, with a fade that waits for a
// page turn and is skipped under reduced motion.
// Usage: node scripts/test-evening-browser.mjs   (needs the app running on localhost:3000)
import { spawn, spawnSync } from 'child_process';
import fs from 'fs';
import path from 'path';

const EDGE_PATH = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const PORT = 9367;
const BASE = 'http://localhost:3000';
const USER_DATA = path.join(process.cwd(), 'scratch', `panna-evening-edge-${process.pid}-${Date.now()}`);
const FILES = path.join(process.cwd(), 'scratch', `panna-evening-files-${process.pid}`);
const THEME = { day: '#2b1d14', evening: '#120a06' };
const PHONE = { width: 390, height: 844, mobile: true };
const DESKTOP = { width: 1440, height: 900, mobile: false };
const QUIET_TOURS = { seen: { start: 1, word: 1, review: 1, settings: 1 }, tips: {}, welcomeDone: true, tipsOff: true, listOpened: true };
const TOUR_EN = 'Dims the page at night by itself (7 pm–6 am), or pick Day or Evening.';
const TOUR_HI = 'रात में (शाम 7 से सुबह 6) पन्ना अपने आप हल्का हो जाता है, या दिन/शाम खुद चुनें।';
let checks = 0;
let failures = 0;
function check(label, ok, detail) {
  checks++;
  if (ok) console.log(`✓ ${label}`);
  else { failures++; console.error(`✗ ${label}${detail !== undefined ? ` — ${JSON.stringify(detail)}` : ''}`); }
}
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Replaces Date with one whose "now" starts at the given local time today and keeps ticking from there.
// window.__advance(ms) moves the clock forward.
const fakeClock = (h, m = 0, s = 0) => `(() => {
  const Real = Date;
  const start = new Real(); start.setHours(${h}, ${m}, ${s}, 0);
  let offset = start.getTime() - Real.now();
  class FakeDate extends Real {
    constructor(...args) { if (args.length) super(...args); else super(Real.now() + offset); }
    static now() { return Real.now() + offset; }
  }
  globalThis.Date = FakeDate;
  window.__advance = (ms) => { offset += ms; };
})();`;
// Records the mode and the theme-color meta as they stand when the document has been parsed, and every change to
// <html>'s class (for the fade), with times.
const PROBE = `(() => {
  window.__classLog = [];
  document.addEventListener('DOMContentLoaded', () => {
    new MutationObserver(() => {
      window.__classLog.push({ t: performance.now(), fading: document.documentElement.classList.contains('light-fading'), light: document.documentElement.dataset.light });
    }).observe(document.documentElement, { attributes: true, attributeFilter: ['class', 'data-light'] });
    const meta = document.querySelector('meta[name="theme-color"]');
    window.__dcl = { light: document.documentElement.dataset.light ?? null, meta: meta ? meta.content : null,
      metas: document.querySelectorAll('meta[name="theme-color"]').length };
  });
})();`;

async function main() {
  fs.mkdirSync(FILES, { recursive: true });
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
    const consoleLines = [];
    socket.addEventListener('message', (event) => {
      const message = JSON.parse(event.data);
      if (message.method === 'Runtime.consoleAPICalled') {
        consoleLines.push(message.params.args.map((a) => a.value ?? a.description ?? '').join(' '));
      } else if (message.method === 'Runtime.exceptionThrown') {
        consoleLines.push(`exception: ${message.params.exceptionDetails?.exception?.description ?? message.params.exceptionDetails?.text}`);
      } else if (message.method === 'Log.entryAdded') {
        consoleLines.push(message.params.entry.text);
      }
    });
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
    const hydrated = async () => {
      for (let i = 0; i < 60; i++) {
        await sleep(250);
        try {
          if (await evaluate(`(() => { const el = document.querySelector('#lookup-input'); return Boolean(el && document.querySelector('.entry-text') && Object.keys(el).some((k) => k.startsWith('__reactFiber$'))); })()`)) return true;
        } catch {}
      }
      return false;
    };
    const light = () => evaluate(`document.documentElement.dataset.light ?? null`);
    const stored = () => evaluate(`(() => { try { return JSON.parse(localStorage.getItem('panna_settings')); } catch { return 'unparsable'; } })()`);
    const openMenu = async () => { await evaluate(`document.querySelector('#menu-btn').click(); true`); await sleep(400); };
    const lightingRadios = () => evaluate(`[...document.querySelectorAll('#reading-menu [role="radiogroup"][aria-label="Desk lighting"] [role="radio"]')].map((r) => ({ id: r.id, label: r.textContent, checked: r.getAttribute('aria-checked') === 'true' }))`);
    const pick = (label) => evaluate(`(() => { const r = [...document.querySelectorAll('#reading-menu [aria-label="Desk lighting"] [role="radio"]')].find((b) => b.textContent === ${JSON.stringify(label)}); if (!r) return false; r.click(); return true; })()`);
    const crossClock = (ms) => evaluate(`window.__advance(${ms}); document.dispatchEvent(new Event('visibilitychange')); true`);
    const sawFade = () => evaluate(`window.__classLog.some((e) => e.fading)`);

    await send('Page.enable');
    await send('Runtime.enable');
    await send('Log.enable');
    await send('DOM.enable');
    await send('Page.setInterceptFileChooserDialog', { enabled: true });

    let size = PHONE;
    const setSize = async (s) => { size = s; await send('Emulation.setDeviceMetricsOverride', { width: s.width, height: s.height, deviceScaleFactor: 1, mobile: s.mobile }); };
    await setSize(PHONE);

    // An origin to write localStorage on (no faked clock yet).
    await send('Page.navigate', { url: `${BASE}/page/16` });
    await sleep(1500);

    let registered = [];
    const register = async (time) => {
      for (const identifier of registered) await send('Page.removeScriptToEvaluateOnNewDocument', { identifier });
      registered = [];
      for (const source of [fakeClock(...time), PROBE]) registered.push((await send('Page.addScriptToEvaluateOnNewDocument', { source })).identifier);
    };
    const navigate = async (url = '/page/16') => {
      consoleLines.length = 0;
      await send('Page.navigate', { url: `${BASE}${url}` });
      const ok = await hydrated();
      await sleep(500);
      const state = await evaluate(`(() => ({ dcl: window.__dcl ?? null, now: document.documentElement.dataset.light ?? null,
        meta: document.querySelector('meta[name="theme-color"]')?.content ?? null, hour: new Date().getHours() }))()`);
      return { ok, ...state };
    };
    // Loads /page/16 with the given stored settings (undefined: none) at the given time ([h, m, s] or an hour).
    const load = async (settings, time, url) => {
      await evaluate(`(() => { localStorage.clear(); localStorage.setItem('panna_tours', ${JSON.stringify(JSON.stringify(QUIET_TOURS))});
        ${settings === undefined ? '' : `localStorage.setItem('panna_settings', ${JSON.stringify(settings)});`} return true; })()`);
      await register(Array.isArray(time) ? time : [time]);
      return navigate(url);
    };

    // ════════ First paint (Task 1) ════════
    const night = await load(undefined, 20);
    check('the faked clock reads 20:00', night.hour === 20, night);
    check('no settings at 20:00: the first paint is evening', night.dcl?.light === 'evening', night);
    check('no settings at 20:00: still evening after hydration', night.ok && night.now === 'evening', night);
    check('theme-color follows: #120a06 in Evening (one meta)', night.dcl?.meta === THEME.evening && night.dcl?.metas === 1 && night.meta === THEME.evening, night);
    const hydrationLines = consoleLines.filter((line) => /hydrat|Minified React error|react\.dev\/errors\/(418|423|425)/i.test(line));
    check('no hydration warning or React hydration error at 20:00', hydrationLines.length === 0, hydrationLines);
    await evaluate(`(() => { const a = document.querySelector('#nav-saved-btn'); a && a.click(); return true; })()`);
    await sleep(800);
    const afterNav = await evaluate(`({ light: document.documentElement.dataset.light, meta: document.querySelector('meta[name="theme-color"]')?.content })`);
    check('after moving around the app, the mode and meta stay', afterNav?.light === 'evening' && afterNav?.meta === THEME.evening, afterNav);

    const day = await load(undefined, 10);
    check('no settings at 10:00: day', day.dcl?.light === 'day' && day.ok && day.now === 'day', day);
    check('theme-color follows: #2b1d14 in Day', day.dcl?.meta === THEME.day && day.meta === THEME.day, day);

    const old = await load(JSON.stringify({ evening: true, speed: 'realistic', sounds: true }), 10);
    check('{evening:true} at 10:00: evening', old.dcl?.light === 'evening' && old.ok && old.now === 'evening', old);

    const pinned = await load(JSON.stringify({ lighting: 'day' }), 20);
    check("{lighting:'day'} at 20:00: day", pinned.dcl?.light === 'day' && pinned.ok && pinned.now === 'day', pinned);

    const broken = await load('{', 20);
    check('broken settings at 20:00: evening, no crash', broken.dcl?.light === 'evening' && broken.ok && broken.now === 'evening', broken);
    const errors = consoleLines.filter((line) => /^exception:/.test(line));
    check('broken settings: no uncaught exception', errors.length === 0, errors);

    // ════════ The menu (Task 2) ════════
    await load(undefined, 10);
    await openMenu();
    const radios = await lightingRadios();
    check('the menu offers Auto · Day · Evening, Auto selected by default',
      JSON.stringify(radios?.map((r) => [r.id, r.label])) === JSON.stringify([['lighting-auto', 'Auto'], ['lighting-day', 'Day'], ['lighting-evening', 'Evening']])
      && radios.find((r) => r.checked)?.label === 'Auto', radios);
    const sub = await evaluate(`[...document.querySelectorAll('#reading-menu .menu-row')].find((r) => r.querySelector('[aria-label="Desk lighting"]'))?.querySelector('.menu-sub')?.textContent`);
    check('the sub-line says when Auto dims the page', sub === 'Auto dims the page from 7 pm to 6 am', sub);
    check('an untouched Auto saves nothing', (await stored()) === null, await stored());

    // Picking Evening at 10:00: at once, no fade, saved, and kept across a reload.
    await evaluate(`window.__classLog.length = 0; true`);
    await pick('Evening');
    await sleep(60);
    const picked = { light: await light(), fade: await sawFade(), stored: await stored() };
    await sleep(400);
    picked.fadeLater = await sawFade();
    check('picking Evening at 10:00 applies at once, with no fade',
      picked.light === 'evening' && !picked.fade && !picked.fadeLater, picked);
    check("picking Evening saves lighting:'evening' (and no evening key)", picked.stored?.lighting === 'evening' && !('evening' in (picked.stored ?? {})), picked.stored);
    check('picking Evening moves the theme-color too', (await evaluate(`document.querySelector('meta[name="theme-color"]')?.content`)) === THEME.evening);
    const desk = await evaluate(`getComputedStyle(document.querySelector('.app-main')).backgroundImage`);
    check('in Evening the desk is the lamp-lit gradient (#2a1a0e → #120a06)', /rgb\(42, 26, 14\) 0%, rgb\(18, 10, 6\) 85%/.test(desk ?? '') && /50% 35%/.test(desk ?? ''), desk);
    const reloaded = await navigate();
    await openMenu();
    const afterReload = await lightingRadios();
    check('picking Evening survives a reload (first paint and menu)', reloaded.dcl?.light === 'evening' && reloaded.now === 'evening'
      && afterReload?.find((r) => r.checked)?.label === 'Evening', { reloaded, afterReload });
    await pick('Auto');
    await sleep(60);
    const backToAuto = { light: await light(), stored: await stored() };
    check('picking Auto at 10:00 returns to day', backToAuto.light === 'day' && backToAuto.stored?.lighting === 'auto', backToAuto);

    // Old settings migrate.
    await load(JSON.stringify({ evening: true, speed: 'brisk', sounds: true }), 10);
    await openMenu();
    const migrated = { radios: await lightingRadios(), stored: await stored() };
    check('old {evening:true} migrates: the menu shows Evening', migrated.radios?.find((r) => r.checked)?.label === 'Evening', migrated.radios);
    check('old {evening:true} migrates: the next save writes lighting with no evening key',
      JSON.stringify(migrated.stored) === JSON.stringify({ lighting: 'evening', speed: 'brisk', sounds: true }), migrated.stored);

    // An old backup with {evening:true}, through the real restore UI.
    const backupFile = path.join(FILES, 'old-backup.json');
    fs.writeFileSync(backupFile, JSON.stringify({ app: 'panna', format: 1, created_at: '2026-09-01T10:00:00.000Z', data_version: '',
      data: { panna_settings: { evening: true, speed: 'realistic', sounds: true }, panna_tours: QUIET_TOURS } }));
    await load(undefined, 10);
    await openMenu();
    await evaluate(`document.querySelector('#restore-btn').click(); true`);
    await sleep(300);
    const doc = await send('DOM.getDocument', { depth: -1 });
    const { nodeId } = await send('DOM.querySelector', { nodeId: doc.root.nodeId, selector: '#restore-file-input' });
    if (nodeId) await send('DOM.setFileInputFiles', { nodeId, files: [backupFile] });
    await sleep(600);
    const merged = await evaluate(`(() => { const b = document.querySelector('#restore-merge-btn'); if (!b) return false; b.click(); return true; })()`);
    await sleep(1500);
    const restoredOk = await hydrated();
    await sleep(500);
    const restored = { merged, restoredOk, dcl: await evaluate('window.__dcl'), now: await light(), stored: await stored() };
    await openMenu();
    restored.radios = (await lightingRadios())?.find((r) => r.checked)?.label;
    check('old backup with {evening:true} restores as Evening', merged && restoredOk && restored.dcl?.light === 'evening' && restored.now === 'evening'
      && restored.radios === 'Evening' && restored.stored?.lighting === 'evening', restored);

    // ════════ Auto over time ════════
    // Crossing 19:00 while open: the clock moves on 60 s and the app is shown again.
    await load(undefined, [18, 59, 30]);
    check('at 18:59:30 Auto is day', (await light()) === 'day');
    await evaluate(`window.__classLog.length = 0; true`);
    await crossClock(60_000);
    await sleep(150);
    const crossing = { light: await light(), fading: await evaluate(`document.documentElement.classList.contains('light-fading')`) };
    // About 1 s in, the desk is part-way between Day and Evening: the theme variables themselves animate.
    await sleep(850);
    const rgb = (text) => (text ?? '').match(/\d+/g)?.slice(0, 3).map(Number) ?? [];
    const mid = await evaluate(`({ center: getComputedStyle(document.documentElement).getPropertyValue('--desk-center').trim(), desk: getComputedStyle(document.querySelector('.app-main')).backgroundImage })`);
    const between = (v, a, b) => v > Math.min(a, b) && v < Math.max(a, b);
    const c = rgb(mid?.center);
    const dayC = [0x4a, 0x33, 0x22], eveC = [0x2a, 0x1a, 0x0e];
    check('about 1 s into the fade, --desk-center is strictly between Day and Evening',
      c.length === 3 && c.every((v, i) => between(v, dayC[i], eveC[i])), mid);
    const deskFirst = rgb(mid?.desk?.slice(mid.desk.indexOf('rgb')));
    check("about 1 s into the fade, .app-main's gradient starts from an in-between colour",
      deskFirst.length === 3 && deskFirst.every((v, i) => between(v, dayC[i], eveC[i])), mid);
    await sleep(1550);
    const log = await evaluate('window.__classLog');
    const on = log.find((e) => e.fading);
    const off = on && log.find((e) => e.t > on.t && !e.fading);
    crossing.after = await evaluate(`document.documentElement.classList.contains('light-fading')`);
    crossing.ms = off && on ? Math.round(off.t - on.t) : null;
    check('Auto crosses 19:00 while open: evening, with a fade', crossing.light === 'evening' && crossing.fading, crossing);
    check('the fade ends after about 2.1 s', !crossing.after && crossing.ms >= 1900 && crossing.ms <= 2700, crossing);
    const fadeCss = await evaluate(`(() => { const html = document.documentElement; html.classList.add('light-fading'); const s = getComputedStyle(html); const t = { property: s.transitionProperty, duration: s.transitionDuration }; html.classList.remove('light-fading'); return t; })()`);
    check('the fade class transitions the theme variables over 2 s on <html>',
      ['--desk-center', '--desk-edge', '--desk-glow-y', '--desk-reach'].every((v) => fadeCss?.property.split(/,\s*/).includes(v)) && /^2s(, 2s)*$/.test(fadeCss?.duration ?? ''), fadeCss);
    // And back: crossing 06:00 returns Auto to day.
    await crossClock(11 * 3600_000); // 06:00:00
    await sleep(2400);
    check('Auto crosses 06:00 back to day', (await light()) === 'day');

    // The fade waits for a page turn (desktop, normal speed).
    await setSize(DESKTOP);
    await load(undefined, [18, 59, 30], '/page/400');
    const turn = await evaluate(`(async () => {
      const flipping = () => Boolean(document.querySelector('div[aria-hidden="true"][style*="preserve-3d"][style*="z-index: 18"]'));
      document.querySelector('button[aria-label="Next spread"]').click();
      let started = false;
      for (let i = 0; i < 120 && !started; i++) { await new Promise((r) => setTimeout(r, 10)); started = flipping(); }
      if (!started) return { started };
      window.__advance(60000); document.dispatchEvent(new Event('visibilitychange'));
      const samples = [];
      for (let i = 0; i < 150; i++) { samples.push({ flip: flipping(), light: document.documentElement.dataset.light }); await new Promise((r) => setTimeout(r, 20)); }
      return { started, flipAfterCross: samples.filter((s) => s.flip).length, eveningMidTurn: samples.filter((s) => s.flip && s.light === 'evening').length,
        final: document.documentElement.dataset.light, faded: window.__classLog.some((e) => e.fading) };
    })()`);
    check('the fade waits for a page turn (desktop): no change mid-turn, evening once it lands',
      turn?.started && turn.flipAfterCross > 0 && turn.eveningMidTurn === 0 && turn.final === 'evening' && turn.faded, turn);

    // Reduced motion: no fade.
    await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
    await setSize(PHONE);
    await load(undefined, [18, 59, 30]);
    await evaluate(`window.__classLog.length = 0; true`);
    await crossClock(60_000);
    await sleep(150);
    const reduced = { light: await light() };
    await sleep(500);
    reduced.fade = await sawFade();
    check('reduced motion: Auto still switches, with no fade', reduced.light === 'evening' && !reduced.fade, reduced);
    await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'no-preference' }] });

    // ════════ The tour step ════════
    await load(undefined, 10);
    await openMenu();
    await evaluate(`document.querySelector('#guided-tours-btn').click(); true`);
    await sleep(600);
    await evaluate(`document.querySelector('#tour-start-settings').click(); true`);
    await sleep(900);
    await evaluate(`document.querySelector('#tour-next-btn').click(); true`);
    let tip = null;
    for (let i = 0; i < 30; i++) {
      await sleep(150);
      tip = await evaluate(`({ title: document.querySelector('#tour-tip-title')?.textContent, text: document.querySelector('#tour-tip-text')?.textContent ?? '', hi: document.querySelector('#tour-tip .tour-hi')?.textContent })`);
      if (tip?.title === 'Evening light') break;
    }
    check('the tour step text (en)', tip?.title === 'Evening light' && tip.text.includes(TOUR_EN), tip);
    check('the tour step text (hi)', tip?.hi === TOUR_HI, tip);
    check('the settings tour still changes nothing', (await stored()) === null, await stored());
  } finally {
    if (socket) { try { socket.send(JSON.stringify({ id: 999999, method: 'Browser.close' })); } catch {} socket.close(); }
    if (edge.pid) spawnSync('taskkill', ['/PID', String(edge.pid), '/T', '/F'], { stdio: 'ignore' });
    await sleep(500);
    try { fs.rmSync(USER_DATA, { recursive: true, force: true, maxRetries: 10, retryDelay: 250 }); } catch {}
    try { fs.rmSync(FILES, { recursive: true, force: true }); } catch {}
  }
  console.log(`Evening: ${checks - failures}/${checks} checks passed.`);
  if (failures) process.exitCode = 1;
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
