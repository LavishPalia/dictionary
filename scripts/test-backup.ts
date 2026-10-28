// Checks backup and restore (src/lib/backup.ts). Usage: npx tsx scripts/test-backup.ts
import { isSavedWord, keepValid, backupFileName, createBackup, parseBackup, restoreData, wordsToLocate, type BackupData } from '../src/lib/backup';

let failures = 0;
function check(label: string, ok: boolean, detail?: unknown) {
  if (ok) console.log(`✓ ${label}`);
  else { failures++; console.error(`✗ ${label}${detail !== undefined ? ` — ${JSON.stringify(detail)}` : ''}`); }
}

const word = (normalized: string, saved_at?: number) => ({ normalized, headword: normalized[0].toUpperCase() + normalized.slice(1), meaning_hi: '', saved_at });
const phone: BackupData = {
  panna_saved_words: [word('camel', 100), word('abandon', 300)],
  panna_review: { camel: { box: 3, due_at: 1, right: 3, wrong: 0, last_at: 500 }, abandon: { box: 1, due_at: 1, right: 0, wrong: 1, last_at: 300 } },
  panna_bookmarks: [16], panna_dog_ears: [23],
  panna_marginalia: [{ id: 'n1', page_number: 18, text: 'phone note', color: 'blue', created_at: 1, anchor: 'ceremony' }],
  panna_mark_anchors: { data_version: 'v1', ribbons: { 16: 'calm' }, dogEars: { 23: 'classic' } },
  panna_settings: { evening: true, speed: 'instant', sounds: false },
  panna_recent_searches: [{ headword: 'Camel', page: 16 }],
};
const laptop: BackupData = {
  panna_saved_words: [word('camel', 50), word('charity', 400)],
  panna_review: { camel: { box: 1, due_at: 1, right: 1, wrong: 0, last_at: 200 }, charity: { box: 2, due_at: 1, right: 2, wrong: 0, last_at: 600 } },
  panna_bookmarks: [40], panna_dog_ears: [23],
  panna_marginalia: [{ id: 'n2', page_number: 40, text: 'laptop note', color: 'graphite', created_at: 2, anchor: 'heal' }],
  panna_mark_anchors: { data_version: 'v1', ribbons: { 40: 'heal' }, dogEars: { 23: 'classic' } },
  panna_settings: { evening: false, speed: 'realistic', sounds: true },
  panna_recent_searches: [{ headword: 'camel', page: 16 }, { headword: 'Heal', page: 40 }],
};

const backup = createBackup(phone, 'v1', new Date(2026, 9, 22));
check('file name carries the date', backupFileName(new Date(2026, 9, 22)) === 'panna-backup-2026-10-22.json');
const parsed = parseBackup(JSON.stringify(backup));
check('a backup reads back with a summary', parsed.ok && parsed.summary.words === 2 && parsed.summary.reviewing === 2 && parsed.summary.pages === 2 && parsed.summary.notes === 1, parsed);

check('rejects a file that is not JSON', !parseBackup('hello').ok);
check('rejects JSON that is not a Panna backup', (() => { const r = parseBackup('{"words":[]}'); return !r.ok && r.error.includes('isn’t a Panna backup'); })());
check('rejects a backup from a newer Panna', (() => { const r = parseBackup(JSON.stringify({ ...backup, format: 99 })); return !r.ok && r.error.includes('newer version'); })());
check('rejects a damaged backup', (() => { const r = parseBackup(JSON.stringify({ ...backup, data: { ...backup.data, panna_bookmarks: ['x'] } })); return !r.ok && r.error.includes('damaged'); })());

const book = { dataVersion: 'v1', totalPages: 95 };
const replaced = restoreData(laptop, backup, 'replace', book);
check('replace makes this browser match the backup', JSON.stringify(replaced.panna_saved_words) === JSON.stringify(phone.panna_saved_words)
  && JSON.stringify(replaced.panna_settings) === JSON.stringify(phone.panna_settings) && JSON.stringify(replaced.panna_bookmarks) === '[16]');

