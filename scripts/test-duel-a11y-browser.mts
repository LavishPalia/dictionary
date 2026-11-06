// The Duel's accessibility pass in a real browser: every screen under axe at phone, small phone and desktop sizes, in
// both lights, what a screen reader is told, where focus goes, sizes, and language tags.
// Usage: npx tsx scripts/test-duel-a11y-browser.mts   (needs the app running on localhost:3000)
import { readFileSync } from 'node:fs';
import { RULES_ID, type Puzzle } from '../src/duel/engine';
import { turnSummary } from '../src/duel/ui/announce';
import { DESKTOP, fixture, istDay, PHONE, run, sleep } from './duel/browser-harness.mjs';
import { playGame } from './duel/play';

const P0 = JSON.parse(readFileSync('data/duel/puzzles/p0000.json', 'utf8')) as Puzzle;
const TODAY = istDay();
const QUIET = { panna_duel_guide: { coach: true, tips: ['hint', 'word', 'swap', 'calendar'] } };
const SMALL = { width: 320, height: 640, mobile: true }, MID = { width: 360, height: 740, mobile: true };

const played = playGame(P0, 11);
const finished = { puzzleId: P0.id, puzzleVersion: P0.version, rules: RULES_ID, seed: 11, log: played.actions, startedAt: '2026-01-01T00:00:00Z', score: played.state.scores, over: true };

