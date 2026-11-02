// Plays thousands of seeded games between a random player and Professor Quill, and checks that every game
// ends, keeps the bag invariant, never goes negative, stays under the score cap, and replays identically.
// Usage: npx tsx scripts/test-duel-sim.ts [games]
import { existsSync, readFileSync } from 'node:fs';
import { botTurn } from '../src/duel/engine/bot';
import { apply, checkInvariant, emptyCells, newGame } from '../src/duel/engine/game';
import { maxActions, maxScore, replay } from '../src/duel/engine/replay';
import { nextFloat, nextInt, seedRng, type RngState } from '../src/duel/engine/rng';
import type { Action, GameState, Puzzle } from '../src/duel/engine/types';

let failures = 0;
function check(label: string, ok: boolean, detail?: unknown) {
  if (ok) console.log(`✓ ${label}`);
  else { failures++; console.error(`✗ ${label}${detail !== undefined ? ` — ${JSON.stringify(detail)}` : ''}`); }
}

const p0 = JSON.parse(readFileSync('data/duel/puzzles/p0000.json', 'utf8')) as Puzzle;
// The games are spread over the engine fixture and up to 20 published puzzles (same total count).
const published = existsSync('data/duel/published.json') ? Object.keys(JSON.parse(readFileSync('data/duel/published.json', 'utf8'))).slice(0, 20) : [];
const PUZZLES = [p0, ...published.map(k => JSON.parse(readFileSync(`data/duel/puzzles/${k}.json`, 'utf8')) as Puzzle)];
const GAMES = Number(process.argv[2]) || 10000;
const CAP = 2000;

/** A legal action: 70 % submit 1–5 tiles (each right with chance 0.8), 15 % pass, 10 % swap, 5 % reveal. */
export function randomPlayer(p: Puzzle, s: GameState, rng: RngState): Action {
  const slots = s.racks.you.map((l, i) => (l ? i : -1)).filter(i => i >= 0);
  const empty = emptyCells(p, s);
  const roll = nextFloat(rng);
  if (roll < 0.05) {
    const open = p.slots.filter(sl => !s.ghosts.includes(sl.id) && sl.cells.some(c => !s.filled[c]));
    if (open.length) return { t: 'reveal', slot: open[nextInt(rng, open.length)].id };
  }
  if (roll < 0.15 && slots.length && s.bag.length) {
    const n = 1 + nextInt(rng, Math.min(slots.length, s.bag.length));
    return { t: 'swap', rackSlots: slots.slice(0, n) };
  }
  if (roll < 0.30 || !slots.length) return { t: 'pass' };
  const want = 1 + nextInt(rng, slots.length);
  const used = new Set<number>(), place: { cell: number; rackSlot: number }[] = [];
  for (const i of slots.slice(0, want)) {
    const letter = s.racks.you[i]!;
    const right = empty.filter(c => !used.has(c) && p.solution[c] === letter);
    const wrong = empty.filter(c => !used.has(c) && p.solution[c] !== letter);
    const pool = nextFloat(rng) < 0.8 && right.length ? right : wrong.length ? wrong : right;
    if (!pool.length) continue;
    const cell = pool[nextInt(rng, pool.length)];
    used.add(cell); place.push({ cell, rackSlot: i });
  }
  return place.length ? { t: 'submit', place } : { t: 'pass' };
}

