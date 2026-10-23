// Checks that ribbons, folded corners and notes follow their words when page numbers change (src/lib/marks.ts).
// Usage: npx tsx scripts/test-marks.ts
import { anchorWords, noteAnchor, pageAnchor, relocateMarks, type MarkAnchors } from '../src/lib/marks';
import type { BookPage, MarginNote } from '../src/lib/types';

let failures = 0;
function check(label: string, ok: boolean, detail?: unknown) {
  if (ok) console.log(`✓ ${label}`);
  else { failures++; console.error(`✗ ${label}${detail !== undefined ? ` — ${JSON.stringify(detail)}` : ''}`); }
}

const entry = (normalized: string) => ({ id: normalized, headword: normalized, normalized, pos: 'n.', pronunciation_deva: '', definition_en: '', meaning_hi: '' });
const page: BookPage = {
  page_number: 16, first_headword: 'calm', last_headword: 'candle', guide_left: 'Calm', guide_right: 'Candle', footer_hints: '',
  column1: ['calm', 'camel', 'camera', 'camp'].map(entry), column2: ['can', 'canal', 'cancel', 'candle'].map(entry),
};
check('a page is anchored to its first word', pageAnchor(page) === 'calm');
check('a note near the top is anchored to the first word', noteAnchor(page, 5) === 'calm');
check('a note halfway down is anchored to the word there', noteAnchor(page, 52) === 'can');
check('a note at the very bottom is anchored to the last word', noteAnchor(page, 100) === 'candle');

// Old build: 8 entries per page. New build: 16 per page, so every page number roughly halves.
const anchors: MarkAnchors = { data_version: 'old', ribbons: { 16: 'calm', 40: 'heal' }, dogEars: { 23: 'classic', 16: 'calm' } };
const notes: MarginNote[] = [
  { id: 'n1', page_number: 18, text: 'learn', color: 'blue', created_at: 1, anchor: 'ceremony' },
  { id: 'n2', page_number: 90, text: 'old note', color: 'blue', created_at: 2 }, // made before anchors existed
];
check('all anchor words are looked up once', anchorWords(anchors, notes).sort().join() === 'calm,ceremony,classic,heal');
const located = { calm: 9, heal: 21, classic: 12, ceremony: 9 };
const out = relocateMarks({ ribbons: [16, 40], dogEars: [16, 23], notes }, anchors, located, 50, 'new');
check('ribbons move to the spread now holding their word (left page)', out.ribbons.join() === '8,20', out.ribbons);
check('folded corners move to their word’s new page', out.dogEars.join() === '9,12', out.dogEars);
check('a note follows the word it was written beside', out.notes[0].page_number === 9, out.notes[0]);
check('a note without an anchor keeps its page, clamped to the smaller book', out.notes[1].page_number === 50, out.notes[1]);
check('new anchors are recorded for the new build', out.anchors.data_version === 'new' && out.anchors.dogEars[9] === 'calm' && out.anchors.ribbons[8] === 'calm', out.anchors);

const gone = relocateMarks({ ribbons: [], dogEars: [23], notes: [] }, anchors, {}, 50, 'new');
check('a mark whose word left the book stays where it was', gone.dogEars.join() === '23');
const merged = relocateMarks({ ribbons: [], dogEars: [16, 17], notes: [] }, { data_version: 'old', ribbons: {}, dogEars: { 16: 'calm', 17: 'camel' } }, { calm: 9, camel: 9 }, 50, 'new');
check('two folds that land on the same page merge into one', merged.dogEars.join() === '9', merged.dogEars);

if (failures) { console.error(`\n${failures} mark check(s) failed.`); process.exit(1); }
console.log('\nMark relocation checks passed.');
