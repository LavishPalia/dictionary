// The game home in a real browser: the hero, the calendar, the day sheets and the month seal, on a stand-in schedule.
// Usage: node scripts/test-duel-home-browser.mjs   (needs the app running on localhost:3000)
import { DESKTOP, fixture, istDay, PHONE, run, sleep } from './duel/browser-harness.mjs';

const TODAY = istDay(), YESTERDAY = istDay(-1), TWO_AGO = istDay(-2), TOMORROW = istDay(1);
const RULES_FROM = (t) => t.evaluate(`JSON.parse(localStorage.getItem('panna_duel_game:${TODAY}')).rules`);
const coin = (d) => `.coin[data-date="${d}"]`;
const MONTH = TODAY.slice(0, 7);
const allOfMonth = (m) => { const [y, mo] = m.split('-').map(Number); return Array.from({ length: new Date(Date.UTC(y, mo, 0)).getUTCDate() }, (_, i) => `${m}-${String(i + 1).padStart(2, '0')}`); };
const prevMonth = (m) => { const [y, mo] = m.split('-').map(Number); return new Date(Date.UTC(y, mo - 2, 1)).toISOString().slice(0, 7); };

await run('Duel home', async (t) => {
  const { check, waitFor, evaluate, open, click, text, exists, setSize, setSchedule, axe, go, send, reduceMotion } = t;
  const home = (store, raw) => open('/play?seed=7', store, raw).then(() => waitFor(`Boolean(document.querySelector('#duel-hero'))`, 20000));
  const sched = fixture([TWO_AGO, YESTERDAY, TODAY, TOMORROW]);

  await setSize(PHONE);
  setSchedule(sched);
  check('/play shows the home', await home());
  check('hero: no game yet → Play', (await text('#duel-hero-btn')) === 'Play today’s duel', await text('#duel-hero-btn'));
  check('coins: today', await exists(`${coin(TODAY)}[data-kind="today"]`));
  check('coins: tomorrow is future', await exists(`${coin(TOMORROW)}[data-kind="future"]`));
  check('coins: yesterday is the latest open day', await exists(`${coin(YESTERDAY)}[data-kind="latest-open"]`));
  check('help chips show the balance', (await evaluate(`document.querySelector('[data-chip="hint"] b').textContent`)) === '1');
  await click('[data-chip="hint"]');
  check('a help chip opens the help sheet', (await text('.duel-sheet h3')) === 'Hints and words', await text('.duel-sheet h3'));
  await click('.duel-sheet [data-close]');

  await click(coin(TOMORROW));
  check('a future coin only toasts', (await waitFor(`document.querySelector('.page-toast')?.textContent.includes('opens on')`)) && (await evaluate('location.pathname')) === '/play');
  await waitFor(`!document.querySelector('.page-toast')`);
  await axe('home, Day');

  // Playing: hero goes straight in; a coin asks first.
  await click('#duel-hero-btn');
  check('hero opens the game directly', await waitFor(`location.pathname === '/play/game/${TODAY}' && Boolean(window.__duel && document.querySelector('.duel-board [data-cell]'))`, 20000));
  check('the deal seed survives the move', (await evaluate('window.__duel.snapshot().state.seed')) === 7);
  await click('.duel-top a');
  check('the back arrow goes home', await waitFor(`Boolean(document.querySelector('#duel-hero'))`));
  check('hero: Continue while a game is under way', await waitFor(`document.querySelector('#duel-hero-btn')?.textContent === 'Continue'`), await text('#duel-hero-btn'));
  check('coins: today shows its ring', await exists(`${coin(TODAY)} .ring`));
  const rules = await RULES_FROM(t), saveText = await evaluate(`localStorage.getItem('panna_duel_game:${TODAY}')`);

  await click(coin(TODAY));
  check('coin with a game: the in-progress sheet', (await text('.duel-sheet h3')) === 'You have a game in progress');
  await click('[data-day="cancel"]');
  check('Cancel leaves the save', (await evaluate(`localStorage.getItem('panna_duel_game:${TODAY}')`)) === saveText && !(await exists('.duel-sheet')));
  await click(coin(TODAY));
  await click('[data-day="restart"]');
  check('Restart asks once more', (await waitFor(`document.querySelector('.duel-sheet .note')?.textContent.includes('Tap again to restart')`)) && (await evaluate('location.pathname')) === '/play');
  await click('[data-day="restart"]');
  check('the second tap starts a fresh game', await waitFor(`location.pathname === '/play/game/${TODAY}' && Boolean(window.__duel)`, 20000));
  check('fresh is off the address, so a reload resumes', await waitFor(`!location.search.includes('fresh')`), await evaluate('location.search'));

  await click('.duel-top a');
  await waitFor(`Boolean(document.querySelector('#duel-hero'))`);
  await click(coin(TODAY));
  await waitFor(`Boolean(document.querySelector('[data-day="continue"]'))`);
  await click('[data-day="continue"]');
  check('Continue opens the game', await waitFor(`location.pathname === '/play/game/${TODAY}'`));

  // Review Focus 3: a save for another version is no game in progress.
  const stale = { puzzleId: 'p0000', puzzleVersion: 9, rules, seed: 1, log: [], startedAt: '', score: { you: 3, quill: 1 }, over: false, progress: 0.5 };
  await home({ [`panna_duel_game:${TODAY}`]: stale });
  check('a republished puzzle: no ring', !(await exists(`${coin(TODAY)} .ring`)));
  check('a republished puzzle: hero says Play', (await text('#duel-hero-btn')) === 'Play today’s duel');
  await click(coin(TODAY));
  check('a republished puzzle: the coin starts at once', await waitFor(`location.pathname === '/play/game/${TODAY}'`));

  // A won day.
  const win = (date, you, quill) => ({ date, puzzle: 'p0000.v1', you, quill, at: `${date}T10:00:00Z` });
  await home({ panna_duel_results: [win(TWO_AGO, 41, 39), win(TWO_AGO, 52, 40)] });
  await click(coin(TWO_AGO));
  check('a won day: its sheet', (await text('.duel-sheet .sub2')) === 'Won ★ · your best was 52 to 40', await text('.duel-sheet .sub2'));
  await click('[data-day="again"]');
  check('Play again starts it', await waitFor(`location.pathname === '/play/game/${TWO_AGO}' && Boolean(window.__duel)`, 20000));

  // Won today: the hero offers the latest open day.
  await home({ panna_duel_results: [win(TODAY, 50, 40)] });
  check('hero: won today → the latest open day', (await evaluate(`document.querySelector('#duel-hero-btn').getAttribute('href')`)) === `/play/game/${YESTERDAY}`);
  check('hero: shows the streak', (await text('.hero-flame')).includes('1 day'));
  check('a newly won day stamps its star', await exists(`${coin(TODAY)}.stamp`));
  await go('/play?seed=7');
  await waitFor(`Boolean(document.querySelector('#duel-hero'))`);
  check('and only once', !(await exists(`${coin(TODAY)}.stamp`)));

  // Review Focus 1: the day turns over while the app is open.
  await home();
  await evaluate(`(() => { const R = Date, later = R.now() + 86400000; window.Date = class extends R { constructor(...a) { super(...(a.length ? a : [later])); } static now() { return later; } }; document.dispatchEvent(new Event('visibilitychange')); return true; })()`);
  check('the day turning over moves today', await waitFor(`document.querySelector('${coin(TOMORROW)}')?.dataset.kind === 'today'`), await evaluate(`document.querySelector('${coin(TOMORROW)}')?.dataset.kind`));

  // Review Focus 4: dates with no daily.
  setSchedule(fixture([]));
  await home();
  check('no schedule: a practice hero', (await text('#duel-hero-btn')) === 'Play practice duel', await text('#duel-hero-btn'));
  check('no schedule: every coin is blank', !(await exists('.coin[data-kind]')));
  check('no schedule: ‹ stops at this month', await evaluate(`document.querySelector('[aria-label="Previous month"]').disabled`));

  // A month only partly scheduled can't be sealed, so it doesn't count down to one.
  setSchedule(fixture([TODAY]));
  await home();
  check('a part-scheduled month: an honest seal line', (await text('.seal-row')).includes('seal needs every day') && !(await text('.seal-row')).includes('to the'), await text('.seal-row'));
  setSchedule(fixture(allOfMonth(MONTH)));
  await home();
  check('a fully scheduled month: the count', /\d+ days to the /.test(await text('.seal-row')), await text('.seal-row'));

  // Months and the seal.
  const before = prevMonth(MONTH), all = allOfMonth(before);
  setSchedule(fixture([...all, TODAY]));
  await home({ panna_duel_results: all.map((d) => win(d, 2, 1)) });
  check('a finished month: the seal moment', await waitFor(`document.querySelector('.seal-moment h3')?.textContent.startsWith('The ')`));
  check('the seal moment has its art, a chime and paper', await exists('.seal-moment svg.seal-flip ellipse') && await waitFor(`(window.__duelSounds ?? []).includes('seal') && document.querySelectorAll('.confetto').length > 0`, 2000), await evaluate('window.__duelSounds'));
  await axe('the seal moment');
  await click('.seal-moment .bigbtn');
  await click('[aria-label="Previous month"]');
  check('‹ shows the month before', await waitFor(`document.querySelector('.cal-grid')?.dataset.month === '${before}'`));
  check('its seal is earned', (await text('.seal-row')).includes('seal is yours'));
  check('its count is right', (await text('.cal-won')).includes(`${all.length} of ${all.length}`), await text('.cal-won'));
  check('› stops at this month', await click('[aria-label="Next month"]') && await waitFor(`document.querySelector('[aria-label="Next month"]').disabled`));
  await go('/play?seed=7');
  await waitFor(`Boolean(document.querySelector('#duel-hero'))`);
  check('the seal moment plays once', !(await exists('.seal-moment')));

  // A failed load.
  setSchedule('fail');
  await open('/play?seed=7');
  check('a failed load: an error with Try again', await waitFor(`Boolean(document.querySelector('.duel-load-error[role="alert"]'))`, 20000));
  setSchedule(sched);
  await click('.duel-load-error button');
  check('Try again loads the home', await waitFor(`Boolean(document.querySelector('#duel-hero'))`));

  // Evening, and desktop.
  await home();
  await t.light('evening');
  await sleep(100);
  await axe('home, Evening');
  await setSize(DESKTOP);
  await home();
  const w = await evaluate(`document.querySelector('.duel-home .page-card').getBoundingClientRect().width`);
  check('desktop: a centred column', w > 400 && w <= 560, w);
  await axe('home, desktop');

  // ── Going back ──
  setSchedule(sched);
  await home();
  await click('#duel-hero-btn');
  await waitFor(`location.pathname.startsWith('/play/game/') && Boolean(document.querySelector('.duel-board [data-cell]'))`, 20000);
  await click('[aria-label="Back to the game home"]');
  check('the game’s arrow returns to the home', await waitFor(`location.pathname === '/play' && Boolean(document.querySelector('#duel-hero'))`, 10000));
  const stepped = await evaluate('history.length');
  await click('#duel-hero-btn');
  await waitFor(`location.pathname.startsWith('/play/game/')`, 10000);
  await click('[aria-label="Settings"]');
  await waitFor(`Boolean(document.querySelector('#duel-settings'))`, 10000);
  await evaluate('history.back(); true');
  await waitFor(`location.pathname.startsWith('/play/game/')`, 10000);
  await click('[aria-label="Settings"]');
  await waitFor(`Boolean(document.querySelector('#duel-settings'))`, 10000);
  await click('#duel-settings [aria-label="Back"]');
  check('browser Back then the arrow: one screen at a time, inside the Duel', await waitFor(`location.pathname.startsWith('/play/game/')`, 10000), await evaluate('location.pathname'));
  check('(no extra entries were left behind)', (await evaluate('history.length')) >= stepped);
  await open('/play/settings?seed=7');
  await waitFor(`Boolean(document.querySelector('#duel-settings'))`, 10000);
  await click('#duel-settings [aria-label="Back"]');
  check('an address opened directly goes back to the home', await waitFor(`location.pathname === '/play' && Boolean(document.querySelector('#duel-hero'))`, 10000));

  // ── Everything won ──
  setSchedule(fixture([TODAY]));
  await home({ panna_duel_results: [{ date: TODAY, you: 60, quill: 40, puzzle: 'p0000.v1', at: new Date().toISOString() }] });
  check('all won: the hero offers the ranks, not a dead end', (await text('#duel-hero-btn')) === 'See this week’s ranks', await text('#duel-hero'));

  // ── Swiping the month ──
  await setSize(PHONE);
  await send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
  const months = [prevMonth(prevMonth(MONTH)), prevMonth(MONTH), MONTH];
  setSchedule(fixture(months.flatMap(allOfMonth).filter((d) => d <= TODAY)));
  await home();
  const shown = () => evaluate(`document.querySelector('.cal-grid').dataset.month`);
  const swipe = async (fromSel, dx, dy = 0, steps = 12, gap = 16) => {
    const c = await evaluate(`(() => { const r = document.querySelector(${JSON.stringify(fromSel)}).getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()`);
    await send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [c] });
    for (let i = 1; i <= steps; i++) {
      await send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: c.x + dx * i / steps, y: c.y + dy * i / steps }] });
      await sleep(gap);
    }
    await send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await sleep(60);
  };
  check('swipe: starts on the current month', (await shown()) === MONTH);
  await swipe('.cal-grid', 120);
  check('swipe right: the month before', (await shown()) === months[1], await shown());
  check('the new month slides in, by transform', await evaluate(`document.querySelector('.cal-grid').getAnimations().some((a) => a.effect.getKeyframes().some((k) => k.transform && k.transform.includes('translateX')))`));
  await sleep(300);
  await swipe('.cal-grid', -120);
  check('swipe left: back to the next month', (await shown()) === MONTH, await shown());
  await sleep(300);
  await swipe('.cal-grid', -120);
  check('past the last month nothing changes', (await shown()) === MONTH, await shown());
  await sleep(300);
  check('and the page springs back to rest', (await evaluate(`document.querySelector('.cal-grid').style.transform`)) === '');
  await swipe(coin(YESTERDAY.slice(0, 7) === MONTH ? YESTERDAY : TODAY), 120);
  check('a swipe starting on a day changes the month and opens nothing', (await shown()) === months[1] && (await evaluate('location.pathname')) === '/play' && !(await exists('.duel-sheet')), await evaluate('location.pathname'));
  await sleep(300);
  await click('[aria-label="Next month"]');
  await sleep(300);
  await swipe('.cal-grid', 20, 0, 3, 200);
  check('a short slow move changes nothing', (await shown()) === MONTH, await shown());
  await sleep(300);
  await swipe('.cal-grid', 8, 160);
  check('a mostly vertical drag leaves the month alone', (await shown()) === MONTH, await shown());
  await evaluate('window.scrollTo(0, 0); true');
  await sleep(300);
  await reduceMotion(true);
  await home();
  await swipe('.cal-grid', 120);
  check('reduced motion: the month still changes', (await shown()) === months[1], await shown());
  check('reduced motion: by a short fade, no sliding', await evaluate(`document.querySelector('.cal-grid').getAnimations().every((a) => a.effect.getTiming().duration <= 120 && !a.effect.getKeyframes().some((k) => k.transform))`));
  await reduceMotion(false);
  await send('Emulation.setTouchEmulationEnabled', { enabled: false });

  // A mouse has the arrows; a mouse drag isn't a swipe.
  await home();
  const mouse = async (type, x, y) => send('Input.dispatchMouseEvent', { type, x, y, button: 'left', clickCount: 1, buttons: type === 'mouseReleased' ? 0 : 1 });
  const m = await evaluate(`(() => { const r = document.querySelector('.cal-grid').getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + 20 }; })()`);
  await mouse('mousePressed', m.x, m.y); await mouse('mouseMoved', m.x + 150, m.y); await mouse('mouseReleased', m.x + 150, m.y);
  await sleep(100);
  check('a mouse drag leaves the month alone', (await shown()) === MONTH, await shown());

  // ── The month turning over while the app is open ──
  const clockTo = (iso) => evaluate(`(() => { const R = window.__RealDate ?? Date; window.__RealDate = R; const at = new R(${JSON.stringify(iso)}).getTime();
    window.Date = class extends R { constructor(...a) { if (a.length) super(...a); else super(at); } static now() { return at; } }; dispatchEvent(new Event('focus')); return true; })()`);
  const nextMonthStart = (() => { const [y, mo] = MONTH.split('-').map(Number); return new Date(Date.UTC(y, mo, 1, 0, 30)).toISOString(); })();
  const nextName = nextMonthStart.slice(0, 7);
  setSchedule(fixture([...months.flatMap(allOfMonth), `${nextName}-01`]));
  await home();
  check('(today’s month is showing)', (await shown()) === MONTH);
  await clockTo(nextMonthStart);
  check('the calendar follows the new month when it was on the old one', await waitFor(`document.querySelector('.cal-grid').dataset.month === ${JSON.stringify(nextName)}`, 3000), await shown());
  await home();
  await click('[aria-label="Previous month"]');
  await sleep(300);
  await clockTo(nextMonthStart);
  await sleep(300);
  check('and stays put when the player had paged elsewhere', (await shown()) === months[1], await shown());

  // A month with no dailies has no won count.
  setSchedule(fixture([`${months[0]}-01`, TODAY]));
  await home();
  await click('[aria-label="Previous month"]');
  await sleep(300);
  check('a month with no dailies shows no “0 of 0”', !(await exists('.cal-won')), await text('.cal-head'));
});
