// The end screens in a real browser: the last move of a real game, then what the screen shows and does.
// Usage: npx tsx scripts/test-duel-end-browser.mts   (needs the app running on localhost:3000)
import { readFileSync } from 'node:fs';
import { apply, botTurn, emptyCells, newGame, RULES_ID, type Action, type GameState, type Puzzle } from '../src/duel/engine';
import { fixture, istDay, PHONE, run } from './duel/browser-harness.mjs';

const P0 = JSON.parse(readFileSync('data/duel/puzzles/p0000.json', 'utf8')) as Puzzle;
const PRACTICE = JSON.parse(readFileSync('data/duel/puzzles/p0001.json', 'utf8')) as Puzzle;
const TODAY = istDay(), YESTERDAY = istDay(-1), TWO_AGO = istDay(-2);

function placements(p: Puzzle, s: GameState) {
  const used = new Set<number>(), place: { cell: number; rackSlot: number }[] = [];
  s.racks.you.forEach((l, rackSlot) => {
    if (l === null) return;
    const cell = emptyCells(p, s).find(c => p.solution[c] === l && !used.has(c));
    if (cell !== undefined) { used.add(cell); place.push({ cell, rackSlot }); }
  });
  return place;
}
const after = (p: Puzzle, s: GameState, a: Action) => {
  let n = apply(p, s, a).state;
  while (!n.over && n.turn === 'quill') n = botTurn(p, n).state;
  return n;
};

/** A real game up to just before its last move: `mode` plays every right tile, or passes throughout. */
function almost(p: Puzzle, mode: 'win' | 'loss', wanted: (s: GameState) => boolean) {
  for (let seed = 1; seed < 400; seed++) {
    let s = newGame(p, seed);
    for (let i = 0; i < 200; i++) {
      // Quill can't fill what's held in your rack, so a losing game plays its last tiles once he has run out.
      const place = mode === 'win' || s.racks.quill.every(l => l === null) ? placements(p, s) : [];
      const a: Action = place.length ? { t: 'submit', place } : { t: 'pass' };
      const n = after(p, s, a);
      if (n.over) {
        if (!wanted(n)) break;
        return { seed, save: { puzzleId: p.id, puzzleVersion: p.version, rules: RULES_ID, seed, log: s.log, startedAt: '2026-01-01T00:00:00Z', score: s.scores, over: false }, last: a, final: n };
      }
      s = n;
    }
  }
  throw new Error(`no ${mode} game found`);
}

const WIN = almost(P0, 'win', s => s.scores.you > s.scores.quill);
const LOSS = almost(P0, 'loss', s => s.scores.you < s.scores.quill);
const PRACTICE_LOSS = almost(PRACTICE, 'loss', s => s.scores.you < s.scores.quill);
const finished = (g: typeof WIN) => ({ ...g.save, log: g.final.log, score: g.final.scores, over: true });

