import { buildCatalog } from './paginate';

console.log("Running pagination stability & collation tests...");

// Run 1
const run1 = buildCatalog();
// Run 2
const run2 = buildCatalog();

// Invariant 1: Identity stability across independent runs
const json1 = JSON.stringify(run1);
const json2 = JSON.stringify(run2);

if (json1 !== json2) {
  console.error("FAIL: Pagination is non-deterministic between runs!");
  process.exit(1);
}
console.log("✓ Invariant 1 Passed: Exact bitwise pagination stability across runs.");

// Invariant 2: Collation ordering
const collator = new Intl.Collator('en', { sensitivity: 'base' });
for (const [pageNum, page] of Object.entries(run1.pages)) {
  const allEntries = [...page.column1, ...page.column2];
  for (let i = 0; i < allEntries.length - 1; i++) {
    const current = allEntries[i].headword;
    const next = allEntries[i + 1].headword;
    if (collator.compare(current, next) > 0) {
      console.error(`FAIL: Collation error on Page ${pageNum}: "${current}" comes after "${next}"`);
      process.exit(1);
    }
  }
}
console.log("✓ Invariant 2 Passed: Strict alphabetical collation within all pages.");

// Invariant 3: Anchor integrity for design mockups
const p92 = run1.pages[92];
const p93 = run1.pages[93];
if (!p92 || !p93) {
  console.error("FAIL: Pages 92 and 93 are missing!");
  process.exit(1);
}

const p92Words = [...p92.column1, ...p92.column2].map(e => e.headword);
const expectedP92 = ["Cellar", "Cement", "Census", "Centre", "Century", "Ceramic", "Ceremony", "Certain"];
for (const expected of expectedP92) {
  if (!p92Words.includes(expected)) {
    console.error(`FAIL: Expected "${expected}" on Page 92, but found: ${p92Words.join(', ')}`);
    process.exit(1);
  }
}
console.log("✓ Invariant 3 Passed: Anchor Page 92 matches Main.dc.html mock exact words.");

console.log("All pagination stability tests passed!");
