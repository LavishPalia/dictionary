import { findWord, validateExample, toExampleDbRows, type ExampleRequest, type ExampleRow } from './lib/examples';

let failed = 0;
function check(label: string, ok: boolean, detail?: string) {
  console.log(`${ok ? '✓' : '✗'} ${label}${!ok && detail ? ` (${detail})` : ''}`);
  if (!ok) failed++;
}
const j = (v: unknown) => JSON.stringify(v);

const a = findWord('The ceremony was postponed because of rain.', 'postponed', []);
check('exact match', j(a) === j({ start: 17, length: 9, exact: true }), j(a));
const b = findWord('She postpones every meeting.', 'postpone', ['postpones', 'postponed']);
check('form match', j(b) === j({ start: 4, length: 9, exact: false }), j(b));
const c = findWord('Start the art class now.', 'art', []);
check('whole word only', c?.start === 10, j(c));
check('twice -> null', findWord('Abandon the plan and abandon hope.', 'abandon', []) === null);
check('headword plus form counted together', findWord('He postpones what she postponed.', 'postpone', ['postpones', 'postponed']) === null);
const d = findWord('Abandon the old plan.', 'abandon', []);
check('case-insensitive at start', j(d) === j({ start: 0, length: 7, exact: true }), j(d));
check('missing -> null', findWord('Nothing here.', 'abandon', []) === null);
const e = findWord('It is a well-known fact.', 'well-known', []);
check('hyphenated word', j(e) === j({ start: 8, length: 10, exact: true }), j(e));
const f = findWord("It is nine o'clock now.", "o'clock", []);
check('apostrophe word', j(f) === j({ start: 11, length: 7, exact: true }), j(f));
check('regex chars are escaped', findWord('Is it a.b here?', 'a.b', []) !== null && findWord('Is it axb here?', 'a.b', []) === null);
check('multi-word headword', findWord('They ice cream daily, ok.', 'ice cream', [])?.start === 5);

const req: ExampleRequest = { headword: 'postponed', normalized: 'postponed', pos: 'verb', definition_en: 'delayed', meaning_hi: 'स्थगित', forms: [] };
const ok = { headword: 'postponed', example_en: 'The ceremony was postponed because of rain.', example_hi: 'बारिश की वजह से समारोह स्थगित कर दिया गया।' };
check('accepts valid example', validateExample(req, ok) === null, String(validateExample(req, ok)));
const bad = (label: string, patch: Partial<typeof ok>) => {
  const r = validateExample(req, { ...ok, ...patch });
  check(`rejects ${label}`, typeof r === 'string' && r.length > 0, String(r));
};
bad('missing word', { example_en: 'The ceremony was cancelled because of rain.' });
bad('over 100 chars', { example_en: 'The ceremony was postponed because of rain ' + 'and more '.repeat(8) + 'today.' });
bad('too short', { example_en: 'It was postponed.' });
bad('Devanagari in English', { example_en: 'The ceremony was postponed because of बारिश.' });
bad('Urdu letters in Hindi', { example_hi: 'समारोह زور स्थगित हुआ।' });
bad('empty Hindi', { example_hi: '   ' });
bad('Hindi over 120 chars', { example_hi: 'क'.repeat(121) });
bad('Latin in Hindi', { example_hi: 'समारोह postponed हुआ।' });
bad('no terminal punctuation', { example_en: 'The ceremony was postponed because of rain' });

bad('5 words', { example_en: 'The ceremony was postponed yesterday.' });
bad('17 words', { example_en: 'The ceremony was postponed because it rained so hard that the guests could not reach the hall.' });
check('17-word fixture is 17 words', 'The ceremony was postponed because it rained so hard that the guests could not reach the hall.'.split(' ').length === 17);
const wc = (en: string) => validateExample(req, { ...ok, example_en: en });
check('accepts 6 words', wc('The ceremony was postponed again today.') === null, String(wc('The ceremony was postponed again today.')));
const sixteen = 'The ceremony was postponed because it rained so hard that the guests stayed home all day.';
check('accepts 16 words', wc(sixteen) === null && sixteen.split(' ').length === 16, String(wc(sixteen)));

// toExampleDbRows: rows -> validated DB rows
const book = new Map([['ceremony', { id: 'id-ceremony' }], ['abandon', { id: 'id-abandon' }]]);
const row = (o: Partial<ExampleRow>): ExampleRow => ({ normalized: 'ceremony', en: 'The ceremony was postponed because of rain.', hi: 'समारोह स्थगित हुआ।', start: 4, length: 8, exact: true, model: 'm', ...o });
const good = toExampleDbRows([row({})], book);
check('loader maps a good row', j(good) === j([{ entry_id: 'id-ceremony', en: 'The ceremony was postponed because of rain.', hi: 'समारोह स्थगित हुआ।', blank_start: 4, blank_len: 8, exact: 1 }]), j(good));
check('loader stores inexact as 0', toExampleDbRows([row({ exact: false })], book)[0]?.exact === 0);
check('loader skips a word not in the book', toExampleDbRows([row({ normalized: 'zzz' })], book).length === 0);
check('loader skips a blank past the end', toExampleDbRows([row({ start: 40, length: 8 })], book).length === 0);
check('loader skips a negative start', toExampleDbRows([row({ start: -1 })], book).length === 0);
check('loader skips a zero length', toExampleDbRows([row({ length: 0 })], book).length === 0);
check('loader skips a fractional span', toExampleDbRows([row({ start: 4.5 })], book).length === 0);
check('loader skips an exact row whose span is not the word', toExampleDbRows([row({ start: 0, length: 3 })], book).length === 0);
check('loader keeps the first of two rows for a word', toExampleDbRows([row({}), row({ hi: 'दूसरा।' })], book).length === 1);
check('loader skips empty text', toExampleDbRows([row({ hi: ' ' })], book).length === 0);
if (failed) { console.error(`${failed} check(s) failed.`); process.exit(1); }
console.log('Example checks passed.');
