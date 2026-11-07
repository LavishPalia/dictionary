// The desk scene on Today: the lamp (switching and aiming), Today's words, the open book, the intro film and
// close-the-book, at desktop and phone sizes. Usage: npx tsx scripts/test-desk-browser.mts (needs the app on :3000)
import { DESKTOP, PHONE, run, sleep } from './duel/browser-harness.mjs';

const settings = (extra: Record<string, unknown> = {}) => ({ speed: 'realistic', sounds: true, ...extra });
// A visitor who has seen the welcome, so it doesn't stand in for the book.
const RETURNING = { panna_tours: { welcomeDone: true } };

await run('Desk scene', async (t: any) => {
  const { check, evaluate, waitFor, open, go, click, exists, setSize, reduceMotion, send } = t;
  const stored = async () => JSON.parse((await evaluate(`localStorage.getItem('panna_settings')`)) ?? 'null');
  const attr = (sel: string, name: string) => evaluate(`document.querySelector(${JSON.stringify(sel)})?.getAttribute(${JSON.stringify(name)}) ?? null`);
  const light = () => evaluate(`document.documentElement.getAttribute('data-light')`);
  const shown = (sel: string) => evaluate(`(() => { const el = document.querySelector(${JSON.stringify(sel)}); if (!el) return false; const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== 'hidden'; })()`);
  const center = (sel: string) => evaluate(`(() => { const r = document.querySelector(${JSON.stringify(sel)}).getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()`);
  const mouse = (type: string, x: number, y: number) => send('Input.dispatchMouseEvent', { type, x, y, button: 'left', buttons: type === 'mouseReleased' ? 0 : 1, clickCount: 1 });
  /** Presses at the element's centre, moves by (dx, dy) in steps, and lets go. */
  const drag = async (sel: string, dx: number, dy: number) => {
    const c = await center(sel);
    await mouse('mousePressed', c.x, c.y);
    for (let i = 1; i <= 6; i++) { await mouse('mouseMoved', c.x + (dx * i) / 6, c.y + (dy * i) / 6); await sleep(16); }
    await mouse('mouseReleased', c.x + dx, c.y + dy);
    await sleep(150);
  };
  /** The page's clock reads `local` (a local date-time) from the next load on. */
  let clockScript: string | null = null;
  const fixClock = async (local: string | null) => {
    if (clockScript) { await send('Page.removeScriptToEvaluateOnNewDocument', { identifier: clockScript }); clockScript = null; }
    if (!local) return;
    clockScript = (await send('Page.addScriptToEvaluateOnNewDocument', { source: `(() => {
      const R = Date, off = new R(${JSON.stringify(local)}).getTime() - R.now();
      class D extends R { constructor(...a) { if (a.length) super(...a); else super(R.now() + off); } static now() { return R.now() + off; } }
      window.Date = D; })();` })).identifier;
  };
  const today = (h: number, m = 0) => { const d = new Date(); d.setHours(h, m, 0, 0); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}T${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:00`; };

  // ── Desktop: the lamp ──
  await setSize(DESKTOP);
  await open('/', { ...RETURNING, panna_settings: settings({ lighting: 'evening' }) });
  check('desktop: the scene shows', await waitFor(`Boolean(document.querySelector('#desk-lamp'))`) && await shown('#desk-scene'));
  check('desktop: no phone strip', !(await shown('#desk-strip')));
  check('desktop: the lamp is a button that says its state', (await attr('#desk-lamp', 'aria-label')) === 'Desk lamp, on: Evening lighting' && (await attr('#desk-lamp', 'aria-pressed')) === 'true',
    await attr('#desk-lamp', 'aria-label'));
  await click('#desk-lamp');
  await sleep(100);
  check('desktop: a click switches to Day', (await light()) === 'day' && (await stored())?.lighting === 'day', await stored());
  check('desktop: the lamp now says off', (await attr('#desk-lamp', 'aria-label')) === 'Desk lamp, off: Day lighting' && (await attr('#desk-lamp', 'aria-pressed')) === 'false');
  check('desktop: the switch fades quickly', await evaluate(`document.documentElement.classList.contains('light-fading--quick')`));
  check('desktop: the first switch shows a note with Use Auto', (await t.text('#desk-note')).includes('Lamp off. It stays this way until you switch it, or choose Auto to follow the clock again.')
    && await exists('#desk-note-auto'), await t.text('#desk-note'));
  check('desktop: the live region says what happened', (await t.text('#desk-live')).includes('Lamp off'));
  check('desktop: speed and sounds are kept', (await stored())?.speed === 'realistic' && (await stored())?.sounds === true);
  await click('#desk-note-auto');
  await sleep(150);
  check('desktop: Use Auto goes back to the clock', (await stored())?.lighting === 'auto' && !(await shown('#desk-note')));

  await go('/');
  await waitFor(`Boolean(document.querySelector('#desk-lamp'))`);
  await click('#desk-lamp');
  await sleep(100);
  check('desktop: the note shows once per device', !(await shown('#desk-note')));

  // The ⋯ menu and the lamp stay in sync both ways.
  await click('#menu-btn');
  await waitFor(`Boolean(document.querySelector('#lighting-evening'))`);
  await click('#lighting-evening');
  await sleep(150);
  check('desktop: picking Evening in the menu lights the lamp', (await attr('#desk-lamp', 'aria-pressed')) === 'true');
  await click('#desk-lamp');
  await sleep(150);
  check('desktop: switching the lamp moves the menu to Day', (await attr('#lighting-day', 'aria-checked')) === 'true');
  await t.key?.('Escape');

  // Under Auto the lamp shows the light the clock chose; a tap pins the opposite.
  await fixClock(today(15));
  await open('/', { ...RETURNING, panna_settings: settings({ lighting: 'auto' }), panna_desk: { noted: true } });
  await waitFor(`Boolean(document.querySelector('#desk-lamp'))`);
  check('desktop: under Auto at 3 pm the lamp is off', (await attr('#desk-lamp', 'aria-pressed')) === 'false' && (await light()) === 'day');
  await click('#desk-lamp');
  await sleep(100);
  check('desktop: one tap under Auto pins Evening', (await stored())?.lighting === 'evening' && (await light()) === 'evening');
  await fixClock(today(23));
  await open('/', { ...RETURNING, panna_settings: settings({ lighting: 'auto' }), panna_desk: { noted: true } });
  await waitFor(`Boolean(document.querySelector('#desk-lamp'))`);
  check('desktop: under Auto at 11 pm the lamp is on', (await attr('#desk-lamp', 'aria-pressed')) === 'true');
  await click('#desk-lamp');
  await sleep(100);
  check('desktop: one tap under Auto at night pins Day', (await stored())?.lighting === 'day');
  await fixClock(null);

  // Reduced motion: the switch is instant.
  await reduceMotion(true);
  await open('/', { ...RETURNING, panna_settings: settings({ lighting: 'evening' }), panna_desk: { noted: true } });
  await waitFor(`Boolean(document.querySelector('#desk-lamp'))`);
  await click('#desk-lamp');
  await sleep(50);
  check('reduced motion: the switch does not fade', !(await evaluate(`document.documentElement.classList.contains('light-fading')`)));
  await reduceMotion(false);

  // ── Phone: the pull cord ──
  await setSize(PHONE);
  await open('/', { ...RETURNING, panna_settings: settings({ lighting: 'evening' }), panna_desk: { noted: true } });
  check('phone: the strip shows', await waitFor(`Boolean(document.querySelector('#desk-cord'))`) && await shown('#desk-strip'));
  check('phone: no desk scene', !(await shown('#desk-scene')) && !(await exists('#desk-lamp')));
  check('phone: the cord is the lamp button', (await attr('#desk-cord', 'aria-label')) === 'Desk lamp, on: Evening lighting' && (await attr('#desk-cord', 'aria-pressed')) === 'true');
  check('phone: the cord is labelled lamp on', (await t.text('#desk-cord')).includes('lamp on'));
  check('phone: the cord is at least 44 px', await evaluate(`(() => { const r = document.querySelector('#desk-cord').getBoundingClientRect(); return r.width >= 44 && r.height >= 44; })()`));
  await click('#desk-cord');
  await sleep(100);
  check('phone: a tap switches the lamp', (await stored())?.lighting === 'day' && (await t.text('#desk-cord')).includes('lamp off'));
  await drag('#desk-cord .desk-cord-bead', 0, 20);
  check('phone: a 20 px pull switches it back', (await stored())?.lighting === 'evening', await stored());
  await drag('#desk-cord .desk-cord-bead', 0, 6);
  check('phone: a 6 px pull does nothing', (await stored())?.lighting === 'evening', await stored());
  check('phone: nothing overflows sideways', await evaluate(`document.documentElement.scrollWidth <= innerWidth`));
});
