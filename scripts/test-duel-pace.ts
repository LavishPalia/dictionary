// The scoring speed: how much each word's motion is scaled, the flags that try other speeds, and the lab's made-up turns.
import { readdirSync, readFileSync } from 'node:fs';
import type { Puzzle } from '../src/duel/engine';
import { scoringScale } from '../src/duel/ui/fx/timings';
import { readFlags } from '../src/duel/ui/flags';
import { labTurn } from '../src/duel/ui/lab/lab-turn';

let failures = 0, total = 0;
function check(label: string, ok: boolean, detail?: unknown) {
  total++;
  if (ok) console.log(`✓ ${label}`);
  else { failures++; console.error(`✗ ${label}${detail !== undefined ? ` — ${JSON.stringify(detail)}` : ''}`); }
}
const close = (a: number, b: number) => Math.abs(a - b) < 1e-4;

const s = { pace: 0.65, ramp: 0.85 };
check('the first word plays at the chosen pace', close(scoringScale(0, s), 0.65));
check('each next word is quicker', close(scoringScale(1, s), 0.5525) && close(scoringScale(2, s), 0.4696));
check('never so quick it can\'t be read', scoringScale(20, s) === 0.35);
check('at 100 %, every word plays as it did', [0, 1, 5].every(i => scoringScale(i, { pace: 1, ramp: 1 }) === 1));

check('flags: a pace and a ramp', readFlags('?pace=0.65&ramp=0.85').pace === 0.65 && readFlags('?pace=0.65&ramp=0.85').ramp === 0.85);
check('flags: nonsense is ignored', [readFlags('?pace=9'), readFlags('?pace=x'), readFlags('?pace=0'), readFlags('')].every(f => f.pace === undefined));
check('flags: a pace doesn\'t turn on the test hook', readFlags('?pace=0.5').test === false);

const dir = 'data/duel/puzzles';
let bad: string[] = [];
for (const f of readdirSync(dir)) {
  const p = JSON.parse(readFileSync(`${dir}/${f}`, 'utf8')) as Puzzle;
  for (const [words, empty] of [[1, false], [3, false], [5, true]] as const) {
    const { state, events } = labTurn(p, words, empty);
    const judged = events.find(e => e.e === 'judged');
    const finished = events.filter(e => e.e === 'word');
    const tiles = judged?.e === 'judged' ? judged.tiles : [];
    const placed = new Set(tiles.map(t => t.cell));
    const problems = [
      finished.length !== Math.min(words, finished.length) && 'too many words',
      finished.length === 0 && 'no words',
      tiles.some(t => p.solution[t.cell] === undefined || state.filled[t.cell]) && 'a tile on a filled or non-letter cell',
      new Set(tiles.map(t => t.cell)).size !== tiles.length && 'two tiles on a cell',
      empty && !events.some(e => e.e === 'emptyHand') && 'no Empty hand',
      empty && tiles.length !== 5 && 'not a full hand',
      finished.some((e, i) => e.e === 'word' && i > 0 && (finished[i - 1] as { points: number }).points > e.points) && 'not shortest first',
      finished.some(e => e.e === 'word' && !p.slots.find(sl => sl.id === e.slot)?.cells.every(c => placed.has(c) || state.filled[c])) && 'a word not actually finished',
    ].filter(Boolean);
    if (problems.length) bad.push(`${f} ${words}: ${problems.join(', ')}`);
  }
}
check('the lab\'s turns work on every puzzle', bad.length === 0, bad.slice(0, 5));
const three = labTurn(JSON.parse(readFileSync(`${dir}/p0067.v1.json`, 'utf8')) as Puzzle, 3, false);
check('a 3-word turn finishes 3 words', three.events.filter(e => e.e === 'word').length === 3);

if (failures) { console.error(`\n${failures} failed`); process.exit(1); }
console.log(`\nDuel pace: ${total}/${total} checks passed.`);
