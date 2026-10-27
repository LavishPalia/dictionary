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
  /** One example sentence; blank is [start, end) of the word in `en`, set only when the word appears as written. */
  example?: { en: string; hi: string; blank?: [number, number] };
  source?: string;
  license_attribution?: string;
  reviewed?: 0 | 1; // 1 = human-written or human-reviewed; 0 = machine-generated, sample-audited
  page_number?: number;
  column?: 1 | 2;
  position_in_column?: number;
  /** Similar and opposite words that are themselves in Panna (WordNet), best first. */
  similar?: RelatedWord[];
  opposite?: RelatedWord[];
}

export interface RelatedWord {
  headword: string;
  page_number: number;
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

export interface BookMeta {
  total_pages: number;
  total_entries: number;
  thumb_index: Record<string, number>; // letter -> page holding that letter's first headword
  data_version: string; // content hash of the built database; versions /api/page caching
}

export interface MarginNote {
  id: string;
  page_number: number;
  text: string;
  color: 'blue' | 'graphite' | 'crimson';
  created_at: number;
  top_pct?: number;
  /** The word the note was written beside; lets the note follow it when page numbers change (src/lib/marks.ts). */
  anchor?: string;
}

