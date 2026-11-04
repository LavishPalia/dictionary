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
  check('settings: the device note', (await text('#duel-settings')).includes('Your games, streak and hints are kept on this device. Clearing the browser’s data starts you afresh.'));
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
  void send;
});
