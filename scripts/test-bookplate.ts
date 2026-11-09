// The bookplate, the pure parts (src/lib/bookplate.ts) and its trip through a backup (src/lib/backup.ts).
// The browser side (the offer, the sheet, the tick sending and taking back the name) is test-bookplate-browser.mjs.
// Usage: npx tsx scripts/test-bookplate.ts
import {
  cleanName, DEFAULT_EMBLEM, EMBLEMS, greetingFor, initialOf, isDevanagari, limitName, NAME_MAX, nameLength,
  offerBookplate, personName, readBookplate,
} from '../src/lib/bookplate';
import { createBackup, parseBackup, restoreData, type BackupData } from '../src/lib/backup';

let checks = 0, failures = 0;
function check(label: string, ok: boolean, detail?: unknown) {
  checks++;
  if (ok) console.log(`✓ ${label}`);
  else { failures++; console.error(`✗ ${label}${detail !== undefined ? ` — ${JSON.stringify(detail)}` : ''}`); }
}
const eq = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

// ── Names ──
check('eight emblems', EMBLEMS.length === 8 && new Set(EMBLEMS).size === 8);
check('a name is cut at 30 characters', nameLength(limitName('a'.repeat(40))) === NAME_MAX);
const hindi = 'रिया शर्मा';
check('a Hindi name keeps every character (combining marks included)', limitName(hindi) === hindi && nameLength(hindi) === Array.from(hindi).length);
check('a long Hindi name is cut at 30 code points, never mid-surrogate', nameLength(limitName('क्षत्रिय'.repeat(6))) === NAME_MAX);
check('an emoji counts as one character', nameLength('Riya 🌸') === 6 && limitName('🌸'.repeat(40)) === '🌸'.repeat(30));
check('control characters and line breaks are dropped', limitName('Ri\u0000ya\n ') === 'Riya', limitName('Ri\u0000ya\n '));
check('the stored name is trimmed and its spaces closed up', cleanName('  Riya   Sharma  ') === 'Riya Sharma');
check('spaces alone are no name', cleanName('   ') === '');
check('the initial is a capital', initialOf('riya') === 'R' && initialOf('  ankit') === 'A');
check('a Hindi initial is its first letter', initialOf('रिया') === 'र');
check('Devanagari is told apart', isDevanagari('रिया') && !isDevanagari('Riya'));

// ── Reading the stored plate ──
check('no plate: null', readBookplate({}) === null && readBookplate(null) === null && readBookplate({ bookplate: 'x' }) === null);
check('a plate with an empty name is no plate', readBookplate({ bookplate: { name: '  ', emblem: 'owl', share: true } }) === null);
check('a stored plate reads back', eq(readBookplate({ bookplate: { name: 'Riya', emblem: 'owl', share: true } }), { name: 'Riya', emblem: 'owl', share: true }));
check('an unknown emblem becomes the lotus', readBookplate({ bookplate: { name: 'Riya', emblem: 'dragon' } })?.emblem === DEFAULT_EMBLEM);
check('the initial is an emblem choice', readBookplate({ bookplate: { name: 'Riya', emblem: 'initial' } })?.emblem === 'initial');
check('share is true only when stored as true', readBookplate({ bookplate: { name: 'Riya', emblem: 'owl', share: 'yes' } })?.share === false);
check('a stored name too long or untrimmed is cleaned', readBookplate({ bookplate: { name: ` ${'b'.repeat(50)} `, emblem: 'owl' } })?.name === 'b'.repeat(30));

// ── The name PostHog sees ──
const plate = { name: 'Riya', emblem: 'lotus' as const, share: true };
check('ticked: "Riya · Indigo Owl 3f2"', personName('Indigo Owl 3f2', plate, true) === 'Riya · Indigo Owl 3f2');
check('unticked: the nickname', personName('Indigo Owl 3f2', { ...plate, share: false }, true) === 'Indigo Owl 3f2');
check('Usage counts off: the nickname', personName('Indigo Owl 3f2', plate, false) === 'Indigo Owl 3f2');
check('no plate: the nickname', personName('Indigo Owl 3f2', null, true) === 'Indigo Owl 3f2');

