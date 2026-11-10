// The phone page turn (spec §5b): a single leaf turning from the spine, for the arrows and swipes.
// Usage: npx tsx scripts/test-phone-turn-browser.mts   (needs the app on :3000)
//        TURN_SHOT=path.png npx tsx scripts/test-phone-turn-browser.mts   (also saves a mid-turn frame)
import fs from 'fs';
import { run, sleep, BASE } from './duel/browser-harness.mjs';

const FIXTURE = 'scripts/fixtures/book-page-baseline.json';
// The owner's two phone pages (spec §4.3), of different heights at 412 px: 2440 is the taller.
const SHORT = 2439, TALL = 2440;
const QUIET_TOURS = { seen: { start: 1, word: 1, review: 1, settings: 1 }, tips: {}, welcomeDone: true, tipsOff: true, listOpened: true };
const settings = (lighting: string, speed = 'realistic') => ({ speed, sounds: true, lighting });
const P412 = { width: 412, height: 915, mobile: true };
const P360 = { width: 360, height: 780, mobile: true };
const LAST = (await (await fetch(`${BASE}/api/meta`)).json()).total_pages as number;

// In every page: count page-turn sounds (the page-turn buffer is the only 0.35 s one soundEngine makes) and page requests.
const PROBES = `(() => {
  window.__turnSounds = 0; window.__pageFetches = [];
  const make = BaseAudioContext.prototype.createBuffer;
  BaseAudioContext.prototype.createBuffer = function (ch, length, rate) {
    if (Math.abs(length / rate - 0.35) < 0.001) window.__turnSounds++;
    return make.call(this, ch, length, rate);
  };
  const f = window.fetch.bind(window);
  window.fetch = (input, init) => { const u = String(input?.url ?? input); if (u.includes('/api/page/')) window.__pageFetches.push(u); return f(input, init); };
})();`;

// In the page: the leaf's angle (rotateY from its computed transform), and the stage.
const LEAF_JS = `const leafAngle = () => { const l = document.querySelector('.phone-turn-leaf'); if (!l) return null; const t = getComputedStyle(l).transform;
    if (!t || t === 'none') return 0; const m = new DOMMatrix(t); return Math.atan2(-m.m13, m.m11) * 180 / Math.PI; };
  const stage = () => document.querySelector('.phone-turn-stage');
  const h1 = () => document.querySelector('#book-title')?.textContent;`;

