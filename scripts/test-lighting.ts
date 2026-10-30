// Checks the lighting logic (src/lib/lighting.ts): settings migration, the clock rule, and that the inline
// pre-paint script agrees with resolveLight. Usage: npx tsx scripts/test-lighting.ts
import { readLighting, isEveningAt, resolveLight, storedSettings, PRE_PAINT_SCRIPT, THEME_COLOR, EVENING_FROM, EVENING_UNTIL, type Lighting } from '../src/lib/lighting';

let checks = 0;
let failures = 0;
function check(label: string, ok: boolean, detail?: unknown) {
  checks++;
  if (ok) console.log(`✓ ${label}`);
  else { failures++; console.error(`✗ ${label}${detail !== undefined ? ` — ${JSON.stringify(detail)}` : ''}`); }
}

const at = (h: number, m = 0) => new Date(2026, 9, 30, h, m, 0);

// ── readLighting (migration) ──
check("{lighting:'day'} reads as day", readLighting({ lighting: 'day' }) === 'day');
check("{lighting:'evening'} reads as evening", readLighting({ lighting: 'evening' }) === 'evening');
check("{lighting:'auto', evening:true} reads as auto (lighting wins)", readLighting({ lighting: 'auto', evening: true }) === 'auto');
check('{evening:true} reads as evening', readLighting({ evening: true }) === 'evening');
check('{evening:false} reads as auto', readLighting({ evening: false }) === 'auto');
check('{} reads as auto', readLighting({}) === 'auto');
check('null reads as auto', readLighting(null) === 'auto');
check("'junk' reads as auto", readLighting('junk') === 'auto');
check("{lighting:'bogus', evening:true} reads as evening", readLighting({ lighting: 'bogus', evening: true }) === 'evening');

// ── storedSettings (what the app writes to panna_settings) ──
// Next to `lighting` it also writes the legacy `evening` key, so an old cached app (which reads and rewrites only
// `evening`) keeps a pinned Evening; readLighting still prefers `lighting`.
for (const lighting of ['auto', 'day', 'evening'] as Lighting[]) {
  const saved = storedSettings(lighting, { speed: 'brisk', sounds: false });
  check(`storedSettings('${lighting}') writes lighting, evening:${lighting === 'evening'}, speed and sounds`,
    JSON.stringify(saved) === JSON.stringify({ lighting, evening: lighting === 'evening', speed: 'brisk', sounds: false }), saved);
  check(`storedSettings('${lighting}') reads back as ${lighting}`, readLighting(JSON.parse(JSON.stringify(saved))) === lighting);
}
// An old app read {lighting:'evening', evening:true} as evening:true and rewrote only its own keys.
check('an old app rewriting a pinned Evening keeps Evening', readLighting({ evening: true, speed: 'realistic', sounds: true }) === 'evening');

// ── isEveningAt ──
check('constants: evening from 19 until 6', EVENING_FROM === 19 && EVENING_UNTIL === 6);
for (const [h, m, want] of [[18, 59, false], [19, 0, true], [23, 30, true], [5, 59, true], [6, 0, false], [12, 0, false]] as const) {
  check(`isEveningAt ${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')} is ${want}`, isEveningAt(at(h, m)) === want);
}

// ── resolveLight ──
check("'day' at 22:00 is day", resolveLight('day', at(22)) === 'day');
check("'evening' at 12:00 is evening", resolveLight('evening', at(12)) === 'evening');
check("'auto' at 20:00 is evening", resolveLight('auto', at(20)) === 'evening');
check("'auto' at 10:00 is day", resolveLight('auto', at(10)) === 'day');

// ── THEME_COLOR ──
check('theme colours', THEME_COLOR.day === '#2b1d14' && THEME_COLOR.evening === '#120a06', THEME_COLOR);

