// Bakes a thin ink outline into a Twemoji SVG, so pale pictures (the goat) stand out on a grey clue cell
// (UI-DESIGN §0). A CSS drop-shadow on every clue picture would cost frames; a stroke in the file costs nothing.
// The stroke is painted under the fill, so it shows only as an edge.
// Usage: npx tsx scripts/duel/pics-outline.ts <in.svg> <out.svg>
import { readFileSync, writeFileSync } from 'node:fs';

export const OUTLINE = 'stroke="#1f2328" stroke-width="0.5" stroke-linejoin="round" paint-order="stroke"';

export function outline(svg: string): string {
  return svg.replace(/<(path|circle|ellipse)\b(?![^>]*\bstroke=)/g, `<$1 ${OUTLINE}`);
}

if (process.argv[1]?.endsWith('pics-outline.ts')) {
  const [src, out] = process.argv.slice(2);
  if (!src || !out) { console.error('Usage: npx tsx scripts/duel/pics-outline.ts <in.svg> <out.svg>'); process.exit(1); }
  writeFileSync(out, outline(readFileSync(src, 'utf8')));
  console.log(`${out}: outlined`);
}
