import fs from 'fs';
import path from 'path';
import { DictionaryEntry, BookPage, BookCatalog } from '../src/lib/types';
import { SEED_ENTRIES } from './seed-entries';

const OUTPUT_DIR = path.join(process.cwd(), 'data', 'book');
const CATALOG_FILE = path.join(OUTPUT_DIR, 'catalog.json');

/**
 * Typographic estimator:
 * Estimates height in pixels for an entry in a 220px column
 * IM Fell English font 15px with line-height 1.4 (~21px per line)
 */
function estimateEntryHeight(entry: Omit<DictionaryEntry, 'id' | 'page_number' | 'column' | 'position_in_column'>): number {
  const fullText = `${entry.headword} ${entry.pronunciation_deva} ${entry.pos} ${entry.definition_en} ${entry.meaning_hi}`;
  const approxCharsPerLine = 34; // approximate characters in a 220px width column
  const estimatedLines = Math.max(2, Math.ceil(fullText.length / approxCharsPerLine));
  const lineHeight = 21;
  const bottomMargin = 11;
  return estimatedLines * lineHeight + bottomMargin;
}

/**
 * Phonetic guide words generator for the page bottom strip
 */
function generateFooterHints(entries: DictionaryEntry[]): string {
  if (entries.length === 0) return 'Word · Pronunciation';
  const sample = entries.slice(0, 4);
  return sample.map(e => `${e.headword} ${e.pronunciation_deva}`).join(' · ');
}

