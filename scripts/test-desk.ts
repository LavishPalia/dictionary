// Checks the desk scene's pure parts (src/lib/desk.ts): the lamp's geometry and what a device remembers.
// Usage: npx tsx scripts/test-desk.ts
import { aimToScene, BOOK_DEFAULT_AIM, BOOK_REACH, bookLampFits, clampScene, DEFAULT_AIM, lampGeometry, parseDesk, PHONE_POOL, sceneToAim, SCENE_H, SCENE_W, TODAY_REACH, type LampReach } from '../src/lib/desk';

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

// ── the Book page's lamp: bookAim, a custom reach, and where the lamp fits ──
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
check('bookAim reads back like aim', same(parseDesk({ bookAim: { x: 0.25, y: 0.28 } }).bookAim, { x: 0.25, y: 0.28 }));
check('a bookAim outside 0–1 or not numbers is dropped', parseDesk({ bookAim: { x: 1.2, y: 0 } }).bookAim === undefined && parseDesk({ bookAim: { x: '0.5', y: '0.5' } }).bookAim === undefined);
const both = parseDesk({ aim: { x: 0.5, y: 0.5 }, bookAim: { x: 0.1, y: 0.1 } });
check('aim and bookAim are independent', same(both.aim, { x: 0.5, y: 0.5 }) && same(both.bookAim, { x: 0.1, y: 0.1 }));
check('the Book defaults', same(BOOK_DEFAULT_AIM, { x: 0.25, y: 0.28 }) && same(PHONE_POOL, { x: 0.45, y: 0.23 }));
check('lampGeometry(t) is lampGeometry(t, TODAY_REACH) on a grid', [0, 0.5, 1].every((fy) => [0, 0.5, 1].every((fx) => {
  const t = { x: fx * 940, y: fy * 400 };
  return same(lampGeometry(t), lampGeometry(t, TODAY_REACH));
})));
const reach: LampReach = { x: [-120, -40], y: [-80, -20], rest: { x: -80, y: -50 }, origin: { x: 0, y: 0 }, lean: 0.12, leanY: 0.08 };
const rf = lampGeometry({ x: 5000, y: 5000 }, reach), rn = lampGeometry({ x: -5000, y: -5000 }, reach);
check('a custom reach clamps the pivot', rf.px === -40 && rf.py === -20 && rn.px === -120 && rn.py === -80, { rf, rn });
const view = { w: 400, h: 300 }, spread = { left: 100, top: 100, right: 300, bottom: 200 };
check('a lamp inside the view and clear of the spread fits', bookLampFits({ left: 10, top: 10, right: 60, bottom: 90 }, [spread], view));
check('a lamp touching the spread does not fit', !bookLampFits({ left: 60, top: 120, right: 100, bottom: 160 }, [spread], view));
check('a lamp partly outside the view does not fit', !bookLampFits({ left: -5, top: 10, right: 40, bottom: 60 }, [spread], view) && !bookLampFits({ left: 350, top: 10, right: 410, bottom: 60 }, [spread], view));

// ── the Book page's reach: the shade (74 units along its angle, ± 38 across) never covers the spread or the left arrow ──
const shadeOf = (t: { x: number; y: number }) => {
  const g = lampGeometry(t, BOOK_REACH); const c = Math.cos(g.ang), s = Math.sin(g.ang);
  const pts = [0, 74].flatMap((a) => [-38, 38].map((k) => ({ x: g.px + a * c - k * s, y: g.py + a * s + k * c })));
  return { left: Math.min(...pts.map((p) => p.x)), right: Math.max(...pts.map((p) => p.x)), top: Math.min(...pts.map((p) => p.y)), bottom: Math.max(...pts.map((p) => p.y)) };
};
type Box = { left: number; right: number; top: number; bottom: number };
const hits = (b: Box, r: Box) => b.left <= r.right && b.right >= r.left && b.top <= r.bottom && b.bottom >= r.top;
const SPREAD_Q = { left: 0, top: 0, right: Infinity, bottom: Infinity }, LEFT_ARROW = { left: -52, top: 288, right: -12, bottom: 352 };
const aims = [[0, 0], [1120, 0], [0, 640], [1120, 640], [BOOK_DEFAULT_AIM.x * 1120, BOOK_DEFAULT_AIM.y * 640]].map(([x, y]) => ({ x, y }));
const bad = aims.map((t) => ({ t, b: shadeOf(t) })).filter(({ b }) => hits(b, SPREAD_Q) || hits(b, LEFT_ARROW));
check('the Book lamp’s shade stays off the spread and the left arrow at every corner', Boolean(BOOK_REACH) && bad.length === 0, bad);
const g0 = BOOK_REACH && lampGeometry({ x: 280, y: 179 }, BOOK_REACH);
check('the Book lamp’s light comes from the left of the spread and slants down-right', Boolean(g0) && g0.px < 0 && g0.mx < 0 && g0.ang > 0 && g0.ang < Math.PI / 2, g0);

console.log(`\nDesk: ${checks - failures}/${checks} checks passed.`);
if (failures) process.exit(1);
