// Checks letter and page helpers (src/lib/letters.ts). Usage: npx tsx scripts/test-letters.ts
import { LETTERS, letterForPage, letterAtOffset, nearestAvailable, markedPages, parsePageInput } from '../src/lib/letters';

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

const marks = markedPages({
  ribbons: [10, 20],
  dogEars: [30],
  notes: [{ page_number: 40, created_at: 5 }, { page_number: 10, created_at: 9 }],
});
check('notes first, newest first', marks[0]?.page === 10 && marks[0].kind === 'note' && marks[1]?.page === 40 && marks[1].kind === 'note', marks);
check('page 10 appears once', marks.filter(m => m.page === 10).length === 1, marks);
check('then ribbon 20 and dog-ear 30', marks[2]?.page === 20 && marks[2].kind === 'ribbon' && marks[3]?.page === 30 && marks[3].kind === 'dog-ear', marks);
check('capped at max', markedPages({ ribbons: Array.from({ length: 20 }, (_, i) => i + 1), dogEars: [], notes: [] }).length === 8);

check("'007' is 7", parsePageInput('007', 3127) === 7);
check("'3127' is 3127", parsePageInput('3127', 3127) === 3127);
for (const bad of ['3128', '0', '-5', '', 'abc', '12.5']) check(`'${bad}' is null`, parsePageInput(bad, 3127) === null);
check("' 42 ' is 42", parsePageInput(' 42 ', 3127) === 42);

if (failures) { console.error(`\n${failures} check(s) failed`); process.exit(1); }
console.log('\nAll checks passed');