export function buildCatalog(): BookCatalog {
  // Sort alphabetically using standard collation
  const collator = new Intl.Collator('en', { sensitivity: 'base' });
  const sorted = [...SEED_ENTRIES].sort((a, b) => collator.compare(a.headword, b.headword));

  const MAX_COL_HEIGHT = 480; // pixels
  const pages: Record<number, BookPage> = {};
  const wordToPage: Record<string, number> = {};
  const thumbIndex: Record<string, number> = {};

  // Anchor pages matching design mockups:
  // Main.dc.html: Page 92 = Cellar...Century, Page 93 = Chain...Charity
  // Flip.dc.html: Page 211 = Dairy...Deep/Dark
  // For entries before C (A and B), we paginate into earlier pages (e.g., Pages 1 to 91).
  // For C, we start Page 92.
  // For D, we place Dairy... at Page 211.
  
  // Group entries by letter
  const byLetter: Record<string, typeof sorted> = {};
  for (const entry of sorted) {
    const firstLetter = entry.headword[0].toUpperCase();
    if (!byLetter[firstLetter]) byLetter[firstLetter] = [];
    byLetter[firstLetter].push(entry);
  }

  // Pre-configured letter page starts to match historical pocket dictionary thickness and mockups:
  // A: 1, B: 45, C: 92, D: 211, E: 260, F: 290, G: 320, H: 350, I: 390, J: 410, K: 425, L: 440,
  // M: 470, N: 510, O: 530, P: 550, Q: 610, R: 620, S: 650, T: 710, U: 760, V: 780, W: 800, X: 830, Y: 840, Z: 850
  const LETTER_STARTS: Record<string, number> = {
    'A': 1,
    'B': 45,
    'C': 92,
    'D': 211,
    'E': 260,
    'F': 290,
    'G': 320,
    'H': 350,
    'I': 390,
    'J': 410,
    'K': 425,
    'L': 440,
    'M': 470,
    'N': 510,
    'O': 530,
    'P': 550,
    'Q': 610,
    'R': 620,
    'S': 650,
    'T': 710,
    'U': 760,
    'V': 780,
    'W': 800,
    'X': 830,
    'Y': 840,
    'Z': 850
  };

  const letters = Object.keys(LETTER_STARTS).sort();
  for (const letter of letters) {
    thumbIndex[letter] = LETTER_STARTS[letter];
  }

  // Paginate each letter's entries into columns
  for (const letter of letters) {
    const letterEntries = byLetter[letter] || [];
    if (letterEntries.length === 0) continue;

    let currentPageNum = LETTER_STARTS[letter];
    let col1: DictionaryEntry[] = [];
    let col2: DictionaryEntry[] = [];
    let col1Height = 0;
    let col2Height = 0;

    for (let i = 0; i < letterEntries.length; i++) {
      const item = letterEntries[i];
      const h = estimateEntryHeight(item);

      // Check if this item is part of Page 92 or 93 anchor split
      // Page 92: Cellar, Cement, Census, Centre (col1), Century, Ceramic, Ceremony, Certain (col2)
      // Page 93: Chain, Chair, Chalk, Chamber (col1), Chance, Change, Chapter, Charity (col2)
      const isSpecificC = letter === 'C';

      let targetCol: 1 | 2 = 1;
      let shouldNewPage = false;

      if (isSpecificC) {
        if (currentPageNum === 92) {
          if (col1.length < 4) {
            targetCol = 1;
          } else if (col2.length < 4) {
            targetCol = 2;
          } else {
            shouldNewPage = true;
          }
        } else if (currentPageNum === 93) {
          if (col1.length < 4) {
            targetCol = 1;
          } else if (col2.length < 4) {
            targetCol = 2;
          } else {
            shouldNewPage = true;
          }
        }
      } else {
        // Natural height based packing
        if (col1Height + h <= MAX_COL_HEIGHT && col2.length === 0) {
          targetCol = 1;
        } else if (col2Height + h <= MAX_COL_HEIGHT) {
          targetCol = 2;
        } else {
          shouldNewPage = true;
        }
      }

      if (shouldNewPage) {
        // Commit current page
        const allPageEntries = [...col1, ...col2];
        pages[currentPageNum] = {
          page_number: currentPageNum,
          first_headword: allPageEntries[0]?.headword || '',
          last_headword: allPageEntries[allPageEntries.length - 1]?.headword || '',
          guide_left: col1[0]?.headword || '',
          guide_right: col2[col2.length - 1]?.headword || col1[col1.length - 1]?.headword || '',
          footer_hints: generateFooterHints(allPageEntries),
          column1: col1,
          column2: col2,
        };

        currentPageNum++;
        col1 = [];
        col2 = [];
        col1Height = 0;
        col2Height = 0;
        targetCol = 1;
      }

      const entry: DictionaryEntry = {
        ...item,
        id: `entry-${item.normalized}`,
        page_number: currentPageNum,
        column: targetCol,
        position_in_column: targetCol === 1 ? col1.length : col2.length
      };

      if (targetCol === 1) {
        col1.push(entry);
        col1Height += h;
      } else {
        col2.push(entry);
        col2Height += h;
      }

      wordToPage[item.normalized] = currentPageNum;
    }

    // Flush last page of letter
    if (col1.length > 0 || col2.length > 0) {
      const allPageEntries = [...col1, ...col2];
      pages[currentPageNum] = {
        page_number: currentPageNum,
        first_headword: allPageEntries[0]?.headword || '',
        last_headword: allPageEntries[allPageEntries.length - 1]?.headword || '',
        guide_left: col1[0]?.headword || '',
        guide_right: col2[col2.length - 1]?.headword || col1[col1.length - 1]?.headword || '',
        footer_hints: generateFooterHints(allPageEntries),
        column1: col1,
        column2: col2,
      };
    }
  }

  // Ensure pairing for two-page spread: Page 92 (left) and 93 (right)
  // Set guide words exactly as in Main.dc.html:
  // Page 92: left guide "Cellar", right guide "Century"
  // Page 93: left guide "Chain", right guide "Charity"
  if (pages[92]) {
    pages[92].guide_left = "Cellar";
    pages[92].guide_right = "Century";
    pages[92].footer_hints = "Cell सेल · Cent सेन्ट · Chair चेयर · Chart चार्ट";
  }
  if (pages[93]) {
    pages[93].guide_left = "Chain";
    pages[93].guide_right = "Charity";
    pages[93].footer_hints = "Chat चैट · Cheer चीयर · Child चाइल्ड · Choice चॉइस";
  }
  if (pages[211]) {
    pages[211].guide_left = "Dairy";
    pages[211].guide_right = "Deep";
    pages[211].footer_hints = "Dam डैम · Day डे · Dear डियर · Deep डीप";
  }

  const catalog: BookCatalog = {
    total_pages: 860,
    total_entries: Object.keys(wordToPage).length,
    thumb_index: thumbIndex,
    word_to_page: wordToPage,
    pages: pages,
  };

  return catalog;
}

function main() {
  console.log("Running deterministic pagination algorithm...");
  const catalog = buildCatalog();

  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  }

  fs.writeFileSync(CATALOG_FILE, JSON.stringify(catalog, null, 2), 'utf-8');
  console.log(`✓ Catalog built successfully!`);
  console.log(`  - Total pages cataloged: ${Object.keys(catalog.pages).length} (Max span: ${catalog.total_pages})`);
  console.log(`  - Total words indexed: ${catalog.total_entries}`);
  console.log(`  - Page 92 words: ${catalog.pages[92]?.column1.map(e => e.headword).join(', ')} | ${catalog.pages[92]?.column2.map(e => e.headword).join(', ')}`);
  console.log(`  - Page 93 words: ${catalog.pages[93]?.column1.map(e => e.headword).join(', ')} | ${catalog.pages[93]?.column2.map(e => e.headword).join(', ')}`);
}

main();
