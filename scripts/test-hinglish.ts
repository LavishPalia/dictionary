// Hinglish search: Hindi typed in English letters (src/lib/hinglish.ts and searchWords).
// Usage: npx tsx scripts/test-hinglish.ts   (after npm run build:data)
import { hinglishKey, romanize, spellingDistance } from '../src/lib/hinglish';
import { searchWords } from '../src/lib/book-data';

let failures = 0;
function check(label: string, ok: boolean, detail?: unknown) {
  if (ok) console.log(`✓ ${label}`);
  else { failures++; console.error(`✗ ${label}${detail !== undefined ? ` — ${JSON.stringify(detail)}` : ''}`); }
}

// Common ways of writing the same Hindi word all reach it.
const spellings: Array<[string, string[]]> = [
  ['छोड़ना', ['chhod', 'chod', 'chhor', 'chhodna', 'chorna']],
  ['पानी', ['pani', 'paani']],
  ['समझना', ['samajh', 'samajhna', 'samjhna']],
  ['हँसना', ['hasna', 'hansna']],
  ['अंदर', ['andar', 'adar']],
  ['खाना', ['khana', 'khaana']],
  ['पढ़ना', ['padhna', 'parhna', 'padna']],
  ['ज़मीन', ['zameen', 'jameen', 'zamin']],
  ['फूल', ['phool', 'fool', 'ful']],
  ['दूध', ['doodh', 'dudh']],
  ['शुरू', ['shuru', 'suru']],
  ['बैठना', ['baithna', 'bethna']],
  ['प्यार', ['pyar', 'pyaar']],
  ['ऊँट', ['oont', 'unt']],
  ['क़िस्मत', ['kismat', 'qismat']],
];
for (const [hindi, typed] of spellings) {
  const keys = romanize(hindi).map(hinglishKey);
  const missed = typed.filter((t) => !keys.some((k) => k.startsWith(hinglishKey(t))) || spellingDistance(t, hindi) === null);
  check(`${hindi}: ${typed.join(', ')}`, missed.length === 0, { keys, missed });
}
check('ड़ is offered both ways', romanize('छोड़ना').join() === 'chhodanaa,chhoranaa', romanize('छोड़ना'));
check('a final a is a real vowel: khana does not start कानून', spellingDistance('khana', 'कानून') === null);
check('typed aspirates break ties: baat is बात before भात, samajh is समझ before समाज',
  (spellingDistance('baat', 'बात', true) ?? 9) < (spellingDistance('baat', 'भात', true) ?? 9)
  && (spellingDistance('samajh', 'समझ', true) ?? 9) < (spellingDistance('samajh', 'समाज', true) ?? 9));
check('the closer spelling scores better: bada is बड़ा before बंद',
  (spellingDistance('bada', 'बड़ा') ?? 9) < (spellingDistance('bada', 'बंद') ?? 9));

// Search on the built book.
const top = (q: string) => searchWords(q);
const hing = (q: string) => top(q).filter((r) => r.match === 'hinglish');
// A verb typed as its stem (chhod) finds the verb, commonest first.
for (const q of ['chhod', 'chod', 'chhodna']) {
  const r = hing(q);
  check(`"${q}" finds छोड़ना (Leave, Quit)`, r.length >= 2 && r.slice(0, 2).every((x) => x.matched_hi === 'छोड़ना')
    && r.some((x) => x.headword.toLowerCase() === 'leave') && r.some((x) => x.headword === 'Quit'), r.map((x) => [x.headword, x.matched_hi]));
}
check('"chhor" finds छोर, which it spells exactly', hing('chhor')[0]?.matched_hi === 'छोर', hing('chhor').map((x) => x.matched_hi));
check('a typed chh means छ: "chhor" does not offer चोर', !hing('chhor').some((x) => x.matched_hi === 'चोर'));
check('ch may be छ: "chota" finds छोटा first', hing('chota')[0]?.matched_hi === 'छोटा', hing('chota').map((x) => x.matched_hi));
check('an exact word before a verb stem: "chor" offers चोर before छोड़ना', (() => { const r = hing('chor').map((x) => x.matched_hi); return r.includes('चोर') && (!r.includes('छोड़ना') || r.indexOf('चोर') < r.indexOf('छोड़ना')); })(), hing('chor').map((x) => x.matched_hi));
check('a short key finds a verb by its stem: "padh" finds Read', hing('padh')[0]?.headword === 'Read', hing('padh').map((x) => x.headword));
check('"kanoon" and "kanun" find Law', hing('kanoon')[0]?.headword === 'Law' && hing('kanun')[0]?.headword === 'Law');
check('"kitab" finds Book through किताब', hing('kitab')[0]?.headword === 'Book' && hing('kitab')[0]?.matched_hi === 'किताब');
check('"bada" puts बड़ा first', hing('bada')[0]?.matched_hi === 'बड़ा', hing('bada').map((x) => x.matched_hi));
check('"dil" finds Heart', hing('dil')[0]?.headword === 'Heart');
check('short keys need a whole match: "oont" finds only Camel', hing('oont').map((x) => x.headword).join() === 'Camel', hing('oont').map((x) => x.headword));
check('"khana" does not offer कानून', !hing('khana').some((x) => x.matched_hi === 'कानून'));
check('English words stay English: no Hinglish for "and", "band", "the"', ['and', 'band', 'the'].every((q) => hing(q).length === 0));
check('two letters are not enough', hing('ch').length === 0 && hing('pa').length === 0);
check('English results that start with the query keep their place first', top('unt')[0]?.match === 'headword' && hing('unt').length > 0);
check('Hinglish results come before typo suggestions', top('chhod').every((r) => r.match !== 'suggestion'));
check('at most four Hinglish results', ['ka', 'kar', 'pan', 'sam', 'man'].every((q) => hing(q).length <= 4));

if (failures) { console.error(`\n${failures} Hinglish check(s) failed.`); process.exit(1); }
console.log('Hinglish checks passed.');
