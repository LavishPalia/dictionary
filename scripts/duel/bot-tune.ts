// How strong is Professor Quill? Pits him against model players and prints win rates and margins.
// A report, not a test. Target (product spec §5): a typical player (accuracy 0.75) wins 65–75 %, median margin ≤ 10.
// Usage: npx tsx scripts/duel/bot-tune.ts [gamesPerProfile]
import { readdirSync, readFileSync } from 'node:fs';
import { BOT, botTurn, choose } from '../../src/duel/engine/bot';
import { apply, emptyCells, newGame } from '../../src/duel/engine/game';
import { nextFloat, nextInt, seedRng, type RngState } from '../../src/duel/engine/rng';
import type { Action, GameState, Puzzle } from '../../src/duel/engine/types';

const GAMES = Number(process.argv[2]) || 2000;
// Try weights without editing the engine: QUILL='[{"at":0,"w":[...]},...]' (see BOT.countWeights), QUILL_AIM=0.65.
if (process.env.QUILL) BOT.countWeights = JSON.parse(process.env.QUILL);
if (process.env.QUILL_AIM) BOT.aimChance = Number(process.env.QUILL_AIM);
const puzzles = readdirSync('data/duel/puzzles').filter(f => f.endsWith('.json')).map(f => JSON.parse(readFileSync(`data/duel/puzzles/${f}`, 'utf8')) as Puzzle);

// `aim`: the share of turns a player places tiles to finish answers (a person who has solved a clue places
// its letters together) rather than dropping right tiles anywhere. Without it no model player ever finishes
// a word on purpose, and any Quill who does looks unbeatable.
// As often as Quill aims (BOT.aimChance), unless PLAYER_AIM says otherwise.
const PLAYER_AIM = Number(process.env.PLAYER_AIM ?? 0.65);
interface Profile { name: string; accuracy: number; minTiles: number; maxTiles: number; hintRate: number; aim: number }
const profiles: Profile[] = [
  { name: 'shaky (0.60)', accuracy: 0.6, minTiles: 2, maxTiles: 5, hintRate: 0.3, aim: PLAYER_AIM },
  { name: 'typical (0.75)', accuracy: 0.75, minTiles: 2, maxTiles: 5, hintRate: 0.3, aim: PLAYER_AIM },
  { name: 'strong (0.90)', accuracy: 0.9, minTiles: 2, maxTiles: 5, hintRate: 0.3, aim: PLAYER_AIM },
];

/**
 * A model player's move: some tiles, each right with the profile's accuracy (0.95 on a turn with Hint on).
 * On an aimed turn the tiles go where they would score most (the same search Quill uses), before the
 * wrong ones are moved elsewhere.
 */
function modelMove(p: Puzzle, s: GameState, pr: Profile, rng: RngState): Action {
  const inHand = s.racks.you.filter(l => l).length;
  if (!inHand) return { t: 'pass' };
  const acc = nextFloat(rng) < pr.hintRate ? 0.95 : pr.accuracy;
  const want = Math.min(inHand, pr.minTiles + nextInt(rng, pr.maxTiles - pr.minTiles + 1));
  const plan = choose(p, s, s.racks.you, rng, want, nextFloat(rng) < pr.aim);
  const used = new Set(plan.map(t => t.cell));
  const place = plan.map(t => {
    if (nextFloat(rng) < acc) return { cell: t.cell, rackSlot: t.rackSlot };
    const wrong = emptyCells(p, s).filter(c => !used.has(c) && p.solution[c] !== t.letter);
    if (!wrong.length) return { cell: t.cell, rackSlot: t.rackSlot };
    const cell = wrong[nextInt(rng, wrong.length)];
    used.delete(t.cell); used.add(cell);
    return { cell, rackSlot: t.rackSlot };
  });
  return { t: 'submit', place };
}

const pct = (xs: number[], q: number) => { const a = [...xs].sort((x, y) => x - y); return a[Math.min(a.length - 1, Math.floor(q * a.length))]; };

console.log(`Quill vs model players, ${GAMES} games per profile over ${puzzles.length} puzzle(s)\n`);
console.log('profile           win %   tie %   median margin   p90 margin   avg you–Quill');
// Quill's tiles per turn by phase (how full the board was before his turn), over every profile.
const phases = ['early (< 1/3 full)', 'mid', 'end (≥ 80 % full)'];
const byPhase = phases.map(() => [0, 0, 0, 0, 0]), allIn = phases.map(() => 0);
let quillTurns = 0, emptyHands = 0;
for (const pr of profiles) {
  let wins = 0, ties = 0; const margins: number[] = []; let you = 0, quill = 0;
  for (let g = 0; g < GAMES; g++) {
    const p = puzzles[g % puzzles.length];
    const seed = 100000 + g, rng = seedRng(seed, 7);
    let s = newGame(p, seed);
    for (let n = 0; !s.over && n < 2000; n++) {
      if (s.turn === 'you') { s = apply(p, s, modelMove(p, s, pr, rng)).state; continue; }
      const total = Object.keys(p.solution).length - p.given.length;
      const full = 1 - emptyCells(p, s).length / total;
      const phase = full >= 0.8 ? 2 : full >= 1 / 3 ? 1 : 0;
      const held = s.racks.quill.filter(l => l).length;
      const r = botTurn(p, s);
      const placed = r.events.find(e => e.e === 'botPlaced');
      if (placed?.e === 'botPlaced') { byPhase[phase][placed.tiles.length - 1]++; if (placed.tiles.length === held || placed.tiles.length === emptyCells(p, s).length) allIn[phase]++; }
      quillTurns++; if (r.events.some(e => e.e === 'emptyHand')) emptyHands++;
      s = r.state;
    }
    if (s.scores.you > s.scores.quill) wins++; else if (s.scores.you === s.scores.quill) ties++;
    margins.push(Math.abs(s.scores.you - s.scores.quill)); you += s.scores.you; quill += s.scores.quill;
  }
  console.log(`${pr.name.padEnd(16)}  ${(100 * wins / GAMES).toFixed(1).padStart(5)}   ${(100 * ties / GAMES).toFixed(1).padStart(5)}   ${String(pct(margins, 0.5)).padStart(13)}   ${String(pct(margins, 0.9)).padStart(10)}   ${(you / GAMES).toFixed(1)}–${(quill / GAMES).toFixed(1)}`);
}

console.log(`
Quill's tiles per turn (share of his turns in that phase); Empty hand on ${(100 * emptyHands / quillTurns).toFixed(1)} % of his turns`);
console.log('phase                  1      2      3      4      5    avg   all he could');
phases.forEach((name, i) => {
  const n = byPhase[i].reduce((a, b) => a + b, 0) || 1;
  const avg = byPhase[i].reduce((a, k, j) => a + k * (j + 1), 0) / n;
  console.log(`${name.padEnd(19)}${byPhase[i].map(k => `${(100 * k / n).toFixed(0).padStart(5)} %`).join('')}  ${avg.toFixed(2)}   ${(100 * allIn[i] / n).toFixed(0).padStart(4)} %`);
});
