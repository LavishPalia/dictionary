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
  const { check, waitFor, evaluate, open, click, text, exists, setSize, setSchedule, axe, go } = t;
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

  // Months and the seal.
  const before = prevMonth(MONTH), all = allOfMonth(before);
  setSchedule(fixture([...all, TODAY]));
  await home({ panna_duel_results: all.map((d) => win(d, 2, 1)) });
  check('a finished month: the seal moment', await waitFor(`document.querySelector('.seal-moment h3')?.textContent.startsWith('The ')`));
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
});
