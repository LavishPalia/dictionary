// The Duel UI's logic that runs without a browser: the router, URL flags, tiers and the game controller.
// Usage: npx tsx scripts/test-duel-controller.ts
import { readFileSync } from 'node:fs';
import { emptyCells, replay, RULES_ID, type CellId, type Puzzle } from '../src/duel/engine';
import type { Platform } from '../src/duel/platform/types';
import { stubHelp } from '../src/duel/platform/web/help';
import { GameController } from '../src/duel/ui/controller/controller';
import { NullDirector } from '../src/duel/ui/controller/null-director';
import { hintCells, nextEmpty, wordCandidates } from '../src/duel/ui/controller/selectors';
import type { Director, SavedGame } from '../src/duel/ui/controller/types';
import { readFlags } from '../src/duel/ui/flags';
import { pickTier, shouldStepDown } from '../src/duel/ui/fx/tier';
import { readResults, RESULTS_KEY } from '../src/duel/progress';
import { istToday, parsePath } from '../src/duel/ui/router';

let failures = 0;
function check(label: string, ok: boolean, detail?: unknown) {
  if (ok) console.log(`✓ ${label}`);
  else { failures++; console.error(`✗ ${label}${detail !== undefined ? ` — ${JSON.stringify(detail)}` : ''}`); }
}

async function main() {
  // ── Router ──
  check('IST today rolls over at 18:30 UTC', istToday(new Date('2026-11-01T18:29:59Z')) === '2026-11-01' && istToday(new Date('2026-11-01T18:30:00Z')) === '2026-11-02');
  check('/play → pick the day', (parsePath('/play', '2026-11-01') as any).screen === 'play');
  check('/play/ → pick the day', (parsePath('/play/', '2026-11-01') as any).screen === 'play');
  check('a past date opens', (parsePath('/play/game/2026-10-28', '2026-11-01') as any).date === '2026-10-28');
  check('today opens', (parsePath('/play/game/2026-11-01', '2026-11-01') as any).date === '2026-11-01');
  for (const bad of ['/play/game/2026-11-02', '/play/game/banana', '/play/game/2026-02-30', '/play/ranks'])
    check(`${bad} → today`, (parsePath(bad, '2026-11-01') as any).redirect === '/play/game/2026-11-01');

  // ── Flags ──
  check('seed flag', readFlags('?seed=7').seed === 7 && readFlags('?seed=7').test && !readFlags('').test);
  check('bad seed ignored', readFlags('?seed=-1').seed === undefined && readFlags('?seed=4294967296').seed === undefined && readFlags('?seed=1.5').seed === undefined);
  check('tier and perf flags', readFlags('?tier=lite&perf=1').tier === 'lite' && readFlags('?perf=1').perf && readFlags('?tier=fast').tier === undefined);

  // ── Quality tiers ──
  check('8 cores, 6 GB → normal', pickTier({ hardwareConcurrency: 8, deviceMemory: 6 }) === 'normal');
  check('4 cores → lite', pickTier({ hardwareConcurrency: 4, deviceMemory: 8 }) === 'lite');
  check('3 GB → lite', pickTier({ hardwareConcurrency: 8, deviceMemory: 3 }) === 'lite');
  check('unknown → normal', pickTier({}) === 'normal');
  check('9 % slow over 2 s → step down', shouldStepDown([...Array(110).fill(16.7), ...Array(11).fill(25)]));
  check('7 % slow → stay', !shouldStepDown([...Array(112).fill(16.7), ...Array(8).fill(25)]));
  check('under 2 s of frames → stay', !shouldStepDown(Array(60).fill(25)));
  check('no frames → stay', !shouldStepDown([]));

  await controllerChecks();

  if (failures) { console.error(`\n${failures} failed`); process.exit(1); }
  console.log('\nAll duel controller checks passed.');
}
// ── Controller ──
const p0 = JSON.parse(readFileSync('data/duel/puzzles/p0000.json', 'utf8')) as Puzzle;
const DATE = '2026-11-01', KEY = `panna_duel_game:${DATE}`;
const RESTORE_TOAST = "That game couldn't be restored, so here's a fresh one.";