await run("Duel end screens", async (t: any) => {
  const { check, waitFor, evaluate, open, click, text, exists, setSize, setSchedule, reduceMotion, axe, send } = t;
  const gameKey = (d: string) => `panna_duel_game:${d}`;
  const url = (d: string, g: typeof WIN) => `/play/game/${d}?seed=${g.seed}`;
  const atEnd = () => waitFor(`Boolean(document.querySelector('.duel-end'))`, 30000);
  /** Plays the saved game's last move through the page and waits for the end screen. */
  const lastMove = async (g: typeof WIN) => {
    await waitFor(`Boolean(window.__duel && document.querySelector('.duel-board [data-cell]'))`, 20000);
    if (g.last.t === 'submit') {
      for (const pl of g.last.place) {
        await evaluate(`document.querySelector('[data-rack="${pl.rackSlot}"] .duel-tile').click(); true`);
        await waitFor(`window.__duel.snapshot().lifted === ${pl.rackSlot}`, 2000);
        await evaluate(`document.querySelector('.duel-board [data-cell="${pl.cell}"]').click(); true`);
        await waitFor(`window.__duel.snapshot().pending.some((x) => x.cell === ${pl.cell})`, 3000);
      }
      await click('[data-act="submit"]');
    } else await click('[data-act="submit"]');
    return atEnd();
  };

  setSchedule(fixture([TWO_AGO, YESTERDAY, TODAY]));
  await setSize(PHONE);
  await reduceMotion(true);

  // A win, live.
  await open(url(TODAY, WIN), { [gameKey(TODAY)]: WIN.save });
  check('win: the end screen comes after the last move', await lastMove(WIN));
  check('win: the title', (await text('#duel-end-title')) === 'You win!');
  check('win: the line', (await text('.end-hero p')).includes('Professor Quill tips his hat.'));
  check('win: the score', (await text('.end-score')).replace(/\s+/g, ' ').includes(`${WIN.final.scores.you} to ${WIN.final.scores.quill}`), await text('.end-score'));
  check('win: the day is starred', (await text('[data-stat="day"]')).includes('Today won'));
  check('win: the rewards show', (await text('[data-rewards]')).includes('+1 Hint') && (await text('[data-rewards]')).includes('+1 Word'), await text('[data-rewards]'));
  check('win: the balance grew', JSON.parse((await evaluate(`localStorage.getItem('panna_duel_help')`))).earned.word === 1);
  check('win: Next names the open day', (await text('[data-end="next"]')).includes(`${Number(YESTERDAY.slice(8))} `) && (await text('[data-end="next"]')).includes('not yet won'), await text('[data-end="next"]'));

  // The word list
  check('words: a row shows the sense it was clued from, Hindi and English', await evaluate(`(() => {
    const s = ${JSON.stringify(P0.slots.map(x => ({ a: x.answer, hi: x.sense.hi, en: x.sense.en })))};
    const row = [...document.querySelectorAll('.wl-row')][0], x = s.find((y) => y.a === row.dataset.word);
    return row.querySelector('.wl-hi').textContent === x.hi && row.querySelector('.wl-en').textContent === x.en;
  })()`));
  const shown = await evaluate(`document.querySelectorAll('.wl-row').length`), allRows = P0.slots.length;
  const hasMore = await exists('.wl-more');
  if (hasMore) {
    await click('.wl-more');
    check('words: Show all shows them all', await waitFor(`document.querySelectorAll('.wl-row').length === ${allRows}`), shown);
  } else check('words: all rows when few', shown === allRows, shown);
  check('words: a row opens the word page', (await evaluate(`document.querySelector('.wl-row[data-word="NIGHT"] a').getAttribute('href')`)) === '/word/night');
  await click('.wl-row[data-word="NIGHT"] .wl-star');
  check('words: ☆ saves to the review deck', await waitFor(`JSON.parse(localStorage.getItem('panna_saved_words') || '[]').some((w) => w.normalized === 'night')`));
  check('words: and says so', await waitFor(`document.querySelector('.page-toast')?.textContent === 'Saved to your review deck'`));
  await click('.wl-row[data-word="NIGHT"] .wl-star');
  check('words: tapping again removes it', await waitFor(`!JSON.parse(localStorage.getItem('panna_saved_words') || '[]').some((w) => w.normalized === 'night')`));
  await click('.wl-addall');
  const known = ['INDULGE', 'NIGHT', 'ROUTE', 'NOTION'];
  check('words: Add all saves them', await waitFor(`(() => { const s = JSON.parse(localStorage.getItem('panna_saved_words') || '[]').map((w) => w.normalized); return ${JSON.stringify(known.map(w => w.toLowerCase()))}.every((w) => s.includes(w)); })()`, 20000));
  const count = await evaluate(`JSON.parse(localStorage.getItem('panna_saved_words')).length`);
  await click('.wl-addall');
  await t.waitFor(`document.querySelector('.page-toast')`, 3000);
  await new Promise(r => setTimeout(r, 800));
  check('words: Add all again adds no duplicates', (await evaluate(`(() => { const s = JSON.parse(localStorage.getItem('panna_saved_words')).map((w) => w.normalized); return new Set(s).size === s.length && s.length; })()`)) >= count);
  await axe('win, Day');

  // Next goes on from the first frame.
  await click('[data-end="next"]');
  check('Next opens the open day', await waitFor(`location.pathname === '/play/game/${YESTERDAY}'`, 10000));
  // A reload on the finished game shows it at once, with no rewards to claim again.
  await open(url(TODAY, WIN), { [gameKey(TODAY)]: finished(WIN), panna_duel_results: [{ date: TODAY, puzzle: 'p0000.v1', you: WIN.final.scores.you, quill: WIN.final.scores.quill, at: 'x' }] });
  check('reload: the end screen shows', await atEnd());
  check('reload: no arrival to sit through', !(await evaluate(`document.querySelector('.duel-end').classList.contains('arriving')`)));
  check('reload: no rewards again', !(await exists('[data-rewards]')));

  // A loss, live.
  await open(url(TODAY, LOSS), { [gameKey(TODAY)]: LOSS.save });
  check('loss: the end screen', await lastMove(LOSS));
  check('loss: the title and line', (await text('#duel-end-title')) === 'So close' && (await text('.end-hero p')).includes('Replay to earn today’s star.'), await text('.end-hero p'));
  check('loss: the star is still open', (await text('[data-stat="day"]')).includes('star still open'));
  check('loss: no rewards', !(await exists('[data-rewards]')));
  await axe('loss, Day');
  await click('[data-end="replay"]');
  check('loss: Replay starts a fresh game of the same puzzle', await waitFor(`!document.querySelector('.duel-end') && !window.__duel.snapshot().state.over && window.__duel.snapshot().state.log.length === 0`));

  // Practice (Review Focus 4)
  setSchedule(fixture([]));
  await open(url(TODAY, PRACTICE_LOSS), { [gameKey(TODAY)]: PRACTICE_LOSS.save });
  check('practice: the end screen', await lastMove(PRACTICE_LOSS));
  check('practice: no star promised', !(await text('.end-hero')).includes('star'));
  check('practice: no day or streak cards', !(await exists('.end-stats')));
  check('practice: records nothing', !(await evaluate(`localStorage.getItem('panna_duel_results')`)));
  setSchedule(fixture([TWO_AGO, YESTERDAY, TODAY]));

  // Motion on: a tap skips the arrival.
  await reduceMotion(false);
  await open(url(TODAY, LOSS), { [gameKey(TODAY)]: LOSS.save });
  await lastMove(LOSS);
  check('arrival: plays', await evaluate(`document.querySelector('.duel-end').classList.contains('arriving')`));
  await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: 200, y: 200, button: 'left', clickCount: 1 });
  await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: 200, y: 200, button: 'left', clickCount: 1 });
  check('arrival: a tap skips it', await waitFor(`!document.querySelector('.duel-end').classList.contains('arriving')`, 800));
  await t.light('evening');
  await reduceMotion(true);
  await axe('loss, Evening');
});
