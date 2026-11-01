// How strong is Professor Quill? Pits him against model players and prints win rates and margins.
// A report, not a test. Target (product spec §5): a typical player (accuracy 0.75) wins 65–75 %, median margin ≤ 10.
// Usage: npx tsx scripts/duel/bot-tune.ts [gamesPerProfile]
import { readdirSync, readFileSync } from 'node:fs';
import { botTurn } from '../../src/duel/engine/bot';
import { apply, emptyCells, newGame } from '../../src/duel/engine/game';
import { nextFloat, nextInt, seedRng, type RngState } from '../../src/duel/engine/rng';
import type { Action, GameState, Puzzle } from '../../src/duel/engine/types';

const GAMES = Number(process.argv[2]) || 2000;
const puzzles = readdirSync('data/duel/puzzles').filter(f => f.endsWith('.json')).map(f => JSON.parse(readFileSync(`data/duel/puzzles/${f}`, 'utf8')) as Puzzle);

interface Profile { name: string; accuracy: number; minTiles: number; maxTiles: number; hintRate: number }
const profiles: Profile[] = [
  { name: 'shaky (0.60)', accuracy: 0.6, minTiles: 2, maxTiles: 5, hintRate: 0.3 },
  { name: 'typical (0.75)', accuracy: 0.75, minTiles: 2, maxTiles: 5, hintRate: 0.3 },
  { name: 'strong (0.90)', accuracy: 0.9, minTiles: 2, maxTiles: 5, hintRate: 0.3 },
];

/** A model player's move: some tiles, each right with the profile's accuracy (0.95 on a turn with Hint on). */
function modelMove(p: Puzzle, s: GameState, pr: Profile, rng: RngState): Action {
  const slots = s.racks.you.map((l, i) => (l ? i : -1)).filter(i => i >= 0);
  if (!slots.length) return { t: 'pass' };
  const acc = nextFloat(rng) < pr.hintRate ? 0.95 : pr.accuracy;
  const want = Math.min(slots.length, pr.minTiles + nextInt(rng, pr.maxTiles - pr.minTiles + 1));
  const empty = emptyCells(p, s), used = new Set<number>(), place: { cell: number; rackSlot: number }[] = [];
  for (const i of slots.slice(0, want)) {
    const letter = s.racks.you[i]!;
    const right = empty.filter(c => !used.has(c) && p.solution[c] === letter);
    const wrong = empty.filter(c => !used.has(c) && p.solution[c] !== letter);
    const pool = nextFloat(rng) < acc && right.length ? right : wrong.length ? wrong : right;
    if (!pool.length) continue;
    const cell = pool[nextInt(rng, pool.length)];
    used.add(cell); place.push({ cell, rackSlot: i });
  }
  return place.length ? { t: 'submit', place } : { t: 'pass' };
}

const pct = (xs: number[], q: number) => { const a = [...xs].sort((x, y) => x - y); return a[Math.min(a.length - 1, Math.floor(q * a.length))]; };

console.log(`Quill vs model players, ${GAMES} games per profile over ${puzzles.length} puzzle(s)\n`);
console.log('profile           win %   tie %   median margin   p90 margin   avg you–Quill');
for (const pr of profiles) {
  let wins = 0, ties = 0; const margins: number[] = []; let you = 0, quill = 0;
  for (let g = 0; g < GAMES; g++) {
    const p = puzzles[g % puzzles.length];
    const seed = 100000 + g, rng = seedRng(seed, 7);
    let s = newGame(p, seed);
    for (let n = 0; !s.over && n < 2000; n++) {
      s = s.turn === 'you' ? apply(p, s, modelMove(p, s, pr, rng)).state : botTurn(p, s).state;
    }
    if (s.scores.you > s.scores.quill) wins++; else if (s.scores.you === s.scores.quill) ties++;
    margins.push(Math.abs(s.scores.you - s.scores.quill)); you += s.scores.you; quill += s.scores.quill;
  }
  console.log(`${pr.name.padEnd(16)}  ${(100 * wins / GAMES).toFixed(1).padStart(5)}   ${(100 * ties / GAMES).toFixed(1).padStart(5)}   ${String(pct(margins, 0.5)).padStart(13)}   ${String(pct(margins, 0.9)).padStart(10)}   ${(you / GAMES).toFixed(1)}–${(quill / GAMES).toFixed(1)}`);
}
