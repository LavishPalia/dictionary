// Checks search within Saved words (src/lib/saved-search.ts). Usage: npx tsx scripts/test-saved-search.ts
import { searchSaved } from '../src/lib/saved-search';

let failures = 0;
function check(label: string, ok: boolean, detail?: unknown) {
  if (ok) console.log(`✓ ${label}`);
  else { failures++; console.error(`✗ ${label}${detail !== undefined ? ` — ${JSON.stringify(detail)}` : ''}`); }
}

const words = [
  { headword: 'candid', meaning_hi: 'स्पष्टवादी' },
  { headword: 'love', meaning_hi: 'प्यार' },
  { headword: 'lovely', meaning_hi: 'सुंदर' },
  { headword: 'beloved', meaning_hi: 'प्रिय' },
  { headword: 'darling', meaning_hi: 'प्यारा, प्रिय' },
  { headword: 'glove', meaning_hi: 'दस्ताना' },
  { headword: 'water', meaning_hi: 'पानी' },
  { headword: 'leave', meaning_hi: 'छोड़ना' },
];
const names = (q: string) => searchSaved(words, q).map((h) => h.word.headword).join();

check('blank query finds nothing', searchSaved(words, '  ').length === 0);
check('prefix first, shorter first, then contains', names('lov') === 'love,lovely,beloved,glove', names('lov'));
check('one letter: prefix only', names('l') === 'love,leave,lovely', names('l'));
check('case and spaces ignored', names('  LOVE ') === 'love,lovely,beloved,glove', names('  LOVE '));
check('Hinglish pyaar → love and darling', names('pyaar') === 'love,darling', names('pyaar'));
check('Hinglish spelled loosely', names('pyar') === 'love,darling' && names('paani') === 'water' && names('pani') === 'water', [names('pyar'), names('pani')]);
check('Hinglish with ड़', names('chhodna') === 'leave' && names('chorna') === 'leave', [names('chhodna'), names('chorna')]);
check('Hindi text', names('प्या') === 'love,darling' && names('प्रिय') === 'beloved,darling', [names('प्या'), names('प्रिय')]);
check('no match', names('serendip') === '');

const love = searchSaved(words, 'lov')[0].mark;
check('headword mark', love.field === 'headword' && love.start === 0 && love.length === 3, love);
const glove = searchSaved(words, 'lov').find((h) => h.word.headword === 'glove')!.mark;
check('contains mark', glove.field === 'headword' && glove.start === 1, glove);
const darling = searchSaved(words, 'pyaar').find((h) => h.word.headword === 'darling')!.mark;
check('Hinglish marks the whole Hindi word', darling.field === 'hindi' && words[4].meaning_hi.substr(darling.start, darling.length) === 'प्यारा', darling);
const priy = searchSaved(words, 'प्रिय').find((h) => h.word.headword === 'darling')!.mark;
check('Hindi mark', priy.field === 'hindi' && words[4].meaning_hi.substr(priy.start, priy.length) === 'प्रिय', priy);

// Nukta letters, stored precomposed (U+095B) or as letter + ़, match typed with or without the nukta.
const nukta = [
  { headword: 'surely', meaning_hi: 'ज़रूर' },
  { headword: 'more', meaning_hi: 'ज़्यादा' },
  { headword: 'adore', meaning_hi: 'प्यार करना' },
  { headword: 'centre', meaning_hi: 'केन्द्र' },
];
const nk = (q: string) => searchSaved(nukta, q).map((h) => h.word.headword).join();
check('Hindi with or without nukta', nk('ज़रूर') === 'surely' && nk('जरूर') === 'surely' && nk('ज्यादा') === 'more' && nk('ज़्यादा') === 'more',
  [nk('ज़रूर'), nk('जरूर'), nk('ज्यादा'), nk('ज़्यादा')]);
const zarur = searchSaved(nukta, 'जरूर')[0].mark;
check('nukta match highlights the whole printed word', nukta[0].meaning_hi.substr(zarur.start, zarur.length) === 'ज़रूर', zarur);
check('half nasal folds like ं', nk('केंद्र') === 'centre', nk('केंद्र'));
check('Hinglish phrase', nk('pyaar karna') === 'adore' && nk('pyar kar') === 'adore', [nk('pyaar karna'), nk('pyar kar')]);
const phrase = searchSaved(nukta, 'pyaar karna')[0].mark;
check('phrase marks both Hindi words', nukta[2].meaning_hi.substr(phrase.start, phrase.length) === 'प्यार करना', phrase);

if (failures) { console.error(`\n${failures} failed`); process.exit(1); }
console.log('\nAll saved-search checks passed');
