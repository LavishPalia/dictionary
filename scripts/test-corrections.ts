// Checks the hand-made corrections layer (scripts/lib/corrections.ts) and the real data/sources/corrections.jsonl.
// Usage: npx tsx scripts/test-corrections.ts
import { applyEntryCorrections, correctExamples, loadCorrections, validateCorrection, type Correction } from './lib/corrections';
import type { ExampleRow } from './lib/examples';

let failures = 0;
function check(label: string, ok: boolean, detail?: unknown) {
  if (ok) console.log(`✓ ${label}`);
  else { failures++; console.error(`✗ ${label}${detail !== undefined ? ` — ${JSON.stringify(detail)}` : ''}`); }
}
const throws = (f: () => unknown) => { try { f(); return false; } catch { return true; } };

const base = {
  headword: 'trust', normalized: 'trust', pos: 'v. i.', pronunciation_deva: 'ट्रस्ट', definition_en: 'to have faith in.',
  meaning_hi: 'भरोसा करना', source: 'Panna machine-assisted from Princeton WordNet 3.1', license_attribution: 'x', reviewed: 0 as const,
};

// Field fixes keep everything else, including the source.
let merged = new Map([['trust', { ...base }]]);
let result = applyEntryCorrections(merged, [{ normalized: 'trust', note: 'takes an object', entry: { pos: 'v. t.' } }]);
check('a field fix changes only that field', merged.get('trust')!.pos === 'v. t.' && merged.get('trust')!.definition_en === base.definition_en);
check('a field fix keeps the source', merged.get('trust')!.source === base.source);
check('the result lists the changed word', result.changed.join() === 'trust' && result.added.length === 0, result);

// Added words become full, unreviewed entries.
const add: Correction = { normalized: 'sundown', note: 'missing from the book', add: true, entry: {
  headword: 'sundown', pos: 'n.', pronunciation_deva: 'सनडाउन', definition_en: 'the time in the evening when the sun goes down.', meaning_hi: 'सूर्यास्त, शाम' } };
merged = new Map();
result = applyEntryCorrections(merged, [add]);
const sd = merged.get('sundown');
check('an added word becomes an entry', !!sd && sd.headword === 'sundown' && sd.reviewed === 0 && result.added.join() === 'sundown', sd);
check('an added word says it was written by hand and is not yet reviewed', !!sd && /correction/i.test(sd.source) && /not yet/i.test(sd.license_attribution), sd);

// Mistakes are build errors, not silent skips.
check('fixing a word that is not in the book fails', throws(() => applyEntryCorrections(new Map(), [{ normalized: 'zzz', note: 'x', entry: { pos: 'n.' } }])));
check('adding a word already in the book fails', throws(() => applyEntryCorrections(new Map([['trust', { ...base }]]), [{ ...add, normalized: 'trust', entry: { ...add.entry, headword: 'trust' } }])));
check('an unknown POS label fails', validateCorrection({ normalized: 'trust', note: 'x', entry: { pos: 'verb' } }) !== null);
check('a definition over 140 characters fails', validateCorrection({ normalized: 'trust', note: 'x', entry: { definition_en: `${'a'.repeat(141)}.` } }) !== null);
check('Hindi with Latin letters fails', validateCorrection({ normalized: 'trust', note: 'x', entry: { meaning_hi: 'भरोसा trust' } }) !== null);
check('an added word missing a field fails', validateCorrection({ ...add, entry: { ...add.entry, meaning_hi: undefined } }) !== null);
check('a correction without a note fails', validateCorrection({ normalized: 'trust', note: '', entry: { pos: 'v. t.' } }) !== null);

// Example fixes replace the generated row and work out the blank.
const generated: ExampleRow[] = [{ normalized: 'crash', en: 'The red car made a loud noise and did crash.', hi: 'पुराना', start: 38, length: 5, exact: true, model: 'gemini' }];
const fixed = correctExamples(generated, [{ normalized: 'crash', note: 'awkward', example: { en: 'Drive slowly, or the car might crash into the wall.', hi: 'धीरे चलाओ, वरना गाड़ी दीवार से टकरा सकती है।' } }], new Map([['crash', ['crashes', 'crashed']]]));
check('an example fix replaces the generated sentence', fixed.length === 1 && fixed[0].en.startsWith('Drive slowly') && fixed[0].model === 'correction', fixed);
check('the blank is worked out from the sentence', fixed[0].en.slice(fixed[0].start, fixed[0].start + fixed[0].length) === 'crash' && fixed[0].exact, fixed[0]);
check('an example that does not contain the word fails', throws(() => correctExamples([], [{ normalized: 'crash', note: 'x', example: { en: 'The car hit the wall very hard today.', hi: 'गाड़ी दीवार से टकराई।' } }], new Map())));

// The real file.
const real = loadCorrections();
check('corrections.jsonl loads and every row is valid', real.length > 0 && real.every((c) => validateCorrection(c) === null), real.map((c) => [c.normalized, validateCorrection(c)]).filter(([, e]) => e));
check('each word is corrected at most once', new Set(real.map((c) => c.normalized)).size === real.length);

if (failures) { console.error(`\n${failures} correction check(s) failed`); process.exit(1); }
console.log('\nCorrection checks passed.');
