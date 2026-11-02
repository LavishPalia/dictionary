// npm run duel:make -- --count 30 [--seed N] [--out DIR]
// Layout → fill → clues → given letters → check, until `count` candidates exist. Writes them to
// <out>/candidates/batch-NNN/cNN.json (git-ignored) and a review sheet <out>/review/batch-NNN.csv for the user's
// spot check (product spec §15.8): put anything in the `bad` column to drop that puzzle at publish. <out> = data/duel.
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { nextU32, seedRng } from '../../src/duel/engine/rng';
import type { CellId, Puzzle } from '../../src/duel/engine/types';
import { type CheckContext, checkPuzzle, defaultContext } from './check';
import { type BankClue, loadBank } from './clues';
import { fill, indexWords } from './fill';
import { fits } from './lib/fontwidth';
import { cellId, clueCellOf, type LSlot, slotId, type Pattern, randomPattern, slotsOf, toPuzzle } from './layout';
import { wordPool } from './words';

export const FILL_STEPS = 1000;
/** Most clues of a kind per puzzle; the rest are definitions (or curated, for one- and two-letter answers). */
export const MIX = { picture: 3, rel: 5, gap: 4 };
const WEIGHT: Record<BankClue['kind'], number> = { def: 3, abbr: 3, rel: 2, gap: 1.5, pic: 4, picmath: 3 };
/** Two puzzles sharing this share of their answers are too alike. */
export const MAX_SHARED = 0.6;

const answersOf = (p: Puzzle) => new Set(p.slots.map(s => s.answer).filter(a => a.length > 1));
const readJson = (f: string) => JSON.parse(readFileSync(f, 'utf8')) as Puzzle;

/** Every puzzle made so far (all candidate batches and the published ones), for the "too alike" rule. */
function earlierPuzzles(out: string): Puzzle[] {
  const found: Puzzle[] = [];
  const cand = join(out, 'candidates');
  if (existsSync(cand)) for (const b of readdirSync(cand)) for (const f of readdirSync(join(cand, b))) if (f.endsWith('.json')) found.push(readJson(join(cand, b, f)));
  if (existsSync('data/duel/puzzles')) for (const f of readdirSync('data/duel/puzzles')) if (/^p\d{4}\.v\d+\.json$/.test(f)) found.push(readJson(join('data/duel/puzzles', f)));
  return found;
}

function nextBatch(out: string): number {
  const nums = [join(out, 'candidates'), join(out, 'review')].filter(existsSync).flatMap(d => readdirSync(d))
    .map(f => /^batch-(\d{3})/.exec(f)?.[1]).filter(Boolean).map(Number);
  return Math.max(0, ...nums) + 1;
}

/** Up to 3 given letters, one per third of the board where possible, never two in one answer; long answers first. */
export function pickGiven(P: Pattern, slots: LSlot[], rng: () => number): CellId[] {
  const slotsAt = new Map<string, LSlot[]>();
  for (const s of slots) for (const [r, c] of s.cells) slotsAt.set(`${r},${c}`, [...(slotsAt.get(`${r},${c}`) ?? []), s]);
  const chosen: [number, number][] = [];
  const clash = (r: number, c: number) => chosen.some(([r2, c2]) => (slotsAt.get(`${r},${c}`) ?? []).some(s => s.cells.some(([a, b]) => a === r2 && b === c2)));
  for (const rows of [[0, 1, 2], [3, 4, 5], [6, 7, 8]]) {
    let best: [number, number] | null = null, bestScore = -1;
    for (const r of rows) for (let c = 0; c < 7; c++) {
      if (P[r][c] || clash(r, c)) continue;
      const score = (slotsAt.get(`${r},${c}`) ?? []).reduce((n, s) => n + s.cells.length, 0) + rng() * 3;
      if (score > bestScore) { best = [r, c]; bestScore = score; }
    }
    if (best) chosen.push(best);
  }
  return chosen.map(([r, c]) => cellId(r, c)).sort((a, b) => a - b);
}

/** One clue per slot from the bank, mixing kinds within the puzzle's limits; null if some slot has no clue that fits. */
export function pickClues(P: Pattern, slots: LSlot[], grid: string[][], bank: Map<string, BankClue[]>, recent: Map<string, string[]>, rng: () => number): BankClue[] | null {
  const shared = new Map<number, number>();
  for (const s of slots) shared.set(clueCellOf(s), (shared.get(clueCellOf(s)) ?? 0) + 1);
  const options = slots.map(s => {
    const word = s.cells.map(([r, c]) => grid[r][c]).join('');
    const mode = shared.get(clueCellOf(s)) === 2 ? 'two' : 'one';
    return (bank.get(word) ?? []).filter(c => !c.text || fits(c.text, mode));
  });
  if (options.some(o => !o.length)) return null;
  const used = { picture: 0, rel: 0, gap: 0 };
  const group = (k: BankClue['kind']) => (k === 'pic' || k === 'picmath' ? 'picture' : k === 'rel' || k === 'gap' ? k : null);
  const picked: BankClue[] = [];
  for (const i of slots.map((_, i) => i).sort((a, b) => options[a].length - options[b].length || a - b)) {
    const open = options[i].filter(c => { const g = group(c.kind); return !g || used[g] < MIX[g]; });
    const pool = open.length ? open : options[i];
    const weights = pool.map(c => WEIGHT[c.kind] * ((recent.get(c.word) ?? []).includes(c.full) ? 0.1 : 1));
    let x = rng() * weights.reduce((a, b) => a + b, 0), k = 0;
    while (k < pool.length - 1 && (x -= weights[k]) > 0) k++;
    const c = pool[k];
    const g = group(c.kind);
    if (g) used[g]++;
    picked[i] = c;
  }
  return picked;
}

