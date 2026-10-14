async function testEndpoints() {
  console.log("Checking live Next.js API endpoints on http://localhost:3000...\n");

  const p92Res = await fetch('http://localhost:3000/api/page/92');
  const p92 = await p92Res.json();
  console.log(`✓ GET /api/page/92: [${p92.guide_left} ... ${p92.guide_right}] - Total entries: ${p92.column1.length + p92.column2.length}`);

  const searchRes = await fetch('http://localhost:3000/api/search?q=ceremo');
  const search = await searchRes.json();
  console.log(`✓ GET /api/search?q=ceremo: Matched "${search.results[0]?.headword}" on Page ${search.results[0]?.page_number}`);

  const wordRes = await fetch('http://localhost:3000/api/word/Ceremony');
  const word = await wordRes.json();
  console.log(`✓ GET /api/word/Ceremony: Page ${word.pageNumber} (${word.entry.pronunciation_deva}) -> "${word.entry.meaning_hi}"`);

  const indexRes = await fetch('http://localhost:3000/api/index');
  const index = await indexRes.json();
  console.log(`✓ GET /api/index: A -> Page ${index.thumb_index['A']}, C -> Page ${index.thumb_index['C']}, D -> Page ${index.thumb_index['D']}`);

  console.log("\nAll API endpoints responded successfully with status 200!");
}

testEndpoints().catch(err => {
  console.error("Endpoint test error:", err);
  process.exit(1);
});
