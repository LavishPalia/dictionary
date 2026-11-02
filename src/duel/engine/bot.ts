// Professor Quill. He knows the answers and never plays a wrong tile. He plays by chance: how many tiles
// (more as the board fills), and on most turns he aims for the cells that score most. All his dice come
// from the game's bot stream, so the same game always plays out the same way.
import { checkInvariant, emptyCells, RACK_SIZE } from './board';
import { nextFloat } from './rng';
import { resolvePlacement, type Placed } from './score';
import type { CellId, GameEvent, GameState, Puzzle } from './types';

export const BOT = {
  /**
   * Weights for playing 1, 2, 3, 4 or 5 tiles at points along the game (`at` = how full the board is,
   * 0–1). In between they blend in a straight line; past the last point they hold. Few tiles early, 5 now
   * and then mid-game, mostly 5 near the end. He never plays more than he holds. Tuned with
   * scripts/duel/bot-tune.ts (round 3, 2 Nov): a typical player wins about 68 %.
   */
  countWeights: [
    { at: 0, w: [10, 2, 0.5, 0.2, 0.1] },
    { at: 0.5, w: [7, 3, 1, 0.5, 0.4] },
    { at: 0.85, w: [1, 1, 1, 2, 8] },
  ],
  /** The chance that he puts his tiles where they score most; otherwise he picks right cells at random. */
  aimChance: 0.65,
  /** The most placements he weighs on an aimed turn, so a rack of common letters can't stall him. */
  searchBudget: 5000,
};

/** The count weights for a board that is `t` full (0–1). */
export function countWeights(t: number): number[] {
  const pts = BOT.countWeights;
  const j = pts.findIndex(x => x.at > t);
  if (j === 0) return [...pts[0].w];
  if (j < 0) return [...pts[pts.length - 1].w];
  const a = pts[j - 1], b = pts[j], k = (t - a.at) / (b.at - a.at);
  return a.w.map((x, i) => x + (b.w[i] - x) * k);
}

function weighted(rng: GameState['rng']['bot'], weights: number[]): number {
  const total = weights.reduce((a, b) => a + b, 0);
  let r = nextFloat(rng) * total;
  for (let i = 0; i < weights.length; i++) { r -= weights[i]; if (r < 0) return i; }
  return weights.length - 1;
}

type Pair = Placed;

/** Adds random right tiles to `picks` until it holds `want` (or nothing fits): no cell or rack slot twice. */
function fillRandom(picks: Pair[], pairs: Pair[], want: number, rng: GameState['rng']['bot']): Pair[] {
  while (picks.length < want) {
    const open = pairs.filter(t => !picks.some(x => x.cell === t.cell || x.rackSlot === t.rackSlot));
    if (!open.length) break;
    picks.push(open[Math.floor(nextFloat(rng) * open.length)]);
  }
  return picks;
}

/**
 * Where `want` right tiles from `rack` go. Aimed: where they score most. Each tile scores 1 wherever it
 * goes, so only the answers it can finish matter: the search tries the cells of answers with at most `want`
 * gaps (ties go to a random one of the best, by a reservoir draw), and the tiles left over go anywhere
 * right. Not aimed: any right cells. Exported for scripts/duel/bot-tune.ts, whose model player aims too.
 */
export function choose(p: Puzzle, s: GameState, rack: (string | null)[], rng: GameState['rng']['bot'], want: number, aim: boolean): Placed[] {
  const empty = emptyCells(p, s);
  // Rack slots grouped by letter, and the empty cells each letter belongs in.
  const byLetter = new Map<string, { slots: number[]; cells: CellId[] }>();
  rack.forEach((l, i) => {
    if (l == null) return;
    if (!byLetter.has(l)) byLetter.set(l, { slots: [], cells: empty.filter(c => p.solution[c] === l) });
    byLetter.get(l)!.slots.push(i);
  });
  const pairs = [...byLetter.entries()].flatMap(([letter, g]) => g.slots.flatMap(rackSlot => g.cells.map(cell => ({ cell, letter, rackSlot }))));
  if (!aim) return fillRandom([], pairs, want, rng);

  // Answers this turn could finish: a few gaps, each with its letter in the rack.
  const finishable = p.slots
    .map(sl => ({ len: sl.cells.length, gaps: sl.cells.filter(c => !s.filled[c]) }))
    .filter(x => x.gaps.length >= 1 && x.gaps.length <= want && x.gaps.every(c => byLetter.has(p.solution[c])));
  const useful = new Set(finishable.flatMap(x => x.gaps));
  const groups = [...byLetter.entries()]
    .map(([letter, g]) => ({ letter, slots: g.slots, cells: g.cells.filter(c => useful.has(c)) }))
    .filter(g => g.cells.length);

  const chosen = new Set<CellId>(), picked: Pair[] = [];
  let best: Pair[] = [], bestValue = -1, ties = 0, tried = 0;
  const value = () => finishable.reduce((n, x) => (x.gaps.every(c => chosen.has(c)) ? n + x.len : n), 0);
  // Every combination of useful cells, no more per letter than the rack holds of it and `want` in all.
  const walk = (g: number, from: number, used: number) => {
    if (tried++ >= BOT.searchBudget) return;
    const v = value();
    if (v > bestValue) { bestValue = v; best = [...picked]; ties = 1; }
    else if (v === bestValue && nextFloat(rng) * ++ties < 1) best = [...picked];
    if (picked.length === want) return;
    for (let k = g; k < groups.length; k++) {
      const grp = groups[k], n = k === g ? used : 0;
      if (n >= grp.slots.length) continue;
      for (let i = k === g ? from : 0; i < grp.cells.length; i++) {
        chosen.add(grp.cells[i]); picked.push({ cell: grp.cells[i], letter: grp.letter, rackSlot: grp.slots[n] });
        walk(k, i + 1, n + 1);
        chosen.delete(grp.cells[i]); picked.pop();
      }
    }
  };
  walk(0, 0, 0);
  return fillRandom(best, pairs, want, rng).sort((a, b) => a.cell - b.cell);
}

/** Plays Quill's whole turn on a copy of the state. */
export function botTurn(p: Puzzle, state: GameState): { state: GameState; events: GameEvent[] } {
  if (state.over) throw new Error('illegal: the game is over');
  if (state.turn !== 'quill') throw new Error('illegal: it is not Quill’s turn');
  const inRack = state.racks.quill.filter(l => l !== null).length;
  // A player with no tiles gets no turn (endTurn skips him), so this can't happen in a real game.
  if (inRack === 0) throw new Error('illegal: Quill has no tiles');
  const s: GameState = JSON.parse(JSON.stringify(state));
  const rng = s.rng.bot;

  const empty = emptyCells(p, s).length;
  const total = Object.keys(p.solution).length - p.given.length;
  const drawn = 1 + weighted(rng, countWeights(1 - empty / total));
  const want = Math.min(drawn, inRack, empty, RACK_SIZE);
  const picks = choose(p, s, s.racks.quill, rng, want, nextFloat(rng) < BOT.aimChance);

  const events: GameEvent[] = [{ e: 'botPlaced', tiles: picks.map(t => ({ ...t })) }];
  events.push(...resolvePlacement(p, s, 'quill', picks));
  s.lastQuill = picks.map(t => t.cell);

  const broken = checkInvariant(p, s);
  if (broken) throw new Error(`engine bug: ${broken}`);
  return { state: s, events };
}
