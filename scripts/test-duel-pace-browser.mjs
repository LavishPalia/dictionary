// The scoring speed in a real browser: a faster turn ends in exactly the same game, and the lab plays and times its turns.
// Usage: node scripts/test-duel-pace-browser.mjs   (needs the app running on localhost:3000)
import { PHONE, run, sleep } from './duel/browser-harness.mjs';
import fs from 'fs';

const GAME = '/play/game/2026-08-01'; // before the first scheduled date, so it plays the practice puzzle
const GUIDE = { panna_duel_guide: { coach: true, tips: ['hint', 'word', 'swap', 'calendar'] } };

await run('Duel pace', async (t) => {
  const { check, waitFor, evaluate, open, click, setSize, send, reduceMotion } = t;
  await setSize(PHONE);

  /** Plays one turn of 3 right tiles by tap, and returns how long it took and how it ended. */
  const turn = async (query) => {
    await open(`${GAME}?seed=7${query}`, GUIDE);
    await waitFor(`Boolean(window.__duel && document.querySelector('.duel-board [data-cell]'))`, 20000);
    await sleep(400);
    const moves = await evaluate(`(() => { const s = window.__duel.snapshot(), sol = window.__duel.puzzle.solution, used = new Set(), out = [];
      s.state.racks.you.forEach((l, slot) => { const cell = Object.keys(sol).find((c) => !used.has(c) && !s.state.filled[c] && sol[c] === l); if (cell !== undefined && out.length < 3) { used.add(cell); out.push({ slot, cell }); } });
      return out; })()`);
    for (const m of moves) {
      await click(`[data-rack="${m.slot}"] .duel-tile`);
      await sleep(120);
      await click(`.duel-board [data-cell="${m.cell}"]`);
      await sleep(450);
    }
    const t0 = Date.now();
    await click('[data-act="submit"]');
    await waitFor(`window.__duel.snapshot().state.log.length > 0 && window.__duel.snapshot().state.scores.you > 0`, 15000);
    const scored = Date.now() - t0;
    await waitFor(`!window.__duel.snapshot().busy`, 40000);
    const s = await evaluate(`(() => { const s = window.__duel.snapshot().state; return JSON.stringify({ filled: s.filled, racks: s.racks, scores: s.scores, log: s.log }); })()`);
    return { scored, s };
  };
  const full = await turn('');
  const half = await turn('&pace=0.5');
  check('a faster turn ends in exactly the same game', full.s === half.s);
  check('and its scoring takes much less time', half.scored <= full.scored * 0.7, { full: full.scored, half: half.scored });

  // ── The lab ──
  await open('/play/lab');
  check('the lab opens', await waitFor(`Boolean(document.querySelector('#lab-play:not(:disabled)'))`, 20000));
  const took = async (speed, ramp, turnIndex) => {
    await click(`[data-speed="${speed}"]`); await click(`[data-ramp="${ramp}"]`); await click(`[data-turn="${turnIndex}"]`);
    await sleep(100);
    await click('#lab-play');
    await sleep(300);
    await waitFor(`/took/.test(document.querySelector('#lab-took').textContent)`, 30000);
    const secs = await evaluate(`parseFloat(document.querySelector('#lab-took').textContent.replace(/[^0-9.]/g, ''))`);
    await waitFor(`!document.querySelector('#lab-play').disabled`, 5000);
    return secs;
  };
  const slow = await took(1, 1, 1), fast = await took(0.5, 1, 1), quick = await took(1, 0.7, 1);
  check('in the lab, 50 % plays a 3-word turn in at most 60 % of the time', fast <= slow * 0.6, { slow, fast });
  check('in the lab, each next word quicker saves time too', quick < slow, { slow, quick });
  check('a played turn leaves nothing behind', (await evaluate(`document.querySelectorAll('.duel-fx > *').length`)) === 0);
  const big = await took(0.65, 0.85, 2);
  check('the big turn plays', big > 0, big);
  const shot = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true });
  fs.writeFileSync('scratch/lab-phone.png', Buffer.from(shot.data, 'base64'));
  await click('[data-sound="drop-2"]');
  check('a sound pick is shown and kept', (await evaluate(`document.querySelector('#lab-choice').textContent`)).includes('drop 2') && (await evaluate(`JSON.parse(localStorage.getItem('panna_duel_lab')).drop`)) === 2);
  const decoded = await evaluate(`fetch('/duel/sounds/lab/drop-2.mp3').then((r) => r.arrayBuffer()).then((b) => new OfflineAudioContext(1, 8000, 44100).decodeAudioData(b)).then((a) => a.duration > 0)`);
  check('a candidate file decodes', decoded);
  await reduceMotion(true);
  await open('/play/lab');
  await waitFor(`Boolean(document.querySelector('#lab-play:not(:disabled)'))`, 20000);
  check('with reduced motion the lab still plays', (await took(1, 1, 1)) > 0);
  await reduceMotion(false);
});
