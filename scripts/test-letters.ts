// Checks letter and page helpers (src/lib/letters.ts). Usage: npx tsx scripts/test-letters.ts
import { LETTERS, letterForPage, letterAtOffset, nearestAvailable, railLetter, markedPages, parsePageInput } from '../src/lib/letters';

let failures = 0;
function check(label: string, ok: boolean, detail?: unknown) {
  if (ok) console.log(`✓ ${label}`);
  else { failures++; console.error(`✗ ${label}${detail !== undefined ? ` — ${JSON.stringify(detail)}` : ''}`); }
}

const idx = { A: 1, B: 200, C: 380, M: 1612, Z: 3120 };
check('LETTERS is A..Z', LETTERS.length === 26 && LETTERS[0] === 'A' && LETTERS[25] === 'Z');

check('page 1 is A', letterForPage(1, idx) === 'A');
check('page 199 is A', letterForPage(199, idx) === 'A');
check('page 200 is B', letterForPage(200, idx) === 'B');
check('page 1700 is M', letterForPage(1700, idx) === 'M');
check('page 3127 is Z', letterForPage(3127, idx) === 'Z');
check('page 0 is null', letterForPage(0, idx) === null);

check('top is A', letterAtOffset(0, 0, 260) === 'A');
check('bottom edge is Z', letterAtOffset(260, 0, 260) === 'Z');
check('middle is N', letterAtOffset(130, 0, 260) === 'N');
check('above the top is A', letterAtOffset(-50, 0, 260) === 'A');
check('below the bottom is Z', letterAtOffset(999, 0, 260) === 'Z');
check('offset top respected', letterAtOffset(330, 200, 260) === 'N');

check('D goes forward to M', nearestAvailable('D', idx) === 'M');
check('D goes back to C', nearestAvailable('D', idx, -1) === 'C');
check('B stays B', nearestAvailable('B', idx) === 'B');
check('nothing forward of Z+1 is null', nearestAvailable('Z', { A: 1 }) === null);

// The rail skipping a missing letter (no X): moving down onto X goes on to Y, moving up onto it goes back to W, and a
// thumb resting on X (raw X again and again) stays put rather than swapping between W and Y.
const noX = Object.fromEntries(LETTERS.filter(l => l !== 'X').map((l, i) => [l, i * 100 + 1]));
const down = railLetter('X', 'W', 1, noX);
check('down onto missing X gives Y', down.letter === 'Y' && down.dir === 1, down);
const rest = railLetter('X', 'X', down.dir, noX);
check('resting on X stays Y', rest.letter === 'Y' && rest.dir === 1, rest);
const up = railLetter('X', 'Y', 1, noX);
check('up onto missing X gives W', up.letter === 'W' && up.dir === -1, up);
check('resting there stays W', railLetter('X', 'X', up.dir, noX).letter === 'W');
check('first touch on X (no previous) gives Y', railLetter('X', null, 1, noX).letter === 'Y');
check('no letter after Z: falls back', railLetter('Z', 'Y', 1, { A: 1, Y: 50 }).letter === 'Y');

const marks = markedPages({
  ribbons: [10, 20],
  dogEars: [30],
  notes: [{ page_number: 40 }, { page_number: 10 }],
}, 25);
check('one chip per page, in page order', marks.map(m => m.page).join() === '10,20,30,40', marks);
check('page 10 is a note (note > ribbon)', marks[0]?.kind === 'note', marks);
check('ribbon 20, dog-ear 30', marks[1]?.kind === 'ribbon' && marks[2]?.kind === 'dog-ear', marks);
// Stored out of page order: the order doesn't matter.
check('stored order ignored', markedPages({ ribbons: [90, 5, 50], dogEars: [], notes: [] }, 1).map(m => m.page).join() === '5,50,90');
const many = markedPages({ ribbons: Array.from({ length: 20 }, (_, i) => (i + 1) * 10), dogEars: [], notes: [] }, 100);
check('capped at max', many.length === 8, many);
check('the 8 nearest the current page', many.map(m => m.page).join() === '60,70,80,90,100,110,120,130', many);

check("'007' is 7", parsePageInput('007', 3127) === 7);
check("'3127' is 3127", parsePageInput('3127', 3127) === 3127);
for (const bad of ['3128', '0', '-5', '', 'abc', '12.5']) check(`'${bad}' is null`, parsePageInput(bad, 3127) === null);
check("' 42 ' is 42", parsePageInput(' 42 ', 3127) === 42);

if (failures) { console.error(`\n${failures} check(s) failed`); process.exit(1); }
console.log('\nAll checks passed');
