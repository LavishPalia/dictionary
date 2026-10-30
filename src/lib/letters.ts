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

/** The rail's letter for a thumb on raw (letterAtOffset), skipping letters with no pages. The skip goes the way the
 *  thumb last moved (raw vs the previous raw, else prevDir), so a thumb resting on a missing letter stays on one side;
 *  if nothing lies that way it goes back the other way. */
export function railLetter(
  raw: string, prevRaw: string | null, prevDir: 1 | -1, thumbIndex: Record<string, number>,
): { letter: string | null; dir: 1 | -1 } {
  const dir: 1 | -1 = prevRaw && raw !== prevRaw ? (LETTERS.indexOf(raw) < LETTERS.indexOf(prevRaw) ? -1 : 1) : prevDir;
  return { letter: nearestAvailable(raw, thumbIndex, dir) ?? nearestAvailable(raw, thumbIndex, dir === 1 ? -1 : 1), dir };
}

export type MarkedPage = { page: number; kind: 'ribbon' | 'dog-ear' | 'note' };

/** Pages with marks, one chip per page (note > ribbon > dog-ear): the max nearest the current page, in page order.
 *  (Ribbons and folded corners carry no time, so "newest" can't be known.) */
export function markedPages(
  input: { ribbons: number[]; dogEars: number[]; notes: { page_number: number }[] },
  current: number,
  max = 8,
): MarkedPage[] {
  const byPage = new Map<number, MarkedPage['kind']>();
  const add = (page: number, kind: MarkedPage['kind']) => { if (!byPage.has(page)) byPage.set(page, kind); };
  input.notes.forEach(n => add(n.page_number, 'note'));
  input.ribbons.forEach(p => add(p, 'ribbon'));
  input.dogEars.forEach(p => add(p, 'dog-ear'));
  return [...byPage]
    .map(([page, kind]) => ({ page, kind }))
    .sort((a, b) => Math.abs(a.page - current) - Math.abs(b.page - current) || a.page - b.page)
    .slice(0, max)
    .sort((a, b) => a.page - b.page);
}

/** A whole page number 1..total from typed text, or null. */
export function parsePageInput(text: string, total: number): number | null {
  const t = text.trim();
  if (!/^\d+$/.test(t)) return null;
  const n = parseInt(t, 10);
  return n >= 1 && n <= total ? n : null;
}
