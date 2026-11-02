// Fills a layout with words. Each letter cell keeps a 26-bit set of letters it may still hold; each slot's candidates
// are a bitset over the words of its length (indexed by position and letter). After a word is placed, the crossing
// slots narrow their cells' letter sets until nothing changes, and the fill backs up as soon as any slot has no word.
// The next slot is always the one with the fewest candidates. Words are tried roughly in rank order, lightly shuffled.
import { LC, LR, type LSlot, type Pattern } from './layout';

const A = 97, ALL = (1 << 26) - 1;
const bit = (ch: string) => 1 << (ch.charCodeAt(0) - A);

/** Words of one length, rank order, with a bitset per (position, letter). */
interface Lexicon { words: string[]; n: number; size: number; idx: Uint32Array[][] }

export interface FillIndex { byLen: Map<number, Lexicon>; ones: number }

/** Builds the per-length bitsets. `words` maps length → words in rank order (common first); length 1 = letters with a clue. */
export function indexWords(words: Map<number, string[]>): FillIndex {
  const byLen = new Map<number, Lexicon>();
  for (const [len, list] of words) {
    if (len < 2) continue;
    const n = list.length, size = Math.ceil(n / 32);
    const idx = [...Array(len)].map(() => [...Array(26)].map(() => new Uint32Array(size)));
    list.forEach((w, k) => { for (let i = 0; i < len; i++) idx[i][w.charCodeAt(i) - A][k >> 5] |= 1 << (k & 31); });
    byLen.set(len, { words: list, n, size, idx });
  }
  let ones = 0;
  for (const l of words.get(1) ?? []) ones |= bit(l);
  return { byLen, ones };
}

function popcount(x: number) { x -= (x >>> 1) & 0x55555555; x = (x & 0x33333333) + ((x >>> 2) & 0x33333333); return (((x + (x >>> 4)) & 0x0f0f0f0f) * 0x01010101) >>> 24; }

/**
 * Returns the filled 9 × 7 grid ('#' = clue square), or null if no fill was found before the deadline.
 * Every word comes from `index`, no word of 2+ letters repeats, and one-letter slots hold a letter that has a clue.
 */
export function fill(P: Pattern, slots: LSlot[], index: FillIndex, deadlineMs: number, rng: () => number): string[][] | null {
  const cell = (r: number, c: number) => r * LC + c;
  const dom = new Int32Array(LR * LC).fill(ALL);
  const multi = slots.filter(s => s.cells.length > 1);
  for (const s of slots) if (s.cells.length === 1) dom[cell(...s.cells[0])] &= index.ones;
  for (const s of multi) if (!index.byLen.has(s.cells.length)) return null;
  const cellsOf = multi.map(s => s.cells.map(([r, c]) => cell(r, c)));
  const slotsAt: number[][] = [...Array(LR * LC)].map(() => []);
  cellsOf.forEach((cs, k) => cs.forEach(c => slotsAt[c].push(k)));
  const used = new Map<number, Uint32Array>([...index.byLen].map(([len, lex]) => [len, new Uint32Array(lex.size)]));
  const placed: (number | null)[] = multi.map(() => null);

  // Candidate bitset for slot k under the current letter sets, minus the words already placed.
  const cand = (k: number): Uint32Array => {
    const lex = index.byLen.get(cellsOf[k].length)!;
    const out = new Uint32Array(lex.size).fill(0xffffffff);
    if (lex.n % 32) out[lex.size - 1] = (1 << (lex.n % 32)) - 1;
    cellsOf[k].forEach((c, i) => {
      const d = dom[c];
      if (d === ALL) return;
      const or = new Uint32Array(lex.size);
      for (let l = 0; l < 26; l++) if (d & (1 << l)) { const b = lex.idx[i][l]; for (let j = 0; j < lex.size; j++) or[j] |= b[j]; }
      for (let j = 0; j < lex.size; j++) out[j] &= or[j];
    });
    const u = used.get(cellsOf[k].length)!;
    for (let j = 0; j < lex.size; j++) out[j] &= ~u[j];
    return out;
  };
  const count = (b: Uint32Array) => { let n = 0; for (let j = 0; j < b.length; j++) n += popcount(b[j]); return n; };

  // Narrow every cell's letters to those some candidate allows, repeating until stable. False = some slot is empty.
  const propagate = (start: number[]): boolean => {
    const queue = [...start], queued = new Set(start);
    while (queue.length) {
      const k = queue.shift()!; queued.delete(k);
      if (placed[k] !== null) continue;
      const b = cand(k);
      const lex = index.byLen.get(cellsOf[k].length)!;
      const allowed = cellsOf[k].map(() => 0);
      let any = false;
      for (let j = 0; j < b.length; j++) for (let x = b[j]; x; x &= x - 1) {
        const w = lex.words[(j << 5) + (31 - Math.clz32(x & -x))];
        any = true;
        for (let i = 0; i < w.length; i++) allowed[i] |= 1 << (w.charCodeAt(i) - A);
      }
      if (!any) return false;
      cellsOf[k].forEach((c, i) => {
        const nd = dom[c] & allowed[i];
        if (nd === dom[c]) return;
        if (!nd) any = false;
        dom[c] = nd;
        for (const o of slotsAt[c]) if (o !== k && !queued.has(o)) { queued.add(o); queue.push(o); }
      });
      if (!any) return false;
    }
    return true;
  };

  const solve = (): boolean => {
    if (Date.now() > deadlineMs) return false;
    let best = -1, bestB: Uint32Array | null = null, bestN = Infinity;
    for (let k = 0; k < multi.length; k++) {
      if (placed[k] !== null) continue;
      const b = cand(k), n = count(b);
      if (!n) return false;
      if (n < bestN) { best = k; bestB = b; bestN = n; }
    }
    if (best < 0) return true;
    const lex = index.byLen.get(cellsOf[best].length)!;
    const order: [number, number][] = [];
    for (let j = 0; j < bestB!.length; j++) for (let x = bestB![j]; x; x &= x - 1) {
      const w = (j << 5) + (31 - Math.clz32(x & -x));
      order.push([w, w * (0.4 + rng())]); // rank order, lightly shuffled
    }
    order.sort((a, b) => a[1] - b[1]);
    const u = used.get(cellsOf[best].length)!;
    for (const [w] of order.slice(0, 40)) {
      const saved = dom.slice();
      const word = lex.words[w];
      cellsOf[best].forEach((c, i) => (dom[c] = 1 << (word.charCodeAt(i) - A)));
      placed[best] = w; u[w >> 5] |= 1 << (w & 31);
      const touched = [...new Set(cellsOf[best].flatMap(c => slotsAt[c]))].filter(o => o !== best);
      if (propagate(touched) && solve()) return true;
      placed[best] = null; u[w >> 5] &= ~(1 << (w & 31));
      dom.set(saved);
      if (Date.now() > deadlineMs) return false;
    }
    return false;
  };

  if (!propagate(multi.map((_, k) => k)) || !solve()) return null;
  return [...Array(LR)].map((_, r) => [...Array(LC)].map((_, c) => (P[r][c] ? '#' : String.fromCharCode(A + 31 - Math.clz32(dom[cell(r, c)])))));
}
