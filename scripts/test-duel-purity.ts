// Keeps the Duel engine pure (no DOM, Node, React or Next) and the Duel UI free of next/*.
// Usage: npx tsx scripts/test-duel-purity.ts
import { spawnSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';

let failures = 0;
function check(label: string, ok: boolean, detail?: unknown) {
  if (ok) console.log(`✓ ${label}`);
  else { failures++; console.error(`✗ ${label}${detail !== undefined ? ` — ${JSON.stringify(detail)}` : ''}`); }
}

function tsFiles(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).flatMap(name => {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) return tsFiles(p);
    return /\.tsx?$/.test(name) ? [p] : [];
  });
}
const specifiers = (file: string) => [...readFileSync(file, 'utf8').matchAll(/(?:from|import)\s*\(?\s*['"]([^'"]+)['"]/g)].map(m => m[1]);

const tsc = spawnSync('npx tsc -p src/duel/engine --noEmit', { stdio: 'inherit', shell: true });
check('engine compiles with ES2022 only (no DOM or Node types)', tsc.status === 0);

const engineFiles = tsFiles('src/duel/engine');
check('engine has source files', engineFiles.length > 0);
const outside = engineFiles.flatMap(f => specifiers(f).filter(s => !s.startsWith('./')).map(s => `${f}: ${s}`));
check('engine imports only from its own folder', outside.length === 0, outside);

const uiNext = [...tsFiles('src/duel/ui'), ...tsFiles('src/duel/platform')].flatMap(f => specifiers(f).filter(s => s === 'next' || s.startsWith('next/')).map(s => `${f}: ${s}`));
check('Duel UI and platform never import next/*', uiNext.length === 0, uiNext);

// The Duel is its own package (it may later mount in a native shell): no Panna app code, by alias or by path.
// Puzzle data (data/duel) is fine.
const inApp = (from: string, s: string) => {
  const r = relative(resolve('src'), resolve(dirname(from), s));
  return !r.startsWith('..') && r.split(/[\\/]/)[0] !== 'duel';
};
const intoApp = [...tsFiles('src/duel/ui'), ...tsFiles('src/duel/platform')].flatMap(f => specifiers(f).filter(s =>
  s.startsWith('@/') || (s.startsWith('.') && inApp(f, s))).map(s => `${f}: ${s}`));
check('Duel UI and platform import nothing from the Panna app (@/ or outside src/duel)', intoApp.length === 0, intoApp);

// The controller is plain TypeScript, unit-tested in Node: no DOM and no React.
const controllerDom = tsFiles('src/duel/ui/controller').flatMap(f => {
  const src = readFileSync(f, 'utf8');
  const bad = [/\bdocument\./, /\bwindow\./].filter(re => re.test(src)).map(re => `${f}: ${re.source}`);
  return [...bad, ...specifiers(f).filter(s => s === 'react' || s.startsWith('react/') || s === 'react-dom').map(s => `${f}: ${s}`)];
});
check('Duel controller touches no DOM or React', controllerDom.length === 0, controllerDom);

if (failures) { console.error(`\n${failures} failed`); process.exit(1); }
console.log('\nAll duel purity checks passed.');