const csv = (v: string) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);

export function make(opts: { count: number; seed?: number; out?: string; bank?: Map<string, BankClue[]>; log?: (m: string) => void }): { batch: string; files: string[] } {
  const out = opts.out ?? 'data/duel';
  const log = opts.log ?? (m => process.stderr.write(m + '\n'));
  const n = nextBatch(out), batch = `batch-${String(n).padStart(3, '0')}`;
  const s = seedRng(opts.seed ?? n, 0), rng = () => nextU32(s) / 2 ** 32;

  const bank = opts.bank ?? loadBank();
  const words = new Map<number, string[]>();
  for (const w of wordPool()) if (bank.has(w.word)) words.set(w.len, [...(words.get(w.len) ?? []), w.word]);
  const index = indexWords(words);
  const earlier = earlierPuzzles(out).map(answersOf);
  const ctx: CheckContext = { ...defaultContext(), hasPic: key => defaultContext().pictures.has(key) };

  const made: Puzzle[] = [];
  const recent = new Map<string, string[]>();
  let layouts = 0;
  while (made.length < opts.count) {
    if (++layouts > opts.count * 400) throw new Error(`gave up after ${layouts} layouts with ${made.length} puzzles`);
    const P = randomPattern(rng);
    if (!P) continue;
    const slots = slotsOf(P);
    const grid = fill(P, slots, index, FILL_STEPS, rng);
    if (!grid) continue;
    const answers = new Set(slots.map(sl => sl.cells.map(([r, c]) => grid[r][c]).join('').toUpperCase()).filter(a => a.length > 1));
    const alike = earlier.find(e => [...answers].filter(a => e.has(a)).length >= MAX_SHARED * answers.size);
    if (alike) { log(`layout ${layouts}: too like an earlier puzzle`); continue; }
    const clues = pickClues(P, slots, grid, bank, recent, rng);
    if (!clues) { log(`layout ${layouts}: a slot has no clue that fits its square`); continue; }
    const id = `${batch}-c${String(made.length + 1).padStart(2, '0')}`;
    const byId = new Map(slots.map((sl, i) => [slotId(sl), clues[i]]));
    const p = toPuzzle(P, grid, sl => {
      const c = byId.get(slotId(sl))!;
      return { clue: { kind: c.kind, ...(c.text ? { text: c.text } : {}), ...(c.img ? { img: c.img } : {}), ...(c.math ? { math: c.math } : {}), full: c.full }, sense: c.sense };
    }, { id, version: 0, given: pickGiven(P, slots, rng) });
    const problems = checkPuzzle(p, ctx);
    if (problems.length) { log(`layout ${layouts}: dropped, ${problems[0]}`); continue; }
    made.push(p);
    earlier.push(answers);
    for (const c of clues) recent.set(c.word, [...(recent.get(c.word) ?? []), c.full]);
    for (const [w, list] of recent) if (list.length > 10) recent.set(w, list.slice(-10)); // "last 10 puzzles", roughly
    log(`${id}: ${p.slots.length} answers (layout ${layouts})`);
  }

  const dir = join(out, 'candidates', batch);
  mkdirSync(dir, { recursive: true });
  mkdirSync(join(out, 'review'), { recursive: true });
  const files = made.map((p, i) => {
    const f = join(dir, `c${String(i + 1).padStart(2, '0')}.json`);
    writeFileSync(f, JSON.stringify(p, null, 1) + '\n');
    return f;
  });
  const rows = ['puzzle,slot,answer,kind,clue,sense_en,sense_hi,bad'];
  for (const p of made) for (const sl of p.slots) rows.push([p.id, sl.id, sl.answer, sl.clue.kind, sl.clue.full, sl.sense.en, sl.sense.hi, ''].map(csv).join(','));
  const review = join(out, 'review', `${batch}.csv`);
  writeFileSync(review, rows.join('\n') + '\n');
  return { batch, files: [...files, review] };
}

if (process.argv[1]?.endsWith('make.ts')) {
  const arg = (name: string) => { const i = process.argv.indexOf(`--${name}`); return i > 0 ? process.argv[i + 1] : undefined; };
  const t0 = Date.now();
  const { batch, files } = make({ count: Number(arg('count') ?? 30), seed: arg('seed') ? Number(arg('seed')) : undefined, out: arg('out') });
  console.log(`${batch}: ${files.length - 1} puzzles in ${((Date.now() - t0) / 1000).toFixed(0)} s; review sheet ${files[files.length - 1]}`);
}
