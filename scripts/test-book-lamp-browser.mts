// The lamp on the Book page: the light under the ink, the darkness on the desk, and a page that doesn't change.
// Usage: npx tsx scripts/test-book-lamp-browser.mts           (needs the app on :3000)
//        npx tsx scripts/test-book-lamp-browser.mts --record  (saves the page's baseline: run it on a build of master's book)
import fs from 'fs';
import { run, sleep } from './duel/browser-harness.mjs';

const RECORD = process.argv.includes('--record');
const FIXTURE = 'scripts/fixtures/book-page-baseline.json';
// The owner's two phone pages (spec §4.3), of different heights: 2440 is the taller one at 412 px.
const SHORT = 2439, TALL = 2440;
const QUIET_TOURS = { seen: { start: 1, word: 1, review: 1, settings: 1 }, tips: {}, welcomeDone: true, tipsOff: true, listOpened: true };
const settings = (lighting: string) => ({ speed: 'realistic', sounds: true, lighting });
const DESK_SIZES = [{ width: 1440, height: 900, mobile: false }, { width: 1280, height: 800, mobile: false }];
const PHONE_SIZES = [{ width: 360, height: 780, mobile: true }, { width: 412, height: 915, mobile: true }];
const D1440 = DESK_SIZES[0], P412 = PHONE_SIZES[1];
const SPREAD = { w: 1120, h: 640 };
const BOOK_DEFAULT_AIM = { x: 0.25, y: 0.28 }, PHONE_POOL = { x: 0.45, y: 0.23 };

// Rects and styles, in the page.
const RECT_JS = `const rect = (el) => { if (!el) return null; const r = el.getBoundingClientRect(); return { x: +r.left.toFixed(2), y: +(r.top + scrollY).toFixed(2), w: +r.width.toFixed(2), h: +r.height.toFixed(2) }; };
  const live = (sel) => [...document.querySelectorAll(sel)].filter((e) => !e.closest('[aria-hidden="true"]'));
  const STYLE_KEYS = ['font', 'lineHeight', 'textAlign', 'margin', 'padding', 'color'];
  const styles = () => live('.entry-text').slice(0, 3).map((e) => { const s = getComputedStyle(e); return Object.fromEntries(STYLE_KEYS.map((k) => [k, s[k]])); });`;

