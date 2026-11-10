// Checks backup and restore (src/lib/backup.ts). Usage: npx tsx scripts/test-backup.ts
import { collectDuel, restoreDuel } from '../src/duel/backup';
import { isSavedWord, keepValid, backupFileName, createBackup, parseBackup, restoreData, wordsToLocate, type BackupData } from '../src/lib/backup';

let failures = 0;
function check(label: string, ok: boolean, detail?: unknown) {
  if (ok) console.log(`✓ ${label}`);
  else { failures++; console.error(`✗ ${label}${detail !== undefined ? ` — ${JSON.stringify(detail)}` : ''}`); }
}

const hw = (normalized: string, last_at: number, count: number, lookups: number[] = [last_at]) => ({
  normalized, headword: normalized[0].toUpperCase() + normalized.slice(1), meaning_hi: '', first_at: last_at, last_at, count, lookups, source: 'search', page: null,
});
const word = (normalized: string, saved_at?: number) => ({ normalized, headword: normalized[0].toUpperCase() + normalized.slice(1), meaning_hi: '', saved_at });
const phone: BackupData = {
  panna_saved_words: [word('camel', 100), word('abandon', 300)],
  panna_review: { camel: { box: 3, due_at: 1, right: 3, wrong: 0, last_at: 500 }, abandon: { box: 1, due_at: 1, right: 0, wrong: 1, last_at: 300 } },
  panna_bookmarks: [16], panna_dog_ears: [23],
  panna_marginalia: [{ id: 'n1', page_number: 18, text: 'phone note', color: 'blue', created_at: 1, anchor: 'ceremony' }],
  panna_mark_anchors: { data_version: 'v1', ribbons: { 16: 'calm' }, dogEars: { 23: 'classic' } },
  panna_settings: { evening: true, speed: 'instant', sounds: false },
  panna_recent_searches: [{ headword: 'Camel', page: 16 }],
  panna_history: [hw('camel', 1_000, 2, [900, 1_000]), hw('abandon', 800, 1)],
};
const laptop: BackupData = {
  panna_saved_words: [word('camel', 50), word('charity', 400)],
  panna_review: { camel: { box: 1, due_at: 1, right: 1, wrong: 0, last_at: 200 }, charity: { box: 2, due_at: 1, right: 2, wrong: 0, last_at: 600 } },
  panna_bookmarks: [40], panna_dog_ears: [23],
  panna_marginalia: [{ id: 'n2', page_number: 40, text: 'laptop note', color: 'graphite', created_at: 2, anchor: 'heal' }],
  panna_mark_anchors: { data_version: 'v1', ribbons: { 40: 'heal' }, dogEars: { 23: 'classic' } },
  panna_settings: { evening: false, speed: 'realistic', sounds: true },
  panna_recent_searches: [{ headword: 'camel', page: 16 }, { headword: 'Heal', page: 40 }],
  panna_history: [hw('camel', 2_000, 5, [1_500, 2_000]), hw('heal', 1_800, 1)],
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
{
  const off = { ...laptop, panna_settings: { ...(laptop.panna_settings as object), analytics: false } };
  const out = restoreData(off, backup, 'replace', book).panna_settings as Record<string, unknown>;
  check('replace keeps Usage counts off when this device switched it off', out.analytics === false && out.lighting === (phone.panna_settings as Record<string, unknown>)?.lighting, out);
  check('replace leaves Usage counts as the backup has it otherwise', !('analytics' in (restoreData(laptop, backup, 'replace', book).panna_settings as object)));
}
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
  const guideBackup = { ...backup, data: { panna_tours: { seen: {}, tips: {}, guideOpened: true } } };
  const guideHere = { panna_tours: { seen: {}, tips: {} } };
  const guideOf = (d: BackupData) => (d.panna_tours as { guideOpened?: boolean }).guideOpened;
  check('a backup with the study guide opened restores it opened, in add and in replace',
    guideOf(restoreData(guideHere, guideBackup, 'merge', book)) === true && guideOf(restoreData(guideHere, guideBackup, 'replace', book)) === true);
  check('merge keeps the study guide opened when only this browser opened it',
    guideOf(restoreData({ panna_tours: { seen: {}, tips: {}, guideOpened: true } }, { ...backup, data: { panna_tours: { seen: {}, tips: {} } } }, 'merge', book)) === true);
  check('a backup with damaged tour progress is refused', !parseBackup(JSON.stringify({ ...backup, data: { ...backup.data, panna_tours: [] } })).ok);
}
{
  type HistoryLike = { normalized: string; count: number; lookups: number[] };
  const hist = merged.panna_history as Array<{ normalized: string; count: number; last_at: number; lookups: number[] }>;
  check('history survives a backup round trip', parsed.ok && JSON.stringify(parsed.backup.data.panna_history) === JSON.stringify(phone.panna_history), parsed);
  check('a damaged history item rejects the backup', !parseBackup(JSON.stringify({ ...backup, data: { ...backup.data, panna_history: [{ x: 1 }] } })).ok);
  const camel = hist.find((h) => h.normalized === 'camel');
  check('merge combines history', hist.map((h) => h.normalized).join() === 'camel,heal,abandon' && camel?.count === 5 && camel.last_at === 2_000
    && camel.lookups.join() === '900,1000,1500,2000', hist);
  check('merge no longer returns recent searches', !('panna_recent_searches' in merged));
  const oldFile = { ...backup, data: { panna_recent_searches: [{ headword: 'Camel', page: 16 }, { headword: 'Heal', page: 40 }] } };
  const folded = restoreData({}, oldFile, 'merge', book).panna_history as Array<{ normalized: string }>;
  check('merge folds an old backup’s recent searches into history', folded.map((h) => h.normalized).join() === 'camel,heal', folded);
  const foldedBoth = restoreData({ panna_recent_searches: [{ headword: 'Zebra' }] }, oldFile, 'merge', book).panna_history as Array<{ normalized: string }>;
  check('merge folds this browser’s recent searches when it has no history', foldedBoth.map((h) => h.normalized).sort().join() === 'camel,heal,zebra', foldedBoth);
  const stamped = { ...oldFile, created_at: '2026-10-01T00:00:00.000Z' };
  const once = restoreData({}, stamped, 'merge', book).panna_history as HistoryLike[];
  const twice = restoreData({ panna_history: once }, stamped, 'merge', book).panna_history as HistoryLike[];
  check('merging the same old backup twice leaves identical history', JSON.stringify(once) === JSON.stringify(twice)
    && twice.every((h) => h.count === 1 && h.lookups.length === 1), { once, twice });
  const undated = { ...oldFile, created_at: 'junk' };
  const u1 = restoreData({}, undated, 'merge', book).panna_history as HistoryLike[];
  const u2 = restoreData({ panna_history: u1 }, undated, 'merge', book).panna_history as HistoryLike[];
  check('an old backup with no usable date also merges idempotently', JSON.stringify(u1) === JSON.stringify(u2) && u2.length === 2, { u1, u2 });
  check('a new backup does not write the old recents key', !('panna_recent_searches' in createBackup({ panna_recent_searches: [{ headword: 'x' }], panna_bookmarks: [] }, 'v1').data));
  check('replace takes the backup’s history', JSON.stringify(replaced.panna_history) === JSON.stringify(phone.panna_history));
  const repFold = restoreData(laptop, oldFile, 'replace', book);
  check('replace folds the backup’s recents when it has no history', (repFold.panna_history as unknown[]).length === 2 && !('panna_recent_searches' in repFold), repFold);
  check('replace empties history when the backup has neither', (restoreData(laptop, { ...backup, data: {} }, 'replace', book).panna_history as unknown[]).length === 0);
}

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

