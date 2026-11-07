// Checks the desk scene's pure parts (src/lib/desk.ts): the lamp's geometry and what a device remembers.
// Usage: npx tsx scripts/test-desk.ts
import { aimToScene, clampScene, DEFAULT_AIM, lampGeometry, parseDesk, sceneToAim, SCENE_H, SCENE_W } from '../src/lib/desk';

let checks = 0, failures = 0;
function check(label: string, ok: boolean, detail?: unknown) {
  checks++;
  if (ok) console.log(`✓ ${label}`);
  else { failures++; console.error(`✗ ${label}${detail !== undefined ? ` — ${JSON.stringify(detail)}` : ''}`); }
}

check('the scene is 940 × 400', SCENE_W === 940 && SCENE_H === 400);
const far = lampGeometry({ x: 2000, y: 2000 }), near = lampGeometry({ x: -2000, y: -2000 });
check('the shade’s pivot stays within its reach (x 130–205, y 45–100)', far.px === 205 && far.py === 100 && near.px === 130 && near.py === 45, { far, near });
check('the shade never reaches the book (its cloth starts at x 288)', [0, 0.5, 1].every((fy) => [0, 0.5, 1].every((fx) => lampGeometry({ x: fx * 940, y: fy * 400 }).px + 74 + 8 < 288)));
const mid = lampGeometry(aimToScene(DEFAULT_AIM));
check('the pivot leans toward the aim', lampGeometry({ x: 800, y: 200 }).px > mid.px && lampGeometry({ x: 300, y: 200 }).px < mid.px);
check('the shade points at the aim', Math.abs(Math.atan2(200 - mid.py, 0.53 * 940 - mid.px) - mid.ang) < 0.05, mid);
check('the mouth is 66 units along the shade', Math.abs(Math.hypot(mid.mx - mid.px, mid.my - mid.py) - 66) < 1e-9);
check('the pool is never smaller than 90', lampGeometry({ x: 230, y: 100 }).r === 90 && mid.r >= 90);
check('the pool grows with distance', lampGeometry({ x: 800, y: 360 }).r > mid.r);

check('aim fractions round-trip through scene units', JSON.stringify(sceneToAim(aimToScene({ x: 0.25, y: 0.75 }))) === JSON.stringify({ x: 0.25, y: 0.75 }));
check('a dragged aim stays inside the scene', JSON.stringify(clampScene({ x: -50, y: 900 })) === JSON.stringify({ x: 20, y: 388 }) && JSON.stringify(clampScene({ x: 2000, y: 0 })) === JSON.stringify({ x: 920, y: 40 }));

check('stored junk reads as nothing', JSON.stringify(parseDesk('x')) === '{}' && JSON.stringify(parseDesk(null)) === '{}' && JSON.stringify(parseDesk([1])) === '{}');
check('a valid state reads back', JSON.stringify(parseDesk({ aim: { x: 0.5, y: 0.2 }, light: 'A', noted: true })) === JSON.stringify({ aim: { x: 0.5, y: 0.2 }, light: 'A', noted: true }));
check('an aim outside 0–1 or not numbers is dropped', parseDesk({ aim: { x: 1.5, y: 0.2 } }).aim === undefined && parseDesk({ aim: { x: '0.5', y: 0.2 } }).aim === undefined);
check('an unknown light version is dropped', parseDesk({ light: 'C' }).light === undefined);
check('noted must be true to count', parseDesk({ noted: 'yes' }).noted === undefined);

console.log(`\nDesk: ${checks - failures}/${checks} checks passed.`);
if (failures) process.exit(1);
