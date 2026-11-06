// The scoring speed the player chose: how much each word's motion is scaled.
import { SCORING, scoringScale } from '../src/duel/ui/fx/timings';

let failures = 0, total = 0;
function check(label: string, ok: boolean, detail?: unknown) {
  total++;
  if (ok) console.log(`✓ ${label}`);
  else { failures++; console.error(`✗ ${label}${detail !== undefined ? ` — ${JSON.stringify(detail)}` : ''}`); }
}
const close = (a: number, b: number) => Math.abs(a - b) < 1e-4;

check('the game plays at the chosen speed: half, much quicker each word', SCORING.pace === 0.5 && SCORING.ramp === 0.7, SCORING);
check('the tiles play at half speed', scoringScale(0) === 0.5);
check('the first word is quicker', close(scoringScale(1), 0.35));
check('and it stays readable however many words', scoringScale(20) === 0.35);

const s = { pace: 0.65, ramp: 0.85 };
check('each next word is quicker', close(scoringScale(0, s), 0.65) && close(scoringScale(1, s), 0.5525) && close(scoringScale(2, s), 0.4696));
check('at 100 %, every word plays at full length', [0, 1, 5].every(i => scoringScale(i, { pace: 1, ramp: 1 }) === 1));

if (failures) { console.error(`\n${failures} failed`); process.exit(1); }
console.log(`\nDuel pace: ${total}/${total} checks passed.`);