await run('Duel accessibility', async (t: any) => {
  const { check, waitFor, evaluate, open, click, exists, setSize, setSchedule, reduceMotion, axe, send } = t;
  setSchedule(fixture([TODAY]));
  const game = `/play/game/${TODAY}?seed=11`;
  const screens: [string, string, string, Record<string, unknown>][] = [
    ['home', '/play?seed=1', '#duel-hero', QUIET],
    ['game', game, '.duel-board [data-cell]', QUIET],
    ['end', game, '.duel-end', { ...QUIET, [`panna_duel_game:${TODAY}`]: finished }],
    ['ranks', '/play/ranks?seed=1', '#duel-ranks', QUIET],
    ['settings', '/play/settings?seed=1', '#duel-settings', QUIET],
    ['how to play', '/play/how?seed=1', 'main h1', QUIET],
  ];
  t.setApi('fail'); // no database here: Ranks shows its offline message
  for (const [size, dims] of [['phone', PHONE], ['small phone', SMALL], ['360 wide', MID], ['desktop', DESKTOP]] as const) {
    await setSize(dims);
    for (const [name, url, ready, store] of screens) {
      await open(url, store);
      check(`${size}: ${name} opens`, await waitFor(`Boolean(document.querySelector(${JSON.stringify(ready)}))`, 20000));
      await sleep(name === 'end' ? 2200 : 300);
      await axe(`${size}, day: ${name}`);
      if (size === 'phone' || size === 'desktop') await axe(`${size}, evening: ${name}`);
      check(`${size}: ${name} doesn't overflow sideways`, await evaluate(`document.documentElement.scrollWidth <= innerWidth + 1`), await evaluate(`document.documentElement.scrollWidth`));
      const untagged = await evaluate(`[...document.querySelectorAll('main *')].filter((el) => [...el.childNodes].some((n) => n.nodeType === 3 && /[\\u0900-\\u097F]/.test(n.textContent)) && !el.closest('[lang="hi"]')).map((el) => el.textContent.slice(0, 40))`);
      check(`${size}: ${name}: every Hindi line says so`, untagged.length === 0, untagged);
    }
  }

  // ── Sizes on the smallest phones ──
  for (const dims of [SMALL, MID]) {
    await setSize(dims);
    await open('/play?seed=1', QUIET);
    await waitFor(`Boolean(document.querySelector('#duel-hero'))`, 20000);
    const coins = await evaluate(`(() => { const r = [...document.querySelectorAll('.coin:not(.blank)')].map((c) => c.getBoundingClientRect());
      return { w: Math.min(...r.map((x) => x.width)), overlap: r.some((a, i) => r.some((b, j) => j > i && a.left < b.right - 0.5 && b.left < a.right - 0.5 && a.top < b.bottom - 0.5 && b.top < a.bottom - 0.5)) }; })()`);
    check(`${dims.width} wide: day coins don't overlap`, !coins.overlap, coins);
    check(`${dims.width} wide: day coins are at least 24 px`, coins.w >= 24, coins);
  }
  await setSize(PHONE);
  await open(game, QUIET);
  await waitFor(`Boolean(window.__duel && document.querySelector('.duel-board [data-cell]'))`, 20000);
  // A clue square holding two clues is split in half by design: the fixed grid is the game (WCAG 2.5.8's "essential" exception).
  const small = await evaluate(`[...document.querySelectorAll('.duel-main button:not(.duel-cl.two .duel-clue), .duel-main a')].filter((el) => { const r = el.getBoundingClientRect(); return r.width > 0 && (r.width < 24 || r.height < 24); }).map((el) => el.getAttribute('aria-label') || el.textContent)`);
  check('phone: every control is at least 24 px', small.length === 0, small);
  const primary = await evaluate(`[...document.querySelectorAll('[data-act], .duel-rack .duel-tile')].filter((el) => { const r = el.getBoundingClientRect(); return r.height < 44; }).map((el) => el.dataset.act ?? el.getAttribute('aria-label'))`);
  check('phone: tiles and game buttons are at least 44 px tall', primary.length === 0, primary);

  // ── What a screen reader hears ──
  const live = `[...document.querySelectorAll('.duel-sr[aria-live] > *')].map((n) => n.textContent)`;
  const moves = await evaluate(`(() => { const s = window.__duel.snapshot(), sol = window.__duel.puzzle.solution, used = new Set(), out = [];
    s.state.racks.you.forEach((l, slot) => { const cell = Object.keys(sol).find((c) => !used.has(c) && !s.state.filled[c] && sol[c] === l); if (cell !== undefined && out.length < 2) { used.add(cell); out.push({ slot, cell }); } });
    return out; })()`);
  for (const m of moves) {
    await click(`[data-rack="${m.slot}"] .duel-tile`);
    await sleep(100);
    await click(`.duel-board [data-cell="${m.cell}"]`);
    await sleep(450);
  }
  await click('[data-act="submit"]');
  check('your turn is spoken', await waitFor(`${live}.some((t) => /^2 right\\./.test(t))`, 15000), await evaluate(live));
  check('and then Quill\'s, each once, neither cut off', await waitFor(`${live}.some((t) => /^Professor Quill (played|passed)/.test(t))`, 20000) && (await evaluate(`new Set(${live}).size === ${live}.length`)), await evaluate(live));
  const said = await evaluate(live);
  check('each ends with both scores', said.every((s: string) => /You \d+, Professor Quill \d+\.$/.test(s)), said);
  await waitFor(`!window.__duel.snapshot().busy`, 30000);

  // ── A non-colour mark on Quill's last move ──
  const mark = await evaluate(`(() => { const c = document.querySelector('.duel-l.last'); if (!c) return null; const s = getComputedStyle(c, '::after'); return { content: s.content, h: parseFloat(s.height), label: c.getAttribute('aria-label') }; })()`);
  if (mark) {
    check('Quill\'s last move has a mark that isn\'t only colour', mark.content !== 'none' && mark.h >= 2, mark);
    check('and says so', /Professor Quill's last move/.test(mark.label), mark);
  }

  // ── Focus and the page title ──
  await open('/play?seed=1', QUIET);
  await waitFor(`Boolean(document.querySelector('#duel-hero'))`, 20000);
  check('the home is titled', (await evaluate('document.title')) === 'Panna Duel', await evaluate('document.title'));
  check('opening the app doesn\'t move focus', await evaluate(`document.activeElement === document.body`));
  await click('[aria-label="Settings"]');
  check('a new screen takes focus at its heading', await waitFor(`document.activeElement?.tagName === 'H1' && document.activeElement.textContent === 'Settings'`, 3000), await evaluate(`document.activeElement?.outerHTML.slice(0, 80)`));
  check('and its title changes', (await evaluate('document.title')) === 'Settings · Panna Duel', await evaluate('document.title'));
  await click('#duel-settings [aria-label="Back"]');
  check('back at the home, focus is on its heading', await waitFor(`document.activeElement?.tagName === 'H1' && Boolean(document.querySelector('#duel-hero'))`, 5000));
  await click('#duel-hero-btn');
  check('the game takes focus at its heading once it has loaded', await waitFor(`document.activeElement?.tagName === 'H1' && Boolean(document.querySelector('.duel-board [data-cell]'))`, 20000));
  check('and is titled with its date', /· Panna Duel$/.test(await evaluate('document.title')), await evaluate('document.title'));
  await open(game, { ...QUIET, [`panna_duel_game:${TODAY}`]: finished });
  await waitFor(`Boolean(document.querySelector('.duel-end'))`, 20000);
  await sleep(200);
  check('the end screen takes focus at its heading', await evaluate(`document.activeElement?.id === 'duel-end-title'`), await evaluate(`document.activeElement?.outerHTML.slice(0, 80)`));
  check('and the board behind is out of reach', await evaluate(`document.querySelector('.duel-main').inert === true`));

  // ── Keyboard on the desktop ──
  await setSize(DESKTOP);
  await open(game, QUIET);
  await waitFor(`Boolean(window.__duel && document.querySelector('.duel-board [data-cell]'))`, 20000);
  await sleep(300);
  const press = async (key: string, code = key, text?: string) => {
    await send('Input.dispatchKeyEvent', { type: 'keyDown', key, code, text, windowsVirtualKeyCode: { Tab: 9, Enter: 13, Backspace: 8 }[key] ?? key.toUpperCase().charCodeAt(0) });
    await send('Input.dispatchKeyEvent', { type: 'keyUp', key, code });
  };
  await press('Tab');
  await sleep(100);
  const ring = await evaluate(`(() => { const a = document.activeElement, s = getComputedStyle(a); return { cell: a.matches('[data-cell]'), style: s.outlineStyle, w: parseFloat(s.outlineWidth) }; })()`);
  check('keyboard: from the heading, Tab reaches the board', ring.cell, ring);
  check('keyboard: and the focus shows', ring.style !== 'none' && ring.w >= 2, ring);

  // ── Motion off ──
  await reduceMotion(true);
  await open(game, { ...QUIET, [`panna_duel_game:${TODAY}`]: finished });
  await waitFor(`Boolean(document.querySelector('.duel-end'))`, 20000);
  check('reduced motion: no long animation on the end screen', await evaluate(`document.getAnimations().every((a) => { const d = a.effect.getTiming().duration; return typeof d !== 'number' || d <= 120; })`));
  await reduceMotion(false);

  // The words themselves.
  const scores = { you: 10, quill: 8 };
  const s0 = P0.slots[0];
  check('summary: a turn with a word', turnSummary(P0, 'you', [{ e: 'judged', who: 'you', tiles: [{ cell: 1, letter: 'A', ok: true, rackSlot: 0 }, { cell: 2, letter: 'B', ok: false, rackSlot: 1 }] }, { e: 'score', who: 'you', to: 10 }, { e: 'word', who: 'you', slot: s0.id, points: 6 }, { e: 'score', who: 'you', to: 16 }] as any, scores) === `1 right, 1 wrong. Finished ${s0.answer}, plus 6. You 16, Professor Quill 8.`, s0.answer);
  check('summary: a pass', turnSummary(P0, 'you', [{ e: 'passed', who: 'you', streak: 1 }] as any, scores) === 'You passed. You 10, Professor Quill 8.');
  check('summary: Quill', turnSummary(P0, 'quill', [{ e: 'botPlaced', who: 'quill', tiles: [{ cell: 1, letter: 'L' }, { cell: 2, letter: 'A' }] }, { e: 'score', who: 'quill', to: 12 }] as any, scores) === 'Professor Quill played L, A. You 10, Professor Quill 12.');
  void exists;
});
