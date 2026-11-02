// One-off: measures Montserrat 700 (the Duel's tile and clue font) in headless Edge and writes scripts/duel/lib/fontwidth.json:
// the advance width of every character per 1 px of font size, plus kerning pairs that differ from the plain sum.
// Clues render in capitals, so lowercase isn't measured.
// Usage: node scripts/duel/fontwidth-gen.mjs
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789 .,;:!?\'"-()/&+=%’‘“”–—…×÷−É_';
const dir = mkdtempSync(path.join(tmpdir(), 'duel-fontwidth-'));
const font = readFileSync('public/duel/fonts/montserrat-700-sub.woff2').toString('base64');
writeFileSync(path.join(dir, 'm.html'), `<!doctype html><meta charset="utf-8"><pre id="out">pending</pre><script>
(async () => {
  const bytes = Uint8Array.from(atob('${font}'), c => c.charCodeAt(0));
  const face = new FontFace('M700', bytes.buffer, { weight: '700' });
  await face.load(); document.fonts.add(face);
  const ctx = document.createElement('canvas').getContext('2d');
  ctx.font = '700 100px M700';
  const chars = ${JSON.stringify(CHARS)};
  const w = {}, kern = {};
  for (const ch of chars) w[ch] = ctx.measureText(ch).width / 100;
  for (const a of chars) for (const b of chars) {
    const d = ctx.measureText(a + b).width / 100 - w[a] - w[b];
    if (Math.abs(d) >= 0.005) kern[a + b] = Math.round(d * 1000) / 1000;
  }
  for (const k in w) w[k] = Math.round(w[k] * 1000) / 1000;
  document.getElementById('out').textContent = JSON.stringify({ widths: w, kern });
})();
</script>`);
const run = spawnSync(EDGE, ['--headless=new', '--disable-gpu', `--user-data-dir=${path.join(dir, 'profile')}`, '--virtual-time-budget=10000', '--dump-dom', pathToFileURL(path.join(dir, 'm.html')).href], { encoding: 'utf8', maxBuffer: 64 << 20 });
const m = /<pre id="out">(\{.*\})<\/pre>/s.exec(run.stdout);
rmSync(dir, { recursive: true, force: true });
if (!m) { console.error('measuring failed:', run.stderr.slice(0, 500), run.stdout.slice(0, 300)); process.exit(1); }
const table = JSON.parse(m[1].replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>'));
writeFileSync('scripts/duel/lib/fontwidth.json', JSON.stringify(table) + '\n');
console.log(`${Object.keys(table.widths).length} characters, ${Object.keys(table.kern).length} kerning pairs; M = ${table.widths.M}, I = ${table.widths.I}, space = ${table.widths[' ']}`);