function memoryPlatform(): Platform & { mem: Map<string, string> } {
  const mem = new Map<string, string>();
  const storage = {
    get<T>(k: string): T | null { const v = mem.get(k); if (v === undefined) return null; try { return JSON.parse(v) as T; } catch { return null; } },
    has(k: string) { return mem.has(k); },
    set(k: string, v: unknown) { mem.set(k, JSON.stringify(v)); },
    remove(k: string) { mem.delete(k); },
  };
  const quiet = { enabled: true, play() {}, unlock() {} };
  const still = { enabled: true, tick() {}, drop() {}, wrong() {}, celebrate() {} };
  return { mem, storage, sound: quiet, haptics: still, puzzles: { schedule: async () => ({ dates: {}, files: {} }), forDate: async () => ({ puzzle: p0, practice: false }) }, help: stubHelp(storage), reducedMotion: () => true, exitHref: '/' };
}

/** A correct cell for every tile in your rack (the bag invariant guarantees one each). */
function correctPlacements(c: GameController): { rackSlot: number; cell: CellId }[] {
  const s = c.snapshot().state, used = new Set<CellId>(), out: { rackSlot: number; cell: CellId }[] = [];
  s.racks.you.forEach((l, rackSlot) => {
    if (l == null) return;
    const cell = emptyCells(p0, s).find(x => p0.solution[x] === l && !used.has(x));
    if (cell !== undefined) { used.add(cell); out.push({ rackSlot, cell }); }
  });
  return out;
}
const anEmpty = (c: GameController) => emptyCells(p0, c.snapshot().state)[0];

