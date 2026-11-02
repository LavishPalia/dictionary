// Does a clue fit its square? Clues render in Montserrat 700 capitals (src/duel/ui/styles/game.css `.duel-cl .t`):
// font cell × .17 (× .15 in a two-clue square), line-height 1.08, letter-spacing −0.2 px, words never broken. The text box
// is cell − 3 px wide (the cell's 1 px right border and the text's 1 px padding each side). Those pixels don't scale with
// the cell, so a smaller cell is always tighter: clues are checked at 40 px and at 34 px (a 320 px-wide phone).
// Widths come from fontwidth.json, measured once in Edge (scripts/duel/fontwidth-gen.mjs).
import { readFileSync } from 'node:fs';

const TABLE = JSON.parse(readFileSync('scripts/duel/lib/fontwidth.json', 'utf8')) as { widths: Record<string, number>; kern: Record<string, number> };
const UNKNOWN = TABLE.widths.M;
const LETTER_SPACING = -0.2;
/** Sub-pixel rounding and the browser's own shaping can differ from the table by a hair; keep a little room. */
const SAFETY_PX = 0.4;

export const CELL = 40;
export const CELLS = [40, 34];
/** The text box width in a cell of this size. */
export const boxWidth = (cell: number) => cell - 3;
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
  return CELLS.every(cell => { const l = lines(text, cell * size, boxWidth(cell)); return l !== null && l.length <= maxLines; });
}