const merged = restoreData(laptop, backup, 'merge', book);
const mergedWords = merged.panna_saved_words as Array<{ normalized: string; saved_at?: number }>;
check('merge keeps words from both, once each', mergedWords.map((w) => w.normalized).sort().join() === 'abandon,camel,charity', mergedWords);
check('merge keeps the earliest save date', mergedWords.find((w) => w.normalized === 'camel')?.saved_at === 50);
const review = merged.panna_review as Record<string, { box: number }>;
check('merge keeps the more recently studied review record', review.camel.box === 3 && review.charity.box === 2 && review.abandon.box === 1, review);
check('merge combines marked pages', JSON.stringify(merged.panna_bookmarks) === '[16,40]' && JSON.stringify(merged.panna_dog_ears) === '[23]');
check('merge keeps notes from both', (merged.panna_marginalia as unknown[]).length === 2);
check('merge keeps this browser’s settings', JSON.stringify(merged.panna_settings) === JSON.stringify(laptop.panna_settings));
{
  const t = restoreData({ panna_tours: { seen: { start: 200 }, tips: { book: 5 }, tipsOff: true } },
    { ...backup, data: { panna_tours: { seen: { start: 100, word: 300 }, tips: { review: 7 }, welcomeDone: true, tipsOff: false } } }, 'merge', book)
    .panna_tours as { seen: Record<string, number>; tips: Record<string, number>; welcomeDone: boolean; tipsOff: boolean };
  check('merge keeps tours and tips seen on either side, and this browser’s tips choice',
    t.seen.start === 100 && t.seen.word === 300 && t.tips.book === 5 && t.tips.review === 7 && t.welcomeDone && t.tipsOff, t);
  check('a backup with damaged tour progress is refused', !parseBackup(JSON.stringify({ ...backup, data: { ...backup.data, panna_tours: [] } })).ok);
}
check('merge combines recent searches without duplicates', (merged.panna_recent_searches as Array<{ headword: string }>).map((r) => r.headword).join() === 'camel,Heal', merged.panna_recent_searches);

// A backup made under an older build of the book: its marks move to where their words are now.
const old = createBackup(phone, 'v0');
const oldData = { ...phone, panna_mark_anchors: { data_version: 'v0', ribbons: { 16: 'calm' }, dogEars: { 23: 'classic' } } };
const oldBackup = { ...old, data: oldData };
check('only marks from another build need looking up', wordsToLocate(backup, 'v1').length === 0 && wordsToLocate(oldBackup, 'v1').sort().join() === 'calm,ceremony,classic');
const moved = restoreData({}, oldBackup, 'merge', book, { calm: 9, classic: 12, ceremony: 9 });
check('marks from an older build land on their words’ current pages', JSON.stringify(moved.panna_bookmarks) === '[8]' && JSON.stringify(moved.panna_dog_ears) === '[12]'
  && (moved.panna_marginalia as Array<{ page_number: number }>)[0].page_number === 9, moved);

{
  const w = (example: unknown) => ({ normalized: 'ceremony', headword: 'Ceremony', example });
  const en = 'The ceremony was postponed.';
  check('saved word accepts a well-formed example with a blank', isSavedWord(w({ en, hi: 'x', blank: [4, 8] })));
  check('saved word accepts an example without a blank', isSavedWord(w({ en, hi: 'x' })));
  check('saved word still accepts an old examples list', isSavedWord({ normalized: 'a', headword: 'A', examples: ['x'] }));
  check('saved word rejects a blank running past the sentence', !isSavedWord(w({ en, hi: 'x', blank: [20, 20] })));
  check('saved word rejects a negative or empty blank', !isSavedWord(w({ en, hi: 'x', blank: [-1, 3] })) && !isSavedWord(w({ en, hi: 'x', blank: [2, 0] })));
}

if (failures) { console.error(`\n${failures} backup check(s) failed.`); process.exit(1); }
console.log('\nBackup checks passed.');