/** Plays one game to the end. Returns the actions and the state after each player action (and Quill's reply). */
function play(p: Puzzle, seed: number) {
  const rng = seedRng(seed, 9);
  let s = newGame(p, seed);
  const actions: Action[] = [], after: string[] = [JSON.stringify(s)];
  const problems: string[] = [];
  const cap = maxScore(p);
  const look = (st: GameState, where: string) => {
    const bad = checkInvariant(p, st);
    if (bad) problems.push(`${where}: ${bad}`);
    if (st.scores.you < 0 || st.scores.quill < 0) problems.push(`${where}: negative score`);
    if (st.scores.you > cap || st.scores.quill > cap) problems.push(`${where}: score over the cap ${cap}`);
  };
  let quillWrong = 0, quillRuns = 0, emptyTurns = 0;
  while (!s.over && actions.length < CAP) {
    if (s.racks.you.every(l => l === null)) emptyTurns++;
    const a = randomPlayer(p, s, rng);
    s = apply(p, s, a).state;
    actions.push(a);
    look(s, `after action ${actions.length}`);
    // Once your rack is empty Quill keeps moving, so one action can be followed by several of his turns.
    let run = 0;
    while (!s.over && s.turn === 'quill') {
      const r = botTurn(p, s);
      for (const e of r.events) if (e.e === 'judged') quillWrong += e.tiles.filter(t => !t.ok).length;
      s = r.state; run++;
      look(s, `after Quill ${actions.length}`);
    }
    if (run > 1) quillRuns++;
    after.push(JSON.stringify(s));
  }
  return { s, actions, after, problems, quillWrong, quillRuns, emptyTurns };
}

let firstProblem = '';
let longest = 0;
let ended = 0, clean = 0, identical = 0, prefixes = 0, prefixOk = 0, quillWrong = 0, quillRuns = 0, emptyTurns = 0;
const t0 = Date.now();
for (let seed = 1; seed <= GAMES; seed++) {
  const p = PUZZLES[seed % PUZZLES.length];
  const g = play(p, seed);
  if (g.s.over) ended++;
  quillWrong += g.quillWrong; quillRuns += g.quillRuns; emptyTurns += g.emptyTurns;
  longest = Math.max(longest, g.actions.length);
  if (!g.problems.length) clean++; else if (!firstProblem) firstProblem = `seed ${seed}: ${g.problems[0]}`;
  if (JSON.stringify(replay(p, seed, g.actions)) === JSON.stringify(g.s)) identical++;
  if (seed <= 200) {
    // Review Focus 4: a saved log (JSON round-trip) replays to the exact mid-game state, Quill's reply included.
    const k = 1 + (seed * 7) % g.actions.length;
    prefixes++;
    if (JSON.stringify(replay(p, seed, JSON.parse(JSON.stringify(g.actions.slice(0, k))))) === g.after[k]) prefixOk++;
  }
}
const secs = ((Date.now() - t0) / 1000).toFixed(1);
check(`${GAMES} games end before ${CAP} actions`, ended === GAMES, { ended });
check(`${GAMES} games keep the invariant, never go negative, stay under the cap`, clean === GAMES, { clean, firstProblem });
check(`${GAMES} games replay identically from seed + actions`, identical === GAMES, { identical });
check(`${prefixes} saved mid-game logs replay to the exact state`, prefixOk === prefixes, { prefixOk });
check(`${GAMES} games: Quill never plays a wrong tile`, quillWrong === 0, { quillWrong });
check(`${GAMES} games: you never get a turn with an empty rack`, emptyTurns === 0, { emptyTurns });
check(`some games end with Quill moving several turns in a row`, quillRuns > 0, { quillRuns });
console.log(`(${secs} s, ${PUZZLES.length} puzzle(s))`);

let msg = '';
try { replay(p0, 1, [{ t: 'submit', place: [] }]); } catch (e) { msg = String(e); }
check('replay of a bad log reports the index', /illegal at 0/.test(msg), msg);
const longT0 = Date.now();
let longMsg = '';
try { replay(p0, 1, Array.from({ length: 50000 }, () => ({ t: 'pass' as const }))); } catch (e) { longMsg = String(e); }
check('a 50,000-action log is rejected quickly, before replaying', /too long/.test(longMsg) && Date.now() - longT0 < 200, { longMsg, ms: Date.now() - longT0 });
check(`real games stay well under the action cap (${maxActions(p0)})`, longest <= maxActions(p0), { longest });
check('maxScore of p0 = 49 non-given cells + all slot lengths + 5 × 49', maxScore(p0) === 49 + p0.slots.reduce((n, s) => n + s.cells.length, 0) + 245, maxScore(p0));

if (failures) { console.error(`\n${failures} failed`); process.exit(1); }
console.log('\nAll duel simulation checks passed.');