// ── Greeting and offer ──
check('morning, afternoon, evening by the clock', greetingFor(5) === 'Good morning' && greetingFor(11) === 'Good morning' && greetingFor(12) === 'Good afternoon'
  && greetingFor(16) === 'Good afternoon' && greetingFor(17) === 'Good evening' && greetingFor(23) === 'Good evening' && greetingFor(2) === 'Good evening');
const base = { savedWords: 1, plate: null, offerDone: false, welcomeShowing: false };
check('offered after the first saved word', offerBookplate(base));
check('not before any word is saved (so never on a first visit)', !offerBookplate({ ...base, savedWords: 0 }));
check('not after Not now', !offerBookplate({ ...base, offerDone: true }));
check('not once there is a plate', !offerBookplate({ ...base, plate }));
check('not beside the tour\'s welcome card', !offerBookplate({ ...base, welcomeShowing: true }));

// ── Backups ──
const book = { dataVersion: 'v1', totalPages: 95 };
const empty = (settings: Record<string, unknown>): BackupData => ({
  panna_saved_words: [], panna_review: {}, panna_bookmarks: [], panna_dog_ears: [], panna_marginalia: [], panna_settings: settings, panna_tours: {},
});
const phone = empty({ lighting: 'evening', bookplate: { name: 'रिया', emblem: 'initial', share: true }, bookplateOffer: 'done' });
const file = parseBackup(JSON.stringify(createBackup(phone, 'v1', new Date(2026, 10, 9))));
check('a backup with a bookplate reads back', file.ok);
if (file.ok) {
  const replaced = restoreData(empty({}), file.backup, 'replace', book).panna_settings;
  check('replace brings the plate back, unshared: the tick is asked for on each device', eq(readBookplate(replaced), { name: 'रिया', emblem: 'initial', share: false }) && (replaced as Record<string, unknown>).bookplateOffer === 'done', replaced);
  const off = restoreData(empty({ analytics: false }), file.backup, 'replace', book).panna_settings;
  check('replace on a device with Usage counts off: the plate comes, unshared', eq(readBookplate(off), { name: 'रिया', emblem: 'initial', share: false }) && (off as Record<string, unknown>).analytics === false, off);
  const merged = restoreData(empty({ lighting: 'day' }), file.backup, 'merge', book).panna_settings as Record<string, unknown>;
  check('merge onto a device with no plate: the plate comes, unshared, and this device keeps its settings', eq(readBookplate(merged), { name: 'रिया', emblem: 'initial', share: false }) && merged.lighting === 'day', merged);
  const mine = restoreData(empty({ bookplate: { name: 'Ankit', emblem: 'owl', share: false } }), file.backup, 'merge', book).panna_settings;
  check('merge keeps this device\'s own plate', readBookplate(mine)?.name === 'Ankit', mine);
  const fresh = restoreData({} as BackupData, file.backup, 'merge', book).panna_settings as Record<string, unknown>;
  check('merge onto a device with no settings at all takes the backup\'s, with the plate unshared', fresh.lighting === 'evening' && eq(readBookplate(fresh), { name: 'रिया', emblem: 'initial', share: false }), fresh);
  const offInFile = parseBackup(JSON.stringify(createBackup(empty({ analytics: false, bookplate: { name: 'Riya', emblem: 'owl', share: true } }), 'v1', new Date(2026, 10, 9))));
  if (offInFile.ok) {
    const out = restoreData(empty({}), offInFile.backup, 'replace', book).panna_settings as Record<string, unknown>;
    check('replace from a backup made with Usage counts off: the plate comes unshared', out.analytics === false && readBookplate(out)?.share === false, out);
  } else check('a backup made with counts off reads back', false, offInFile);
}

console.log(`\n${checks - failures}/${checks} checks passed`);
process.exit(failures ? 1 : 0);