// A file with no anchors, restored with Replace everything, must not write an empty list where the app expects an object.
{
  const made = parseBackup(JSON.stringify(createBackup({ panna_saved_words: [] }, 'v1')));
  const out = made.ok ? restoreData({}, made.backup, 'replace', { dataVersion: 'v1', totalPages: 100 }) : {};
  check('replace with no anchors in the file leaves none', out.panna_mark_anchors === undefined, out.panna_mark_anchors);
}

// ── The Duel in the backup (src/duel/backup.ts) ──
{
  const ME = { id: '11111111-1111-4111-8111-111111111111', token: 'a'.repeat(64), name: 'Curious Inkwell' };
  const OTHER = { id: '22222222-2222-4222-8222-222222222222', token: 'b'.repeat(64), name: 'Quiet Folio' };
  const queued = (seed: number) => ({ puzzle: 'p0067.v1', date: '2026-11-04', seed, rules: '1.x', actions: [], startedAt: '2026-11-04T10:00:00Z', finishedAt: '2026-11-04T10:05:00Z', claimedScore: 50 });
  const won = (date: string, at: string) => ({ date, puzzle: 'p0002.v1', you: 60, quill: 40, at });
  const inFile = {
    panna_duel_player: ME, panna_duel_outbox: [queued(1)], panna_duel_results: [won('2026-11-01', '2026-11-01T10:00:00Z')],
    panna_duel_help: { day: '2026-11-01', free: { hint: 0, word: 0 }, earned: { hint: 5, word: 1 } },
    panna_duel_settings: { sound: false, vibration: true }, panna_duel_guide: { coach: true, tips: ['hint'] },
    panna_duel_home: { seals: ['2026-09'], stamped: 'old' }, 'panna_duel_game:2026-11-02': { seed: 1, from: 'file' }, 'panna_duel_game:2026-11-03': { seed: 3, from: 'file' },
  };
  const onDevice = {
    panna_duel_player: OTHER, panna_duel_outbox: [queued(2)], panna_duel_results: [won('2026-11-05', '2026-11-05T10:00:00Z')],
    panna_duel_help: { day: '2026-11-06', free: { hint: 1, word: 1 }, earned: { hint: 2, word: 4 } },
    panna_duel_settings: { sound: true, vibration: false }, panna_duel_guide: { coach: false, tips: ['word'] },
    panna_duel_home: { seals: ['2026-10'], stamped: 'new' }, 'panna_duel_game:2026-11-03': { seed: 9, from: 'device' }, 'panna_duel_game:2026-11-06': { seed: 6, from: 'device' },
    panna_duel_week: { week: 'x' }, panna_duel_board: { this: {} },
  };

  // What a backup takes
  const collected = collectDuel({
    panna_duel_player: JSON.stringify(ME), 'panna_duel_game:2026-11-03': '{"seed":3}', panna_duel_week: '{}', panna_duel_board: '{}', panna_duel_results: '{broken', panna_saved_words: '[]',
  });
  check('a backup takes the player, token included, and dated games', (collected.panna_duel_player as typeof ME).token === ME.token && 'panna_duel_game:2026-11-03' in collected);
  check('not the cached week or board, not Panna\'s keys, not an unreadable value', Object.keys(collected).length === 2, Object.keys(collected));
  const made = createBackup({ panna_saved_words: [], panna_duel: collected }, 'v1');
  const parsedFile = parseBackup(JSON.stringify(made));
  check('the file reads back with its Duel data', parsedFile.ok && (parsedFile.backup.data.panna_duel as typeof collected).panna_duel_player !== undefined);
  check('the format stays 1, so older files and apps still work', made.format === 1);
  const sum = parseBackup(JSON.stringify(createBackup({ panna_duel: inFile }, 'v1')));
  check('the summary names the Duel player and days won', sum.ok && sum.summary.duelWon === 1 && sum.summary.duelName === ME.name);
  const oldFile = parseBackup(JSON.stringify(createBackup({ panna_saved_words: [] }, 'v1')));
  check('an old file has no Duel in its summary', oldFile.ok && oldFile.summary.duelWon === 0 && oldFile.summary.duelName === null);

  // What a file may not do
  const damaged = (d: unknown) => { const r = parseBackup(JSON.stringify({ app: 'panna', format: 1, created_at: '', data: { panna_duel: d } })); return !r.ok && /damaged/.test(r.error); };
  check('the Duel\'s section can\'t reach Panna\'s own keys', damaged({ panna_saved_words: [] }));
  check('nor bring in a cache', damaged({ panna_duel_week: {} }));
  check('a malformed player is damage', damaged({ panna_duel_player: { id: 'x', token: 'y' } }));
  check('a malformed outbox is damage', damaged({ panna_duel_outbox: [{ seed: 'x' }] }) && damaged({ panna_duel_outbox: 'x' }));
  check('results that aren\'t a list are damage', damaged({ panna_duel_results: 'x' }));

  // A file from before the Duel: both modes
  check('an old file leaves the Duel alone when merging', restoreDuel(onDevice, undefined, 'merge') === null);
  check('and with Replace everything', restoreDuel(onDevice, undefined, 'replace') === null);
  check('an empty section too', restoreDuel(onDevice, {}, 'replace') === null);
  const justOpened = { panna_duel_seen: true, panna_duel_settings: { sound: false } };
  check('a device that only opened the Duel once has nothing to restore', restoreDuel(onDevice, justOpened, 'replace') === null && restoreDuel(onDevice, justOpened, 'merge') === null);

  // No player here, or the same player
  const toEmpty = restoreDuel({}, inFile, 'replace')!;
  check('a cleared phone: everything comes back', (toEmpty.set.panna_duel_player as typeof ME).id === ME.id && 'panna_duel_game:2026-11-02' in toEmpty.set && (toEmpty.set.panna_duel_help as { earned: { hint: number } }).earned.hint === 5);
  check('a cleared phone when merging too', (restoreDuel({}, inFile, 'merge')!.set.panna_duel_player as typeof ME).id === ME.id);
  const renamedHere = { ...ME, name: 'Newer Name' };
  check('the same player keeps this device\'s newer name', (restoreDuel({ panna_duel_player: renamedHere }, inFile, 'merge')!.set.panna_duel_player as typeof ME).name === 'Newer Name');

  // A different player here: the backup's takes over, in both modes
  for (const mode of ['merge', 'replace'] as const) {
    const r = restoreDuel(onDevice, inFile, mode)!;
    check(`${mode}: the backup's player takes over`, (r.set.panna_duel_player as typeof ME).id === ME.id);
    const seeds = (r.set.panna_duel_outbox as { seed: number }[]).map(g => g.seed).sort();
    check(`${mode}: unsent scores from both sides are kept`, seeds.join() === '1,2', seeds);
    check(`${mode}: the cached week and board go`, r.remove.includes('panna_duel_week') && r.remove.includes('panna_duel_board') && !('panna_duel_week' in r.set));
  }
  const fileHasNoPlayer = restoreDuel(onDevice, { panna_duel_results: [won('2026-11-01', '2026-11-01T10:00:00Z')] }, 'replace')!;
  check('a file with no player leaves this device\'s player', (fileHasNoPlayer.set.panna_duel_player as typeof ME).id === OTHER.id);

  // Add to this device
  const merged = restoreDuel(onDevice, inFile, 'merge')!.set;
  check('merge: results from both', (merged.panna_duel_results as unknown[]).length === 2);
  check('merge: this device\'s game wins on a shared date, the file fills the others',
    (merged['panna_duel_game:2026-11-03'] as { from: string }).from === 'device' && (merged['panna_duel_game:2026-11-02'] as { from: string }).from === 'file' && (merged['panna_duel_game:2026-11-06'] as { from: string }).from === 'device');
  const help = merged.panna_duel_help as { day: string; free: { hint: number }; earned: { hint: number; word: number } };
  check('merge: the higher of each earned balance', help.earned.hint === 5 && help.earned.word === 4, help);
  check('merge: today\'s free ones are this device\'s', help.day === '2026-11-06' && help.free.hint === 1);
  check('merge: this device\'s settings stay', (merged.panna_duel_settings as { sound: boolean }).sound === true);
  check('merge: tips and seals from both', (merged.panna_duel_guide as { tips: string[] }).tips.length === 2 && (merged.panna_duel_home as { seals: string[] }).seals.length === 2);
  check('merge: first-game guide state stays this device\'s', (merged.panna_duel_guide as { coach: boolean }).coach === false);
  const twice = restoreDuel(merged, inFile, 'merge')!.set;
  const sameExceptPlayer = (x: Record<string, unknown>) => JSON.stringify(Object.entries(x).sort(([a], [b]) => a.localeCompare(b)));
  check('merging the same file twice changes nothing', sameExceptPlayer(twice) === sameExceptPlayer(merged));

  // Replace everything
  const replaced = restoreDuel(onDevice, inFile, 'replace')!;
  check('replace: results are the backup\'s', (replaced.set.panna_duel_results as { date: string }[]).map(r => r.date).join() === '2026-11-01');
  check('replace: games only here are removed, the backup\'s written', replaced.remove.includes('panna_duel_game:2026-11-06') && (replaced.set['panna_duel_game:2026-11-03'] as { from: string }).from === 'file');
  check('replace: help and settings are the backup\'s', (replaced.set.panna_duel_help as { earned: { hint: number } }).earned.hint === 5 && (replaced.set.panna_duel_settings as { sound: boolean }).sound === false);
  check('replace never removes a key it also writes', !replaced.remove.some(k => k in replaced.set));
}

if (failures) { console.error(`\n${failures} backup check(s) failed.`); process.exit(1); }
console.log('\nBackup checks passed.');
