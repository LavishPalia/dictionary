// Starting a Duel game with no connection, with the real service worker in charge and on the real schedule.
// Usage: node scripts/test-duel-offline-browser.mjs   (needs a production build running on localhost:3000)
import { istDay, PHONE, run, sleep } from './duel/browser-harness.mjs';

const TODAY = istDay();
const board = `Boolean(document.querySelector('.duel-board [data-cell]'))`;
const saved = (path) => `caches.open('panna-duel-v1').then((c) => c.match(${JSON.stringify(path)})).then(Boolean)`;
const keys = (name) => `caches.open(${JSON.stringify(name)}).then((c) => c.keys()).then((ks) => ks.map((k) => new URL(k.url).pathname + new URL(k.url).search))`;

await run('Duel offline', async (t) => {
  const { check, waitFor, evaluate, setSize, offline, stalled, go, click, exists, text } = t;
  await setSize(PHONE);

  // ── A device that has only ever opened /play ──
  await go('/icon.svg');
  await waitFor(`location.pathname === '/icon.svg'`);
  await evaluate(`localStorage.setItem('panna_duel_guide', JSON.stringify({ coach: true, tips: ['hint', 'word', 'swap', 'calendar'] })); true`);
  await go('/play');
  check('the home opens online', await waitFor(`Boolean(document.querySelector('#duel-hero'))`, 20000));
  check('opening only /play registers the service worker', await waitFor(`navigator.serviceWorker.getRegistration().then((r) => Boolean(r))`, 20000));
  check('the shell is saved', await waitFor(saved('/play'), 30000));
  const schedule = await evaluate(`fetch('/duel/schedule.json').then((r) => r.json())`);
  const scheduled = Boolean(schedule.dates[TODAY]);
  if (scheduled) check('today’s puzzle is saved', await waitFor(saved(`/duel/p/${schedule.files[schedule.dates[TODAY]]}`), 30000));
  await waitFor(`caches.open('panna-duel-v1').then((c) => c.keys()).then((k) => k.some((r) => r.url.includes('/duel/pics/')))`, 30000);
  await sleep(2500);
  await go('/play');
  check('the worker is in charge after a reload', await waitFor(`Boolean(navigator.serviceWorker.controller)`, 20000));
  await sleep(2500);

  check('the practice game\'s pictures are saved too', (await evaluate(saved('/duel/pics/1f350.svg'))) && (await evaluate(saved('/duel/pics/1f6f7.svg'))));

  // ── A connection that carries nothing ──
  await stalled(true);
  await go('/play');
  check('stalled: the home still opens, from what is saved', await waitFor(`Boolean(document.querySelector('#duel-hero'))`, 15000), await evaluate('document.body.innerText.slice(0, 200)'));
  await stalled(false);

  // ── Offline ──
  await offline(true);
  await go('/play');
  check('offline: the home opens', await waitFor(`Boolean(document.querySelector('#duel-hero'))`, 20000), await evaluate('document.body.innerText.slice(0, 200)'));
  await go(`/play/game/${TODAY}?seed=7`);
  check('offline: today’s address opens the game', await waitFor(board, 20000), await evaluate('location.href + " " + document.body.innerText.slice(0, 200)'));
  check('offline: the address stays the game’s', (await evaluate('location.pathname')) === `/play/game/${TODAY}`, await evaluate('location.href'));
  check('offline: the letters are in Montserrat', await waitFor(`document.fonts.ready.then(() => [...document.fonts].some((f) => /montserrat/i.test(f.family) && f.status === 'loaded'))`, 5000));
  await sleep(500);
  const pics = await evaluate(`[...document.querySelectorAll('.duel-clue img')].map((i) => ({ src: i.getAttribute('src'), ok: i.complete && i.naturalWidth > 0 }))`);
  check('offline: picture clues show', pics.every((p) => p.ok), pics);

  // A real move offline: place a right tile, submit, and Quill answers.
  const move = await evaluate(`(() => { const s = window.__duel.snapshot(), sol = window.__duel.puzzle.solution;
    for (const [slot, l] of s.state.racks.you.entries()) { const cell = Object.keys(sol).find((c) => !s.state.filled[c] && sol[c] === l); if (l && cell !== undefined) return { slot, cell }; } return null; })()`);
  check('offline: there is a move to play', Boolean(move));
  await click(`[data-rack="${move.slot}"] .duel-tile`);
  await sleep(200);
  await click(`.duel-board [data-cell="${move.cell}"]`);
  await sleep(600);
  await click('[data-act="submit"]');
  check('offline: a turn is played, and Quill answers', await waitFor(`window.__duel.snapshot().state.log.length >= 1 && !window.__duel.snapshot().busy && window.__duel.snapshot().state.turn === 'you' && window.__duel.snapshot().state.scores.you > 0`, 40000));
  await go(`/play/game/${TODAY}?seed=7`);
  check('offline: the game continues after a reload', await waitFor(`window.__duel && window.__duel.snapshot().state.log.length >= 1`, 20000));

  await go('/play/settings');
  check('offline: another address opens its screen', await waitFor(`Boolean(document.querySelector('#duel-settings'))`, 20000), await evaluate('location.href'));

  // A past day nobody saved: a plain message, and never a practice game.
  const unsaved = Object.keys(schedule.dates).sort().find((d) => d < TODAY);
  if (unsaved) {
    await evaluate(`caches.open('panna-duel-v1').then((c) => c.delete('/duel/p/${schedule.files[schedule.dates[unsaved]]}'))`);
    await go(`/play/game/${unsaved}`);
    check('offline: a day not saved says so', await waitFor(`document.querySelector('.duel-load-error')?.innerText.includes('isn’t saved on this phone')`, 20000), await evaluate('document.body.innerText.slice(0, 200)'));
    check('offline: no practice board in its place', !(await exists('.duel-board [data-cell]')));
    check('offline: Try again is offered', (await text('.duel-load-error button')) === 'Try again');
  }

  // From Panna itself.
  await go('/');
  check('offline: Panna’s front page opens', await waitFor(`document.readyState === 'complete' && document.body.innerText.length > 20`, 20000));
  await waitFor(`Boolean(document.querySelector('#nav-play-btn'))`, 5000);
  await click('#nav-play-btn');
  check('offline: its Play tab opens the home', await waitFor(`location.pathname === '/play' && Boolean(document.querySelector('#duel-hero'))`, 20000), await evaluate('location.href'));

  await offline(false);
  const duelKeys = await evaluate(keys('panna-duel-v1')), dataKeys = await evaluate(keys('panna-data-v1'));
  await evaluate(`navigator.serviceWorker.controller.postMessage({ type: 'warm', urls: ['/api/duel/leaderboard?week=this'] }); true`);
  await sleep(1500);
  check('warming doesn\'t keep a server reply in the page cache', !(await evaluate(keys('panna-pages-v1'))).some((k) => k.includes('/api/duel')));
  check('/api/duel is never cached', !duelKeys.some((k) => k.includes('/api/')) && !dataKeys.some((k) => k.includes('/api/duel')), dataKeys);

  // ── Many days don't push book pages out ──
  const pagesBefore = await evaluate(keys('panna-pages-v1'));
  for (let i = 0; i < 5; i++) { await go(`/play/game/${istDay(-i)}?seed=7`); await sleep(400); }
  const pagesAfter = await evaluate(keys('panna-pages-v1'));
  check('game addresses aren’t kept in the book’s page cache', !pagesAfter.some((k) => k.startsWith('/play')) && pagesAfter.length <= pagesBefore.length, pagesAfter);

  // ── A new deploy: the page's own code is older than the server's shell ──
  await go('/play');
  await waitFor(`Boolean(document.querySelector('#duel-hero'))`, 20000);
  await sleep(3000);
  const readShell = `caches.open('panna-duel-v1').then((c) => c.match('/play')).then((r) => r.text())`;
  const shellBefore = await evaluate(readShell);
  await evaluate(`(() => { const real = window.fetch;
    window.fetch = async (u, o) => (String(u) === '/play' ? new Response('<script src="/_next/static/chunks/new-deploy-abc.js"></script>', { status: 200, headers: { 'Content-Type': 'text/html' } }) : real(u, o));
    dispatchEvent(new Event('online')); return true; })()`);
  await sleep(2500);
  check('a newer deploy’s shell isn’t saved over the one that matches its files', (await evaluate(readShell)) === shellBefore);
}, { serviceWorker: true });
