// Pure helpers for the phone A-Z rail and the "Go to" panel.
export const LETTERS: readonly string[] = Array.from({ length: 26 }, (_, i) => String.fromCharCode(65 + i));

/** The last letter whose first page is <= page; null if the page is before every letter. */
export function letterForPage(page: number, thumbIndex: Record<string, number>): string | null {
  let found: string | null = null;
  for (const l of LETTERS) {
    const first = thumbIndex[l];
    if (first !== undefined && first <= page) found = l;
  }
  return found;
}

/** Which letter a touch at y falls on, for a rail starting at top with the given height. Clamps to A..Z. */
export function letterAtOffset(y: number, top: number, height: number): string {
  if (!(height > 0)) return LETTERS[0];
  const i = Math.floor(((y - top) / height) * LETTERS.length);
  return LETTERS[Math.min(LETTERS.length - 1, Math.max(0, i))];
}

/** The letter itself if it has pages, else the next one in direction dir that does; null if none. */
export function nearestAvailable(letter: string, thumbIndex: Record<string, number>, dir: 1 | -1 = 1): string | null {
  for (let i = LETTERS.indexOf(letter); i >= 0 && i < LETTERS.length; i += dir) {
    if (thumbIndex[LETTERS[i]] !== undefined) return LETTERS[i];
  }
  return null;
}

export type MarkedPage = { page: number; kind: 'ribbon' | 'dog-ear' | 'note' };

/** Pages with marks, newest first, one chip per page (note > ribbon > dog-ear), at most max. */
export function markedPages(
  input: { ribbons: number[]; dogEars: number[]; notes: { page_number: number; created_at: number }[] },
  max = 8,
): MarkedPage[] {
  const seen = new Set<number>();
  const out: MarkedPage[] = [];
  const add = (page: number, kind: MarkedPage['kind']) => {
    if (seen.has(page)) return;
    seen.add(page);
    out.push({ page, kind });
  };
  [...input.notes].sort((a, b) => b.created_at - a.created_at).forEach(n => add(n.page_number, 'note'));
  [...input.ribbons].reverse().forEach(p => add(p, 'ribbon'));
  [...input.dogEars].reverse().forEach(p => add(p, 'dog-ear'));
  return out.slice(0, max);
}

/** A whole page number 1..total from typed text, or null. */
export function parsePageInput(text: string, total: number): number | null {
  const t = text.trim();
  if (!/^\d+$/.test(t)) return null;
  const n = parseInt(t, 10);
  return n >= 1 && n <= total ? n : null;
}
