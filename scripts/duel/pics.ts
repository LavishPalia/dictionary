// Self-hosts Twemoji 15.1 pictures for the Duel: fetches each SVG, bakes in the ink outline (pics-outline.ts) and writes
// public/duel/pics/<key>.svg (committed; credits in public/duel/pics/CREDITS.txt). Only pictures a puzzle uses are kept.
// Usage: npx tsx scripts/duel/pics.ts <code point…>
import { existsSync, writeFileSync } from 'node:fs';
import { outline } from './pics-outline';

export const PIC_DIR = 'public/duel/pics';
const url = (key: string) => `https://cdn.jsdelivr.net/gh/jdecked/twemoji@15.1.0/assets/svg/${key}.svg`;

/** Fetches the pictures not yet in `dir`. Returns the keys it wrote. */
export async function fetchPics(keys: string[], dir = PIC_DIR): Promise<string[]> {
  const wrote: string[] = [];
  for (const key of [...new Set(keys)]) {
    if (!/^[0-9a-f]+(-[0-9a-f]+)*$/.test(key)) throw new Error(`bad picture key ${key}`);
    if (existsSync(`${dir}/${key}.svg`)) continue;
    const res = await fetch(url(key));
    if (!res.ok) throw new Error(`Twemoji ${key}: HTTP ${res.status}`);
    const svg = await res.text();
    if (!svg.startsWith('<svg')) throw new Error(`Twemoji ${key}: not an SVG`);
    writeFileSync(`${dir}/${key}.svg`, outline(svg));
    wrote.push(key);
  }
  return wrote;
}

if (process.argv[1]?.endsWith('pics.ts')) {
  fetchPics(process.argv.slice(2)).then(w => console.log(`wrote ${w.length} picture(s): ${w.join(' ')}`), err => { console.error(err.message); process.exit(1); });
}
