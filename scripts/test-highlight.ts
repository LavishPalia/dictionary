// Checks the search-result highlighter (src/lib/highlight.ts). Usage: npx tsx scripts/test-highlight.ts
import { splitMatch } from '../src/lib/highlight';

let failures = 0;
function expect(text: string, query: string, match: string) {
  const [, got] = splitMatch(text, query);
  if (got === match) console.log(`✓ "${query}" in "${text}" → "${got}"`);
  else { failures++; console.error(`✗ "${query}" in "${text}": expected "${match}", got "${got}"`); }
}

// English: case-insensitive, prefers a word start.
expect('Ceremony', 'cere', 'Cere');
expect('a large long-necked mammal', 'mammal', 'mammal');
expect('anger, or excitement', 'or', 'or'); // "or" inside "anger"? no: the whole word "or" wins
expect('Camel', 'zz', '');

// Hindi: the highlight covers the printed spelling even when the query used a variant.
expect('ऊँट', 'ऊंट', 'ऊँट'); // chandrabindu printed, anusvara typed
expect('अफ़सोस', 'अफसोस', 'अफ़सोस'); // nukta printed, none typed
expect('केन्द्र', 'केंद्र', 'केन्द्र'); // half nasal printed, anusvara typed
expect('त्याग देना, छोड़ना', 'छोड़', 'छोड़'); // prefix of a later meaning
expect('बेसहारा छोड़ देना', 'छोड', 'छोड़'); // nukta kept inside the highlight
expect('समारोह', 'समा', 'समा'); // whole letters only
expect('ऊपर, के ऊपर', 'ऊपर', 'ऊपर');
expect('कैमरा', 'क', 'कै'); // never splits a consonant from its vowel sign

if (failures) { console.error(`\n${failures} highlight check(s) failed.`); process.exit(1); }
console.log('\nHighlight checks passed.');
