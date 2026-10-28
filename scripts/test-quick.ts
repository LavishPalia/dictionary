import { quickText } from '../src/lib/quick';

let failures = 0;
function check(label: string, ok: boolean, detail = '') {
  console.log(`${ok ? '✓' : '✗'} ${label}${!ok && detail ? ` — ${detail}` : ''}`);
  if (!ok) failures++;
}

const ob = quickText('obfuscate');
check('word starts with headword (pos', ob.startsWith('obfuscate ('), ob);
check('word line 2 is Devanagari', /[ऀ-ॿ]/.test(ob.split('\n')[1] ?? ''), ob);
const cer = quickText('ceremonies');
check('form shows arrow', cer.startsWith('ceremonies → Ceremony ('), cer);
const sen = quickText('The government tried to obfuscate the facts about the budget.');
check('sentence leads with rarest word', sen.startsWith('obfuscate'), sen);
const nf = quickText('zzxqv');
check('not found message', nf.includes("isn't in Panna"), nf);
check('not found has curly quotes', nf.startsWith('“zzxqv” isn\'t in Panna.'), nf);
const near = quickText('exacerbat');
check('near spelling lists Closest', near.includes('Closest: exacerbate'), near);
const hi = quickText('प्यार');
const hiLines = hi.split('\n');
check('Hindi gives 1-3 word – हिंदी lines', hiLines.length >= 1 && hiLines.length <= 3 && hiLines.every((l) => / – /.test(l)), hi);
check('empty message', quickText('') === 'Select a word or sentence first.');
check('link message', quickText('https://x.com') === 'Share a word or sentence, not a link.');
check('no words message', quickText('1234 5678') === 'None of these words are in Panna.', quickText('1234 5678'));

const samples = [ob, cer, sen, nf, near, hi, quickText('the'), quickText('government'), quickText('x '.repeat(1500)),
  quickText(Array.from({ length: 40 }, () => 'obfuscate').join(' ')), quickText('pyar')];
check('all results <= 600 chars', samples.every((s) => s.length <= 600), samples.map((s) => s.length).join());
check('no emoji', samples.every((s) => !/\p{Extended_Pictographic}/u.test(s)));

if (failures) {
  console.error(`\n${failures} check(s) failed.`);
  process.exit(1);
}
console.log('\nAll quick checks passed.');
