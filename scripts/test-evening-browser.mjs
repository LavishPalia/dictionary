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

    // ════════ The book under a lamp (Task 3) ════════
    // Colour helpers, in the page: every rgb()/rgba()/color(srgb …) in a computed value, relative luminance, contrast.
    const COLOR_JS = `
      const parseAll = (text) => {
        const out = [];
        for (const m of (text || '').matchAll(/rgba?\\(([^)]+)\\)|color\\(srgb ([^)]+)\\)/g)) {
          const p = (m[1] ?? m[2]).split(/[\\s,\\/]+/).filter(Boolean).map(Number);
          const k = m[1] ? 1 : 255;
          out.push({ r: p[0] * k, g: p[1] * k, b: p[2] * k, a: p.length > 3 ? p[3] : 1 });
        }
        if (!out.length) { const h = (text || '').trim().match(/^#([0-9a-f]{6})$/i); if (h) { const n = parseInt(h[1], 16); out.push({ r: n >> 16, g: (n >> 8) & 255, b: n & 255, a: 1 }); } }
        return out;
      };
      const lum = ({ r, g, b }) => { const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); };
      const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
      const name = (el) => el.id || (typeof el.className === 'string' && el.className) || el.tagName.toLowerCase();
      // Every visible element under the selectors whose background (colour or gradient stop) is opaque and brighter
      // than the limit.
      const bright = (selectors, limit) => {
        const hits = [];
        for (const sel of selectors) for (const root of document.querySelectorAll(sel)) for (const el of [root, ...root.querySelectorAll('*')]) {
          const box = el.getBoundingClientRect();
          const s = getComputedStyle(el);
          if (!box.width || !box.height || s.visibility === 'hidden' || s.display === 'none') continue;
          for (const c of [...parseAll(s.backgroundColor), ...parseAll(s.backgroundImage)]) {
            if (c.a >= 0.9 && lum(c) > limit) hits.push({ el: name(el), lum: +lum(c).toFixed(3), c: [c.r, c.g, c.b].map(Math.round) });
          }
        }
        return hits;
      };
      const textOn = (pairs, bg) => pairs.map(([label, sel]) => {
        const el = document.querySelector(sel);
        if (!el) return { label, missing: true, ok: false };
        const fg = parseAll(getComputedStyle(el).color)[0];
        const back = bg ?? parseAll(getComputedStyle(el).backgroundColor)[0];
        const r = ratio(fg, back);
        return { label, ratio: +r.toFixed(2), ok: r >= 4.5 };
      });
      const token = (n) => parseAll(getComputedStyle(document.documentElement).getPropertyValue(n))[0];
      // Every visible piece of text whose colour, over the backgrounds of its own ancestors (translucent washes laid
      // over the first opaque one; each gradient stop tried, the worst counted), falls short of AA: 4.5:1, or 3:1 for
      // large text (24px, or 18.66px bold). Opacity on the way up fades the text too. Disabled controls are exempt.
      const over = (top, bottom) => ({ r: top.r * top.a + bottom.r * (1 - top.a), g: top.g * top.a + bottom.g * (1 - top.a), b: top.b * top.a + bottom.b * (1 - top.a), a: 1 });
      const lowText = () => {
        const out = [];
        for (const el of document.body.querySelectorAll('*')) {
          if (![...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim())) continue;
          if (el.closest('script, style, noscript, [disabled], [aria-disabled="true"], .ui-visually-hidden')) continue;
          // Drawn over a ::before dot the walk cannot see (the A–Z rail's current letter, 5.1:1 on its brass dot).
          if (el.matches('.letter-rail-letter[data-current="true"]')) continue;
          const box = el.getBoundingClientRect();
          const s = getComputedStyle(el);
          if (!box.width || !box.height || s.visibility === 'hidden') continue;
          let alpha = 1; const layers = [];
          for (let n = el; n; n = n.parentElement) {
            const cs = getComputedStyle(n);
            alpha *= Number(cs.opacity);
            if (cs.display === 'none') { alpha = 0; break; }
            // The pencil underline is a 2px gradient strip under the word, not the word's background.
            const stops = n.classList.contains('pencil-underlined') ? [] : parseAll(cs.backgroundImage);
            const solid = parseAll(cs.backgroundColor).filter((c) => c.a > 0);
            if (stops.length) layers.push(stops);
            else if (solid.length) layers.push(solid);
            const last = layers[layers.length - 1];
            if (last && last.every((c) => c.a >= 0.99)) break;
          }
          if (alpha < 0.05 || !layers.length) continue;
          // Compose: start from each colour of the deepest layer, lay the translucent ones above it in order.
          let bases = layers[layers.length - 1].map((c) => ({ ...c, a: 1 }));
          for (let i = layers.length - 2; i >= 0; i--) bases = bases.flatMap((b) => layers[i].map((c) => over(c, b)));
          const fg0 = parseAll(s.color)[0];
          if (!fg0) continue;
          const size = parseFloat(s.fontSize); const bold = Number(s.fontWeight) >= 700;
          const need = size >= 24 || (bold && size >= 18.66) ? 3 : 4.5;
          const worst = Math.min(...bases.map((b) => ratio(over({ ...fg0, a: fg0.a * alpha }, b), b)));
          if (worst < need) out.push({ el: name(el).slice(0, 40), text: el.textContent.trim().slice(0, 24), ratio: +worst.toFixed(2), need });
        }
        return out;
      };
    `;
    const inPage = (body) => evaluate(`(() => { ${COLOR_JS} ${body} })()`);
    const AXE = fs.readFileSync(path.join(process.cwd(), 'node_modules', 'axe-core', 'axe.min.js'), 'utf8');
    const axeContrast = (selector) => evaluate(`(async () => {
      if (!window.axe) { const s = document.createElement('script'); s.textContent = ${JSON.stringify(AXE)}; document.head.appendChild(s); }
      const out = [];
      for (const el of document.querySelectorAll(${JSON.stringify(selector)})) {
        const r = await axe.run(el, { runOnly: ['color-contrast'] });
        for (const v of r.violations) for (const n of v.nodes) out.push({ target: n.target.join(' '), summary: n.failureSummary?.slice(0, 160) });
      }
      return out;
    })()`);
    const ENTRY_TEXT = [
      ['headword', '.entry-headword'], ['definition', '.entry-text > span:not([lang])'], ['Hindi', '.entry-hindi'],
      ['pronunciation', '.entry-pronunciation'], ['part of speech', '.entry-pos'], ['guide word', '.guide-word'],
      ['pronunciation footer', '.pronunciation-footer'],
    ];
    const SHOTS = process.env.EVENING_SHOTS === '1';
    const shot = async (file) => {
      const { data } = await send('Page.captureScreenshot', { format: 'png' });
      fs.writeFileSync(path.join(process.cwd(), 'scratch', file), Buffer.from(data, 'base64'));
    };

    // Day keeps today's paper.
    await setSize(PHONE);
    await load(JSON.stringify({ lighting: 'day' }), 20);
    const dayPaper = await evaluate(`getComputedStyle(document.querySelector('#mobile-page')).backgroundColor`);
    check('Day (forced at 20:00): the phone page is still #ecdfba', dayPaper === 'rgb(236, 223, 186)', dayPaper);

    // Phone, Evening forced.
    await load(JSON.stringify({ lighting: 'evening' }), 10);
    const phonePaper = await inPage(`const c = parseAll(getComputedStyle(document.querySelector('#mobile-page')).backgroundColor)[0];
      return { c: [c.r, c.g, c.b], lum: +lum(c).toFixed(3) };`);
    const lamp = [0xc2, 0xad, 0x84];
    check('phone page paper is lamp paper (#c2ad84, luminance ≤ 0.45)',
      phonePaper?.lum <= 0.45 && phonePaper.c.every((v, i) => Math.abs(v - lamp[i]) <= 6), phonePaper);
    const phoneBright = await inPage(`return bright(['#mobile-page'], 0.5);`);
    check('no bright book surface in Evening (phone page, footer, ribbon, rail)', phoneBright?.length === 0, phoneBright?.slice(0, 8));
    const phoneText = await inPage(`return textOn(${JSON.stringify(ENTRY_TEXT)}, parseAll(getComputedStyle(document.querySelector('#mobile-page')).backgroundColor)[0]);`);
    check('phone: entry text, Hindi and guide words pass 4.5:1 on the lamp paper', phoneText?.every((t) => t.ok), phoneText);
    const footText = await inPage(`const foot = token('--page-foot'); return foot ? textOn([['page pill', '#page-number-btn'], ['arrow', 'button[aria-label="Next page"]']], foot) : [{ label: '--page-foot missing', ok: false }];`);
    check('phone: the footer pill and arrows pass 4.5:1 on the footer bar', footText?.every((t) => t.ok), footText);
    // Ribbon on, and the A–Z rail held down (its bubble showing).
    await evaluate(`document.querySelector('#mobile-ribbon').click(); true`);
    await sleep(500);
    const railBox = await evaluate(`(() => { const r = document.querySelector('#letter-rail').getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height * 0.4 }; })()`);
    await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: railBox.x, y: railBox.y, button: 'left', buttons: 1, clickCount: 1 });
    await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: railBox.x, y: railBox.y + 12, button: 'left', buttons: 1 });
    await sleep(300);
    const bubble = await inPage(`const b = document.querySelector('#letter-bubble'); if (!b) return null;
      return { bright: bright(['#mobile-page'], 0.5), text: textOn([['bubble letter', '.letter-bubble-letter']], parseAll(getComputedStyle(b).backgroundColor)[0]) };`);
    check('phone: with the ribbon on and the rail bubble showing, nothing is bright', bubble && bubble.bright.length === 0, bubble);
    check('phone: the rail bubble letter passes 4.5:1', bubble?.text.every((t) => t.ok), bubble?.text);
    const phoneAxe = await axeContrast('#mobile-page');
    check('phone: axe finds no contrast problem on the page in Evening', phoneAxe?.length === 0, phoneAxe);
    if (SHOTS) await shot('evening-book-phone.png');
    await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 20, y: railBox.y, button: 'left', buttons: 1 });
    await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: 20, y: railBox.y, button: 'left', buttons: 0, clickCount: 1 });

    // Desktop, Evening forced: a folded corner, the ribbon, a margin note.
    await setSize(DESKTOP);
    await load(JSON.stringify({ lighting: 'evening' }), 10, '/page/400');
    await evaluate(`(() => { document.querySelector('[id^="dog-ear-trigger-"]')?.click(); document.querySelector('#silk-ribbon')?.click(); return true; })()`);
    await sleep(600);
    await evaluate(`document.querySelector('[id^="add-note-trigger-p"]').click(); true`);
    await sleep(300);
    await evaluate(`(() => { const t = document.querySelector('#margin-note-textarea'); if (!t) return false;
      Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set.call(t, 'cf. p. 94'); t.dispatchEvent(new Event('input', { bubbles: true })); return true; })()`);
    await sleep(100);
    const editor = await inPage(`return { bright: bright(['#margin-note-editor'], 0.5) };`);
    check('desktop: the margin-note editor is not bright', editor?.bright.length === 0, editor);
    await evaluate(`document.querySelector('#save-margin-note-btn')?.click(); true`);
    await sleep(400);
    const marks = await evaluate(`({ ear: Boolean(document.querySelector('[id^="dog-ear-corner-"]')), note: Boolean(document.querySelector('[id^="margin-note-"]:not(#margin-note-editor):not(#margin-note-textarea)')),
      ribbon: document.querySelector('#silk-ribbon')?.getAttribute('aria-pressed') })`);
    check('desktop: a dog-ear, a margin note and the ribbon are on the spread', marks?.ear && marks.note && marks.ribbon === 'true', marks);
    const deskBright = await inPage(`return bright(['#book-spread-container'], 0.5);`);
    check('no bright book surface in Evening (spread, thumb tabs, dog-ear, ribbon, arrows)', deskBright?.length === 0, deskBright?.slice(0, 8));
    const deskText = await inPage(`return textOn(${JSON.stringify(ENTRY_TEXT)}, token('--parch-2'));`);
    check('desktop: entry text, Hindi and guide words pass 4.5:1 on the lamp paper', deskText?.every((t) => t.ok), deskText);
    const tabs = await inPage(`return [...document.querySelectorAll('.thumb-tab')].map((t) => { const s = getComputedStyle(t); return { l: t.textContent, r: +ratio(parseAll(s.color)[0], parseAll(s.backgroundColor)[0]).toFixed(2) }; }).filter((t) => t.r < 4.5);`);
    check('desktop: every thumb-index tab passes 4.5:1', tabs?.length === 0, tabs);
    const noteText = await inPage(`return [...document.querySelectorAll('[id^="margin-note-"]:not(#margin-note-editor) > span')].map((n) => +ratio(parseAll(getComputedStyle(n).color)[0], token('--parch-2')).toFixed(2));`);
    check('desktop: margin notes pass 4.5:1 on the lamp paper', noteText?.length > 0 && noteText.every((r) => r >= 4.5), noteText);
    const deskAxe = await axeContrast('#book-spread-container');
    check('desktop: axe finds no contrast problem on the spread in Evening', deskAxe?.length === 0, deskAxe);
    if (SHOTS) await shot('evening-book-desktop.png');
    // The ink lines (a slow page load) are drawn on the same lamp paper.
    const ink = await inPage(`const v = document.createElement('div'); v.className = 'ink-lines ink-lines--2';
      v.innerHTML = '<div class="ink-lines-page"></div><div class="ink-lines-page"></div>';
      document.querySelector('#book-spread-container').appendChild(v); const out = bright(['.ink-lines'], 0.5); v.remove(); return out;`);
    check('the ink-lines veil is lamp paper in Evening', ink?.length === 0, ink);

    // The binding rule: every token Evening overrides is registered with @property and in the fade's transition list.
    const binding = await evaluate(`(() => {
      const rules = []; const walk = (list) => { for (const r of list) { rules.push(r); if (r.cssRules) walk(r.cssRules); } };
      for (const sheet of document.styleSheets) { try { walk(sheet.cssRules); } catch {} }
      const evening = rules.filter((r) => r.selectorText === 'html[data-light="evening"]').flatMap((r) => [...r.style].filter((p) => p.startsWith('--')));
      const registered = new Set(rules.filter((r) => r.constructor.name === 'CSSPropertyRule').map((r) => r.name));
      const fading = rules.find((r) => r.selectorText === 'html.light-fading');
      const listed = new Set((fading?.style.transitionProperty ?? '').split(/,\\s*/));
      return { count: evening.length, unregistered: evening.filter((p) => !registered.has(p)), unlisted: evening.filter((p) => !listed.has(p)) };
    })()`);
    check('every Evening token is registered with @property and fades (binding rule)',
      binding?.count > 4 && binding.unregistered.length === 0 && binding.unlisted.length === 0, binding);
    await setSize(PHONE);

    // ════════ Every other screen (Task 4) ════════
    // Each screen, sheet, toast and bubble in Evening: no visible opaque background (colour or gradient stop) brighter
    // than luminance 0.5 anywhere on the page.
    const visibleNow = (selector) => evaluate(`(() => { const el = document.querySelector(${JSON.stringify(selector)}); if (!el) return false; const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== 'hidden'; })()`);
    const waitFor = async (selector, tries = 40) => { for (let i = 0; i < tries; i++) { if (await visibleNow(selector)) return true; await sleep(100); } return false; };
    const tap = async (selector) => { await waitFor(selector); return evaluate(`(() => { const el = document.querySelector(${JSON.stringify(selector)}); if (!el) return false; el.click(); return true; })()`); };
    const go = async (url, ready) => {
      await send('Page.navigate', { url: `${BASE}${url}` });
      for (let i = 0; i < 60; i++) {
        await sleep(250);
        try { if (await evaluate(`(() => { const el = document.querySelector('#lookup-input'); return Boolean(el && document.querySelector(${JSON.stringify(ready)}) && Object.keys(el).some((k) => k.startsWith('__reactFiber$'))); })()`)) break; } catch {}
      }
      await sleep(500);
    };
    const typeLookup = (text) => evaluate(`(() => { const input = document.querySelector('#lookup-input'); input.focus(); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, ${JSON.stringify(text)}); input.dispatchEvent(new Event('input', { bubbles: true })); return true; })()`);
    const SENTENCE = '/?share_text=The%20government%27s%20plan%20deepened%20and%20obfuscated%20the%20facts.';
    const seedSaved = () => evaluate(`(async () => {
      const list = []; for (const h of ['camel', 'ceremony', 'abandon', 'calm']) list.push({ ...(await (await fetch('/api/word/' + h)).json()).entry, saved_at: Date.now() });
      localStorage.setItem('panna_saved_words', JSON.stringify(list));
      localStorage.setItem('panna_review', JSON.stringify(Object.fromEntries(list.map((e) => [e.normalized, { box: 1, due_at: 0, right: 1, wrong: 0 }]))));
      localStorage.setItem('panna_bookmarks', JSON.stringify([16]));
      const now = Date.now(); const w = (normalized, headword, meaning_hi, at, count, source) => ({ normalized, headword, meaning_hi, first_at: at, last_at: at, count, lookups: [at], source, page: null });
      localStorage.setItem('panna_history', JSON.stringify([w('camel', 'Camel', 'ऊँट', now - 60000, 3, 'share'), w('candid', 'candid', 'स्पष्टवादी', now - 3 * 86400000, 1, 'voice')]));
      return true; })()`);
    for (const [sizeName, size] of [['phone', PHONE], ['desktop', DESKTOP]]) {
      await setSize(size);
      await load(JSON.stringify({ lighting: 'evening' }), 10);
      await seedSaved();
      const views = [];
      const probe = async (name, marker) => {
        const shown = await waitFor(marker, 30);
        await sleep(350);
        views.push({ name, shown, ...(shown ? await inPage(`return { hits: bright(['body'], 0.5), low: lowText() };`) : {}) });
      };
      const fresh = () => go('/page/16', '.entry-text');
      await fresh();
      await probe('the book with the search bar', '#lookup-input');
      if (SHOTS && size === PHONE) await shot('evening-page.png');
      await typeLookup('cam'); await sleep(1200);
      await probe('search results', '.lookup-panel');
      await typeLookup('ceremonis'); await sleep(1200);
      await probe('search, no entry', '.noentry');
      await fresh(); await tap('.entry-open');
      await probe('the word card', '#save-word-btn');
      if (SHOTS && size === PHONE) await shot('evening-word.png');
      await tap('#report-btn');
      await probe('report a problem', '.report');
      await fresh(); await tap('#page-number-btn');
      await probe('Go to', '#goto-sheet');
      await fresh(); await tap('#menu-btn');
      await probe('the ⋯ menu', '#reading-menu');
      await tap('#guided-tours-btn');
      await probe('guided tours list', '#tour-start-start');
      await tap('#tour-start-start');
      await probe('a tour bubble', '#tour-tip');
      await fresh(); await tap('#menu-btn'); await tap('#open-credits-btn');
      await probe('Credits', '[aria-label="Close credits"]');
      await fresh(); await tap(size.mobile ? '#nav-today-btn' : '#open-today-btn');
      await probe('Today', '.today');
      if (SHOTS && size === PHONE) await shot('evening-today.png');
      await tap(size.mobile ? '#nav-saved-btn' : '#open-bookmarks-btn');
      for (const tab of ['words', 'pages', 'notes', 'history']) {
        await tap(`#saved-tab-${tab}`);
        await probe(`Saved: ${tab}`, '#saved-screen');
        if (SHOTS && size === PHONE && tab === 'words') await shot('evening-saved.png');
      }
      await tap('#saved-tab-words');
      await sleep(300);
      await evaluate(`(() => { const b = [...document.querySelectorAll('.saved-item .ui-iconbtn')].pop(); b?.click(); return Boolean(b); })()`);
      await probe('a toast (word removed, Undo)', '.saved-toast');
      await fresh(); await tap(size.mobile ? '#nav-review-btn' : '#open-review-btn');
      await probe('Review', '.review-option');
      await tap('.review-option');
      await probe('Review, answered', '.review-feedback');
      await go('/learn', '#learn-title');
      await probe('Learn', '#learn-title');
      await go(SENTENCE, '#lookup-input');
      await probe('the sentence sheet', '#sentence-sheet button.sentence-word');
      await tap('#sentence-sheet button.sentence-word');
      await probe('the sentence sheet with a word chosen', '.sentence-entry');
      for (const v of views) {
        check(`evening ${sizeName}: nothing bright on ${v.name}`, v.shown && v.hits?.length === 0, v.shown ? v.hits?.slice(0, 6) : 'not shown');
        check(`evening ${sizeName}: every text on ${v.name} reaches AA`, v.shown && v.low?.length === 0, v.shown ? v.low?.slice(0, 8) : 'not shown');
      }
    }
    await setSize(PHONE);

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