// ── PRE_PAINT_SCRIPT agrees with resolveLight ──
// Runs the script string against stubs: a document with <html> and a theme-color meta, a localStorage, and a Date
// fixed at the given hour.
function runScript(stored: string | null | 'THROW', hour: number) {
  const html = { dataset: {} as Record<string, string>, attrs: {} as Record<string, string>,
    setAttribute(k: string, v: string) { this.attrs[k] = v; if (k === 'data-light') this.dataset.light = v; } };
  const metas: { name: string; content: string; setAttribute(k: string, v: string): void }[] = [];
  const makeMeta = () => {
    const meta = { name: '', content: '', setAttribute(k: string, v: string) { (meta as Record<string, unknown>)[k] = v; } };
    return meta;
  };
  const head = { appendChild(el: (typeof metas)[number]) { metas.push(el); return el; } };
  const document = {
    documentElement: html,
    head,
    querySelector(sel: string) { return sel === 'meta[name="theme-color"]' ? metas.find((m) => m.name === 'theme-color') ?? null : null; },
    createElement(tag: string) { if (tag !== 'meta') throw new Error(`unexpected element ${tag}`); return makeMeta(); },
  };
  const localStorage = { getItem(key: string) { if (stored === 'THROW') throw new Error('SecurityError'); return key === 'panna_settings' ? stored : null; } };
  const RealDate = Date;
  const FixedDate = function (this: unknown, ...args: unknown[]) {
    return args.length ? new (RealDate as unknown as new (...a: unknown[]) => Date)(...args) : at(hour);
  } as unknown as DateConstructor;
  FixedDate.now = () => at(hour).getTime();
  let error: unknown = null;
  try { new Function('document', 'localStorage', 'Date', PRE_PAINT_SCRIPT)(document, localStorage, FixedDate); }
  catch (e) { error = e; }
  return { light: html.dataset.light, attr: html.attrs['data-light'], meta: metas.find((m) => m.name === 'theme-color')?.content, metaCount: metas.length, error };
}

const cases: { label: string; stored: string | null | 'THROW'; hour: number; settings: unknown }[] = [
  { label: 'no settings at 20:00', stored: null, hour: 20, settings: null },
  { label: 'no settings at 10:00', stored: null, hour: 10, settings: null },
  { label: '{evening:true} at 10:00', stored: JSON.stringify({ evening: true }), hour: 10, settings: { evening: true } },
  { label: "{lighting:'day'} at 20:00", stored: JSON.stringify({ lighting: 'day' }), hour: 20, settings: { lighting: 'day' } },
  { label: 'invalid JSON at 20:00', stored: '{', hour: 20, settings: null },
  { label: 'localStorage throws at 20:00', stored: 'THROW', hour: 20, settings: null },
  { label: "{lighting:'bogus', evening:true} at 10:00", stored: JSON.stringify({ lighting: 'bogus', evening: true }), hour: 10, settings: { lighting: 'bogus', evening: true } },
  { label: "{lighting:'auto', evening:true} at 10:00", stored: JSON.stringify({ lighting: 'auto', evening: true }), hour: 10, settings: { lighting: 'auto', evening: true } },
  { label: 'JSON 5 at 20:00', stored: '5', hour: 20, settings: 5 },
  { label: "{lighting:'day', evening:false} at 20:00", stored: JSON.stringify({ lighting: 'day', evening: false }), hour: 20, settings: { lighting: 'day', evening: false } },
  { label: "{lighting:'auto', evening:false} at 20:00", stored: JSON.stringify({ lighting: 'auto', evening: false }), hour: 20, settings: { lighting: 'auto', evening: false } },
  { label: "{lighting:'evening', evening:true} at 10:00", stored: JSON.stringify({ lighting: 'evening', evening: true }), hour: 10, settings: { lighting: 'evening', evening: true } },
];
check('PRE_PAINT_SCRIPT is a string', typeof PRE_PAINT_SCRIPT === 'string' && PRE_PAINT_SCRIPT.length > 0);
check('PRE_PAINT_SCRIPT has no import/require', typeof PRE_PAINT_SCRIPT === 'string' && !/\bimport\b|\brequire\s*\(/.test(PRE_PAINT_SCRIPT));
for (const c of cases) {
  const want = resolveLight(readLighting(c.settings), at(c.hour));
  const got = runScript(c.stored, c.hour);
  check(`script: ${c.label} gives ${want}`, !got.error && (got.attr ?? got.light) === want, got);
  check(`script: ${c.label} sets theme-color ${THEME_COLOR[want]}`, got.meta === THEME_COLOR[want] && got.metaCount === 1, got);
}

console.log(`Lighting: ${checks - failures}/${checks} checks passed.`);
if (failures) process.exitCode = 1;
