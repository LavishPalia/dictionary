// The desk scene on Today: the lamp (switching and aiming), Today's words, the open book, the intro film and
// close-the-book, at desktop and phone sizes. Usage: npx tsx scripts/test-desk-browser.mts (needs the app on :3000)
import Database from 'better-sqlite3';
import { DESKTOP, PHONE, run, sleep } from './duel/browser-harness.mjs';

// The page Camel is on (page numbers change when the book grows).
const CAMEL_PAGE = (new Database('data/dictionary.db', { readonly: true }).prepare("SELECT page_number FROM entries WHERE normalized = 'camel'").get() as { page_number: number }).page_number;

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
  const drag = async (sel: string, dx: number, dy: number, steps = 6) => {
    const c = await center(sel);
    await mouse('mousePressed', c.x, c.y);
    for (let i = 1; i <= steps; i++) { await mouse('mouseMoved', c.x + (dx * i) / steps, c.y + (dy * i) / steps); await sleep(16); }
    await mouse('mouseReleased', c.x + dx, c.y + dy);
    await sleep(150);
  };
  /** The page's clock reads `local` (a local date-time) from the next load on. */
  let clockScript: string | null = null;
  const fixClock = async (local: string | null) => {
    if (clockScript) { await send('Page.removeScriptToEvaluateOnNewDocument', { identifier: clockScript }); clockScript = null; }
    if (!local) return;
    clockScript = (await send('Page.addScriptToEvaluateOnNewDocument', { source: `(() => {
      const R = Date; let off = new R(${JSON.stringify(local)}).getTime() - R.now();
      window.__shiftClock = (ms) => { off += ms; };
      class D extends R { constructor(...a) { if (a.length) super(...a); else super(R.now() + off); } static now() { return R.now() + off; } }
      window.Date = D; })();` })).identifier;
  };
  const press = async (key: string, code = key, vk?: number) => {
    await send('Input.dispatchKeyEvent', { type: 'keyDown', key, code, windowsVirtualKeyCode: vk });
    await send('Input.dispatchKeyEvent', { type: 'keyUp', key, code, windowsVirtualKeyCode: vk });
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

  // ── Today's words ──
  const ms = (local: string) => new Date(local).getTime();
  const yesterday = (h: number, m = 0) => ms(today(h, m)) - 86_400_000;
  const word = (headword: string, saved_at?: number) => ({ normalized: headword.toLowerCase(), headword, ...(saved_at ? { saved_at } : {}) });
  const rec = (last_at: number) => ({ box: 1, due_at: last_at + 86_400_000, right: 1, wrong: 0, last_at });
  const QUIET = { ...RETURNING, panna_desk: { noted: true } };
  const count = () => t.text('#desk-goal-count');
  const listed = () => evaluate(`[...document.querySelectorAll('.desk-goal-words li')].map((li) => li.textContent)`);
  await setSize(DESKTOP);
  await fixClock(today(15));
  await open('/', { ...QUIET, panna_settings: settings({ lighting: 'day' }) });
  await waitFor(`Boolean(document.querySelector('#desk-goal-count'))`);
  check('goal: nothing yet reads 0 of 10', (await count()).replace(/\s+/g, ' ') === '0 of 10' && (await attr('#desk-goal-count', 'aria-label')) === '0 of 10 words today', await count());
  check('goal: the empty notebook says how to fill it', (await t.text('.desk-goal-words')).includes('Save or review a word and it is written here.'));
  const seeded = {
    ...QUIET, panna_settings: settings({ lighting: 'day' }),
    panna_saved_words: [word('Abandon', ms(today(9))), word('Rigour', ms(today(11))), word('Yester', yesterday(23, 59)), word('Undated')],
    panna_review: { gone: rec(ms(today(10))), rigour: rec(ms(today(8))), yester: rec(yesterday(20)) },
  };
  await open('/', seeded);
  await waitFor(`document.querySelector('#desk-goal-count')?.textContent.startsWith('3')`);
  check('goal: saved today, reviewed today, once each: 3 of 10', (await attr('#desk-goal-count', 'aria-label')) === '3 of 10 words today', await attr('#desk-goal-count', 'aria-label'));
  check('goal: the words are written in the order they were met', JSON.stringify(await listed()) === JSON.stringify(['Rigour', 'Abandon', 'gone']), await listed());
  check('goal: no full-page line before the goal', !(await exists('#desk-goal-full')));
  // rigour (reviewed 8:00, no longer saved), One–Six (saved 9:00–9:05), gone (reviewed 10:00): 8 words.
  await open('/', { ...seeded, panna_saved_words: ['One', 'Two', 'Three', 'Four', 'Five', 'Six'].map((w, i) => word(w, ms(today(9, i)))) });
  await waitFor(`document.querySelector('#desk-goal-count')?.textContent.startsWith('8')`);
  check('goal: more than 4 words shows "+ N more" above the latest 4', JSON.stringify(await listed()) === JSON.stringify(['+ 4 more', 'Four', 'Five', 'Six', 'gone']), await listed());
  await open('/', { ...seeded, panna_settings: settings({ lighting: 'day', dailyGoal: 3 }) });
  await waitFor(`Boolean(document.querySelector('#desk-goal-full'))`);
  check('goal: reached says the page is full, in English and Hindi', (await t.text('#desk-goal-full')).includes('Today’s page is full.') && (await t.text('#desk-goal-full')).includes('आज के 3 शब्द पूरे।'), await t.text('#desk-goal-full'));

  // The editor.
  await click('#desk-goal-edit');
  await waitFor(`Boolean(document.querySelector('#desk-goal-editor'))`);
  check('editor: opens in the notebook with focus in the field', await evaluate(`document.activeElement?.matches('#desk-goal-editor input')`));
  check('editor: has its label, quick picks and help line', (await t.text('#desk-goal-editor')).includes('Words a day') && (await t.text('#desk-goal-editor')).includes('Every word you save or review today counts once.')
    && JSON.stringify(await evaluate(`[...document.querySelectorAll('.desk-goal-presets button')].map((b) => b.textContent)`)) === '["5","10","20"]');
  await click('#desk-goal-editor [aria-label="One more"]');
  check('editor: + steps up', (await evaluate(`document.querySelector('#desk-goal-editor input').value`)) === '4');
  await evaluate(`document.querySelector('#desk-goal-editor input').focus(); true`);
  await press('Escape', 'Escape', 27);
  await sleep(150);
  check('editor: Esc cancels and focus returns to the pencil', !(await exists('#desk-goal-editor')) && (await stored())?.dailyGoal === 3 && await evaluate(`document.activeElement?.id === 'desk-goal-edit'`));
  await click('#desk-goal-edit');
  await waitFor(`Boolean(document.querySelector('#desk-goal-editor'))`);
  await click('#desk-goal-editor .desk-goal-presets button:nth-child(3)');
  await click('#desk-goal-editor .desk-goal-cancel');
  await sleep(100);
  check('editor: Cancel keeps the old goal', (await stored())?.dailyGoal === 3);
  await click('#desk-goal-edit');
  await waitFor(`document.activeElement?.matches('#desk-goal-editor input')`);
  await send('Input.insertText', { text: '7' });
  await press('Enter', 'Enter', 13);
  await sleep(150);
  check('editor: Enter saves the typed goal', (await stored())?.dailyGoal === 7 && (await count()).replace(/\s+/g, ' ') === '3 of 7', [await stored(), await count()]);
  check('editor: the other settings are kept', (await stored())?.lighting === 'day' && (await stored())?.speed === 'realistic' && (await stored())?.sounds === true, await stored());
  await click('#desk-goal-edit');
  await waitFor(`Boolean(document.querySelector('#desk-goal-editor'))`);
  await click('#desk-goal-editor .desk-goal-presets button:nth-child(3)');
  await click('#desk-goal-editor .desk-goal-save');
  await sleep(150);
  check('editor: a quick pick and Save set 20', (await stored())?.dailyGoal === 20 && await evaluate(`document.activeElement?.id === 'desk-goal-edit'`));
  await click('#desk-lamp');
  await sleep(150);
  check('goal: a lamp switch keeps the goal', (await stored())?.dailyGoal === 20 && (await stored())?.lighting === 'evening');

  // A save from Today counts at once.
  await waitFor(`Boolean(document.querySelector('#today-word-save[aria-pressed="false"]'))`);
  await click('#today-word-save');
  await waitFor(`document.querySelector('#desk-goal-count')?.textContent.startsWith('4')`, 3000);
  check('goal: saving the word of the day counts at once', (await attr('#desk-goal-count', 'aria-label')) === '4 of 20 words today', await attr('#desk-goal-count', 'aria-label'));

  // Midnight empties it while Today is open.
  await fixClock(today(23, 59));
  await open('/', { ...QUIET, panna_settings: settings({ lighting: 'day' }), panna_saved_words: [word('Late', ms(today(23)))] });
  await waitFor(`document.querySelector('#desk-goal-count')?.textContent.startsWith('1')`);
  await evaluate(`window.__shiftClock(120000); document.dispatchEvent(new Event('visibilitychange')); true`);
  check('goal: after midnight the count starts again at 0', await waitFor(`document.querySelector('#desk-goal-count')?.textContent.startsWith('0')`, 3000), await count());

  // Phone: the chip and its editor card.
  await fixClock(today(15));
  await setSize(PHONE);
  await open('/', seeded);
  await waitFor(`Boolean(document.querySelector('#desk-goal-chip'))`);
  check('phone: the chip says Today’s words 3 of 10', (await t.text('#desk-goal-chip')).replace(/\s+/g, ' ').includes('Today’s words 3 of 10'), await t.text('#desk-goal-chip'));
  check('phone: 10 tally marks, 3 inked', (await evaluate(`document.querySelectorAll('.desk-goal-tally i').length`)) === 10 && (await evaluate(`document.querySelectorAll('.desk-goal-tally i.on').length`)) === 3);
  await click('#desk-goal-chip');
  await waitFor(`Boolean(document.querySelector('.desk-goal-card #desk-goal-editor'))`);
  check('phone: a tap opens the editor as a card under the strip', (await attr('#desk-goal-chip', 'aria-expanded')) === 'true' && await evaluate(`document.activeElement?.matches('#desk-goal-editor input')`));
  check('phone: the editor’s controls are at least 44 px', await evaluate(`[...document.querySelectorAll('#desk-goal-editor button, #desk-goal-editor input')].every((b) => { const r = b.getBoundingClientRect(); return r.height >= 44 && r.width >= 44; })`));
  await click('#desk-goal-editor .desk-goal-cancel');
  await sleep(100);
  check('phone: Cancel closes it and focus returns to the chip', !(await exists('#desk-goal-editor')) && await evaluate(`document.activeElement?.id === 'desk-goal-chip'`));
  await open('/', { ...seeded, panna_settings: settings({ lighting: 'day', dailyGoal: 25 }) });
  await waitFor(`Boolean(document.querySelector('#desk-goal-chip'))`);
  check('phone: a goal of 25 still shows 10 marks', (await evaluate(`document.querySelectorAll('.desk-goal-tally i').length`)) === 10);
  await fixClock(null);

  // ── The open book ──
  {
    const html = await (await fetch('http://localhost:3000/')).text();
    check('book: the server page already holds the scene box and the strip (sizes reserved before paint)', html.includes('desk-scene-box') && html.includes('desk-strip'));
    const page = await (await fetch(`http://localhost:3000/api/page/${CAMEL_PAGE}`)).json();
    const left = page.column1.map((e: any) => e.headword), right = page.column2.map((e: any) => e.headword);
    await setSize(DESKTOP);
    await open('/', { ...QUIET, panna_settings: settings({ lighting: 'day' }) }, { panna_last_page: String(CAMEL_PAGE) });
    await waitFor(`document.querySelectorAll('.desk-book .desk-mini-entry').length > 0`);
    const shownWords = await evaluate(`[...document.querySelectorAll('.desk-book .desk-mini-entry b')].map((b) => b.textContent)`);
    check('book: the miniature is the page left off on, as real text', left.slice(0, 4).every((w: string) => shownWords.includes(w)) && right.slice(0, 4).every((w: string) => shownWords.includes(w)), { shownWords, left, right });
    check('book: the Hindi in the miniature is marked as Hindi', await evaluate(`document.querySelectorAll('.desk-book .desk-mini-entry [lang="hi"]').length > 0`));
    check('book: the tag names the page and its words', (await t.text('#desk-book-tag')) === `Page ${CAMEL_PAGE.toLocaleString('en-IN')} · ${page.first_headword} – ${page.last_headword} · Open book ›`, await t.text('#desk-book-tag'));
    check('book: the book is the Continue reading button', (await attr('#today-continue-btn', 'aria-label')) === `Continue reading: page ${CAMEL_PAGE}, ${page.first_headword} to ${page.last_headword}` && await evaluate(`Boolean(document.querySelector('.desk-book #today-continue-btn'))`), await attr('#today-continue-btn', 'aria-label'));
    check('book: no Continue reading card while the scene shows', !(await shown('#today-continue')));
    check('book: the scene box keeps its size', await evaluate(`(() => { const r = document.querySelector('#desk-scene').getBoundingClientRect(); return Math.abs(r.width / r.height - 940 / 400) < 0.01; })()`));
    await click('#today-continue-btn');
    check('book: clicking the book opens the page', await waitFor(`location.pathname === '/page/${CAMEL_PAGE}'`, 5000), await evaluate('location.pathname'));
    await open('/', { ...QUIET, panna_settings: settings({ lighting: 'day' }) });
    await waitFor(`Boolean(document.querySelector('#desk-book-tag'))`);
    check('book: a reader who never opened a page gets page 1', (await t.text('#desk-book-tag')) === 'Start reading · Page 1 ›', await t.text('#desk-book-tag'));
    // First visit: the book is the welcome card.
    await open('/', { panna_desk: { noted: true }, panna_settings: settings({ lighting: 'day' }) });
    await waitFor(`Boolean(document.querySelector('#today-welcome'))`);
    check('book: on a first visit the welcome is on the book’s left page', await evaluate(`Boolean(document.querySelector('.desk-book #today-welcome'))`) && (await t.text('#today-welcome')).includes('New here?')
      && (await t.text('#today-welcome')).includes('Take the one-minute tour') && await exists('#today-take-tour') && await exists('#today-not-now'));
    check('book: the welcome has its Hindi line', (await evaluate(`document.querySelector('#today-welcome [lang="hi"]')?.textContent`)) === 'नए हैं? एक मिनट का टूर देखें।');
    check('book: there is no separate welcome card on the desktop', (await evaluate(`document.querySelectorAll('#today-welcome').length`)) === 1);
    await click('#today-not-now');
    check('book: Not now turns the book back to the page', await waitFor(`Boolean(document.querySelector('#desk-book-tag')) && !document.querySelector('#today-welcome')`, 3000));
    // Phone: the Continue card stays, and the welcome card says New here?
    await setSize(PHONE);
    await open('/', { ...QUIET, panna_settings: settings({ lighting: 'day' }) }, { panna_last_page: String(CAMEL_PAGE) });
    await waitFor(`Boolean(document.querySelector('#desk-cord'))`);
    check('phone: the Continue reading card stays', await shown('#today-continue') && !(await exists('.desk-book')));
    await open('/', { panna_desk: { noted: true }, panna_settings: settings({ lighting: 'day' }) });
    await waitFor(`Boolean(document.querySelector('#today-welcome'))`);
    check('phone: the welcome card says New here?', (await t.text('#today-welcome')).includes('New here?') && !(await t.text('#today-welcome')).includes('New to'));
  }

  // ── Aiming the light ──
  {
    await setSize(DESKTOP);
    await reduceMotion(false);
    const desk = async () => JSON.parse((await evaluate(`localStorage.getItem('panna_desk')`)) ?? '{}');
    const spot = (a: string) => evaluate(`Number(document.querySelector('#desk-spot')?.getAttribute(${JSON.stringify(a)}))`);
    const settle = async () => { await sleep(50); return waitFor(`!document.querySelector('.desk-scene')?.dataset.moving`, 6000); };
    await open('/', { ...QUIET, panna_settings: settings({ lighting: 'evening' }), panna_desk: { noted: true, light: 'B' } });
    await waitFor(`Boolean(document.querySelector('#desk-spot'))`);
    check('light: the spotlight (B) is used by default', await evaluate(`document.querySelector('.desk-scene').classList.contains('desk-scene--b')`));
    check('light: the tuned spotlight values', await evaluate(`(() => {
      const q = (s) => document.querySelector(s), a = (s, n) => Number(q(s).getAttribute(n));
      return a('#desk-light-b feTurbulence', 'baseFrequency') === 1.3 && a('#desk-light-b feDiffuseLighting', 'surfaceScale') === 0.7
        && a('#desk-light-b feDiffuseLighting', 'diffuseConstant') === 1.4 && a('#desk-spot', 'specularExponent') === 16
        && a('#desk-spot', 'limitingConeAngle') === 42 && a('#desk-spot', 'z') === 230 && a('#desk-amb', 'k4') === 0.45; })()`));
    check('light: the darkness sits under the book and the notebook, so their text keeps its contrast', await evaluate(`(() => {
      const z = (s) => Number(getComputedStyle(document.querySelector(s)).zIndex);
      const shade = getComputedStyle(document.querySelector('.desk-page-shade'));
      return z('#desk-light-b') < z('.desk-book') && z('.desk-beam') < z('.desk-book') && z('#desk-light-b') < z('.desk-notebook')
        && shade.mixBlendMode === 'multiply' && shade.backgroundImage.endsWith('rgb(217, 217, 217) 90%)')
        && getComputedStyle(document.querySelector('.desk-warm')).mixBlendMode === 'soft-light'; })()`));
    check('light: only the pool handle and the shade take the drag (the rest of the scene scrolls the page)', await evaluate(`getComputedStyle(document.querySelector('.desk-scene')).touchAction === 'auto'
      && getComputedStyle(document.querySelector('.desk-pool-handle')).touchAction === 'none' && getComputedStyle(document.querySelector('#desk-lamp')).touchAction === 'none'`));
    const x0 = await spot('pointsAtX');
    await drag('.desk-pool-handle', 150, 40);
    await settle();
    const x1 = await spot('pointsAtX');
    check('light: dragging the pool moves the light', x1 - x0 > 120, { x0, x1 });
    check('light: the aim is remembered on this device', Math.abs((await desk()).aim?.x - x1 / 940) < 0.01, { x1, desk: await desk() });
    check('light: dragging the pool does not switch the lamp', (await stored())?.lighting === 'evening');
    const lightBefore = (await stored())?.lighting;
    await drag('#desk-lamp', 4, 3);
    await sleep(200);
    check('light: a press on the shade that hardly moves switches the lamp', (await stored())?.lighting !== lightBefore, await stored());
    await click('#desk-lamp');
    await sleep(200);
    const ax = (await desk()).aim?.x;
    await drag('#desk-lamp', -60, 90);
    await settle();
    check('light: dragging the shade aims it without switching', (await stored())?.lighting === 'evening' && (await desk()).aim?.x !== ax, [await stored(), await desk()]);
    // Keyboard.
    await evaluate(`document.querySelector('#desk-lamp').focus(); true`);
    const k0 = await spot('pointsAtX');
    await press('ArrowRight', 'ArrowRight', 39);
    await settle();
    check('light: → moves the aim 20', Math.round((await spot('pointsAtX')) - k0) === 20, [k0, await spot('pointsAtX')]);
    await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'ArrowLeft', code: 'ArrowLeft', windowsVirtualKeyCode: 37, modifiers: 8 });
    await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'ArrowLeft', code: 'ArrowLeft', windowsVirtualKeyCode: 37, modifiers: 8 });
    await settle();
    check('light: Shift+← moves it 60', Math.round(k0 + 20 - (await spot('pointsAtX'))) === 60, await spot('pointsAtX'));
    await press('Home', 'Home', 36);
    await settle();
    check('light: Home puts it back', Math.round(await spot('pointsAtX')) === Math.round(0.53 * 940) && (await desk()).aim?.x === 0.53, [await spot('pointsAtX'), await desk()]);
    check('light: the keys did not switch the lamp', (await stored())?.lighting === 'evening');
    check('light: the lamp says how to aim it', (await evaluate(`document.getElementById(document.querySelector('#desk-lamp').getAttribute('aria-describedby'))?.textContent ?? ''`)).includes('Arrow keys'));
    await press('ArrowDown', 'ArrowDown', 40);
    await settle();
    await evaluate(`document.querySelector('.desk-pool-handle').dispatchEvent(new MouseEvent('dblclick', { bubbles: true })); true`);
    await settle();
    check('light: a double-click on the pool resets the aim', Math.round(await spot('pointsAtY')) === 200, await spot('pointsAtY'));
    // A tap on the pool handle reaches the book under it.
    await drag('.desk-pool-handle', 0, 0);
    check('light: a tap on the pool still opens the book under it', await waitFor(`location.pathname.startsWith('/page/')`, 4000), await evaluate('location.pathname'));
    // Day: no pool, no beam; the window light instead.
    await open('/', { ...QUIET, panna_settings: settings({ lighting: 'day' }), panna_desk: { noted: true, light: 'B' } });
    await waitFor(`Boolean(document.querySelector('#desk-spot'))`);
    await sleep(900);
    check('light: in Day there is no pool or beam, and the window light shows', await evaluate(`['#desk-light-b', '.desk-beam', '.desk-warm'].every((s) => getComputedStyle(document.querySelector(s)).opacity === '0')
      && getComputedStyle(document.querySelector('.desk-daylight')).opacity === '1'`));
    // The fallback (A): a device remembered as slow, and reduced motion.
    await open('/', { ...QUIET, panna_settings: settings({ lighting: 'evening' }), panna_desk: { noted: true, light: 'A' } });
    await waitFor(`Boolean(document.querySelector('.desk-scene'))`);
    check('light: a device found slow uses the CSS light (A)', !(await exists('#desk-light-b')) && await evaluate(`getComputedStyle(document.querySelector('.desk-dark')).opacity === '1'`));
    check('light: A’s darkness also stays under the book and the notebook', await evaluate(`(() => { const z = (s) => Number(getComputedStyle(document.querySelector(s)).zIndex);
      return z('.desk-dark') < z('.desk-book') && z('.desk-dark') < z('.desk-notebook'); })()`));
    await reduceMotion(true);
    await open('/', { ...QUIET, panna_settings: settings({ lighting: 'evening' }), panna_desk: { noted: true } });
    await waitFor(`Boolean(document.querySelector('.desk-scene'))`);
    await sleep(300);
    check('reduced motion: the CSS light (A)', !(await exists('#desk-light-b')));
    const r0 = await evaluate(`getComputedStyle(document.querySelector('.desk-scene')).getPropertyValue('--tx')`);
    await evaluate(`document.querySelector('#desk-lamp').focus(); true`);
    await press('ArrowRight', 'ArrowRight', 39);
    await sleep(50);
    check('reduced motion: the light snaps to the new aim', parseFloat(await evaluate(`getComputedStyle(document.querySelector('.desk-scene')).getPropertyValue('--tx')`)) - parseFloat(r0) === 20, r0);
    await reduceMotion(false);
    // The first drag on a slow device switches it to A for good.
    await open('/', { ...QUIET, panna_settings: settings({ lighting: 'evening' }), panna_desk: { noted: true } });
    await waitFor(`Boolean(document.querySelector('#desk-spot'))`);
    await send('Emulation.setCPUThrottlingRate', { rate: 40 });
    await drag('.desk-pool-handle', 200, 0, 30);
    await sleep(800);
    await send('Emulation.setCPUThrottlingRate', { rate: 1 });
    await settle();
    check('light: a slow first drag (over 24 ms a frame) switches this device to A', (await desk()).light === 'A' && !(await exists('#desk-light-b')), await desk());
  }

  // ── The intro film ──
  {
    const FIRST = { panna_desk: { noted: true }, panna_settings: settings({ lighting: 'day' }) };
    const mp4Loads = () => evaluate(`performance.getEntriesByType('resource').filter((e) => /\\/intro\\/.*\\.mp4/.test(e.name)).length`);
    const realClick = async (sel: string) => { const c = await center(sel); await mouse('mousePressed', c.x, c.y); await mouse('mouseReleased', c.x, c.y); };
    await setSize(DESKTOP);
    await open('/', FIRST);
    await waitFor(`Boolean(document.querySelector('.desk-book #desk-film video'))`);
    await sleep(800);
    check('film: on a first visit it sits on the book’s right page', await evaluate(`Boolean(document.querySelector('.desk-book-half--right #desk-film'))`));
    check('film: nothing but the poster loads before play', (await attr('#desk-film video', 'preload')) === 'none' && (await mp4Loads()) === 0
      && await evaluate(`(() => { const v = document.querySelector('#desk-film video'); return v.readyState === 0 && v.buffered.length === 0; })()`)
      && (await attr('#desk-film video', 'poster')) === '/intro/poster.v1.jpg');
    check('film: the play button says what it plays', (await attr('#desk-film-play', 'aria-label')) === 'Play the 37-second film');
    check('film: its size is shown', (await t.text('#desk-film')).includes('37 s · about 2 MB'));
    check('film: captions in both languages, off by default (the film has them burned in)', await evaluate(`(() => { const tr = [...document.querySelectorAll('#desk-film track')];
      return tr.length === 2 && tr.every((x) => x.kind === 'captions' && !x.default) && tr.some((x) => x.srclang === 'en') && tr.some((x) => x.srclang === 'hi'); })()`));
    check('film: English by default', (await attr('#desk-film video', 'src')) === '/intro/english.v1.mp4' && (await attr('#desk-film [data-lang="english"]', 'aria-pressed')) === 'true');
    await click('#desk-film [data-lang="hindi"]');
    await sleep(100);
    check('film: हिंदी switches the film and the button', (await attr('#desk-film video', 'src')) === '/intro/hindi.v1.mp4' && (await attr('#desk-film-play', 'aria-label')) === 'Play the 37-second film in Hindi');
    check('film: switching language loads nothing either', (await mp4Loads()) === 0);
    await go('/');
    await waitFor(`Boolean(document.querySelector('#desk-film video'))`);
    check('film: the language is remembered on this device', (await attr('#desk-film video', 'src')) === '/intro/hindi.v1.mp4');
    await realClick('#desk-film-play');
    check('film: ▶ plays it', await waitFor(`(() => { const v = document.querySelector('#desk-film video'); return v && !v.paused && v.currentTime > 0; })()`, 8000),
      await evaluate(`(() => { const v = document.querySelector('#desk-film video'); return { paused: v.paused, t: v.currentTime, err: v.error?.code, rs: v.readyState }; })()`));
    check('film: pause and full-screen buttons while it plays', await exists('#desk-film [aria-label="Pause the film"]') && await exists('#desk-film [aria-label="Full screen"]'));
    await click('#desk-film [data-lang="english"]');
    check('film: switching language while it plays restarts it in the other language', await waitFor(`(() => { const v = document.querySelector('#desk-film video'); return v.getAttribute('src') === '/intro/english.v1.mp4' && !v.paused && v.currentTime < 3; })()`, 8000));
    await click('#desk-film [aria-label="Pause the film"]');
    await sleep(200);
    check('film: pause stops it and brings back ▶', await evaluate(`document.querySelector('#desk-film video').paused`) && await exists('#desk-film-play'));
    // Phone: beside the welcome text, growing to the card's width as it plays.
    await setSize(PHONE);
    await open('/', FIRST);
    await waitFor(`Boolean(document.querySelector('#today-welcome #desk-film video'))`);
    const narrow = await evaluate(`document.querySelector('#desk-film .desk-film-frame').getBoundingClientRect().width`);
    check('phone: the film sits in the welcome card as a small page', narrow > 80 && narrow < 140, narrow);
    await realClick('#desk-film-play');
    await sleep(700);
    const wideFilm = await evaluate(`[document.querySelector('#desk-film .desk-film-frame').getBoundingClientRect().width, document.querySelector('#today-welcome').getBoundingClientRect().width]`);
    check('phone: playing lifts it to the card’s full width', wideFilm[0] > wideFilm[1] - 48, wideFilm);
    check('phone: nothing overflows sideways with the film open', await evaluate(`document.documentElement.scrollWidth <= innerWidth`));
    check('phone: Take the tour and Not now stay', await exists('#today-take-tour') && await exists('#today-not-now'));
  }

  // ── Close the book ──
  {
    const RET = { ...QUIET, panna_settings: settings({ lighting: 'day' }) };
    const closed = () => evaluate(`document.querySelector('.desk-book').classList.contains('desk-book--closed')`);
    const holdAt = async (sel: string, ms: number) => { const c = await center(sel); await mouse('mousePressed', c.x, c.y); await sleep(ms); await mouse('mouseReleased', c.x, c.y); };
    await reduceMotion(false);
    await setSize(DESKTOP);
    await open('/', RET, { panna_last_page: String(CAMEL_PAGE) });
    await waitFor(`Boolean(document.querySelector('#desk-clasp'))`);
    check('close: the clasp is a button that says to hold it', (await attr('#desk-clasp', 'aria-label')) === 'Close the book (press and hold)' && (await t.text('.desk-clasp-tip')) === 'Hold to close');
    check('close: the clasp is at least 36 × 52', await evaluate(`(() => { const r = document.querySelector('#desk-clasp').getBoundingClientRect(); return r.width >= 36 && r.height >= 52; })()`));
    await holdAt('#desk-clasp', 300);
    await sleep(600);
    check('close: letting go early cancels', !(await closed()));
    const c = await center('#desk-clasp');
    await mouse('mousePressed', c.x, c.y);
    check('close: holding fills the ring', await waitFor(`document.querySelector('#desk-clasp').classList.contains('desk-clasp--holding')`, 500));
    await sleep(850);
    await mouse('mouseReleased', c.x, c.y);
    check('close: a 0.85 s hold closes the book', await closed());
    check('close: it says so', (await t.text('#desk-live')) === 'The book closes, and opens again.', await t.text('#desk-live'));
    await sleep(900);
    check('close: a puff of dust', (await evaluate(`document.querySelectorAll('.desk-dust').length`)) > 0);
    await click('#today-continue-btn');
    await sleep(300);
    check('close: the book does not open while it is closed', await evaluate(`location.pathname === '/'`));
    check('close: it reopens by itself', await waitFor(`!document.querySelector('.desk-book').classList.contains('desk-book--closed')`, 4000));
    await sleep(1200);
    check('close: the dust is gone again', (await evaluate(`document.querySelectorAll('.desk-dust').length`)) === 0);
    // The keyboard: Space held down.
    await evaluate(`document.querySelector('#desk-clasp').focus(); true`);
    await send('Input.dispatchKeyEvent', { type: 'keyDown', key: ' ', code: 'Space', windowsVirtualKeyCode: 32 });
    await sleep(850);
    await send('Input.dispatchKeyEvent', { type: 'keyUp', key: ' ', code: 'Space', windowsVirtualKeyCode: 32 });
    check('close: holding Space closes it too', await closed());
    await waitFor(`!document.querySelector('.desk-book').classList.contains('desk-book--closed')`, 4000);
    await sleep(1000);
    // Reduced motion: a fade to the cover and back, no turn and no dust.
    await reduceMotion(true);
    await open('/', RET, { panna_last_page: String(CAMEL_PAGE) });
    await waitFor(`Boolean(document.querySelector('#desk-clasp'))`);
    await holdAt('#desk-clasp', 850);
    await sleep(500);
    check('reduced motion: the book fades to its cover without turning', await closed()
      && await evaluate(`getComputedStyle(document.querySelector('.desk-book-half--left')).transform === 'none' && getComputedStyle(document.querySelector('.desk-book-cover')).opacity === '1'`));
    await sleep(600);
    check('reduced motion: no dust', (await evaluate(`document.querySelectorAll('.desk-dust').length`)) === 0);
    check('reduced motion: it opens again', await waitFor(`!document.querySelector('.desk-book').classList.contains('desk-book--closed')`, 3000));
    await reduceMotion(false);
    // The welcome book has no clasp: nothing may hide the tour's buttons.
    await open('/', { panna_desk: { noted: true }, panna_settings: settings({ lighting: 'day' }) });
    await waitFor(`Boolean(document.querySelector('#today-welcome'))`);
    check('close: no clasp on the welcome book', !(await exists('#desk-clasp')));
  }
});

