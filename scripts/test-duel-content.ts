// Checks the Duel's puzzle pipeline and published content (scripts/duel, data/duel). Usage: npx tsx scripts/test-duel-content.ts
import { textProblem } from './duel/lib/clue-rules';
import { blocklist } from './duel/lib/db';
import { curated, LENGTHS, pictures, wordPool } from './duel/words';

let failures = 0;
function check(label: string, ok: boolean, detail?: unknown) {
  if (ok) console.log(`✓ ${label}`);
  else { failures++; console.error(`✗ ${label}${detail !== undefined ? ` — ${JSON.stringify(detail)}` : ''}`); }
}

// ---------- word pool, curated, pictures ----------
const pool = wordPool();
const poolWords = new Set(pool.map(w => w.word));
{
  const blocked = blocklist();
  const bad = pool.filter(w => !/^[a-z]+$/.test(w.word) || !LENGTHS.includes(w.len) || w.len !== w.word.length || blocked.has(w.word) || !w.sense.en.trim() || !w.sense.hi.trim());
  check('pool words are a–z, a board length, not blocked, with an en and hi sense', bad.length === 0, bad.slice(0, 5).map(w => w.word));
  check('pool has no duplicate words', poolWords.size === pool.length);
  check('pool is about 12k words', pool.length > 10000 && pool.length < 16000, pool.length);
  check('the family blocklist keeps PISS, SPANK, ANTHRAX, CIGARETTE out', ['piss', 'spank', 'anthrax', 'cigarette', 'snot', 'phallic'].every(w => !poolWords.has(w)));

  const cur = curated();
  check('curated has ≥ 180 entries', cur.length >= 180, cur.length);
  const curBad = cur.filter(c => !/^[a-z]{1,2}$/.test(c.answer) || !c.en.trim() || !c.hi.trim() || !c.clue.trim() || textProblem(c.answer, c.clue));
  check('every curated clue has en/hi and passes the text rules', curBad.length === 0, curBad.slice(0, 5).map(c => `${c.answer}: ${c.clue} (${textProblem(c.answer, c.clue)})`));
  const letters = new Set(cur.filter(c => c.answer.length === 1).map(c => c.answer));
  check('every letter A–Z has a curated one-letter clue', [...'abcdefghijklmnopqrstuvwxyz'].every(l => letters.has(l)), [...'abcdefghijklmnopqrstuvwxyz'].filter(l => !letters.has(l)));

  const pics = pictures();
  check('pictures have unique keys', new Set(pics.map(p => p.key)).size === pics.length);
  const notPool = pics.flatMap(p => p.words).filter(w => !poolWords.has(w));
  check('every picture word is in the pool', notPool.length === 0, notPool);
  const named = pics.flatMap(p => p.words.filter(w => textProblem(w, p.alt)).map(w => `${w}: ${p.alt}`));
  check('no picture alt names its word', named.length === 0, named);
}

if (failures) { console.error(`\n${failures} check(s) failed`); process.exit(1); }
console.log('\nall duel content checks passed');
