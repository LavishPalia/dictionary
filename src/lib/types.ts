export interface DictionaryEntry {
  id: string;
  headword: string;
  normalized: string;
  pos: string; // e.g., "n.", "adj.", "v. t.", "v. i."
  pronunciation_deva: string; // Hindi phonetic transcription (Devanagari)
  pronunciation_ipa?: string;
  definition_en: string;
  meaning_hi: string;
  etymology?: string;
  examples?: string[];
  source?: string;
  license_attribution?: string;
  page_number?: number;
  column?: 1 | 2;
  position_in_column?: number;
}

export interface BookPage {
  page_number: number;
  first_headword: string;
  last_headword: string;
  guide_left: string;
  guide_right: string;
  footer_hints: string; // e.g., "Cell सेल · Cent सेन्ट · Chair चेयर · Chart चार्ट"
  column1: DictionaryEntry[];
  column2: DictionaryEntry[];
}

export interface ThumbIndexItem {
  letter: string;
  page_number: number;
}

export interface BookCatalog {
  total_pages: number;
  total_entries: number;
  thumb_index: Record<string, number>; // e.g., { 'A': 1, 'B': 45, 'C': 90, ... }
  word_to_page: Record<string, number>; // lowercase normalized headword -> page number
  pages: Record<number, BookPage>;
}
