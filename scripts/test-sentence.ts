import { cleanShared, tokenize, pickWord, capitalisedShare } from '../src/lib/sentence';

let failures = 0;
function check(label: string, ok: boolean, detail = '') {
  console.log(`${ok ? '✓' : '✗'} ${label}${!ok && detail ? ` — ${detail}` : ''}`);
  if (!ok) failures++;
}
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

// cleanShared
const c1 = cleanShared({ text: '"obfuscate the facts" https://ex.com/x', title: 'The Hindu' });
check('link stripped, title ignored', same(c1, { kind: 'text', text: '"obfuscate the facts"', truncated: false }), JSON.stringify(c1));
check('only a link in text is a link', cleanShared({ text: 'https://ex.com/a', url: 'https://ex.com/a' }).kind === 'link');
check('only a url is a link', cleanShared({ url: 'https://ex.com' }).kind === 'link');
check('nothing is empty', cleanShared({}).kind === 'empty');
check('blank text is empty', cleanShared({ text: '   ' }).kind === 'empty');
const long = Array.from({ length: 45 }, (_, i) => `w${i}`).join(' ');
const c2 = cleanShared({ text: long });
check('45 words cut to 40', c2.kind === 'text' && c2.truncated && c2.text.split(' ').length === 40, JSON.stringify(c2));
const c3 = cleanShared({ text: 'a\n\n  b\tc' });
check('whitespace collapsed', c3.kind === 'text' && c3.text === 'a b c');

// tokenize
const t1 = tokenize("The government's plan deepened.");
check('tokens join back', t1.map((t) => t.text).join('') === "The government's plan deepened.");
check('word keys', same(t1.filter((t) => t.key).map((t) => t.key), ['the', 'government', 'plan', 'deepened']));
check('no midCap at sentence start', t1.every((t) => !t.midCap));
const t2 = tokenize('We met Rose. Then Mark left');
const mc = (w: string) => t2.find((t) => t.text === w)!.midCap;
check('midCap names', mc('Rose') && mc('Mark') && !mc('We') && !mc('Then'));
check('WhatsApp markup', tokenize('Word of the day: *ubiquitous*').some((t) => t.key === 'ubiquitous'));
check('over-long word is not a word', tokenize('x'.repeat(101))[0].key === null);
check('curly apostrophe folded', tokenize('it’s Bob’s').filter((t) => t.key).map((t) => t.key).join() === 'it,bob');

// pickWord
const plan = { index: 0, key: 'plan', rank: 900, midCap: false };
const obf = { index: 2, key: 'obfuscate', rank: 23675, midCap: false };
check('rarest by rank', pickWord([plan, obf], 'rank', 0) === 2);
check('null rank beats 23675', pickWord([obf, { index: 5, key: 'zz', rank: null, midCap: false }], 'rank', 0) === 5);
const name = { index: 7, key: 'rose', rank: 30000, midCap: true };
check('midCap skipped at low share', pickWord([plan, name], 'rank', 0.2) === 0);
check('midCap allowed at high share', pickWord([plan, name], 'rank', 0.8) === 7);
check('only midCap: rarest midCap', pickWord([name, { index: 9, key: 'mark', rank: 100, midCap: true }], 'rank', 0) === 7);
check('length picks longest', pickWord([plan, obf], 'length', 0) === 2);
check('empty list is null', pickWord([], 'rank', 0) === null);
check('ties go to first', pickWord([{ ...plan, index: 1 }, { ...plan, index: 3 }], 'rank', 0) === 1);
check('shouting share is 1', capitalisedShare(tokenize('RBI HIKES REPO RATE')) === 1);

if (failures) { console.error(`\n${failures} sentence check(s) failed.`); process.exit(1); }
console.log('Sentence checks passed.');
