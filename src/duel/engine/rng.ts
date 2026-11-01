// Seeded randomness for the Duel engine: sfc32, seeded by splitmix32.
// The state is a plain array, so a game saved as JSON carries its dice with it.

export type RngState = [number, number, number, number];

/** A fresh generator for one stream of a game's seed (0 = bag, 1 = bot). */
export function seedRng(seed: number, stream: number): RngState {
  let x = (seed ^ Math.imul(stream + 1, 0x9e3779b9)) >>> 0;
  const splitmix = () => {
    x = (x + 0x9e3779b9) >>> 0;
    let z = x;
    z = Math.imul(z ^ (z >>> 16), 0x85ebca6b) >>> 0;
    z = Math.imul(z ^ (z >>> 13), 0xc2b2ae35) >>> 0;
    return (z ^ (z >>> 16)) >>> 0;
  };
  const s: RngState = [splitmix(), splitmix(), splitmix(), splitmix()];
  for (let i = 0; i < 12; i++) nextU32(s);
  return s;
}

/** Next uint32. Mutates the state in place. */
export function nextU32(s: RngState): number {
  let [a, b, c, d] = s;
  const t = (((a + b) >>> 0) + d) >>> 0;
  d = (d + 1) >>> 0;
  a = b ^ (b >>> 9);
  b = (c + (c << 3)) >>> 0;
  c = ((c << 21) | (c >>> 11)) >>> 0;
  c = (c + t) >>> 0;
  s[0] = a >>> 0; s[1] = b; s[2] = c; s[3] = d;
  return t;
}

/** A float in [0, 1). */
export function nextFloat(s: RngState): number {
  return nextU32(s) / 4294967296;
}

/** An integer in [0, n). */
export function nextInt(s: RngState, n: number): number {
  return Math.floor(nextFloat(s) * n);
}

/** Fisher–Yates, in place, from the end. */
export function shuffle<T>(s: RngState, a: T[]): void {
  for (let i = a.length - 1; i > 0; i--) {
    const j = nextInt(s, i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
}