// With the service worker: the film is never kept, not even after it has played.
await run('Desk film and the service worker', async (t: any) => {
  const { check, evaluate, waitFor, open, go, send } = t;
  await t.setSize(DESKTOP);
  await open('/', { panna_desk: { noted: true } });
  await waitFor(`navigator.serviceWorker?.controller !== null && navigator.serviceWorker?.controller !== undefined`, 15000) || (await go('/'), await waitFor(`Boolean(navigator.serviceWorker?.controller)`, 15000));
  await waitFor(`Boolean(document.querySelector('#desk-film-play'))`);
  const c = await evaluate(`(() => { const r = document.querySelector('#desk-film-play').getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()`);
  await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: c.x, y: c.y, button: 'left', buttons: 1, clickCount: 1 });
  await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: c.x, y: c.y, button: 'left', buttons: 0, clickCount: 1 });
  check('sw: the film plays with the service worker in charge', await waitFor(`(() => { const v = document.querySelector('#desk-film video'); return v && !v.paused && v.currentTime > 1; })()`, 10000)
    && await evaluate(`Boolean(navigator.serviceWorker.controller)`));
  const kept = await evaluate(`(async () => (await Promise.all((await caches.keys()).map(async (n) => (await (await caches.open(n)).keys()).map((r) => r.url)))).flat().filter((u) => u.includes('/intro/')))()`);
  check('sw: no cache holds the film or its captions', Array.isArray(kept) && kept.filter((u: string) => /\.(mp4|vtt)$/.test(u)).length === 0, kept);
}, { serviceWorker: true });
