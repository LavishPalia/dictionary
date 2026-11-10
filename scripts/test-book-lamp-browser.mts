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
    // Wait for the fade to end (it is slow in headless Edge): the layers and the darkness turn hidden, or 2 s pass.
    await waitFor(`(() => { const ls = [...document.querySelectorAll('.book-light')]; const d = document.querySelector('.book-desk-dark');
      return ls.length > 0 && ls.every((l) => getComputedStyle(l).visibility === 'hidden') && (!d || getComputedStyle(d).visibility === 'hidden'); })()`, 2000);
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

  // ── The desktop lamp (Task 3): it leans in from the top-left; its shade switches the light and aims it ──
  const { send } = t;
  const stored = async () => JSON.parse((await evaluate(`localStorage.getItem('panna_settings')`)) ?? 'null');
  const deskStore = async () => JSON.parse((await evaluate(`localStorage.getItem('panna_desk')`)) ?? 'null');
  const dataLight = () => evaluate(`document.documentElement.getAttribute('data-light')`);
  const center = (sel: string) => evaluate(`(() => { const el = document.querySelector(${JSON.stringify(sel)}); if (!el) return null; const r = el.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()`);
  const mouse = (type: string, x: number, y: number) => send('Input.dispatchMouseEvent', { type, x, y, button: 'left', buttons: type === 'mouseReleased' ? 0 : 1, clickCount: 1 });
  /** Presses at (x, y), moves by (dx, dy) in steps, and lets go. */
  const dragAt = async (x: number, y: number, dx: number, dy: number, steps = 8) => {
    await mouse('mousePressed', x, y);
    for (let i = 1; i <= steps; i++) { await mouse('mouseMoved', x + (dx * i) / steps, y + (dy * i) / steps); await sleep(16); }
    await mouse('mouseReleased', x + dx, y + dy);
    await sleep(150);
  };
  const drag = async (sel: string, dx: number, dy: number) => { const c = await center(sel); await dragAt(c.x, c.y, dx, dy); return c; };
  const clickAt = async (sel: string) => { const c = await center(sel); await mouse('mousePressed', c.x, c.y); await mouse('mouseReleased', c.x, c.y); await sleep(150); };
  const press = async (key: string, code: string, vk: number, modifiers = 0) => {
    await send('Input.dispatchKeyEvent', { type: 'keyDown', key, code, windowsVirtualKeyCode: vk, modifiers });
    await send('Input.dispatchKeyEvent', { type: 'keyUp', key, code, windowsVirtualKeyCode: vk, modifiers });
    await sleep(60);
  };
  const lampShown = () => evaluate(`(() => { const b = document.querySelector('#book-lamp'), a = document.querySelector('.book-lamp-art'); if (!b || !a) return false;
    const r = b.getBoundingClientRect(); return !b.hidden && !a.hasAttribute('hidden') && r.width > 0 && getComputedStyle(a).display !== 'none'; })()`);
  const dupIds = () => evaluate(`(() => { const seen = new Map(); for (const el of document.querySelectorAll('[id]')) seen.set(el.id, (seen.get(el.id) ?? 0) + 1);
    return [...seen].filter(([, n]) => n > 1).map(([id]) => id); })()`);
  const watchErrors = () => evaluate(`(() => { window.__errs = []; addEventListener('error', (e) => window.__errs.push(String(e.message)));
    const ce = console.error; console.error = (...a) => { window.__errs.push(String(a[0]).slice(0, 200)); ce.apply(console, a); }; return true; })()`);
  // The shade's real box (its drawn head: shade, rim, glow and hinge) against what it must never cover, in viewport px:
  // the spread, its leather cover (14 units round it), the left arrow, the header and the page count. `gap` is the
  // smallest clearance to any of them (negative or 0 = touching).
  const clearOfAll = () => evaluate(`(() => { const R = (el) => el && el.getBoundingClientRect(); const lamp = R(document.querySelector('.book-lamp-art [data-lamp="head"]'));
    const sp = R(document.querySelector('#book-spread-container')), c = 14 * sp.width / 1120;
    const avoid = { spread: sp, cover: { left: sp.left - c, top: sp.top - c, right: sp.right + c, bottom: sp.bottom + c },
      arrow: R(document.querySelector('button[aria-label="Previous spread"]')), header: R(document.querySelector('.app-header')), count: R(document.querySelector('#page-number-btn')) };
    const sep = (a) => Math.max(a.left - lamp.right, lamp.left - a.right, a.top - lamp.bottom, lamp.top - a.bottom);
    const gaps = Object.fromEntries(Object.entries(avoid).filter(([, a]) => a).map(([k, a]) => [k, +sep(a).toFixed(1)]));
    return { hit: Object.keys(gaps).filter((k) => gaps[k] <= 0), gap: Math.min(...Object.values(gaps)), gaps, inView: lamp.left >= 0 && lamp.top >= 0,
      lamp: [lamp.left, lamp.top, lamp.right, lamp.bottom].map(Math.round), s: getComputedStyle(document.querySelector('#book-lamp')).getPropertyValue('--lamp-s').trim() }; })()`);
  const LAMP_B = { noted: true, light: 'B' };

  await load(D1440, 400, 'evening', LAMP_B);
  const named = await evaluate(`(() => { const b = document.querySelector('#book-lamp'); if (!b) return null; const hint = document.getElementById(b.getAttribute('aria-describedby') ?? '');
    return { tag: b.tagName, name: b.getAttribute('aria-label'), pressed: b.getAttribute('aria-pressed'), hint: hint?.textContent, cls: b.className,
      art: document.querySelector('.book-lamp-art')?.getAttribute('aria-hidden') }; })()`);
  check('the lamp is a button named "Desk lamp, on: Evening lighting"', named?.tag === 'BUTTON' && named.name === 'Desk lamp, on: Evening lighting' && named.pressed === 'true'
    && named.cls === 'book-lamp-hit' && named.hint === 'Drag the shade to aim the light. Arrow keys aim it; Home puts it back.' && named.art === 'true', named);
  check('desktop lamp: it shows at 1440 × 900', await lampShown());
  await evaluate(`document.querySelector('#book-lamp').focus(); true`);
  await press('Shift', 'ShiftLeft', 16); // a key press makes the focus visible
  check('desktop lamp: the shade has a visible focus ring', await evaluate(`(() => { const b = document.querySelector('#book-lamp'); const s = getComputedStyle(b);
    return b.matches(':focus-visible') && s.outlineStyle !== 'none' && parseFloat(s.outlineWidth) >= 2; })()`));
  await evaluate(`document.activeElement?.blur(); true`);
  await clickAt('#book-lamp');
  check('clicking the lamp switches to Day and says so', (await dataLight()) === 'day' && (await stored())?.lighting === 'day'
    && (await attr('#book-lamp', 'aria-label'))?.endsWith('off: Day lighting') && (await attr('#book-lamp', 'aria-pressed')) === 'false', await stored());
  check('#book-live says "Lamp off: Day lighting."', (await evaluate(`document.querySelector('#book-live')?.textContent`)) === 'Lamp off: Day lighting.');
  await evaluate(`document.querySelector('#menu-btn').click(); true`);
  await waitFor(`Boolean(document.querySelector('#lighting-day'))`);
  check('the ⋯ menu shows Day after the switch', (await attr('#lighting-day', 'aria-checked')) === 'true');
  await evaluate(`document.querySelector('#lighting-evening').click(); true`);
  await evaluate(`document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); true`);
  await sleep(300);
  check('picking Evening in the menu lights the lamp', (await attr('#book-lamp', 'aria-pressed')) === 'true' && (await dataLight()) === 'evening');
  await clickAt('#book-lamp');
  await clickAt('#book-lamp');
  check('#book-live says "Lamp on: Evening lighting." after switching back on', (await evaluate(`document.querySelector('#book-live')?.textContent`)) === 'Lamp on: Evening lighting.');
  await clickAt('#book-lamp'); // off again, then Today
  const pressedHere = await attr('#book-lamp', 'aria-pressed');
  check('no duplicate ids on the Book page', (await dupIds()).length === 0, await dupIds());
  await evaluate(`document.querySelector('#open-today-btn').click(); true`);
  await waitFor(`Boolean(document.querySelector('#desk-lamp'))`, 10000);
  check('Today\'s lamp agrees after a switch on the Book page', (await attr('#desk-lamp', 'aria-pressed')) === pressedHere && pressedHere === 'false', { pressedHere });
  check('no duplicate ids on Today (from the Book page)', (await dupIds()).length === 0, await dupIds());
  await evaluate(`document.querySelector('#open-today-btn').click(); true`);
  await waitFor(`Boolean(document.querySelector('#book-lamp'))`, 10000);
  check('no duplicate ids back on the Book page', (await dupIds()).length === 0, await dupIds());
  await evaluate(`document.querySelector('#open-today-btn').click(); true`);
  await waitFor(`Boolean(document.querySelector('#desk-lamp')) && !document.querySelector('#book-lamp')`, 10000);
  check('no duplicate ids on Today again (Today → Book → Today)', (await dupIds()).length === 0, await dupIds());

  // The one-time note, shared with Today through `noted`.
  await load(D1440, 400, 'evening', { light: 'B' });
  await clickAt('#book-lamp');
  check('the note shows on the first switch on a device', await waitFor(`Boolean(document.querySelector('#book-note'))`, 2000));
  await evaluate(`document.querySelector('#book-note-auto').click(); true`);
  await sleep(200);
  check('Use Auto stores Auto and puts focus on #book-lamp', (await stored())?.lighting === 'auto' && (await evaluate(`document.activeElement?.id`)) === 'book-lamp',
    { s: await stored(), f: await evaluate(`document.activeElement?.id`) });
  await load(D1440, 400, 'evening', LAMP_B);
  await clickAt('#book-lamp');
  await sleep(300);
  check('the note shows once, shared with Today (noted set: no #book-note)', !(await evaluate(`Boolean(document.querySelector('#book-note'))`)));

  // Dragging the shade aims the light; a small move still switches.
  await load(D1440, 400, 'evening', LAMP_B);
  const frameBox = await evaluate(`(() => { const r = document.querySelector('#book-spread-container').getBoundingClientRect(); return { x: r.left, y: r.top, k: r.width / 1120 }; })()`);
  const from = await drag('#book-lamp', 200, 120);
  // The light glides to the new aim (slowly in headless Edge, which draws the filter without a GPU).
  await waitFor(`!document.querySelector('#book-spread-container').dataset.lightMoving`, 8000);
  const dropped = await deskStore(), s1 = await spot();
  const wantX = (from.x + 200 - frameBox.x) / frameBox.k, wantY = (from.y + 120 - frameBox.y) / frameBox.k;
  check('dragging the shade aims the light (bookAim stored, Today\'s aim untouched, the spotlight follows)', dropped?.bookAim && dropped.aim === undefined
    && near(dropped.bookAim.x * SPREAD.w, wantX, 2) && near(dropped.bookAim.y * SPREAD.h, wantY, 2) && near(s1.x, wantX, 2) && near(s1.y, wantY, 2), { dropped, s1, wantX, wantY });
  check('a drag doesn\'t switch the lamp', (await dataLight()) === 'evening');
  check('the light comes from the shade\'s mouth, left of the spread and up-left of the spot', await evaluate(`(() => { const s = document.querySelector('#book-spot');
    return Number(s.getAttribute('x')) < 0 && Number(s.getAttribute('x')) < Number(s.getAttribute('pointsAtX')) && Number(s.getAttribute('y')) < Number(s.getAttribute('pointsAtY')); })()`));
  await drag('#book-lamp', 4, 0);
  check('a 4 px move switches instead', (await dataLight()) === 'day' && (await deskStore())?.bookAim?.x === dropped?.bookAim?.x);

  // The keys, with the shade focused.
  await load(D1440, 400, 'evening', LAMP_B);
  await evaluate(`document.querySelector('#book-lamp').focus(); true`);
  await press('ArrowRight', 'ArrowRight', 39);
  const k1 = (await deskStore())?.bookAim;
  check('ArrowRight aims 20 px right', k1 && near(k1.x * SPREAD.w, BOOK_DEFAULT_AIM.x * SPREAD.w + 20, 1) && near(k1.y, BOOK_DEFAULT_AIM.y, 0.002), k1);
  await press('ArrowDown', 'ArrowDown', 40, 8);
  const k2 = (await deskStore())?.bookAim;
  check('Shift+ArrowDown aims 60 px down', k2 && near(k2.y * SPREAD.h, BOOK_DEFAULT_AIM.y * SPREAD.h + 60, 1) && near(k2.x, k1.x, 0.002), k2);
  await press('Home', 'Home', 36);
  const k3 = (await deskStore())?.bookAim;
  check('Home puts it back (0.25, 0.28)', k3?.x === 0.25 && k3?.y === 0.28 && (await deskStore())?.aim === undefined, k3);
  check('the keys don\'t switch the lamp', (await dataLight()) === 'evening');

  // The aim stays on the spread.
  const c0 = await center('#book-lamp');
  await dragAt(c0.x, c0.y, 1430 - c0.x, 890 - c0.y);
  const far = (await deskStore())?.bookAim;
  check('the aim stays on the spread (stored fractions ≤ 1)', far && far.x <= 1 && far.y <= 1 && far.x >= 0.99 && far.y >= 0.99, far);

  // Touches: only the shade takes them over.
  const touch = await evaluate(`(() => { const ta = (el) => el && getComputedStyle(el).touchAction;
    return { lamp: ta(document.querySelector('#book-lamp')), spread: ta(document.querySelector('#book-spread-container')), pages: [...document.querySelectorAll('#book-spread-container .book-lit')].map(ta) }; })()`);
  check('touch-action none only on the shade', touch.lamp === 'none' && touch.spread === 'auto' && touch.pages.length > 0 && touch.pages.every((v: string) => v === 'auto' || v === 'pan-y'), touch);

  // Nothing lies over the entries.
  const over = await evaluate(`(() => { const bad = []; const all = [...document.querySelectorAll('#book-spread-container .entry-open')].filter((e) => !e.closest('[aria-hidden="true"]'));
    for (const e of all) { const r = e.getBoundingClientRect(); const top = document.elementsFromPoint(r.left + r.width / 2, r.top + r.height / 2)[0];
      if (!top || !e.contains(top)) bad.push({ word: e.textContent, top: top?.id || top?.className }); }
    return { n: all.length, bad }; })()`);
  check(`nothing over the entries (${over?.n} entries)`, over?.n > 10 && over.bad.length === 0, over);

  // Review Focus 4: a drag released over an entry opens nothing; selecting text across entries still works.
  await load(D1440, 400, 'evening', LAMP_B);
  const e1 = await center('#book-spread-container .entry-open');
  const lc = await center('#book-lamp');
  await dragAt(lc.x, lc.y, e1.x - lc.x, e1.y - lc.y);
  await sleep(400);
  check('a shade drag released over an entry opens no word sheet', !(await evaluate(`(() => { const s = document.querySelector('#word-sheet'); if (!s) return false;
    const r = s.getBoundingClientRect(); return r.width > 0 && getComputedStyle(s).visibility !== 'hidden'; })()`)) && (await dataLight()) === 'evening');
  const sel = await evaluate(`(() => { const ps = [...document.querySelectorAll('#book-spread-container .entry-text')].filter((p) => !p.closest('[aria-hidden="true"]'));
    const a = ps[0].querySelector('.entry-hindi').getBoundingClientRect(), b = ps[1].querySelector('.entry-hindi').getBoundingClientRect();
    return { a: { x: a.left + 2, y: a.top + a.height / 2 }, b: { x: b.right - 2, y: b.top + b.height / 2 } }; })()`);
  await evaluate(`getSelection().removeAllRanges(); true`);
  await dragAt(sel.a.x, sel.a.y, sel.b.x - sel.a.x, sel.b.y - sel.a.y);
  const picked = await evaluate(`getSelection().toString()`);
  check('a mouse drag across two entries still selects text', typeof picked === 'string' && picked.trim().length > 10, picked);
  await evaluate(`getSelection().removeAllRanges(); true`);

  // Review Focus 3: the lamp is fitted to the space from 1024 px up, clear of the book, its cover, the left arrow, the header
  // and the page count wherever it is aimed (the default aim and the spread's four corners); 8 px clear at 1430 and 1440.
  const settle = () => waitFor(`!document.querySelector('#book-spread-container').dataset.lightMoving`, 8000);
  for (const [w, h] of [[1024, 768], [1280, 800], [1366, 768], [1400, 900], [1430, 900], [1440, 900], [1920, 1080]]) {
    await load({ width: w, height: h, mobile: false }, 400, 'evening', { noted: true, light: 'A' });
    const shown = await lampShown();
    const seen: any[] = [];
    if (shown) {
      await evaluate(`document.querySelector('#book-lamp').focus(); true`);
      await press('Home', 'Home', 36); await settle(); seen.push({ at: 'rest', ...(await clearOfAll()) });
      for (const [tx, ty, at] of [[1, 1, 'top left'], [w - 2, 1, 'top right'], [1, h - 2, 'bottom left'], [w - 2, h - 2, 'bottom right']] as const) {
        const c = await center('#book-lamp');
        await dragAt(c.x, c.y, tx - c.x, ty - c.y);
        await settle();
        seen.push({ at, aim: (await deskStore())?.bookAim, ...(await clearOfAll()) });
      }
    }
    const worst = seen.reduce((m, x) => Math.min(m, x.gap), Infinity);
    const need = w >= 1430 ? 8 : 0;
    console.log(`  ${w} × ${h}: head scale ${seen[0]?.s || '-'}, smallest clearance ${worst.toFixed(1)} px`);
    check(`${w} × ${h}: the lamp shows, its shade clear of the spread, cover, arrow, header and page count at every aim${need ? ' by 8 px or more' : ''}`,
      shown && seen.length === 5 && seen.every((x) => x.hit.length === 0 && x.inView && (need ? x.gap >= need : x.gap > 0)), seen.map((x) => ({ at: x.at, gap: x.gap, hit: x.hit, lamp: x.lamp, s: x.s })));
  }
  await load(D1440, 400, 'evening', { ...LAMP_B, bookAim: { x: 0.4, y: 0.5 } });
  await watchErrors();
  await setSize({ width: 1100, height: 800, mobile: false });
  await sleep(500);
  const at1100 = await clearOfAll();
  check('1440 → 1100: the lamp refits (smaller head) and stays clear', (await lampShown()) && at1100.hit.length === 0 && Number(at1100.s) < 1, at1100);
  await setSize(D1440);
  await sleep(500);
  check('1440 → 1100 → 1440: the lamp comes back, bookAim kept, no console errors', (await lampShown()) && JSON.stringify((await deskStore())?.bookAim) === JSON.stringify({ x: 0.4, y: 0.5 })
    && (await evaluate(`window.__errs.length`)) === 0 && (await clearOfAll()).gap >= 8, await evaluate(`window.__errs`));
  await setSize({ width: 800, height: 900, mobile: false });
  check('1440 → 800: the phone page, no lamp', await waitFor(`Boolean(document.querySelector('#mobile-page')) && !document.querySelector('#book-lamp, .book-lamp-art')`, 5000));
  await setSize(D1440);
  check('800 → 1440: the spread and the lamp come back cleanly', await waitFor(`Boolean(document.querySelector('#book-spread-container')) && Boolean(document.querySelector('#book-lamp'))`, 5000)
    && (await lampShown()) && (await evaluate(`window.__errs.length`)) === 0 && (await dupIds()).length === 0, { errs: await evaluate(`window.__errs`), dup: await dupIds() });
  await sleep(600);
  await settle();
  const back = await spot();
  check('800 → 1440: the light rests at the stored aim', near(back.x, 0.4 * SPREAD.w) && near(back.y, 0.5 * SPREAD.h), back);
  check('the light comes from the shade’s mouth (the spotlight’s source is inside the drawn head)', await evaluate(`(() => { const s = document.querySelector('#book-spot');
    const sp = document.querySelector('#book-spread-container').getBoundingClientRect(), k = sp.width / 1120;
    const x = sp.left + Number(s.getAttribute('x')) * k, y = sp.top + Number(s.getAttribute('y')) * k;
    const h = document.querySelector('.book-lamp-art [data-lamp="head"]').getBoundingClientRect();
    return x >= h.left && x <= h.right && y >= h.top && y <= h.bottom; })()`));

  // No lamp over the cover.
  await load(D1440, 400, 'evening', LAMP_B);
  await evaluate(`document.querySelector('#menu-btn').click(); true`);
  await waitFor(`Boolean(document.querySelector('#cover-toggle-btn'))`);
  await evaluate(`document.querySelector('#cover-toggle-btn').click(); true`);
  await waitFor(`!document.querySelector('#book-spread-container')`, 5000);
  check('no lamp over the cover', !(await evaluate(`Boolean(document.querySelector('#book-lamp, .book-lamp-art'))`)));

  // Reduced motion: the switch is instant.
  await reduceMotion(true);
  await load(D1440, 400, 'evening', LAMP_B);
  await clickAt('#book-lamp');
  check('reduced motion: no light-fading class after a switch', (await dataLight()) === 'day' && !(await evaluate(`document.documentElement.classList.contains('light-fading')`)));
  await reduceMotion(false);

  // ── The phone's brass push-switch (Task 4): on the page's foot, right of the page number ──
  const SW = '#book-switch';
  /** A key with its character, as a keyboard sends it (a button's Space and Enter need the text to click). */
  const typeKey = async (key: string, code: string, vk: number, text: string) => {
    await send('Input.dispatchKeyEvent', { type: 'keyDown', key, code, windowsVirtualKeyCode: vk, text });
    await send('Input.dispatchKeyEvent', { type: 'keyUp', key, code, windowsVirtualKeyCode: vk });
    await sleep(600);
  };
  const footGeometry = () => evaluate(`(() => { ${RECT_JS}
    const sw = document.querySelector('#book-switch'); if (!sw) return null;
    const row = sw.parentElement, r = (el) => el.getBoundingClientRect();
    const pill = r(document.querySelector('#page-number-btn')), next = r(document.querySelector('button[aria-label="Next page"]')), s = r(sw), f = r(row);
    const spacer = row.querySelector('.book-switch-spacer');
    const kids = [...row.children].map((c) => c.id || c.className || c.getAttribute('aria-label'));
    const probe = (x) => document.elementsFromPoint(x, s.top + s.height / 2).filter((e) => e.closest('#book-switch, #page-number-btn, button[aria-label="Next page"], button[aria-label="Previous page"]')).map((e) => e.id || e.tagName);
    const sc = getComputedStyle(sw);
    return { w: s.width, h: s.height, rowH: f.height, rowCx: f.left + f.width / 2, pillCx: pill.left + pill.width / 2, gapL: s.left - pill.right, gapR: next.left - s.right,
      pad: sc.padding, before: getComputedStyle(sw, '::before').content, after: getComputedStyle(sw, '::after').content, spacer: spacer ? r(spacer).width : null, kids,
      hitL: probe(s.left - 2), hitR: probe(s.right + 2),
      rects: { prev: rect(document.querySelector('button[aria-label="Previous page"]')), pill: rect(document.querySelector('#page-number-btn')), next: rect(document.querySelector('button[aria-label="Next page"]')) },
      label: sw.getAttribute('aria-label'), pressed: sw.getAttribute('aria-pressed'), type: sw.tagName + ':' + sw.type }; })()`);
  for (const size of PHONE_SIZES) for (const page of [TALL, SHORT]) for (const lighting of ['day', 'evening']) {
    const where = `switch, ${size.width} px, p. ${page}, ${lighting}`;
    await load(size, page, lighting);
    const g: any = await footGeometry();
    check(`${where}: #book-switch is a 44 × 44 button with no padding or pseudo-element`, g && near(g.w, 44, 0.01) && near(g.h, 44, 0.01) && g.type === 'BUTTON:button' && g.pad === '0px' && g.before === 'none' && g.after === 'none', g);
    check(`${where}: the foot is ←, spacer, pill, switch, → and 56 px tall`, g && g.rowH === 56 && g.spacer === 44 && g.kids.length === 5 && g.kids[1] === 'book-switch-spacer' && g.kids[2] === 'page-number-btn' && g.kids[3] === 'book-switch', g);
    check(`${where}: the pill is centred on the foot`, g && near(g.pillCx, g.rowCx, 1), g);
    // Equal gaps. The owner's ~21 px is at 412; the pill is fixed, so at 360 px only ~7 px (6.8 on p. 2440) is left each side of a 44 px switch.
    check(`${where}: the switch is centred between the pill and → (gaps ${g?.gapL?.toFixed(1)} / ${g?.gapR?.toFixed(1)}, each at least ${size.width >= 412 ? 16 : 6})`, g && near(g.gapL, g.gapR, 1) && g.gapL >= (size.width >= 412 ? 16 : 6), g);
    const b = base.phone[`${size.width}x${size.height}`][page];
    check(`${where}: ←, the pill and → sit where they did`, g && ['prev', 'pill', 'next'].every((k) => ['x', 'y', 'w', 'h'].every((m) => near(g.rects[k][m], b[k][m], 0.5))), { g: g?.rects, b });
    check(`${where}: 2 px outside the switch hits neither it, the pill nor →`, g && g.hitL.length === 0 && g.hitR.length === 0, g);
    check(`${where}: labelled and pressed to match the light`, g && g.label === (lighting === 'evening' ? 'Desk lamp, on: Evening lighting' : 'Desk lamp, off: Day lighting') && g.pressed === String(lighting === 'evening'), g);
    const glow = await evaluate(`(() => { const g = document.querySelector('#book-switch [data-glow]'); if (!g) return null; const s = getComputedStyle(g); return { op: Number(s.opacity), vis: s.visibility }; })()`);
    check(`${where}: the warm ring ${lighting === 'evening' ? 'shows' : 'is gone'}`, glow && (lighting === 'evening' ? glow.op > 0.9 && glow.vis === 'visible' : glow.op === 0 || glow.vis === 'hidden'), glow);
  }

  // Switching: a tap, Space, Enter and the ⋯ menu, each one switch.
  for (const size of PHONE_SIZES) {
    const where = `switch, ${size.width} px`;
    await load(size, TALL, 'evening');
    // At 360 px a tall page runs under the tab bar until the page is scrolled: bring the switch into view first.
    await evaluate(`document.querySelector('#book-switch').scrollIntoView({ block: 'center' }); true`);
    await sleep(200);
    await clickAt(SW);
    await sleep(500); // the light fades slowly in headless Edge
    check(`${where}: a tap switches once (Day, stored, pressed follows)`, (await dataLight()) === 'day' && (await stored())?.lighting === 'day' && (await attr(SW, 'aria-pressed')) === 'false'
      && (await attr(SW, 'aria-label')) === 'Desk lamp, off: Day lighting', { l: await dataLight(), s: await stored() });
    check(`${where}: #book-live says so`, (await evaluate(`document.querySelector('#book-live')?.textContent`)) === 'Lamp off: Day lighting.');
    await evaluate(`document.querySelector('#book-switch').focus(); true`);
    await typeKey(' ', 'Space', 32, ' ');
    check(`${where}: focus plus Space switches once`, (await dataLight()) === 'evening' && (await stored())?.lighting === 'evening', { l: await dataLight() });
    await typeKey('Enter', 'Enter', 13, '\r');
    check(`${where}: focus plus Enter switches once`, (await dataLight()) === 'day' && (await stored())?.lighting === 'day', { l: await dataLight() });
    await evaluate(`document.querySelector('#menu-btn').click(); true`);
    await waitFor(`Boolean(document.querySelector('#lighting-evening'))`);
    await evaluate(`document.querySelector('#lighting-evening').click(); true`);
    await evaluate(`document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); true`);
    await sleep(300);
    check(`${where}: the ⋯ menu lights the lamp and the switch follows`, (await attr(SW, 'aria-pressed')) === 'true' && (await dataLight()) === 'evening', { l: await dataLight() });
  }
  await load(P412, TALL, 'evening');
  check('switch: no duplicate ids on the phone page', (await dupIds()).length === 0, await dupIds());

  // The press: the cap sinks for about 120 ms (none under reduced motion).
  await evaluate(`document.querySelector('#book-switch').click(); true`);
  await sleep(80);
  const sunk = await evaluate(`(() => { const sw = document.querySelector('#book-switch'); return { on: sw.dataset.sunk, m: getComputedStyle(sw.querySelector('.book-switch-cap')).transform }; })()`);
  await sleep(400);
  const sunkAfter = await evaluate(`document.querySelector('#book-switch').dataset.sunk ?? null`);
  check('switch: the cap sinks on a press (scale below 1) and comes back', sunk.on === 'true' && sunk.m !== 'none' && Number(sunk.m.match(/matrix\(([^,]+)/)?.[1]) < 1 && sunkAfter === null, { sunk, sunkAfter });
  await reduceMotion(true);
  await load(P412, TALL, 'evening');
  await evaluate(`document.querySelector('#book-switch').click(); true`);
  await sleep(80);
  check('switch: under reduced motion the cap does not move', (await evaluate(`getComputedStyle(document.querySelector('#book-switch .book-switch-cap')).transform`)) === 'none' && (await dataLight()) === 'day');
  await reduceMotion(false);

  // axe on the phone, with the switch in.
  for (const lighting of ['day', 'evening']) { await load(P412, TALL, lighting); await t.axe(`phone with the switch, ${lighting === 'day' ? 'Day' : 'Evening'}`); }
  // ── The pool follows the word (Task 5) ──
  const DESK_FRAME = '#book-spread-container', PHONE_FRAME = '#mobile-page';
  const POOL = BOOK_LIGHT.pool;
  const DEF = { x: BOOK_DEFAULT_AIM.x * SPREAD.w, y: BOOK_DEFAULT_AIM.y * SPREAD.h };
  /** The n-th live entry's headword button: its text and where to click. */
  const entryAt = (frame: string, n: number) => evaluate(`(() => { const b = [...document.querySelectorAll('${frame} .entry-open')].filter((e) => !e.closest('[aria-hidden="true"]'))[${n}];
    if (!b) return null; const r = b.getBoundingClientRect(); return { hw: b.textContent.trim(), x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()`);
  /** Where a headword's first line is, in frame units; `first` says the headword sits on the paragraph's first line. */
  const lineOf = (frame: string, hw: string) => evaluate(`(() => { const f = document.querySelector('${frame}'); const k = f.getBoundingClientRect().width / f.offsetWidth, fr = f.getBoundingClientRect();
    for (const el of f.querySelectorAll('.entry-headword')) { if (el.closest('[aria-hidden="true"]') || el.textContent.trim() !== ${JSON.stringify(hw)}) continue;
      const r = el.getClientRects()[0], p = el.closest('.entry-text').getBoundingClientRect(), lh = parseFloat(getComputedStyle(el.closest('.entry-text')).lineHeight) || r.height;
      return { x: (r.left + r.width / 2 - fr.left) / k, y: (r.top + r.height / 2 - fr.top) / k, first: r.top + r.height / 2 - p.top <= lh * 1.2 }; } return null; })()`);
  const watchSpot = () => evaluate(`(() => { window.__ser = []; window.__n = 0; const s = document.querySelector('#book-spot'); if (!s) return false;
    window.__mo?.disconnect(); window.__mo = new MutationObserver((l) => { window.__n += l.length; window.__ser.push([performance.now(), Number(s.getAttribute('pointsAtX')), Number(s.getAttribute('pointsAtY'))]); });
    window.__mo.observe(s, { attributes: true }); return true; })()`);
  const series = () => evaluate(`({ n: window.__n, ser: window.__ser })`);
  const sheetShown = () => waitFor(`(() => { const s = document.querySelector('#word-sheet'); if (!s) return false; const r = s.getBoundingClientRect(); return r.width > 0 && getComputedStyle(s).visibility !== 'hidden'; })()`, 5000);
  const sheetGone = () => waitFor(`(() => { const s = document.querySelector('#word-sheet'); if (!s) return true; const r = s.getBoundingClientRect(); return r.width === 0 || getComputedStyle(s).visibility === 'hidden'; })()`, 5000);
  // Let the sheet finish sliding in (a click on its close button while it moves is lost), close it, and let it slide out.
  const closeSheet = async () => { await sleep(500); await evaluate(`document.querySelector('#close-word-drawer')?.click(); true`); await sheetGone(); await sleep(400); };
  const clickWord = async (frame: string, n: number) => { const e = await entryAt(frame, n); await mouse('mousePressed', e.x, e.y); await mouse('mouseReleased', e.x, e.y); return e; };
  const dist = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.hypot(a.x - b.x, a.y - b.y);
  // The light is still: give a glide a moment to start (the flag comes on with its first frame), then wait for it to end.
  const settleLight = async (frame: string) => { await waitFor(`Boolean(document.querySelector('${frame}').dataset.lightMoving)`, 700); return waitFor(`!document.querySelector('${frame}').dataset.lightMoving`, 15000); };
  const liveText = () => evaluate(`document.querySelector('#book-live')?.textContent ?? null`);
  const atDefault = (p: { x: number; y: number }) => near(p.x, DEF.x, 1.5) && near(p.y, DEF.y, 1.5);

  // Opening a word (a click) glides the pool to its first line.
  await load(D1440, 400, 'evening', LAMP_B);
  const rest0 = await spot();
  const liveBefore = await liveText();
  await watchSpot();
  const w3 = await entryAt(DESK_FRAME, 2);
  const line3 = await lineOf(DESK_FRAME, w3.hw);
  check('the third entry\'s headword sits on its first line', line3 && line3.first, { w3, line3 });
  const clickedAt = await evaluate(`performance.now()`);
  await mouse('mousePressed', w3.x, w3.y); await mouse('mouseReleased', w3.x, w3.y);
  await sheetShown();
  await settleLight(DESK_FRAME);
  const end3 = await spot();
  const ser3 = await series();
  check(`opening a word moves the pool to its first line (${w3.hw})`, line3 && near(end3.x, line3.x, 4) && near(end3.y, line3.y, 4) && dist(end3, rest0) > 20, { end3, line3, rest0 });
  const inBetween = (p: { x: number; y: number }) => p.x >= Math.min(rest0.x, end3.x) - 1 && p.x <= Math.max(rest0.x, end3.x) + 1 && p.y >= Math.min(rest0.y, end3.y) - 1 && p.y <= Math.max(rest0.y, end3.y) + 1;
  check('it glides: some frame lies strictly between the start and the end, and none outside them',
    ser3.ser.some((r: number[]) => dist({ x: r[1], y: r[2] }, rest0) > 3 && dist({ x: r[1], y: r[2] }, end3) > 3) && ser3.ser.every((r: number[]) => inBetween({ x: r[1], y: r[2] })),
    { n: ser3.ser.length, first: ser3.ser[0], last: ser3.ser.at(-1) });
  const at300 = [...ser3.ser].filter((r: number[]) => r[0] <= clickedAt + 300).pop();
  check('its value at 300 ms is between the start and the end', !at300 || inBetween({ x: at300[1], y: at300[2] }), at300);
  check('nothing is announced for a glide (#book-live unchanged)', (await liveText()) === liveBefore, { before: liveBefore, now: await liveText() });
  check('the glide never overwrites bookAim', (await deskStore())?.bookAim === undefined, await deskStore());
  await closeSheet();
  await settleLight(DESK_FRAME);
  check('closing the sheet returns it to rest (the default aim)', atDefault(await spot()), await spot());

  // Enter on the headword button does the same.
  await evaluate(`[...document.querySelectorAll('${DESK_FRAME} .entry-open')].filter((e) => !e.closest('[aria-hidden="true"]'))[3].focus(); true`);
  const w4 = await entryAt(DESK_FRAME, 3);
  await typeKey('Enter', 'Enter', 13, '\r');
  await sheetShown();
  await settleLight(DESK_FRAME);
  const line4 = await lineOf(DESK_FRAME, w4.hw), end4 = await spot();
  check(`Enter on a headword button moves the pool to its first line (${w4.hw})`, line4 && near(end4.x, line4.x, 4) && near(end4.y, line4.y, 4) && dist(end4, DEF) > 20, { end4, line4 });
  await closeSheet();

  // With a stored aim, closing goes back to that aim, and the stored aim is untouched.
  await load(D1440, 400, 'evening', { ...LAMP_B, bookAim: { x: 0.6, y: 0.5 } });
  const restS = await spot();
  await clickWord(DESK_FRAME, 1);
  await sheetShown(); await settleLight(DESK_FRAME);
  const midS = await spot();
  await closeSheet(); await settleLight(DESK_FRAME);
  const backS = await spot();
  check('a stored aim: the pool goes to the word, comes back to that aim, and bookAim stays as it was',
    dist(midS, restS) > 20 && near(backS.x, 0.6 * SPREAD.w, 1.5) && near(backS.y, 0.5 * SPREAD.h, 1.5) && JSON.stringify((await deskStore())?.bookAim) === JSON.stringify({ x: 0.6, y: 0.5 }), { restS, midS, backS });

  // While the shade is dragged, a word opening doesn't move the aim.
  await load(D1440, 400, 'evening', LAMP_B);
  const lamp0 = await center('#book-lamp');
  await mouse('mousePressed', lamp0.x, lamp0.y);
  for (let i = 1; i <= 6; i++) { await mouse('mouseMoved', lamp0.x + 20 * i, lamp0.y + 10 * i); await sleep(16); }
  const held0 = await evaluate(`document.querySelector('#book-lamp').getAttribute('data-dragging')`);
  await evaluate(`[...document.querySelectorAll('${DESK_FRAME} .entry-open')].filter((e) => !e.closest('[aria-hidden="true"]'))[2].click(); true`);
  const shownD = await sheetShown(); await sleep(300);
  await mouse('mouseMoved', lamp0.x + 120, lamp0.y + 60); await sleep(32);
  await mouse('mouseReleased', lamp0.x + 120, lamp0.y + 60); await sleep(200);
  await settleLight(DESK_FRAME);
  const drag2 = await spot(), dragStore = await deskStore();
  check('dragging the shade: a word opening doesn\'t move the aim (it ends where the pointer let go)', held0 === 'true' && shownD && dragStore?.bookAim
    && near(drag2.x, dragStore.bookAim.x * SPREAD.w, 2) && near(drag2.y, dragStore.bookAim.y * SPREAD.h, 2), { held0, shownD, drag2, dragStore });
  await closeSheet();

  // A related word opened inside the sheet: it moves the pool only if its entry is on the visible page(s).
  await load(D1440, 20, 'evening', LAMP_B); // page 20 has "accrued", whose similar word "accumulated" is on the spread
  const visibleHws: string[] = await evaluate(`[...document.querySelectorAll('${DESK_FRAME} .entry-open')].filter((e) => !e.closest('[aria-hidden="true"]')).map((e) => e.textContent.trim())`);
  let sameWord: { from: string; chip: string } | null = null, elseWord: { from: string; chip: string } | null = null;
  for (let n = 0; n < visibleHws.length && !(sameWord && elseWord); n++) {
    await clickWord(DESK_FRAME, n);
    await sheetShown();
    await waitFor(`document.querySelectorAll('#word-sheet .word-related .ui-chip').length > 0`, 1200);
    const chips: string[] = await evaluate(`[...document.querySelectorAll('#word-sheet .word-related .ui-chip')].map((c) => c.textContent)`);
    for (const chip of chips) {
      if (visibleHws.includes(chip)) sameWord ??= { from: visibleHws[n], chip }; else elseWord ??= { from: visibleHws[n], chip };
    }
    await closeSheet();
  }
  console.log(`  related words: same page ${JSON.stringify(sameWord)}, elsewhere ${JSON.stringify(elseWord)}`);
  const chipClick = (word: string) => evaluate(`(() => { const c = [...document.querySelectorAll('#word-sheet .word-related .ui-chip')].find((c) => c.textContent === ${JSON.stringify(word)}); if (!c) return false; c.click(); return true; })()`);
  if (sameWord) {
    await clickWord(DESK_FRAME, visibleHws.indexOf(sameWord.from));
    await sheetShown(); await settleLight(DESK_FRAME);
    const first = await spot();
    await chipClick(sameWord.chip);
    await waitFor(`document.querySelector('#word-sheet-title')?.textContent === ${JSON.stringify(sameWord.chip)}`, 5000);
    await sleep(300); await settleLight(DESK_FRAME);
    const moved = await spot(), want = await lineOf(DESK_FRAME, sameWord.chip);
    check(`a similar word on the same page moves the pool to it (${sameWord.from} → ${sameWord.chip})`, want && near(moved.x, want.x, 4) && near(moved.y, want.y, 4) && dist(moved, first) > 3, { first, moved, want });
    await closeSheet();
  } else check('a similar word on the same page moves the pool (no entry on page 20 has one: pick another page)', false, { visibleHws });
  if (elseWord) {
    await clickWord(DESK_FRAME, visibleHws.indexOf(elseWord.from));
    await sheetShown(); await settleLight(DESK_FRAME);
    const first = await spot();
    await chipClick(elseWord.chip);
    await waitFor(`document.querySelector('#word-sheet-title')?.textContent === ${JSON.stringify(elseWord.chip)}`, 5000);
    await sleep(800); await settleLight(DESK_FRAME);
    const stayed = await spot();
    check(`a related word that isn't on the page leaves the pool where it is (${elseWord.from} → ${elseWord.chip})`, near(stayed.x, first.x, 1) && near(stayed.y, first.y, 1) && dist(stayed, DEF) > 10, { first, stayed });
    await closeSheet(); await settleLight(DESK_FRAME);
    check('and closing that sheet returns it to rest', atDefault(await spot()), await spot());
  } else check('a related word elsewhere leaves the pool alone (no entry on page 20 has one: pick another page)', false, { visibleHws });

  // A page turn alone never moves the pool.
  await load(D1440, 400, 'evening', LAMP_B);
  const before = await spot();
  await watchSpot();
  await evaluate(`document.querySelector('button[aria-label="Next spread"]').click(); true`);
  await waitFor(`Boolean(document.querySelector('[data-book-base][data-flipping]'))`, 3000);
  await sleep(150);
  const turnLayers = await evaluate(`(() => { const base = [...document.querySelectorAll('[data-book-base] .book-light')];
    return { base: base.length, shown: base.every((l) => getComputedStyle(l).visibility === 'visible'), onLeaf: document.querySelectorAll('[style*="preserve-3d"] .book-light').length }; })()`);
  const flipN = await series();
  await waitFor(`!document.querySelector('[data-book-base][data-flipping]')`, 6000);
  await sleep(500);
  const after = await spot(), turned = await series();
  check('a page turn doesn\'t move the pool (same aim, 0 #book-spot changes)', near(after.x, before.x, 0.2) && near(after.y, before.y, 0.2) && flipN.n === 0 && turned.n === 0, { before, after, flip: flipN.n, all: turned.n });
  check('during the flip the base-layer light is visible and no light sits on a turning leaf', turnLayers.base === 2 && turnLayers.shown && turnLayers.onLeaf === 0, turnLayers);

  // A search jump that turns pages moves the pool after the turn.
  await load(D1440, 400, 'evening', LAMP_B);
  const jumpHw: string = await evaluate(`fetch('/api/page/405').then((r) => r.json()).then((p) => (p.column1[2] ?? p.column1[0]).headword)`);
  const restJ = await spot();
  await watchSpot();
  await evaluate(`(() => { const input = document.querySelector('#lookup-input'); input.focus(); const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
    set.call(input, ${JSON.stringify(jumpHw)}); input.dispatchEvent(new Event('input', { bubbles: true })); return true; })()`);
  await waitFor(`Boolean(document.querySelector('#lookup-panel [role="option"]'))`, 5000);
  await evaluate(`document.querySelector('#lookup-panel [role="option"]').click(); true`);
  await waitFor(`Boolean(document.querySelector('[data-book-base][data-flipping]'))`, 5000);
  await sleep(200);
  const midFlip = await series();
  check('a search jump that turns pages: during the flip the pool hasn\'t moved (0 changes)', midFlip.n === 0, midFlip);
  await waitFor(`!document.querySelector('[data-book-base][data-flipping]')`, 8000);
  await sleep(300); await settleLight(DESK_FRAME); // a search opens no sheet: the word is underlined in pencil and the light goes to it
  const lineJ = await lineOf(DESK_FRAME, jumpHw), endJ = await spot();
  check(`…and after the turn it goes to the entry (${jumpHw})`, lineJ && near(endJ.x, lineJ.x, 4) && near(endJ.y, lineJ.y, 4) && dist(endJ, restJ) > 20, { endJ, lineJ, restJ });
  await clickWord(DESK_FRAME, 0); // reading another word takes the light over, and closing that sheet puts it back at rest
  await sheetShown(); await settleLight(DESK_FRAME);
  await closeSheet(); await settleLight(DESK_FRAME);
  check('…and after another word has been read and closed it is back at rest', atDefault(await spot()), await spot());

  // Reduced motion: the pool jumps.
  await reduceMotion(true);
  await load(D1440, 400, 'evening', LAMP_B);
  const wr = await entryAt(DESK_FRAME, 2);
  await mouse('mousePressed', wr.x, wr.y); await mouse('mouseReleased', wr.x, wr.y);
  await sleep(50);
  const lineR = await lineOf(DESK_FRAME, wr.hw);
  const poolR = await evaluate(`(() => { const f = document.querySelector('${DESK_FRAME}'); return { x: parseFloat(f.style.getPropertyValue('--pool-x')), y: parseFloat(f.style.getPropertyValue('--pool-y')) }; })()`);
  check('reduced motion: the pool jumps (at 50 ms it is already at the word)', lineR && near(poolR.x, lineR.x + POOL.desktop.dx, 3) && near(poolR.y, lineR.y + POOL.desktop.dy, 3), { poolR, lineR });
  await reduceMotion(false);

  // The phone: the same glide, and the first one is the slow-device check.
  await load(P412, TALL, 'evening', { noted: true, light: 'B' });
  const restP = await spot();
  const wp = await clickWord(PHONE_FRAME, 2);
  await sheetShown(); await settleLight(PHONE_FRAME);
  const endP = await spot(), lineP = await lineOf(PHONE_FRAME, wp.hw);
  check(`phone: opening a word moves the pool to its first line (${wp.hw})`, lineP && lineP.first && near(endP.x, lineP.x, 4) && near(endP.y, lineP.y, 4) && dist(endP, restP) > 20, { endP, lineP, restP });
  await closeSheet(); await settleLight(PHONE_FRAME);
  const homeP = await spot(), boxP = await evaluate(`(() => { const p = document.querySelector('#mobile-page'); return { w: p.offsetWidth, h: p.offsetHeight }; })()`);
  check('phone: closing returns it to PHONE_POOL', near(homeP.x, PHONE_POOL.x * boxP.w, 1.5) && near(homeP.y, PHONE_POOL.y * boxP.h, 1.5), { homeP, boxP });

  await load(P412, TALL, 'evening', { noted: true });
  await evaluate(`window.requestAnimationFrame = (cb) => setTimeout(() => cb(performance.now()), 40); true`);
  await clickWord(PHONE_FRAME, 2);
  await sheetShown();
  await sleep(1500);
  check('phone: a slow first glide (frames 40 ms apart) switches to A and drops the filter', (await deskStore())?.light === 'A'
    && !(await evaluate(`Boolean(document.querySelector('#book-spot-filter, [filter*="book-spot-filter"]'))`)), await deskStore());

});