async function controllerChecks() {
  // a. placing, and no tile on a pending tile
  let pf = memoryPlatform(), d = new NullDirector();
  let c = new GameController(p0, DATE, pf, d, { seed: 123 });
  const e0 = anEmpty(c);
  check('a: place on an empty cell', c.place(0, e0) === true);
  check('a: no tile on a pending tile', c.place(1, e0) === false && c.snapshot().pending.length === 1);
  // b. given and clue cells refuse tiles
  check('b: a given cell refuses a tile', c.place(1, p0.given[0]) === false);
  check('b: a clue cell refuses a tile', c.place(1, p0.clueCells[0]) === false);
  // c. move and take back
  const e1 = emptyCells(p0, c.snapshot().state).find(x => x !== e0)!;
  check('c: move a pending tile', c.move(e0, e1) === true && c.snapshot().pending[0].cell === e1);
  check('c: take it back', c.takeBack(e1) === true && c.snapshot().pending.length === 0 && c.snapshot().lifted === null);

  // d. a whole correct rack: you resolve, arrive, then Quill
  for (const t of correctPlacements(c)) c.place(t.rackSlot, t.cell);
  await c.submit();
  check('d: director order you → quill → your new tiles', d.calls.map(x => `${x.fn}:${x.who}`).join() === 'resolve:you,arrive:you,resolve:quill,arrive:quill,deal:you,arrive:you', d.calls);
  check('d: all 5 new tiles are dealt as a refill, after Quill', d.calls[4].kinds.join() === 'refill,0,1,2,3,4', d.calls[4]);
  check('d: an empty hand comes first', d.calls[0].kinds.slice(0, 3).join() === 'emptyHand,score,judged', d.calls[0].kinds);
  check('d: not busy afterwards, your turn, nothing pending', !c.snapshot().busy && c.snapshot().state.turn === 'you' && c.snapshot().pending.length === 0);

  // d2. while Quill moves, your new tiles are held out of sight and the game is busy; they show after
  {
    const seen: { held: number[]; busy: boolean }[] = [];
    const watch: Director = {
      async resolve(_e, who, snap) { if (who === 'quill') seen.push({ held: [...snap.held], busy: snap.busy }); },
      async arrive() {}, toast() {},
    };
    const c2 = new GameController(p0, DATE, memoryPlatform(), watch, { seed: 123 });
    const [t] = correctPlacements(c2);
    c2.place(t.rackSlot, t.cell);
    await c2.submit();
    check('d2: during Quill’s turn your refilled slot is held, input locked', seen.length === 1 && seen[0].held.join() === String(t.rackSlot) && seen[0].busy, seen);
    check('d2: afterwards nothing is held', c2.snapshot().held.length === 0 && !c2.snapshot().busy);
  }

  // e. Submit twice → one action
  pf = memoryPlatform(); d = new NullDirector(); c = new GameController(p0, DATE, pf, d, { seed: 123 });
  const [t0] = correctPlacements(c); c.place(t0.rackSlot, t0.cell);
  await Promise.all([c.submit(), c.submit()]);
  check('e: two Submits make one action', c.snapshot().state.log.length === 1, c.snapshot().state.log);

  // f. the save is written before the motion starts
  pf = memoryPlatform();
  const hang: Director = { resolve: () => new Promise(() => {}), arrive: async () => {}, toast() {} };
  c = new GameController(p0, DATE, pf, hang, { seed: 123 });
  const [t1] = correctPlacements(c); c.place(t1.rackSlot, t1.cell);
  void c.submit();
  await Promise.resolve();
  const saved = pf.storage.get<SavedGame>(KEY);
  check('f: the save holds the submit before any motion ends', saved?.log.length === 1 && saved.log[0].t === 'submit', saved);
  check("f: the save's score is the one after Quill's reply", !!saved?.score && saved.over === false
    && saved.score.you + saved.score.quill > 0 && JSON.stringify(saved.score) !== JSON.stringify(c.snapshot().state.scores), saved?.score);
  check('f: busy while the sequence plays', c.snapshot().busy && c.submit() instanceof Promise && c.snapshot().state.log.length === 0);

  // g. Continue rebuilds the same board
  pf = memoryPlatform(); d = new NullDirector(); c = new GameController(p0, DATE, pf, d, { seed: 123 });
  for (let turn = 0; turn < 2; turn++) { const [t] = correctPlacements(c); c.place(t.rackSlot, t.cell); await c.submit(); }
  const again = new GameController(p0, DATE, pf, new NullDirector());
  check('g: Continue gives the same state', JSON.stringify(again.snapshot().state) === JSON.stringify(c.snapshot().state));

  // h. saves that can't be restored
  const good = { puzzleId: p0.id, puzzleVersion: p0.version, rules: RULES_ID, seed: 5, log: [], startedAt: '2026-11-01T00:00:00Z' };
  pf = memoryPlatform(); pf.mem.set(KEY, JSON.stringify(good)); d = new NullDirector();
  c = new GameController(p0, DATE, pf, d);
  check('h: a save under these rules continues', c.snapshot().state.seed === 5 && !d.toasts.length, d.toasts);
  const { rules: _, ...noRules } = good;
  const bads: [string, string][] = [
    ['junk JSON', '{junk'],
    ['another puzzle version', JSON.stringify({ ...good, puzzleVersion: 99 })],
    ['a save from other rules (Quill tuned differently)', JSON.stringify({ ...good, rules: '1.00000000' })],
    ['a save from before saves named their rules', JSON.stringify(noRules)],
    ['an illegal action', JSON.stringify({ ...good, log: [{ t: 'submit', place: [] }] })],
    ['not a save at all', JSON.stringify([1, 2, 3])],
  ];
  for (const [what, raw] of bads) {
    pf = memoryPlatform(); pf.mem.set(KEY, raw); d = new NullDirector();
    c = new GameController(p0, DATE, pf, d);
    const now = pf.storage.get<SavedGame>(KEY);
    check(`h: ${what} → a fresh game and a toast`, c.snapshot().state.log.length === 0 && d.toasts.includes(RESTORE_TOAST) && now?.seed === c.snapshot().state.seed, d.toasts);
  }

  // i. one hint per turn, restored on Continue
  pf = memoryPlatform(); d = new NullDirector(); c = new GameController(p0, DATE, pf, d, { seed: 123 });
  await c.hint(); await c.hint();
  check('i: the second hint only toasts', d.toasts.includes('Hint is on until you end this turn') && pf.help.balance().hint === 0 && c.snapshot().hintOn);
  check('i: the hint is logged once', c.snapshot().state.log.filter(a => a.t === 'hint').length === 1);
  check('i: Hint is still on after Continue', new GameController(p0, DATE, pf, new NullDirector()).snapshot().hintOn);
  // j. no hints left → the help sheet
  pf = memoryPlatform(); c = new GameController(p0, DATE, pf, new NullDirector(), { seed: 123 });
  pf.help.spend('hint');
  await c.hint();
  check('j: no hints → the help sheet, nothing logged', JSON.stringify(c.snapshot().sheet) === '{"k":"help","want":"hint"}' && c.snapshot().state.log.length === 0);

  // k. Word: mode, confirm, reveal
  pf = memoryPlatform(); d = new NullDirector(); c = new GameController(p0, DATE, pf, d, { seed: 123 });
  c.enterWordMode();
  const cand = wordCandidates(p0, c.snapshot().state)[0];
  c.tapClue(cand);
  check('k: a lit clue opens the reveal sheet', c.snapshot().wordMode && JSON.stringify(c.snapshot().sheet) === JSON.stringify({ k: 'reveal', slot: cand }));
  await c.reveal(cand);
  check('k: reveal adds ghosts, costs a Word, keeps your turn', c.snapshot().state.ghosts.includes(cand) && pf.help.balance().word === 0 && c.snapshot().state.turn === 'you' && !c.snapshot().wordMode && c.snapshot().sheet === null);
  c.enterWordMode();
  check('k: no Words left → the help sheet', JSON.stringify(c.snapshot().sheet) === '{"k":"help","want":"word"}' && !c.snapshot().wordMode);

  // l. typing into the selected answer
  pf = memoryPlatform(); c = new GameController(p0, DATE, pf, new NullDirector(), { seed: 123 });
  const rack = c.snapshot().state.racks.you;
  const slot = p0.slots.find(sl => sl.cells.some(x => !c.snapshot().state.filled[x]))!;
  const target = nextEmpty(p0, c.snapshot().state, [], slot.id)!;
  c.select(slot.id);
  const typed = rack[0]!; // keys type any rack letter; Submit judges it
  check('l: typing places a tile in the next empty cell', c.typeLetter(typed) && c.snapshot().pending[0]?.cell === target, c.snapshot().pending);
  check('l: backspace takes it back', c.backspace() && c.snapshot().pending.length === 0);
  const missing = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('').find(l => !rack.includes(l))!;
  check('l: a letter not in the rack does nothing', !c.typeLetter(missing) && c.snapshot().pending.length === 0);

  // m. hint cells follow the rack minus the pending letters
  {
    const st = c.snapshot().state;
    const letter = st.racks.you.find((l, i) => l && st.racks.you.indexOf(l) !== i) ?? null; // a doubled letter, if any
    const lone = st.racks.you.find(l => l && st.racks.you.filter(x => x === l).length === 1)!;
    const loneCells = (pending: { cell: CellId; rackSlot: number }[]) => hintCells(p0, st, pending).filter(x => p0.solution[x] === lone);
    const loneSlot = st.racks.you.indexOf(lone);
    const someCell = emptyCells(p0, st).find(x => p0.solution[x] === lone)!;
    check('m: a letter in the rack lights its cells', loneCells([]).length > 0);
    check('m: its only copy placed → its glows leave', loneCells([{ cell: someCell, rackSlot: loneSlot }]).length === 0);
    if (letter) {
      const i = st.racks.you.indexOf(letter), cell = emptyCells(p0, st).find(x => p0.solution[x] === letter)!;
      check('m: a doubled letter stays lit with one copy placed', hintCells(p0, st, [{ cell, rackSlot: i }]).some(x => p0.solution[x] === letter));
    }
    check('m: pending cells never glow', !hintCells(p0, st, [{ cell: someCell, rackSlot: loneSlot }]).includes(someCell));
  }

  // n. a game to the end, then Play again
  pf = memoryPlatform(); d = new NullDirector(); c = new GameController(p0, DATE, pf, d, { seed: 123 });
  for (let turns = 0; turns < 80 && !c.snapshot().state.over; turns++) {
    for (const t of correctPlacements(c)) c.place(t.rackSlot, t.cell);
    if (c.snapshot().pending.length) await c.submit(); else await c.pass();
  }
  check('n: the game ends', c.snapshot().state.over && !c.snapshot().busy);
  {
    const fin = c.snapshot().state.scores, sv = pf.storage.get<SavedGame>(KEY);
    const rows = readResults(pf.storage.get(RESULTS_KEY));
    check('n: the save holds the final score and the end', sv?.over === true && sv.score?.you === fin.you && sv.score?.quill === fin.quill, sv?.score);
    check('n: the finished game is recorded once', rows.length === 1 && rows[0].date === DATE && rows[0].puzzle === 'p0000.v1'
      && rows[0].you === fin.you && rows[0].quill === fin.quill, rows);
    new GameController(p0, DATE, pf, new NullDirector());
    check('n: a reload records nothing more', readResults(pf.storage.get(RESULTS_KEY)).length === 1);
  }
  const endLog = c.snapshot().state.log.length;
  await c.pass();
  check('n: pass after the end is ignored', c.snapshot().state.log.length === endLog);
  pf.help.spend('word');
  c.newGame();
  check('n: Play again deals a new game and resets help', !c.snapshot().state.over && c.snapshot().state.log.length === 0 && c.snapshot().state.seed !== 123 && pf.help.balance().word === 1);
  check('n: the new game is saved', pf.storage.get<SavedGame>(KEY)?.seed === c.snapshot().state.seed);
  check('n: Play again records nothing', readResults(pf.storage.get(RESULTS_KEY)).length === 1);
  {
    const pp = memoryPlatform(), cp = new GameController(p0, DATE, pp, new NullDirector(), { seed: 123, practice: true });
    for (let turns = 0; turns < 80 && !cp.snapshot().state.over; turns++) {
      for (const t of correctPlacements(cp)) cp.place(t.rackSlot, t.cell);
      if (cp.snapshot().pending.length) await cp.submit(); else await cp.pass();
    }
    check('n: a finished practice game records nothing', cp.snapshot().state.over && !pp.storage.has(RESULTS_KEY));
  }

  // round 3: your rack empties near the end, so Quill plays several turns in a row and you never press Pass
  {
    check('the ?quill= playtest flag is gone', !('quill' in readFlags('?quill=b')));
    let found: { seed: number; runs: number; emptyTurns: number; state: string; replayed: string; quillLast: boolean } | null = null;
    for (let seed = 1; seed <= 60 && !found; seed++) {
      pf = memoryPlatform(); d = new NullDirector(); c = new GameController(p0, DATE, pf, d, { seed });
      let runs = 0, emptyTurns = 0;
      for (let turns = 0; turns < 80 && !c.snapshot().state.over; turns++) {
        if (c.snapshot().state.racks.you.every(l => l === null)) emptyTurns++;
        for (const t of correctPlacements(c)) c.place(t.rackSlot, t.cell);
        const before = d.calls.length;
        await c.submit();
        if (d.calls.slice(before).filter(x => x.fn === 'resolve' && x.who === 'quill').length >= 2) runs++;
      }
      if (runs) {
        const st = c.snapshot().state;
        found = { seed, runs, emptyTurns, state: JSON.stringify(st), replayed: JSON.stringify(replay(p0, seed, pf.storage.get<SavedGame>(KEY)!.log)), quillLast: st.over && !c.snapshot().busy };
      }
    }
    check('round 3: some game ends with Quill moving several turns after one of yours', found !== null, found?.seed);
    if (found) {
      check('round 3: …the game ends with input unlocked', found.quillLast, found);
      check('round 3: …you never get a turn with an empty rack', found.emptyTurns === 0, found.emptyTurns);
      check('round 3: …and the save replays to the same state', found.state === found.replayed);
    }
  }

  // review: a director that throws must not lock the game
  {
    pf = memoryPlatform();
    const broken: Director = { resolve: async () => { throw new Error('boom'); }, arrive: async () => {}, toast() {} };
    c = new GameController(p0, DATE, pf, broken, { seed: 123 });
    const [t] = correctPlacements(c); c.place(t.rackSlot, t.cell);
    let threw = false;
    try { await c.submit(); } catch { threw = true; }
    const snap = c.snapshot();
    check('a failing animation still ends the turn: not busy, the move and Quill’s reply applied', !threw && !snap.busy && snap.state.log.length === 1 && snap.state.turn === 'you' && snap.pending.length === 0);
  }

  // Tab order: answers in order, and Tab leaves the board after the last (no keyboard trap)
  {
    pf = memoryPlatform();
    c = new GameController(p0, DATE, pf, new NullDirector(), { seed: 123 });
    const open = p0.slots.filter(sl => sl.cells.some(x => !c.snapshot().state.filled[x])).map(sl => sl.id);
    check('Tab from nothing selects the first open answer', c.selectNext(1) && c.snapshot().selected === open[0]);
    check('Shift+Tab from the first answer leaves the board', !c.selectNext(-1) && c.snapshot().selected === open[0]);
    c.select(open[open.length - 1]);
    check('Tab from the last answer leaves the board', !c.selectNext(1) && c.snapshot().selected === open[open.length - 1]);
    c.select(open[0]);
    check('Tab moves to the next open answer', c.selectNext(1) && c.snapshot().selected === open[1]);
  }

  // subscribe
  let heard = 0; const off = c.subscribe(() => heard++);
  c.place(0, anEmpty(c)); off(); c.takeBackAll();
  check('subscribers hear rest-state changes and can leave', heard === 1);
}

main().catch((e) => { console.error(e); process.exit(1); });
