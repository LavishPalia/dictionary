// Settings, How to play and the coached first game in a real browser.
// Usage: node scripts/test-duel-guide-browser.mjs   (needs the app running on localhost:3000)
import { DESKTOP, fixture, istDay, PHONE, run, sleep } from './duel/browser-harness.mjs';

const TODAY = istDay();
const GAME = `/play/game/${TODAY}?seed=7`;

await run('Duel settings and guide', async (t) => {
  const { check, waitFor, evaluate, open, click, text, exists, setSize, setSchedule, axe, go, send, reduceMotion } = t;
  const settings = () => waitFor(`Boolean(document.querySelector('#duel-settings'))`, 20000);
  const seenCoach = { panna_duel_guide: { coach: true, tips: [] } };
  await setSize(PHONE);
  await reduceMotion(true);
  setSchedule(fixture([TODAY]));

  // ── Settings ──
  await open('/play/settings');
  check('settings: opens by address', await settings());
  check('settings: sound and vibration start on', await evaluate(`document.querySelector('#set-sound').checked && document.querySelector('#set-vibration').checked`));
  check('settings: the device note', (await text('#duel-settings')).includes('Your games, streak and hints are kept on this device, and your name and scores go to Panna’s server for the leaderboard. Clearing the browser’s data starts you afresh, unless you have a backup'));
  check('settings: motion follows the phone', (await text('#duel-settings')).includes('Follows your phone’s reduced-motion setting'));
  check('settings: picture credits', (await text('#duel-settings')).includes('Twemoji') && (await text('#duel-settings')).includes('CC BY 4.0'));
  check('settings: no board style (dropped, user 5 Nov)', !(await text('#duel-settings')).includes('Board style'));
  await axe('settings, Day');
  await click('#set-sound');
  check('settings: a switch is kept', await waitFor(`JSON.parse(localStorage.getItem('panna_duel_settings')).sound === false`));
  await go('/play/settings');
  await settings();
  check('settings: it survives a reload', await evaluate(`!document.querySelector('#set-sound').checked && document.querySelector('#set-vibration').checked`));
  await go(GAME);
  await waitFor(`Boolean(window.__duel)`, 20000);
  check('settings: sound off reaches the game', (await evaluate('window.__duel.platform.sound.enabled')) === false && (await evaluate('window.__duel.platform.haptics.enabled')) === true);

  // Review Focus 5: broken settings
  await open('/play/settings', {}, { panna_duel_settings: '{broken' });
  check('settings: broken storage → both on, no crash', (await settings()) && await evaluate(`document.querySelector('#set-sound').checked && document.querySelector('#set-vibration').checked`));

  // From the game and back, with the save intact.
  await open(GAME, seenCoach);
  await waitFor(`Boolean(window.__duel && document.querySelector('.duel-board [data-cell]'))`, 20000);
  const save = await evaluate(`localStorage.getItem('panna_duel_game:${TODAY}')`);
  check('the game has a settings link', await click('.duel-top a[href="/play/settings"]'));
  check('the gear opens settings', await settings());
  await click('#duel-settings .duel-top a');
  check('Back returns to the game', await waitFor(`location.pathname === '/play/game/${TODAY}' && Boolean(document.querySelector('.duel-board [data-cell]'))`, 20000));
  check('the save is untouched', (await evaluate(`localStorage.getItem('panna_duel_game:${TODAY}')`)) === save);

  // ── How to play ──
  await open('/play/how');
  check('how: opens', await waitFor(`Boolean(document.querySelector('#duel-how'))`, 20000));
  check('how: six pages', (await evaluate(`document.querySelectorAll('.how-page').length`)) === 6, await evaluate(`document.querySelectorAll('.how-page').length`));
  const how = await text('#duel-how');
  check('how: the scoring example', how.includes('A G O T A') && how.includes('16 points'), how.slice(0, 200));
  check('how: no clue bar any more', !how.includes('up here'));
  check('how: no week before M5', !how.includes('your week'));
  check('how: the legend has real board cells', await exists('#duel-how .duel-board-legend .duel-cell'));
  await axe('how to play, Day');
  await t.light('evening');
  await sleep(100);
  await axe('how to play, Evening');

  await open('/play/settings');
  await settings();
  await t.light('evening');
  await sleep(100);
  await axe('settings, Evening');

  await setSize(DESKTOP);
  await open('/play/settings');
  await settings();
  const w = await evaluate(`document.querySelector('#duel-settings .page-card').getBoundingClientRect().width`);
  check('desktop: settings sit in the centred column', w <= 560 && w > 300, w);
  await setSize(PHONE);

  // ── The coached first game ──
  const coaching = () => waitFor(`Boolean(document.querySelector('#duel-coach'))`, 20000);
  const title = () => text('#duel-coach .coach-k');
  await open(`/play/game/${TODAY}?seed=7`);
  await waitFor(`Boolean(window.__duel)`, 20000);
  check('coach: test runs (?seed=) skip it', !(await exists('#duel-coach')));
  await open(`/play/game/${TODAY}`);
  check('coach: a first game starts with it', await coaching());
  check('coach: four dots', (await evaluate(`document.querySelectorAll('#duel-coach .coach-dots i').length`)) === 4);
  check('coach: step 1 is the tiles', (await title()) === 'Your tiles', await title());
  check('coach: English and Hindi', (await text('#duel-coach .coach-en')).includes('Drag one onto a square') && (await evaluate(`document.querySelector('#duel-coach .coach-hi').lang`)) === 'hi');
  const lit = (sel) => evaluate(`(() => { const s = document.querySelector('#duel-coach .coach-spot').getBoundingClientRect(), r = document.querySelector(${JSON.stringify(sel)}).getBoundingClientRect(); return s.left <= r.left + 1 && s.right >= r.right - 1 && s.top <= r.top + 1 && s.bottom >= r.bottom - 1; })()`);
  check('coach: the spotlight is on the rack', await lit('.duel-rack'));
  check('coach: the game is out of reach', await evaluate(`document.querySelector('.duel-main').inert`));
  await axe('coach');
  await click('#duel-coach [data-coach="next"]');
  check('coach: step 2 is the clues, with no clue bar', (await title()) === 'The clues' && (await text('#duel-coach .coach-en')).includes('Tap a clue to read it in full.') && await lit('.duel-clue'), await text('#duel-coach .coach-en'));
  await click('#duel-coach [data-coach="next"]');
  check('coach: step 3 is Submit', (await title()) === 'Submit' && await lit('[data-act="submit"]'));
  await click('#duel-coach [data-coach="next"]');
  check('coach: step 4 is the duel', (await title()) === 'The duel' && (await text('#duel-coach [data-coach="next"]')) === 'Let’s play');
  await click('#duel-coach [data-coach="next"]');
  check('coach: it ends, and the game plays', !(await exists('#duel-coach')) && !(await evaluate(`document.querySelector('.duel-main').inert`)));
  await go(`/play/game/${TODAY}`);
  await waitFor(`Boolean(document.querySelector('.duel-board [data-cell]'))`, 20000);
  check('coach: never again after that', !(await exists('#duel-coach')));

  await open(`/play/game/${TODAY}`);
  await coaching();
  await click('#duel-coach [data-coach="skip"]');
  await go(`/play/game/${TODAY}`);
  await waitFor(`Boolean(document.querySelector('.duel-board [data-cell]'))`, 20000);
  check('coach: Skip counts as seen', !(await exists('#duel-coach')));

  // Replay from How to play, with the game kept.
  await open(`/play/game/${TODAY}?seed=7`, seenCoach);
  await waitFor(`Boolean(window.__duel)`, 20000);
  const kept = await evaluate(`localStorage.getItem('panna_duel_game:${TODAY}')`);
  await go('/play/how');
  await waitFor(`Boolean(document.querySelector('#how-guide'))`, 20000);
  await click('#how-guide');
  check('coach: How to play replays it', await coaching());
  check('coach: the replay opens today\'s game', (await evaluate('location.pathname')) === `/play/game/${TODAY}`);
  check('coach: the replay leaves the save', (await evaluate(`localStorage.getItem('panna_duel_game:${TODAY}')`)) === kept);
  await click('#duel-coach [data-coach="skip"]');
  check('coach: guide is off the address after', await waitFor(`!location.search.includes('guide')`));

  // Settings offers it too.
  await go('/play/settings');
  await settings();
  check('settings: a row replays the guide', await exists('#duel-settings a[href*="guide=1"]'));

  // A later tip: a pass brings the Hint tip, once.
  await open(`/play/game/${TODAY}?seed=7&guide=1`, seenCoach);
  await coaching();
  await click('#duel-coach [data-coach="skip"]');
  await click('[data-act="submit"]');
  check('tip: a pass brings the Hint tip', await waitFor(`document.querySelector('.coach-tip')?.textContent.includes('Hint')`, 30000));
  const clear = await evaluate(`(() => {
    const r = (s) => document.querySelector(s).getBoundingClientRect(), tip = r('.coach-tip');
    const apart = (o) => tip.bottom <= o.top || tip.top >= o.bottom;
    return { rack: apart(r('.duel-rack')), actions: apart(r('.duel-actions')), score: apart(r('.duel-score')) };
  })()`);
  check('tip: it covers neither the rack, the buttons nor the score', clear.rack && clear.actions && clear.score, clear);
  await click('.coach-tip button');
  check('tip: Got it closes it', !(await exists('.coach-tip')));
  check('tip: and it is kept', await evaluate(`JSON.parse(localStorage.getItem('panna_duel_guide')).tips.includes('hint')`));
  // The Calendar tip on the home, after a finished game.
  await open('/play', { ...seenCoach, panna_duel_results: [{ date: TODAY, puzzle: 'p0000.v1', you: 3, quill: 9, at: 'x' }] });
  check('tip: the Calendar tip on the home', await waitFor(`document.querySelector('.coach-tip')?.textContent.includes('calendar')`, 20000));
  await axe('home with a tip');

  // ── The desktop book ──
  await setSize(DESKTOP);
  await open(`/play/game/${TODAY}?seed=7`, seenCoach);
  await waitFor(`Boolean(window.__duel && document.querySelector('.duel-board [data-cell]'))`, 20000);
  await sleep(300);
  const pages = await evaluate(`(() => {
    const r = (s) => document.querySelector(s).getBoundingClientRect(), b = r('.duel-board'), l = r('.duel-cluelist'), g = r('.duel-game'), m = g.left + g.width / 2;
    return { boardLeft: b.right <= m, listRight: l.left >= m, cell: r('.duel-board [data-cell]').width, w: g.width };
  })()`);
  check('book: the board on the left page, the clues on the right', pages.boardLeft && pages.listRight, pages);
  check('book: large cells', pages.cell >= 50, pages);
  const P = await evaluate(`window.__duel.puzzle.slots.map((s) => ({ id: s.id, dir: s.dir, cells: s.cells }))`);
  check('book: every clue is listed', (await evaluate(`document.querySelectorAll('.duel-cluelist [data-clue]').length`)) === P.length);
  check('book: the key legend', (await text('.duel-keys')).includes('Tab next clue'));
  const openSlot = await evaluate(`(() => { const st = window.__duel.snapshot().state; return window.__duel.puzzle.slots.find((s) => s.cells.every((c) => !st.filled[c]) && s.cells.length > 1).id; })()`);
  await click(`[data-clue="${openSlot}"]`);
  check('book: a clue selects its answer', await waitFor(`window.__duel.snapshot().selected === ${JSON.stringify(openSlot)}`));
  check('book: and is highlighted', await evaluate(`document.querySelector('[data-clue="${openSlot}"]').classList.contains('cur')`));
  const rackLetter = await evaluate(`window.__duel.snapshot().state.racks.you.find((l) => l)`);
  await send('Input.dispatchKeyEvent', { type: 'keyDown', key: rackLetter.toLowerCase(), code: `Key${rackLetter}`, text: rackLetter.toLowerCase() });
  await send('Input.dispatchKeyEvent', { type: 'keyUp', key: rackLetter.toLowerCase(), code: `Key${rackLetter}` });
  check('book: letters type into it', await waitFor(`window.__duel.snapshot().pending.length === 1`, 3000));
  await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Tab', code: 'Tab', windowsVirtualKeyCode: 9 });
  await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Tab', code: 'Tab', windowsVirtualKeyCode: 9 });
  check('book: Tab moves to the next clue', await waitFor(`window.__duel.snapshot().selected !== ${JSON.stringify(openSlot)}`, 2000));
  const landed = async () => evaluate(`(() => { const s = document.querySelector('[data-score="you"]').getBoundingClientRect(); return s.width > 0 && s.left > innerWidth / 2; })()`);
  check('book: the score sits on the right page', await landed());
  await axe('book, Day');
  await t.light('evening');
  await sleep(100);
  await axe('book, Evening');

  // With a real mouse, so the clue takes the focus as it does for a player.
  const mouse = async (sel) => {
    const { x, y } = await evaluate(`(() => { const el = document.querySelector(${JSON.stringify(sel)}); el.scrollIntoView({ block: 'nearest' }); const r = el.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()`);
    await send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', buttons: 1, clickCount: 1 });
    await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', clickCount: 1 });
  };
  await open(`/play/game/${TODAY}?seed=7`, seenCoach);
  await waitFor(`Boolean(window.__duel && document.querySelector('.duel-board [data-cell]'))`, 20000);
  await sleep(300);
  await mouse(`[data-clue="${openSlot}"]`);
  await waitFor(`window.__duel.snapshot().selected === ${JSON.stringify(openSlot)}`);
  const letter = await evaluate(`window.__duel.snapshot().state.racks.you.find((l) => l)`);
  await send('Input.dispatchKeyEvent', { type: 'keyDown', key: letter.toLowerCase(), code: `Key${letter}`, text: letter.toLowerCase() });
  await send('Input.dispatchKeyEvent', { type: 'keyUp', key: letter.toLowerCase(), code: `Key${letter}` });
  await waitFor(`window.__duel.snapshot().pending.length === 1`, 3000);
  check('book: focus is on the clue', await evaluate(`Boolean(document.activeElement?.closest('.duel-cluelist'))`));
  await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13, text: '\r' });
  await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 });
  check('book: Enter submits after a clue was clicked', await waitFor(`window.__duel.snapshot().state.log.length > 0`, 5000));

  await open(`/play/game/${TODAY}?seed=7`, seenCoach);
  await waitFor(`Boolean(window.__duel && document.querySelector('.duel-board [data-cell]'))`, 20000);
  await sleep(300);
  await mouse('[data-act="word"]');
  await waitFor(`window.__duel.snapshot().wordMode`, 3000);
  await mouse(`[data-clue="${openSlot}"]`);
  check('book: in Word mode, a clue from the list is the pick', await waitFor(`window.__duel.snapshot().sheet?.k === 'reveal'`, 3000), await evaluate(`window.__duel.snapshot().wordMode`));
  await send('Emulation.setDeviceMetricsOverride', { width: 900, height: 800, deviceScaleFactor: 1, mobile: false });
  check('book: narrower than 1000 px, the phone column', await waitFor(`!document.querySelector('.duel-cluelist') && document.querySelector('.duel-game').getBoundingClientRect().width <= 560`));
  await setSize(PHONE);

  // Panna's Guided tours lists it.
  await open('/');
  await waitFor(`Boolean(document.querySelector('#menu-btn'))`, 20000);
  await sleep(1500); // hydration
  await click('#menu-btn');
  await waitFor(`Boolean(document.querySelector('#guided-tours-btn'))`, 3000);
  await sleep(400);
  await click('#guided-tours-btn');
  check('tours: Guided tours lists Panna Duel', await waitFor(`Boolean(document.querySelector('#tours-sheet a[href*="guide=1"]'))`, 5000));

  // Panna's side of the Duel. A review with nothing due earns nothing.
  const panna = async (store) => {
    await open('/', store);
    await waitFor(`Boolean(document.querySelector('#nav-review-btn'))`, 20000);
    await sleep(1500); // hydration
  };
  await panna({});
  await click('#nav-review-btn');
  check('review: opens with nothing due', await waitFor(`Boolean(document.querySelector('#review-screen'))`, 5000));
  await sleep(1000);
  check('review: nothing due earns no Hint', (await evaluate(`localStorage.getItem('panna_duel_help')`)) === null, await evaluate(`localStorage.getItem('panna_duel_help')`));
  // A real round earns one.
  const entry = await evaluate(`fetch('/api/word/night').then((r) => r.json()).then((d) => d.entry)`);
  await panna({ panna_saved_words: [{ ...entry, saved_at: Date.now() - 60000 }] });
  await click('#nav-review-btn');
  for (let i = 0; i < 6 && !(await waitFor(`Boolean(document.querySelector('#review-done'))`, 300)); i++) {
    await waitFor(`Boolean(document.querySelector('.review-option, #review-done'))`, 5000);
    await click('.review-option');
    await waitFor(`Boolean(document.querySelector('#review-next-btn'))`, 2000);
    await click('#review-next-btn');
  }
  check('review: a finished round earns a Hint', await waitFor(`JSON.parse(localStorage.getItem('panna_duel_help') || 'null')?.earned.hint === 1`, 3000), await evaluate(`localStorage.getItem('panna_duel_help')`));

  // Words the Duel saved while Panna stayed open (another tab, or a page kept in the browser's back-forward cache).
  await panna({});
  const word = (w) => ({ normalized: w, headword: w, saved_at: Date.now() });
  const savedList = (ws) => `localStorage.setItem('panna_saved_words', ${JSON.stringify(JSON.stringify(ws))});`;
  await evaluate(`${savedList([word('zzfirst')])} dispatchEvent(new StorageEvent('storage', { key: 'panna_saved_words' })); true`);
  await evaluate(`${savedList([word('zzfirst'), word('zzsecond')])} dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true })); true`);
  await click('#nav-saved-btn');
  check('saved: Panna picks up words saved elsewhere', await waitFor(`document.body.innerText.includes('zzfirst') && document.body.innerText.includes('zzsecond')`, 5000));
});
