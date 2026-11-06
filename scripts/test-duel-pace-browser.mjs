// The scoring speed and the sounds in a real browser: the motion changes nothing about the game, a turn scores quickly,
// picking up a tile and Quill's thinking are silent, and the chosen files decode.
// Usage: node scripts/test-duel-pace-browser.mjs   (needs the app running on localhost:3000)
import { PHONE, run, sleep } from './duel/browser-harness.mjs';

const GAME = '/play/game/2026-08-01'; // before the first scheduled date, so it plays the practice puzzle
const GUIDE = { panna_duel_guide: { coach: true, tips: ['hint', 'word', 'swap', 'calendar'] } };
const FILES = ['drop', 'wrong', 'rack', 'thud'];

await run('Duel pace', async (t) => {
  const { check, waitFor, evaluate, open, click, setSize, reduceMotion } = t;
  await setSize(PHONE);

  /** Plays one turn of 3 right tiles by tap, and returns how long it took, how it ended and what it sounded like. */
  const turn = async () => {
    await open(`${GAME}?seed=7`, GUIDE);
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
    const placing = await evaluate(`window.__duelSounds.slice()`);
    const t0 = Date.now();
    await click('[data-act="submit"]');
    await waitFor(`window.__duel.snapshot().state.log.length > 0 && window.__duel.snapshot().state.scores.you > 0`, 15000);
    const scored = Date.now() - t0;
    await waitFor(`!window.__duel.snapshot().busy`, 40000);
    const s = await evaluate(`(() => { const s = window.__duel.snapshot().state; return JSON.stringify({ filled: s.filled, racks: s.racks, scores: s.scores, log: s.log }); })()`);
    return { scored, s, placing, all: await evaluate(`window.__duelSounds.slice()`) };
  };

  const played = await turn();
  check('placing 3 tiles sounds only their 3 landings', played.placing.join() === 'drop,drop,drop', played.placing);
  check('nothing sounds a pick-up or Quill thinking', !played.all.some((n) => n === 'lift' || n === 'think'), played.all);
  check('a 3-tile turn scores within 2.5 s', played.scored <= 2500, played.scored);

  await reduceMotion(true);
  const still = await turn();
  await reduceMotion(false);
  check('without motion, the turn ends in exactly the same game', played.s === still.s);

  for (const name of FILES) {
    const decoded = await evaluate(`fetch('/duel/sounds/${name}.v1.mp3').then((r) => r.arrayBuffer()).then((b) => new OfflineAudioContext(1, 8000, 44100).decodeAudioData(b)).then((a) => a.duration > 0)`);
    check(`${name}: the file decodes`, decoded);
  }
});