// Colour helpers, copied from test-evening-browser.mjs (the evening contrast walk), limited to text under `roots`.
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
  const over = (top, bottom) => ({ r: top.r * top.a + bottom.r * (1 - top.a), g: top.g * top.a + bottom.g * (1 - top.a), b: top.b * top.a + bottom.b * (1 - top.a), a: 1 });
  const lowText = (roots) => {
    const out = [];
    for (const root of roots.flatMap((s) => [...document.querySelectorAll(s)])) for (const el of root.querySelectorAll('*')) {
      if (![...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim())) continue;
      if (el.closest('script, style, noscript, [disabled], [aria-disabled="true"], .ui-visually-hidden, [aria-hidden="true"]')) continue;
      if (el.matches('.letter-rail-letter[data-current="true"]')) continue;
      const box = el.getBoundingClientRect();
      const s = getComputedStyle(el);
      if (!box.width || !box.height || s.visibility === 'hidden') continue;
      let alpha = 1; const layers = [];
      for (let n = el; n; n = n.parentElement) {
        const cs = getComputedStyle(n);
        alpha *= Number(cs.opacity);
        if (cs.display === 'none') { alpha = 0; break; }
        const stops = n.classList.contains('pencil-underlined') ? [] : parseAll(cs.backgroundImage);
        const solid = parseAll(cs.backgroundColor).filter((c) => c.a > 0);
        if (stops.length) layers.push(stops);
        else if (solid.length) layers.push(solid);
        const last = layers[layers.length - 1];
        if (last && last.every((c) => c.a >= 0.99)) break;
      }
      if (alpha < 0.05 || !layers.length) continue;
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
  };`;

// Every visible piece of text under `roots` (elements holding a text node), with the centre of its first line box.
// The probe style makes everything hit-testable, so elementsFromPoint lists layers that normally let clicks through.
const STACK_JS = `
  const texts = (roots) => roots.flatMap((s) => [...document.querySelectorAll(s)]).flatMap((root) => [root, ...root.querySelectorAll('*')]).filter((el) => {
    if (![...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim())) return false;
    if (el.closest('script, style, noscript, .ui-visually-hidden, svg')) return false;
    const s = getComputedStyle(el); const r = el.getClientRects()[0];
    return r && r.width > 1 && r.height > 1 && s.visibility !== 'hidden' && Number(s.opacity) > 0;
  });
  const probe = (fn) => {
    const st = document.createElement('style'); st.textContent = '*, *::before, *::after { pointer-events: auto !important; }';
    document.head.appendChild(st);
    try { return fn(); } finally { st.remove(); }
  };
  const mid = (el) => { const r = el.getClientRects()[0]; return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; };
  const at = (el) => { const p = mid(el); return document.elementsFromPoint(p.x, p.y); };
  // Cut off by an ancestor's overflow (an ellipsis, a page edge): not drawn at its centre, so nothing to compare there.
  const clipped = (el) => { const p = mid(el); for (let n = el.parentElement; n; n = n.parentElement) {
    if (getComputedStyle(n).overflow === 'visible') continue; const r = n.getBoundingClientRect();
    if (p.x < r.left || p.x > r.right || p.y < r.top || p.y > r.bottom) return true; } return false; };
  const label = (el) => (el.id ? '#' + el.id : el.tagName.toLowerCase() + (typeof el.className === 'string' && el.className ? '.' + el.className.split(' ')[0] : '')) + ' "' + el.textContent.trim().slice(0, 20) + '"';`;

await run('Book lamp', async (t: any) => {
  const { check, evaluate, waitFor, open, setSize, reduceMotion } = t;

  /** Opens a Book page at a size and lighting, and waits for its text and fonts. */
  const load = async (size: any, page: number, lighting: string, desk: Record<string, unknown> | null = { noted: true }) => {
    await setSize(size);
    await open(`/page/${page}`, { panna_tours: QUIET_TOURS, panna_settings: settings(lighting), ...(desk ? { panna_desk: desk } : {}) });
    await waitFor(`document.readyState === 'complete' && document.querySelectorAll('.entry-text').length > 0 && Boolean(document.querySelector(${JSON.stringify(size.mobile ? '#mobile-page' : '#book-spread-container')}))`, 20000);
    await evaluate(`document.fonts.ready.then(() => true)`);
    await evaluate(`window.scrollTo(0, 0); true`);
    await sleep(500);
  };
  const deskRects = () => evaluate(`(() => { ${RECT_JS} return { spread: rect(document.querySelector('#book-spread-container')),
    prev: rect(document.querySelector('button[aria-label="Previous spread"]')), pill: rect(document.querySelector('#page-number-btn')),
    next: rect(document.querySelector('button[aria-label="Next spread"]')) }; })()`);
  const phoneRects = () => evaluate(`(() => { ${RECT_JS} return { page: rect(document.querySelector('#mobile-page')),
    prev: rect(document.querySelector('button[aria-label="Previous page"]')), pill: rect(document.querySelector('#page-number-btn')),
    next: rect(document.querySelector('button[aria-label="Next page"]')) }; })()`);
  const entryStyles = () => evaluate(`(() => { ${RECT_JS} return styles(); })()`);

  /** The page as it is now: every rect and style the baseline holds. */
  const measure = async () => {
    const out: any = { desktop: {}, phone: {}, styles: { desktop: {}, phone: {} } };
    for (const size of DESK_SIZES) { await load(size, 400, 'day'); out.desktop[`${size.width}x${size.height}`] = await deskRects(); }
    for (const size of PHONE_SIZES) {
      const at: any = {};
      for (const page of [TALL, SHORT]) { await load(size, page, 'day'); at[page] = await phoneRects(); }
      out.phone[`${size.width}x${size.height}`] = at;
    }
    for (const lighting of ['day', 'evening']) {
      await load(D1440, 400, lighting); out.styles.desktop[lighting] = await entryStyles();
      await load(P412, TALL, lighting); out.styles.phone[lighting] = await entryStyles();
    }
    return out;
  };

  if (RECORD) {
    const base = await measure();
    const tall = base.phone['412x915'][TALL].page.h, short = base.phone['412x915'][SHORT].page.h;
    check(`pages ${TALL} and ${SHORT} differ in height by at least 40 px (${tall} vs ${short})`, Math.abs(tall - short) >= 40, { tall, short });
    fs.mkdirSync('scripts/fixtures', { recursive: true });
    fs.writeFileSync(FIXTURE, JSON.stringify(base, null, 2) + '\n');
    console.log(`Recorded ${FIXTURE}`);
    return;
  }

  // The tuned light values live in one exported constant (read here, so a retune changes one place).
  const { BOOK_LIGHT } = await import('../src/components/book/lamp/bookLight');
  const BOOK_LIGHT_B = BOOK_LIGHT.b;
  const attr = (sel: string, name: string) => evaluate(`document.querySelector(${JSON.stringify(sel)})?.getAttribute(${JSON.stringify(name)}) ?? null`);
  const spot = async () => ({ x: Number(await attr('#book-spot', 'pointsAtX')), y: Number(await attr('#book-spot', 'pointsAtY')) });
  const near = (a: number, b: number, d = 1) => Math.abs(a - b) <= d;

  // ── Desktop, Evening ──
  for (const [where, size, page, frame] of [['desktop', D1440, 400, '#book-spread-container'], ['phone', P412, TALL, '#mobile-page']] as const) {
    await load(size, page, 'evening');
    const layers = await evaluate(`(() => { const all = [...document.querySelectorAll('${frame} .book-light')].filter((l) => !l.closest('[aria-hidden="true"]:not(.book-light)'));
      return all.map((l) => ({ hidden: l.getAttribute('aria-hidden'), pe: getComputedStyle(l).pointerEvents, z: getComputedStyle(l).zIndex, blend: getComputedStyle(l).mixBlendMode,
        first: l.parentElement.firstElementChild === l, lit: l.parentElement.classList.contains('book-lit') && getComputedStyle(l.parentElement).isolation === 'isolate',
        shown: getComputedStyle(l).visibility === 'visible' })); })()`);
    const want = where === 'desktop' ? 2 : 1;
    check(`${where}: light layers: one per page (${want})`, layers?.length === want && layers.every((l: any) => l.hidden === 'true' && l.pe === 'none' && l.z === '-1'
      && l.blend === 'screen' && l.first && l.lit && l.shown), layers);

    const under = await evaluate(`(() => { ${STACK_JS} return probe(() => {
      const bad = [];
      const roots = [...document.querySelectorAll('${frame}.book-lit, ${frame} .book-lit')].filter((p) => !p.closest('[aria-hidden="true"]'));
      let n = 0;
      for (const root of roots) for (const el of [root, ...root.querySelectorAll('*')]) {
        if (![...el.childNodes].some((x) => x.nodeType === 3 && x.textContent.trim())) continue;
        if (el.closest('.ui-visually-hidden, svg, [aria-hidden="true"]')) continue;
        const r = el.getClientRects()[0]; const s = getComputedStyle(el);
        if (!r || r.width <= 1 || r.height <= 1 || s.visibility === 'hidden') continue;
        if (clipped(el)) continue;
        n++;
        const list = at(el);
        const i = list.indexOf(el), j = list.findIndex((x) => x.closest('.book-light'));
        if (i < 0 || j < 0 || j < i) { bad.push({ text: label(el), i, j, top: list.slice(0, 4).map(label) }); continue; }
        const blended = list.slice(0, i).filter((x) => getComputedStyle(x).mixBlendMode !== 'normal');
        if (blended.length) bad.push({ text: label(el), blended: blended.map(label) });
      }
      return { n, bad };
    }); })()`);
    check(`${where}: the light is under every text (${under?.n} texts)`, under?.n > 10 && under.bad.length === 0, under?.bad.slice(0, 5));

    const dark = await evaluate(`(() => { ${STACK_JS} return probe(() => {
      const bad = []; const book = document.querySelector('${frame}');
      const all = texts(['main']).filter((el) => !el.closest('[aria-hidden="true"]') && !clipped(el));
      for (const el of all) {
        const list = at(el);
        const d = list.findIndex((x) => x.closest('.book-desk-dark'));
        if (d < 0) continue;
        const i = list.indexOf(el), b = list.indexOf(book);
        if (i < 0 || d < i || (b >= 0 && d < b)) bad.push({ text: label(el), i, b, d });
      }
      // It multiplies with the desk itself: in the isolated .app-main's own stacking context (inside a wrapper of its own it
      // would multiply with nothing and paint its raw colours).
      const dd = document.querySelector('.book-desk-dark');
      let box = dd?.parentElement; while (box && getComputedStyle(box).display === 'contents') box = box.parentElement; // the Book section's wrapper has no box
      const desk = Boolean(dd) && box?.matches('main.app-main') && getComputedStyle(box).isolation === 'isolate'
        && getComputedStyle(dd).mixBlendMode === 'multiply' && getComputedStyle(dd).zIndex === '-1';
      return { n: all.length, desk, bad };
    }); })()`);
    check(`${where}: the darkness stays on the desk (${dark?.n} texts)`, dark?.desk && dark.n > 10 && dark.bad.length === 0, dark);

    if (where === 'desktop') {
      const filter = await evaluate(`(() => { const f = document.querySelector('#book-spot-filter'); if (!f) return null; const a = (sel, n) => f.querySelector(sel)?.getAttribute(n);
        return { units: f.getAttribute('filterUnits'), prim: f.getAttribute('primitiveUnits'), region: ['x', 'y', 'width', 'height'].map((n) => f.getAttribute(n)).join(' '),
          freq: a('feTurbulence', 'baseFrequency'), scale: a('feDiffuseLighting', 'surfaceScale'), kd: a('feDiffuseLighting', 'diffuseConstant'),
          color: a('feDiffuseLighting', 'lighting-color'), z: a('#book-spot', 'z'), exp: a('#book-spot', 'specularExponent'), cone: a('#book-spot', 'limitingConeAngle'),
          composite: f.querySelectorAll('feComposite').length, used: document.querySelectorAll('[filter="url(#book-spot-filter)"]').length }; })()`);
      check('B: the filter (grain, diffuse light, spotlight, no feComposite)', filter?.units === 'objectBoundingBox' && filter.prim === 'userSpaceOnUse' && filter.region === '0 0 1 1'
        && Number(filter.freq) === BOOK_LIGHT_B.baseFrequency && Number(filter.scale) === BOOK_LIGHT_B.surfaceScale && filter.color === BOOK_LIGHT_B.color && Number(filter.kd) === BOOK_LIGHT_B.diffuseConstant
        && Number(filter.z) === BOOK_LIGHT_B.z && Number(filter.exp) === BOOK_LIGHT_B.specularExponent && Number(filter.cone) === BOOK_LIGHT_B.coneAngle && filter.composite === 0 && filter.used >= 2, filter);
      const s = await spot();
      check('desktop: the pool rests at the default aim', near(s.x, BOOK_DEFAULT_AIM.x * SPREAD.w) && near(s.y, BOOK_DEFAULT_AIM.y * SPREAD.h), s);
      check('desktop: the base-layer copies of the light are hidden at rest', await evaluate(`(() => { const base = [...document.querySelectorAll('#book-spread-container .book-light')].filter((l) => l.closest('[data-book-base]'));
        return base.length === 2 && base.every((l) => getComputedStyle(l).visibility === 'hidden'); })()`));
      check('desktop: no light on the turning leaves (they never get one)', await evaluate(`!document.querySelector('[style*="preserve-3d"] .book-light')`));
    } else {
      const s = await spot();
      const box = await evaluate(`(() => { const p = document.querySelector('#mobile-page'); return { w: p.offsetWidth, h: p.offsetHeight }; })()`);
      check('phone: the pool rests at PHONE_POOL on the page', near(s.x, PHONE_POOL.x * box.w) && near(s.y, PHONE_POOL.y * box.h), { s, box });
    }
    const mutations = await evaluate(`new Promise((resolve) => { let n = 0; const s = document.querySelector('#book-spot'); if (!s) return resolve(-1);
      const mo = new MutationObserver((l) => { n += l.length; }); mo.observe(s, { attributes: true }); setTimeout(() => { mo.disconnect(); resolve(n); }, 1000); })`);
    check(`${where}: the filter stays still at rest`, mutations === 0, mutations);
    check(`${where}: a polite live region for the lamp`, (await attr('#book-live', 'aria-live')) === 'polite');

    // Day: the light and the darkness fade out and stop being drawn; the window light shows.
    await evaluate(`document.querySelector('#menu-btn').click(); true`);
    await waitFor(`Boolean(document.querySelector('#lighting-day'))`);
    await evaluate(`document.querySelector('#lighting-day').click(); true`);
    await evaluate(`document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); true`);
    await sleep(850);
    const day = await evaluate(`(() => { const v = (el) => (el ? getComputedStyle(el).visibility : null); const ls = [...document.querySelectorAll('.book-light')];
      const dd = document.querySelector('.book-desk-day');
      return { light: document.documentElement.dataset.light, layers: ls.length, hidden: ls.every((l) => v(l) === 'hidden'), dark: v(document.querySelector('.book-desk-dark')),
        day: dd && v(dd) === 'visible' && Number(getComputedStyle(dd).opacity) > 0.5 }; })()`);
    check(`${where}: Day: no pool, no darkness, and the window light shows`, day?.light === 'day' && day.layers > 0 && day.hidden && day.dark === 'hidden' && day.day, day);
  }

  // ── Version A ──
  const usesA = (frame: string) => evaluate(`(() => { const ls = [...document.querySelectorAll('${frame} .book-light')];
    return { n: ls.length, filter: Boolean(document.querySelector('[filter*="book-spot-filter"]')) || Boolean(document.querySelector('#book-spot-filter')),
      gradient: ls.every((l) => getComputedStyle(l).backgroundImage.includes('radial-gradient')) }; })()`);
  await reduceMotion(true);
  for (const [where, size, page, frame] of [['desktop', D1440, 400, '#book-spread-container'], ['phone', P412, TALL, '#mobile-page']] as const) {
    await load(size, page, 'evening');
    const a = await usesA(frame);
    check(`${where}: A under reduced motion`, a.n > 0 && !a.filter && a.gradient, a);
  }
  await reduceMotion(false);
  for (const [where, size, page, frame] of [['desktop', D1440, 400, '#book-spread-container'], ['phone', P412, TALL, '#mobile-page']] as const) {
    await load(size, page, 'evening', { noted: true, light: 'A' });
    const a = await usesA(frame);
    check(`${where}: A when panna_desk.light is 'A'`, a.n > 0 && !a.filter && a.gradient, a);
  }

  // ── Today: no Book lamp in the DOM ──
  await setSize(D1440);
  await open('/', { panna_tours: QUIET_TOURS, panna_settings: settings('evening'), panna_desk: { noted: true } });
  await waitFor(`Boolean(document.querySelector('#desk-lamp'))`, 15000);
  check('Today: no Book light, filter or desk layer while Today shows', await evaluate(`!document.querySelector('.book-light, #book-spot-filter, .book-desk-dark, #book-live')`));

  // ── A phone page that comes back: "Page not available" (no #mobile-page), then a real page ──
  // The controller must be made again on the live page, in both versions. The version changes (reduced motion on or
  // off) while no page shows, so the light is set up when there is no frame to find, and must catch up once there is.
  for (const v of ['B', 'A'] as const) {
    await reduceMotion(v === 'B');
    await load(P412, 400, 'evening');
    await evaluate(`(() => { window.__fetch = window.fetch; window.fetch = (u, ...a) => String(u).includes('/api/page/')
      ? Promise.resolve(new Response('{}', { status: 503 })) : window.__fetch(u, ...a); return true; })()`);
    await evaluate(`document.querySelector('#page-number-btn').click(); true`);
    await waitFor(`Boolean(document.querySelector('#goto-page-input'))`);
    const goTo = async (n: number) => {
      await evaluate(`(() => { const i = document.querySelector('#goto-page-input'); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(i, '${n}');
        i.dispatchEvent(new Event('input', { bubbles: true })); document.querySelector('#goto-go-btn').click(); return true; })()`);
    };
    await goTo(3000);
    const missing = await waitFor(`!document.querySelector('#mobile-page') && document.querySelector('#page-number-btn')?.textContent.trim() === 'Go to another page'`, 8000);
    check(`phone (${v}): an unloadable page shows "Page not available" (no #mobile-page)`, missing);
    await reduceMotion(v === 'A');
    await sleep(300);
    await evaluate(`window.fetch = window.__fetch; document.querySelector('#page-number-btn').click(); true`);
    await waitFor(`Boolean(document.querySelector('#goto-page-input'))`);
    await goTo(TALL);
    await waitFor(`document.querySelector('#mobile-page .entry-text') && !document.querySelector('#goto-sheet')`, 10000);
    await sleep(600);
    const back = await evaluate(`(() => { const p = document.querySelector('#mobile-page'); const s = document.querySelector('#book-spot');
      return { w: p.offsetWidth, h: p.offsetHeight, px: parseFloat(p.style.getPropertyValue('--pool-x')), py: parseFloat(p.style.getPropertyValue('--pool-y')),
        sx: s ? Number(s.getAttribute('pointsAtX')) : null, sy: s ? Number(s.getAttribute('pointsAtY')) : null,
        layer: Boolean(p.querySelector(':scope > .book-light')), gradient: getComputedStyle(p.querySelector('.book-light')).backgroundImage }; })()`);
    const pool = BOOK_LIGHT.pool.phone;
    const ok = back && back.layer && near(back.px, PHONE_POOL.x * back.w + pool.dx) && near(back.py, PHONE_POOL.y * back.h + pool.dy)
      && (v === 'B' ? near(back.sx, PHONE_POOL.x * back.w) && near(back.sy, PHONE_POOL.y * back.h) : back.sx === null && back.gradient.includes('radial-gradient'));
    check(`phone (${v}): back on a page, the pool sits at PHONE_POOL on the live #mobile-page`, ok, back);
  }
  await reduceMotion(false);

  // ── A desktop flip: the base-layer copies carry the light while it runs, the leaves never do ──
  await load(D1440, 400, 'evening');
  await evaluate(`document.querySelector('button[aria-label="Next spread"]').click(); true`);
  await waitFor(`Boolean(document.querySelector('[data-book-base][data-flipping]'))`, 3000);
  await sleep(150);
  const during = await evaluate(`(() => { const base = [...document.querySelectorAll('[data-book-base] .book-light')];
    return { flipping: Boolean(document.querySelector('[data-book-base][data-flipping]')), base: base.length, shown: base.every((l) => getComputedStyle(l).visibility === 'visible'),
      onLeaf: document.querySelectorAll('[style*="preserve-3d"] .book-light').length }; })()`);
  check('desktop flip: the base-layer light shows while it runs, and no light is on a turning leaf', during?.flipping && during.base === 2 && during.shown && during.onLeaf === 0, during);
  await waitFor(`!document.querySelector('[data-book-base][data-flipping]')`, 5000);
  await sleep(200);
  check('desktop flip: afterwards the base-layer copies are hidden again', await evaluate(`(() => { const base = [...document.querySelectorAll('[data-book-base] .book-light')];
    return base.length === 2 && base.every((l) => getComputedStyle(l).visibility === 'hidden'); })()`));

  // ── AA on unlit paper, and axe ──
  for (const lighting of ['day', 'evening']) {
    for (const [where, size, page, frame] of [['desktop', D1440, 400, '#book-spread-container'], ['phone', P412, TALL, '#mobile-page']] as const) {
      await load(size, page, lighting);
      const low = await evaluate(`(() => { ${COLOR_JS} return lowText([${JSON.stringify(frame)}]); })()`);
      check(`${where}, ${lighting}: every text on the page passes AA on unlit paper`, Array.isArray(low) && low.length === 0, low?.slice(0, 6));
      await t.axe(`${where}, ${lighting === 'day' ? 'Day' : 'Evening'}`);
    }
  }

  // ── The page doesn't change ──
  const base = JSON.parse(fs.readFileSync(FIXTURE, 'utf8'));
  const tallH = base.phone['412x915'][TALL].page.h, shortH = base.phone['412x915'][SHORT].page.h;
  check(`the baseline still has a tall and a short page (${TALL}: ${tallH}, ${SHORT}: ${shortH})`, Math.abs(tallH - shortH) >= 40,
    'The book was rebuilt and these two pages no longer differ by 40 px: pick a new tall/short pair and record again.');
  const now = await measure();
  const diffs: string[] = [];
  const cmp = (path: string, a: any, b: any) => {
    if (a && typeof a === 'object') { for (const k of new Set([...Object.keys(a), ...Object.keys(b ?? {})])) cmp(`${path}.${k}`, a[k], b?.[k]); return; }
    if (typeof a === 'number' && typeof b === 'number' ? Math.abs(a - b) > 0.5 : a !== b) diffs.push(`${path}: ${a} → ${b}`);
  };
  cmp('page', base, now);
  check('the page doesn\'t change (every baseline rect within 0.5 px, every entry style equal)', diffs.length === 0, diffs.slice(0, 10));
});
