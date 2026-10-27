import { findWord, validateExample, type ExampleRequest } from './lib/examples';

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

if (failed) { console.error(`${failed} check(s) failed.`); process.exit(1); }
console.log('Example checks passed.');
