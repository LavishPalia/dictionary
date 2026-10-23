// Spelling-variant folding for Hindi search. Used both when building the database (scripts/init-db.ts) and on
// every Devanagari query (src/lib/book-data.ts), so stored text and queries always fold the same way.
// Only for matching: the printed meaning_hi is never altered.

const NUKTA = /़/g; // ़ — क़ ख़ ग़ ज़ ड़ ढ़ फ़ य़ decompose to base + nukta under NFD
const CHANDRABINDU = /ँ/g; // ँ → ं (ऊँट / ऊंट)
const CANDRA_O = /ॉ/g; // ॉ → ा (डॉक्टर / डाक्टर)
const CANDRA_O_VOWEL = /ऑ/g; // ऑ → आ
const HALF_NASAL = /[ङञणनम]्(?=[क-ह])/g; // न्/म्/ण्… before a consonant → ं (केन्द्र / केंद्र)
const JOINERS = /[‌‍]/g;

export function normalizeHindi(text: string): string {
  return text
    .normalize('NFD')
    .replace(NUKTA, '')
    .replace(JOINERS, '')
    .replace(CHANDRABINDU, 'ं')
    .replace(CANDRA_O, 'ा')
    .replace(CANDRA_O_VOWEL, 'आ')
    .replace(HALF_NASAL, 'ं')
    .normalize('NFC')
    .replace(/\s+/g, ' ')
    .trim();
}
