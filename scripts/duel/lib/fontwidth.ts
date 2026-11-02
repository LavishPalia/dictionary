// Does a clue fit its square? Clues render in Montserrat 700 capitals (src/duel/ui/styles/game.css `.duel-cl .t`):
// font cell × .17 (× .15 in a two-clue square), line-height 1.08, letter-spacing −0.2 px, 1 px padding, words never broken.
// Widths come from fontwidth.json, measured once in Edge (scripts/duel/fontwidth-gen.mjs). Checked at a 40 px cell.
import { readFileSync } from 'node:fs';

const TABLE = JSON.parse(readFileSync('scripts/duel/lib/fontwidth.json', 'utf8')) as { widths: Record<string, number>; kern: Record<string, number> };
const UNKNOWN = TABLE.widths.M;
const LETTER_SPACING = -0.2;
/** Sub-pixel rounding and the browser's own shaping can differ from the table by a hair; keep a little room. */
const SAFETY_PX = 0.4;

export const CELL = 40;
export const FIT = { one: { size: 0.17, lines: 3 }, two: { size: 0.15, lines: 2 } } as const;

/** Rendered width in px of one line of (already uppercased) text. */
export function textWidth(text: string, fontPx: number): number {
  const chars = [...text];
  let em = 0;
  chars.forEach((ch, i) => { em += TABLE.widths[ch] ?? UNKNOWN; if (i) em += TABLE.kern[chars[i - 1] + ch] ?? 0; });
  return em * fontPx + LETTER_SPACING * chars.length;
}

/** Greedy word wrap at spaces; null when a single word is wider than the line (the browser would break it). */
export function lines(text: string, fontPx: number, widthPx: number): string[] | null {
  const max = widthPx - SAFETY_PX;
  const out: string[] = [];
  let line = '';
  for (const word of text.toUpperCase().split(/\s+/).filter(Boolean)) {
    if (textWidth(word, fontPx) > max) return null;
    const next = line ? `${line} ${word}` : word;
    if (textWidth(next, fontPx) <= max) line = next;
    else { out.push(line); line = word; }
  }
  if (line) out.push(line);
  return out;
}

/** True when the clue text fits a square alone ('one') or as one half of a two-clue square ('two'). */
export function fits(text: string, mode: 'one' | 'two'): boolean {
  const { size, lines: maxLines } = FIT[mode];
  const l = lines(text, CELL * size, CELL - 2);
  return l !== null && l.length <= maxLines;
}
