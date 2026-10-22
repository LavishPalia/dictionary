// Ribbons, folded corners and pencil notes are stored by page number, but page numbers change whenever the book is
// rebuilt (new words, new page sizes). Each mark therefore also remembers an anchor word: the first word on its page,
// or for a note the word beside it. When the book's data_version changes, marks move to wherever their anchor word
// now lives. Pure functions; the app does the storage and the lookup.
import type { BookPage, MarginNote } from './types';

export interface MarkAnchors {
  /** The book build the page numbers below belong to. */
  data_version: string;
  /** Ribbon (left page of the spread) → first word of that page. */
  ribbons: Record<number, string>;
  /** Folded page → first word of that page. */
  dogEars: Record<number, string>;
}

export const ANCHORS_KEY = 'panna_mark_anchors';

export function emptyAnchors(dataVersion: string): MarkAnchors {
  return { data_version: dataVersion, ribbons: {}, dogEars: {} };
}

/** The first word on a page. */
export function pageAnchor(page: BookPage | null): string | undefined {
  return page ? [...page.column1, ...page.column2][0]?.normalized : undefined;
}

/** The word printed at a note's height (top_pct of the page), so a note follows the word it was written beside. */
export function noteAnchor(page: BookPage | null, topPct = 0): string | undefined {
  if (!page) return undefined;
  const entries = [...page.column1, ...page.column2];
  if (!entries.length) return undefined;
  const at = Math.min(entries.length - 1, Math.max(0, Math.floor((topPct / 100) * entries.length)));
  return entries[at].normalized;
}

/** Every anchor word the marks refer to, for one lookup. */
export function anchorWords(anchors: MarkAnchors, notes: MarginNote[]): string[] {
  return [...new Set([...Object.values(anchors.ribbons), ...Object.values(anchors.dogEars), ...notes.map((n) => n.anchor).filter((a): a is string => !!a)])];
}

const spreadLeft = (p: number) => (p % 2 === 0 ? p : p - 1);

/**
 * Moves marks made under an older book build to the pages their anchor words are on now, and returns anchors for
 * the new build. `located` maps anchor word → current page. A mark whose anchor is gone (or that never had one)
 * keeps its page number, clamped to the book. Duplicates created by the move are merged.
 */
export function relocateMarks(
  marks: { ribbons: number[]; dogEars: number[]; notes: MarginNote[] },
  anchors: MarkAnchors,
  located: Record<string, number>,
  totalPages: number,
  dataVersion: string,
): { ribbons: number[]; dogEars: number[]; notes: MarginNote[]; anchors: MarkAnchors } {
  const clamp = (p: number) => Math.min(Math.max(1, p), totalPages);
  const next = emptyAnchors(dataVersion);
  const move = (pages: number[], old: Record<number, string>, out: Record<number, string>, toPage: (p: number) => number) => {
    const result = new Set<number>();
    for (const page of pages) {
      const anchor = old[page];
      const now = toPage(clamp(anchor && located[anchor] ? located[anchor] : page));
      result.add(now);
      if (anchor && located[anchor] && !out[now]) out[now] = anchor;
    }
    return [...result].sort((a, b) => a - b);
  };
  const ribbons = move(marks.ribbons, anchors.ribbons, next.ribbons, spreadLeft);
  const dogEars = move(marks.dogEars, anchors.dogEars, next.dogEars, (p) => p);
  const notes = marks.notes.map((n) => ({
    ...n,
    page_number: n.anchor && located[n.anchor] ? located[n.anchor] : clamp(n.page_number),
  }));
  return { ribbons, dogEars, notes, anchors: next };
}