await run('Phone page turn', async (t: any) => {
  const { check, evaluate, waitFor, open, setSize, reduceMotion, send } = t;
  await send('Page.addScriptToEvaluateOnNewDocument', { source: PROBES });
  await send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 1 });

  /** Opens a phone page at a size, lighting and speed, and waits for its text, fonts and the neighbours' prefetch. */
  const load = async (page: number, { size = P412, lighting = 'day', speed = 'realistic' } = {}) => {
    await setSize(size);
    await open(`/page/${page}`, { panna_tours: QUIET_TOURS, panna_settings: settings(lighting, speed), panna_desk: { noted: true } });
    await waitFor(`document.readyState === 'complete' && document.querySelectorAll('#mobile-page .entry-text').length > 0`, 20000);
    await evaluate(`document.fonts.ready.then(() => true)`);
    await evaluate(`window.scrollTo(0, 0); true`);
    await sleep(700);
    // Headless Edge draws in software: wait for ten smooth frames in a row (at most 3 s), so a turn's timing is its own.
    await evaluate(`new Promise((done) => { let n = 0, last = performance.now(); const t0 = last;
      const tick = (t) => { n = t - last < 40 ? n + 1 : 0; last = t; if (n >= 10 || t - t0 > 3000) done(true); else requestAnimationFrame(tick); };
      requestAnimationFrame(tick); })`);
    await evaluate(`window.__turnSounds = 0; window.__pageFetches = []; true`);
  };
  const touch = (type: string, x = 0, y = 0) => send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' || type === 'touchCancel' ? [] : [{ x, y, id: 0 }] });
  /** A finger from (x0, y0) by (dx, dy) in `steps` moves `stepMs` apart; it stays down unless `lift`. */
  const swipe = async (x0: number, y0: number, dx: number, dy: number, { steps = 8, stepMs = 30, lift = true } = {}) => {
    await touch('touchStart', x0, y0);
    for (let i = 1; i <= steps; i++) { await touch('touchMove', x0 + (dx * i) / steps, y0 + (dy * i) / steps); if (stepMs) await sleep(stepMs); }
    if (lift) await touch('touchEnd');
  };
  const tap = async (x: number, y: number) => { await touch('touchStart', x, y); await touch('touchEnd'); };
  const centre = (sel: string) => evaluate(`(() => { const el = document.querySelector(${JSON.stringify(sel)}); if (!el) return null; const r = el.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()`);
  const width = () => evaluate(`document.querySelector('#mobile-page').getBoundingClientRect().width`);
  const title = () => evaluate(`document.querySelector('#book-title')?.textContent`);
  const stageGone = () => waitFor(`!document.querySelector('.phone-turn-stage')`, 4000);
  const sounds = () => evaluate(`window.__turnSounds`);
  const angle = () => evaluate(`(() => { ${LEAF_JS} return leafAngle(); })()`);

  // ── → turns a leaf ──
  await load(SHORT);
  const fwd = await evaluate(`(async () => { ${LEAF_JS}
    document.querySelector('button[aria-label="Next page"]').click();
    await new Promise((r) => setTimeout(r, 100));
    const at100 = leafAngle();
    await new Promise((r) => setTimeout(r, 600));
    return { at100, stage: Boolean(stage()), h1: h1(), focus: document.activeElement?.getAttribute('aria-label') }; })()`);
  check('→ turns a leaf: 100 ms after the tap it is between −10° and −170°', fwd.at100 !== null && fwd.at100 < -10 && fwd.at100 > -170, fwd);
  check('→ turns a leaf: after 700 ms the stage is gone, the next page shows and → has focus',
    !fwd.stage && fwd.h1 === `Page ${SHORT + 1}` && fwd.focus === 'Next page', fwd);
  check('the sound plays once per arrow turn', (await sounds()) === 1, await sounds());

  // ── ← swings the previous page in ──
  await evaluate(`window.__turnSounds = 0; true`);
  const back = await evaluate(`(async () => { ${LEAF_JS}
    const seen = [];
    document.querySelector('button[aria-label="Previous page"]').click();
    await new Promise((r) => requestAnimationFrame(r));
    for (let i = 0; i < 120 && stage(); i++) { const a = leafAngle(); if (a !== null) seen.push(Math.round(a)); await new Promise((r) => requestAnimationFrame(r)); }
    return { first: seen[0], last: seen[seen.length - 1], n: seen.length, h1: h1(), focus: document.activeElement?.getAttribute('aria-label') }; })()`);
  check('← swings the previous page in: the leaf starts near −180° and ends at 0', back.first <= -165 && Math.abs(back.last) <= 2 && back.n > 5, back);
  check('← lands on the previous page with focus on ←', back.h1 === `Page ${SHORT}` && back.focus === 'Previous page', back);
  check('the sound plays once on the way back too', (await sounds()) === 1, await sounds());

  // ── Copies are inert ──
  const inert = await evaluate(`(async () => {
    document.querySelector('button[aria-label="Next page"]').click();
    await new Promise((r) => setTimeout(r, 150));
    const s = document.querySelector('.phone-turn-stage'), p = document.querySelector('#mobile-page');
    const copies = [...(s?.querySelectorAll('.phone-page-copy, .phone-turn-paper') ?? [])];
    return { stage: Boolean(s), inert: p.hasAttribute('inert'), focusable: s ? s.querySelectorAll('button, a, [tabindex]').length : -1,
      copies: copies.length, hidden: copies.every((c) => c.closest('[aria-hidden="true"]')),
      ids: ['mobile-page', 'page-number-btn', 'book-switch', 'letter-rail', 'mobile-ribbon', 'page-loading'].filter((id) => s?.querySelector('#' + id)) }; })()`);
  check('copies are inert: #mobile-page is inert and the stage holds nothing focusable', inert.stage && inert.inert && inert.focusable === 0, inert);
  check('every copy is aria-hidden, and none repeats a live id', inert.copies >= 2 && inert.hidden && inert.ids.length === 0, inert);
  await stageGone();
  check('after the turn #mobile-page is no longer inert', await evaluate(`!document.querySelector('#mobile-page').hasAttribute('inert')`));

  // ── A swipe follows the finger; a short slow one falls back ──
  await load(SHORT);
  let w = await width();
  await swipe(300, 400, -80, 0, { lift: false });
  await sleep(60);
  const follow = await angle();
  const want = (-80 / w) * 180;
  check(`a swipe follows the finger: 80 px left is ≈ ${want.toFixed(1)}°`, follow !== null && Math.abs(follow - want) <= 5, { follow, want });
  await touch('touchEnd');
  await stageGone();
  await sleep(100);
  check('a slow 80 px swipe falls back (no page change, no sound)', (await title()) === `Page ${SHORT}` && (await sounds()) === 0, { h1: await title(), sounds: await sounds() });

  await swipe(300, 400, -60, 0, { steps: 6, stepMs: 60 });
  await stageGone();
  await sleep(100);
  check('a short swipe falls back: the page doesn\'t change and there is no sound', (await title()) === `Page ${SHORT}` && (await sounds()) === 0, { h1: await title(), sounds: await sounds() });

  // A flick: 40 px in 50 ms. Fired from inside the page (as test-book-fit does): DevTools input arrives too unevenly in a
  // busy headless browser to promise a fast finger. The other swipes use real input events.
  await evaluate(`(async () => {
    const el = document.querySelector('#mobile-page');
    const fire = (type, x) => { const t = new Touch({ identifier: 1, target: el, clientX: x, clientY: 400 });
      el.dispatchEvent(new TouchEvent(type, { bubbles: true, cancelable: true, touches: type === 'touchend' ? [] : [t], targetTouches: type === 'touchend' ? [] : [t], changedTouches: [t] })); };
    fire('touchstart', 300);
    for (const x of [280, 260]) { await new Promise((r) => setTimeout(r, 25)); fire('touchmove', x); }
    fire('touchend', 260);
    return true; })()`);
  await stageGone();
  check('a flick turns the page', (await title()) === `Page ${SHORT + 1}`, await title());
  check('the sound plays once per completed swipe', (await sounds()) === 1, await sounds());
  await evaluate(`window.__turnSounds = 0; true`);
  await swipe(100, 400, 200, 0, { steps: 10, stepMs: 25 });
  await stageGone();
  check('a long swipe right turns back, with one sound', (await title()) === `Page ${SHORT}` && (await sounds()) === 1, { h1: await title(), sounds: await sounds() });

  // ── A vertical drag scrolls (a short window, so the page can scroll) ──
  await load(SHORT, { size: { width: 412, height: 520, mobile: true } });
  await swipe(200, 400, -8, -60, { steps: 6, stepMs: 30, lift: false });
  const vert = await evaluate(`({ stage: Boolean(document.querySelector('.phone-turn-stage')), y: scrollY })`);
  await touch('touchEnd');
  await sleep(300);
  check('a vertical drag scrolls: no stage, and scrollY moves', !vert.stage && vert.y > 10 && (await title()) === `Page ${SHORT}`, vert);

  // ── The first and last page resist ──
  for (const [page, dx, label] of [[1, 200, 'first'], [LAST, -200, 'last']] as const) {
    await load(page);
    w = await width();
    const normal = (Math.abs(dx) / w) * 180;
    await touch('touchStart', dx > 0 ? 100 : 320, 400);
    let most = 0;
    for (let i = 1; i <= 10; i++) { await touch('touchMove', (dx > 0 ? 100 : 320) + (dx * i) / 10, 400); await sleep(25); most = Math.max(most, Math.abs((await angle()) ?? 0)); }
    await touch('touchEnd');
    await stageGone();
    check(`the ${label} page resists: it lifts, never past 0.25 × the normal angle (${most.toFixed(1)}° of ${normal.toFixed(1)}°)`,
      most > 3 && most <= normal * 0.25 + 0.5, { most, normal });
    check(`the ${label} page falls back and stays (no sound)`, (await title()) === `Page ${page}` && (await sounds()) === 0, { h1: await title(), sounds: await sounds() });
  }

  // ── Instant ──
  await load(SHORT, { speed: 'instant' });
  const instant = await evaluate(`(async () => { let staged = false; const mo = new MutationObserver(() => { if (document.querySelector('.phone-turn-stage, .phone-turn-fade')) staged = true; });
    mo.observe(document.body, { childList: true, subtree: true });
    const t0 = performance.now(); document.querySelector('button[aria-label="Next page"]').click();
    let ms = null; for (let i = 0; i < 100; i++) { if (document.querySelector('#book-title').textContent === 'Page ${SHORT + 1}') { ms = performance.now() - t0; break; } await new Promise((r) => setTimeout(r, 10)); }
    mo.disconnect(); return { staged, ms }; })()`);
  check('Instant: never a stage, and the page changes at once', !instant.staged && instant.ms !== null && instant.ms < 150, instant);
  check('Instant: the sound still plays once', (await sounds()) === 1, await sounds());

  // ── Reduced motion: a 120 ms cross-fade ──
  await reduceMotion(true);
  await load(SHORT);
  const fade = await evaluate(`(async () => { let leaf = false, added = null, removed = null, opacities = [];
    const mo = new MutationObserver(() => { const f = document.querySelector('.phone-turn-fade'); if (document.querySelector('.phone-turn-leaf')) leaf = true;
      if (f && added === null) added = performance.now(); if (!f && added !== null && removed === null) removed = performance.now(); });
    mo.observe(document.body, { childList: true, subtree: true });
    document.querySelector('button[aria-label="Next page"]').click();
    for (let i = 0; i < 40; i++) { const f = document.querySelector('.phone-turn-fade'); if (f) opacities.push(+getComputedStyle(f).opacity); await new Promise((r) => setTimeout(r, 10)); }
    mo.disconnect();
    const f = document.querySelector('.phone-turn-fade');
    return { leaf, ms: added !== null && removed !== null ? removed - added : null, fell: opacities.length > 1 && opacities[opacities.length - 1] < opacities[0], h1: document.querySelector('#book-title').textContent }; })()`);
  check('reduced motion: no leaf, a fading copy for ≤ 150 ms, and the page changes', !fade.leaf && fade.ms !== null && fade.ms <= 150 && fade.h1 === `Page ${SHORT + 1}`, fade);
  check('reduced motion: the copy fades out', fade.fell, fade);
  check('reduced motion: one sound', (await sounds()) === 1, await sounds());
  await reduceMotion(false);

  // ── Jumps don't turn: Go to page, the A–Z rail and a search result ──
  await load(SHORT);
  await evaluate(`window.__staged = false; window.__mo = new MutationObserver(() => { if (document.querySelector('.phone-turn-stage, .phone-turn-fade')) window.__staged = true; });
    window.__mo.observe(document.body, { childList: true, subtree: true }); true`);
  await evaluate(`document.querySelector('#page-number-btn').click(); true`);
  await waitFor(`Boolean(document.querySelector('#goto-page-input'))`);
  await evaluate(`(() => { const i = document.querySelector('#goto-page-input'); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(i, '${SHORT + 1}');
    i.dispatchEvent(new Event('input', { bubbles: true })); document.querySelector('#goto-go-btn').click(); return true; })()`);
  const wentTo = await waitFor(`document.querySelector('#book-title').textContent === 'Page ${SHORT + 1}' && !document.querySelector('#goto-sheet')`, 5000);
  await sleep(300);
  const rail = await evaluate(`(() => { const r = document.querySelector('#letter-rail').getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + (4 + 0.5) * r.height / 26 }; })()`);
  await tap(rail.x, rail.y); // E
  const railed = await waitFor(`document.querySelector('#book-title').textContent !== 'Page ${SHORT + 1}'`, 5000);
  await sleep(300);
  await evaluate(`(() => { const input = document.querySelector('#lookup-input'); input.focus(); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, 'seem');
    input.dispatchEvent(new Event('input', { bubbles: true })); return true; })()`);
  await waitFor(`Boolean(document.querySelector('#lookup-panel [role="option"]'))`, 8000);
  await evaluate(`document.querySelector('#lookup-panel [role="option"]').click(); true`);
  const searched = await waitFor(`document.querySelector('#book-title').textContent === 'Page ${SHORT}'`, 8000);
  await sleep(400);
  check('jumps don\'t turn: Go to page, the A–Z rail and a search result never mount a stage',
    wentTo && railed && searched && !(await evaluate(`window.__mo.disconnect(); window.__staged`)), { wentTo, railed, searched });

  // ── Pages of different heights: 2439 → 2440 → 2439 ──
  const base = JSON.parse(fs.readFileSync(FIXTURE, 'utf8'));
  const hShort = base.phone['412x915'][SHORT].page.h, hTall = base.phone['412x915'][TALL].page.h;
  await load(SHORT);
  for (const [label, to] of [['Next page', TALL], ['Previous page', SHORT]] as const) {
    const r = await evaluate(`(async () => { ${LEAF_JS}
      document.querySelector('button[aria-label="${label}"]').click();
      let least = Infinity;
      await new Promise((r) => requestAnimationFrame(r));
      for (let i = 0; i < 120 && stage(); i++) { least = Math.min(least, document.querySelector('.phone-turn').getBoundingClientRect().height); await new Promise((r) => requestAnimationFrame(r)); }
      await new Promise((r) => setTimeout(r, 100));
      return { least, after: document.querySelector('#mobile-page').getBoundingClientRect().height, wrap: document.querySelector('.phone-turn').getBoundingClientRect().height, h1: h1() }; })()`);
    const want = to === TALL ? hTall : hShort;
    check(`heights, ${label}: during the turn the wrapper is ≥ the taller page (${Math.max(hShort, hTall)})`, r.least >= Math.max(hShort, hTall) - 0.5, r);
    check(`heights, ${label}: after it, #mobile-page is page ${to}'s baseline height (${want})`, r.h1 === `Page ${to}` && Math.abs(r.after - want) <= 0.5 && Math.abs(r.wrap - want) <= 0.5, r);
  }

  // ── The lamp during a turn, and the switch on the leaf ──
  await load(SHORT, { lighting: 'evening' });
  const lamp = await evaluate(`(async () => {
    const spot = document.querySelector('#book-spot'); let n = 0; const mo = new MutationObserver((l) => { n += l.length; });
    document.querySelector('button[aria-label="Next page"]').click();
    if (spot) mo.observe(spot, { attributes: true });
    // Stop counting as the stage goes (the light may redraw for the new page once the turn is over).
    const end = new MutationObserver(() => { if (!document.querySelector('.phone-turn-stage')) { mo.disconnect(); end.disconnect(); } });
    await new Promise((r) => requestAnimationFrame(r));
    end.observe(document.body, { childList: true, subtree: true });
    await new Promise((r) => setTimeout(r, 120));
    const leaf = document.querySelector('.phone-turn-leaf'), under = document.querySelector('.phone-turn-under');
    const out = { spot: Boolean(spot), leafLight: leaf?.querySelectorAll('.book-light').length, underLight: under?.querySelectorAll('.book-light').length,
      art: leaf?.querySelectorAll('.book-switch-art').length, live: leaf?.querySelectorAll('#book-switch, button').length };
    for (let i = 0; i < 100 && document.querySelector('.phone-turn-stage'); i++) await new Promise((r) => setTimeout(r, 20));
    mo.disconnect(); return { ...out, mutations: n }; })()`);
  check('the lamp during a turn: #book-spot is not touched while the stage shows', lamp.spot && lamp.mutations === 0, lamp);
  check('the lamp during a turn: the leaf holds no .book-light, the page beneath holds one', lamp.leafLight === 0 && lamp.underLight === 1, lamp);
  check('the switch rides on the leaf: PushSwitchArt, and no #book-switch', lamp.art === 1 && lamp.live === 0, lamp);

  // ── Review focus 5: taps and touches during a turn ──
  // At the Slow speed (667 ms a turn), so the taps surely land while the leaf turns, even in a busy headless browser.
  await load(SHORT, { speed: 'slow' });
  const next = await centre('button[aria-label="Next page"]');
  await tap(next.x, next.y);
  await sleep(80);
  await tap(next.x, next.y);
  await sleep(80);
  await tap(next.x, next.y);
  await waitFor(`document.querySelector('#book-title').textContent === 'Page ${SHORT + 2}' && !document.querySelector('.phone-turn-stage')`, 4000);
  await sleep(700);
  const three = await evaluate(`({ h1: document.querySelector('#book-title').textContent, focus: document.activeElement?.getAttribute('aria-label'), stage: Boolean(document.querySelector('.phone-turn-stage')) })`);
  check('three fast taps on → end exactly 2 pages on, with focus on →', three.h1 === `Page ${SHORT + 2}` && three.focus === 'Next page' && !three.stage, three);
  check('two turns, two sounds', (await sounds()) === 2, await sounds());

  await load(SHORT);
  await evaluate(`document.querySelector('button[aria-label="Next page"]').click(); true`);
  await sleep(100);
  await swipe(320, 300, -220, 0, { steps: 6, stepMs: 20 });
  await stageGone();
  await sleep(600);
  check('a touch that starts mid-turn changes nothing (one page on)', (await title()) === `Page ${SHORT + 1}` && !(await evaluate(`Boolean(document.querySelector('.phone-turn-stage'))`)), await title());

  await load(SHORT, { speed: 'slow' });
  const pill = await centre('#page-number-btn');
  const goto = await evaluate(`(async () => { window.__t = { gone: null, sheet: null }; const mo = new MutationObserver(() => {
      if (window.__t.gone === null && window.__t.started && !document.querySelector('.phone-turn-stage')) window.__t.gone = performance.now();
      if (window.__t.sheet === null && document.querySelector('#goto-sheet')) window.__t.sheet = performance.now(); });
    mo.observe(document.body, { childList: true, subtree: true });
    document.querySelector('button[aria-label="Next page"]').click(); await new Promise((r) => requestAnimationFrame(r));
    window.__t.started = Boolean(document.querySelector('.phone-turn-stage')); return true; })()`);
  await sleep(100);
  await tap(pill.x, pill.y);
  await waitFor(`Boolean(document.querySelector('#goto-sheet'))`, 3000);
  const g = await evaluate(`window.__t`);
  check('tapping the pill mid-turn opens Go to only after the stage is gone', goto && g.started && g.gone !== null && g.sheet !== null && g.sheet >= g.gone, g);
  await evaluate(`document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); true`);

  // ── Neighbours are cached: an arrow turn requests no page ──
  await load(SHORT);
  const cached = await evaluate(`(async () => { window.__pageFetches = [];
    document.querySelector('button[aria-label="Next page"]').click();
    await new Promise((r) => setTimeout(r, 60));
    const under = document.querySelector('.phone-turn-under');
    const real = Boolean(under?.querySelector('.entry-text')) && !under?.querySelector('.ink-lines');
    for (let i = 0; i < 100 && document.querySelector('.phone-turn-stage'); i++) await new Promise((r) => setTimeout(r, 20));
    return { real, asked: window.__pageFetches.filter((u) => u.includes('/api/page/${SHORT + 1}?')) }; })()`);
  check('neighbours are cached: the next page lies underneath, and the turn makes no /api/page request for it', cached.real && cached.asked.length === 0, cached);
  await sleep(600);
  const ahead = await evaluate(`(async () => { window.__pageFetches = []; document.querySelector('button[aria-label="Previous page"]').click();
    for (let i = 0; i < 100 && document.querySelector('.phone-turn-stage'); i++) await new Promise((r) => setTimeout(r, 20));
    return window.__pageFetches.filter((u) => u.includes('/api/page/${SHORT}?')); })()`);
  check('neighbours are cached: back again, no request for the previous page either', ahead.length === 0, ahead);

  // ── Speeds: Slow and Brisk turn the leaf too, in proportion ──
  for (const [speed, ms] of [['slow', Math.round(500 * 1400 / 1050)], ['brisk', Math.round(500 * 650 / 1050)]] as const) {
    await load(SHORT, { speed });
    const took = await evaluate(`(async () => { const t0 = performance.now(); document.querySelector('button[aria-label="Next page"]').click();
      let leaf = false; await new Promise((r) => setTimeout(r, 30)); leaf = Boolean(document.querySelector('.phone-turn-leaf'));
      while (document.querySelector('.phone-turn-stage') && performance.now() - t0 < 4000) await new Promise((r) => setTimeout(r, 10));
      return { leaf, ms: performance.now() - t0 }; })()`);
    check(`${speed}: the leaf turns in about ${ms} ms`, took.leaf && took.ms >= ms - 20 && took.ms <= ms + 250, took);
  }

  // ── A mid-turn frame for the report (Evening, the finger held about a third of the way) ──
  if (process.env.TURN_SHOT) {
    await load(SHORT, { lighting: 'evening' });
    await swipe(330, 380, -130, 0, { steps: 8, stepMs: 30, lift: false });
    await sleep(150);
    const shot = await send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(process.env.TURN_SHOT, Buffer.from(shot.data, 'base64'));
    await touch('touchCancel');
    console.log(`Saved ${process.env.TURN_SHOT}`);
  }

  // ── The page at rest is unchanged: the baseline rects and the entry styles ──
  const RECT_JS = `const rect = (el) => { if (!el) return null; const r = el.getBoundingClientRect(); return { x: +r.left.toFixed(2), y: +(r.top + scrollY).toFixed(2), w: +r.width.toFixed(2), h: +r.height.toFixed(2) }; };`;
  const diffs: string[] = [];
  const cmp = (path: string, a: any, b: any) => {
    if (a && typeof a === 'object') { for (const k of new Set([...Object.keys(a), ...Object.keys(b ?? {})])) cmp(`${path}.${k}`, a[k], b?.[k]); return; }
    if (typeof a === 'number' && typeof b === 'number' ? Math.abs(a - b) > 0.5 : a !== b) diffs.push(`${path}: ${a} → ${b}`);
  };
  for (const size of [P360, P412]) {
    for (const page of [TALL, SHORT]) {
      await load(page, { size });
      const now = await evaluate(`(() => { ${RECT_JS} return { page: rect(document.querySelector('#mobile-page')),
        prev: rect(document.querySelector('button[aria-label="Previous page"]')), pill: rect(document.querySelector('#page-number-btn')),
        next: rect(document.querySelector('button[aria-label="Next page"]')) }; })()`);
      cmp(`${size.width}x${size.height}.${page}`, base.phone[`${size.width}x${size.height}`][page], now);
    }
  }
  for (const lighting of ['day', 'evening']) {
    await load(TALL, { lighting });
    const now = await evaluate(`[...document.querySelectorAll('.entry-text')].filter((e) => !e.closest('[aria-hidden="true"]')).slice(0, 3).map((e) => { const s = getComputedStyle(e);
      return Object.fromEntries(['font', 'lineHeight', 'textAlign', 'margin', 'padding', 'color'].map((k) => [k, s[k]])); })`);
    cmp(`styles.${lighting}`, base.styles.phone[lighting], now);
  }
  check('page unchanged at rest: the baseline rects (within 0.5 px) and the .entry-text styles match', diffs.length === 0, diffs.slice(0, 10));
  check('page unchanged at rest: .phone-turn wraps #mobile-page at its own size', await evaluate(`(() => { const w = document.querySelector('.phone-turn')?.getBoundingClientRect(), p = document.querySelector('#mobile-page').getBoundingClientRect();
    return Boolean(w) && document.querySelector('#mobile-page').parentElement.classList.contains('phone-turn') && Math.abs(w.height - p.height) < 0.5 && Math.abs(w.width - p.width) < 0.5 && w.top === p.top; })()`));
});
