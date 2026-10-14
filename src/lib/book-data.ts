import catalogData from '../../data/book/catalog.json';
import { BookCatalog, BookPage, DictionaryEntry } from './types';

const catalog = catalogData as unknown as BookCatalog;

export function getCatalog(): BookCatalog {
  return catalog;
}

export function getPage(pageNum: number): BookPage | null {
  return catalog.pages[pageNum] || null;
}

export function getSpread(leftPageNum: number): { left: BookPage | null; right: BookPage | null } {
  // If leftPageNum is odd, adjust to even left page if desired, or handle spread pairing
  const left = catalog.pages[leftPageNum] || null;
  const right = catalog.pages[leftPageNum + 1] || null;
  return { left, right };
}

export function getWordEntry(headword: string): {
  entry: DictionaryEntry | null;
  pageNumber: number | null;
  neighbours: DictionaryEntry[];
} {
  const norm = headword.toLowerCase().trim();
  const pageNum = catalog.word_to_page[norm] || null;

  if (!pageNum || !catalog.pages[pageNum]) {
    // If not exact match, search all pages
    for (const [pNum, page] of Object.entries(catalog.pages)) {
      const allEntries = [...page.column1, ...page.column2];
      const foundIdx = allEntries.findIndex(e => e.normalized === norm);
      if (foundIdx !== -1) {
        return {
          entry: allEntries[foundIdx],
          pageNumber: Number(pNum),
          neighbours: allEntries,
        };
      }
    }
    return { entry: null, pageNumber: null, neighbours: [] };
  }

  const page = catalog.pages[pageNum];
  const allEntries = [...page.column1, ...page.column2];
  const entry = allEntries.find(e => e.normalized === norm) || null;

  return {
    entry,
    pageNumber: pageNum,
    neighbours: allEntries,
  };
}

export function searchWords(query: string, limit: number = 8): {
  headword: string;
  normalized: string;
  page_number: number;
  preview: string;
}[] {
  const q = query.toLowerCase().trim();
  if (!q) return [];

  const results: { headword: string; normalized: string; page_number: number; preview: string; score: number }[] = [];

  for (const [pNum, page] of Object.entries(catalog.pages)) {
    const entries = [...page.column1, ...page.column2];
    for (const entry of entries) {
      const norm = entry.normalized;
      let score = 0;

      if (norm === q) {
        score = 100;
      } else if (norm.startsWith(q)) {
        score = 80 - (norm.length - q.length);
      } else if (norm.includes(q)) {
        score = 50;
      } else if (entry.definition_en.toLowerCase().includes(q) || entry.meaning_hi.includes(q)) {
        score = 20;
      }

      if (score > 0) {
        results.push({
          headword: entry.headword,
          normalized: entry.normalized,
          page_number: Number(pNum),
          preview: `${entry.pos} ${entry.meaning_hi}`,
          score,
        });
      }
    }
  }

  // Sort by score descending
  results.sort((a, b) => b.score - a.score);
  return results.slice(0, limit).map(({ headword, normalized, page_number, preview }) => ({
    headword,
    normalized,
    page_number,
    preview,
  }));
}

export function getThumbIndex(): Record<string, number> {
  return catalog.thumb_index;
}
