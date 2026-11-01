// The perf gate (tech design §1.5): plays three scripted turns of the Duel on a real phone's Chrome over adb,
// with the CPU slowed, and measures frame times and long tasks per phase (drag, submit, quill, refill).
// Usage:
//   node scripts/duel/perf-phone.mjs --throttle 4 [--tier normal|lite] [--url http://localhost:3000]
//   node scripts/duel/perf-phone.mjs --throttle 1 --cdp http://127.0.0.1:9331   (a local browser instead of the phone)
// Needs `npx next start` on :3000. On the phone: USB or wireless debugging on, Chrome opened once.
// Exits 0 when every phase passes, 1 when one fails, 2 when the phone can't be reached.
import { spawnSync } from 'child_process';
import fs from 'fs';
import path from 'path';

const arg = (name, fallback) => { const i = process.argv.indexOf(`--${name}`); return i > 0 ? process.argv[i + 1] : fallback; };
const THROTTLE = Number(arg('throttle', '4'));
const TIER = arg('tier', 'normal');
const URL_BASE = arg('url', 'http://localhost:3000');
const LOCAL = arg('cdp', null);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Pass criteria at 4× CPU on the Pixel 6a (tech design §1.5). The drag's p95 is 16.7 ms (one 60 Hz frame) plus
// 0.8 ms for rAF timestamp jitter: a perfectly smooth run measures 16.6–17.2 ms, never a clean 16.7.
const LIMITS = { dragP95: 17.5, dragMax: 33, slowShare: 0.02, slowFrame: 20, longTask: 50 };

function adb(...args) {
  const r = spawnSync('adb', args, { encoding: 'utf8' });
  return r.status === 0 && !/error/i.test(r.stderr ?? '');
}

async function main() {
  let cdp = LOCAL;
  if (!cdp) {
    if (!adb('reverse', 'tcp:3000', 'tcp:3000') || !adb('forward', 'tcp:9222', 'localabstract:chrome_devtools_remote')) {
      console.error('Phone not reachable: plug in or pair wireless debugging, and open Chrome once');
      process.exit(2);
    }
    cdp = 'http://127.0.0.1:9222';
  }
  let target;
  try { target = await (await fetch(`${cdp}/json/new?about:blank`, { method: 'PUT' })).json(); }
  catch { console.error(`No DevTools at ${cdp}${LOCAL ? '' : ': open Chrome on the phone once and retry'}`); process.exit(2); }

  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => { ws.onopen = resolve; ws.onerror = reject; });
  let nextId = 1;
  const send = (method, params = {}) => new Promise((resolve, reject) => {
    const id = nextId++;
    const onMessage = (event) => {
      const m = JSON.parse(event.data);
      if (m.id !== id) return;
      ws.removeEventListener('message', onMessage);
      m.error ? reject(new Error(m.error.message)) : resolve(m.result);
    };
    ws.addEventListener('message', onMessage);
    ws.send(JSON.stringify({ id, method, params }));
  });
  const evaluate = async (expression) => {
    const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description ?? r.exceptionDetails.text);
    return r.result?.value;
  };
  const waitFor = async (expr, ms) => { for (let t = 0; t < ms; t += 100) { try { if (await evaluate(expr)) return true; } catch {} await sleep(100); } return false; };

  try {
    await send('Page.enable');
    await send('Runtime.enable');
    if (LOCAL) { // a desktop browser stands in for a phone
      await send('Emulation.setDeviceMetricsOverride', { width: 393, height: 851, deviceScaleFactor: 2.75, mobile: true });
      await send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
    }
    await send('Emulation.setCPUThrottlingRate', { rate: THROTTLE });
    await send('Page.navigate', { url: `${URL_BASE}/icon.svg` });
    await sleep(800);
    await evaluate('localStorage.clear(); true');
    await send('Page.navigate', { url: `${URL_BASE}/play/game/2026-11-01?seed=7&perf=1&tier=${TIER}` });
    if (!(await waitFor(`Boolean(window.__duel && document.querySelector('.duel-board [data-cell]'))`, 30000))) throw new Error('The game did not load');
    await sleep(1500);

    // Frame and long-task recorders.
    await evaluate(`(() => {
      window.__frames = []; let last = 0;
      const step = (now) => { if (last) window.__frames.push([now, now - last]); last = now; requestAnimationFrame(step); };
      requestAnimationFrame(step);
      window.__long = [];
      try { new PerformanceObserver((l) => { for (const e of l.getEntries()) window.__long.push([e.startTime, e.duration]); }).observe({ type: 'longtask', buffered: true }); } catch {}
      performance.clearMarks();
      return true;
    })()`);

    const center = (sel) => evaluate(`(() => { const r = document.querySelector(${JSON.stringify(sel)})?.getBoundingClientRect(); return r ? { x: r.left + r.width / 2, y: r.top + r.height / 2 } : null; })()`);
    const touch = (type, x, y) => send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x, y }] });
    /** A finger drag from a rack tile to a cell (the tile rides 30 px above the finger). */
    const dragTo = async (rackSlot, cell) => {
      const a = await center(`[data-rack="${rackSlot}"] .duel-tile`), b = await center(`.duel-board [data-cell="${cell}"]`);
      if (!a || !b) return;
      b.y += 30;
      await touch('touchStart', a.x, a.y);
      for (let i = 1; i <= 30; i++) { await touch('touchMove', a.x + (b.x - a.x) * i / 30, a.y + (b.y - a.y) * i / 30); await sleep(16); }
      await touch('touchEnd');
      await sleep(400);
    };
    const tapSubmit = async () => { const c = await center('[data-act="submit"]'); await touch('touchStart', c.x, c.y); await touch('touchEnd'); };
    const plan = (count, wrong = 0) => evaluate(`(() => {
      const s = window.__duel.snapshot(), sol = window.__duel.puzzle.solution, used = new Set(), out = [];
      const empty = Object.keys(sol).map(Number).sort((a, b) => a - b).filter((c) => !s.state.filled[c]);
      s.state.racks.you.forEach((l, rackSlot) => {
        if (!l || out.length >= ${count} + ${wrong}) return;
        const bad = out.filter((t) => t.wrong).length < ${wrong};
        const cell = empty.find((c) => !used.has(c) && (bad ? sol[c] !== l : sol[c] === l));
        if (cell !== undefined) { used.add(cell); out.push({ rackSlot, cell, wrong: bad }); }
      });
      return out;
    })()`);
    const turn = async (count, wrong = 0) => {
      for (const t of await plan(count, wrong)) await dragTo(t.rackSlot, t.cell);
      await tapSubmit();
      await sleep(300);
      if (!(await waitFor('!window.__duel.snapshot().busy', 60000))) throw new Error('A turn did not finish');
      await sleep(500);
    };

    console.log(`Playing 3 turns at ${THROTTLE}× CPU, tier ${TIER}…`);
    await turn(3);       // drag, submit, Quill, refill
    await turn(5);       // Empty hand: the card, confetti and word seals
    await turn(1, 2);    // wrong tiles shake and go home

    const data = await evaluate(`({ frames: window.__frames, long: window.__long,
      marks: performance.getEntriesByType('mark').filter((m) => m.name.startsWith('duel:')).map((m) => [m.name, m.startTime]) })`);

    // Pair each phase's start and end marks into windows.
    const windows = {};
    const open = {};
    for (const [name, t] of data.marks) {
      const [, phase, edge] = name.split(':');
      if (edge === 'start') open[phase] = t;
      else if (open[phase] !== undefined) { (windows[phase] ??= []).push([open[phase], t]); delete open[phase]; }
    }
    const rows = ['drag', 'submit', 'quill', 'refill'].map((phase) => {
      const w = windows[phase] ?? [];
      const inside = (t) => w.some(([a, b]) => t >= a && t <= b);
      const d = data.frames.filter(([t]) => inside(t)).map(([, dt]) => dt).sort((a, b) => a - b);
      const long = data.long.filter(([s, dur]) => dur > LIMITS.longTask && w.some(([a, b]) => s < b && s + dur > a));
      const p95 = d.length ? d[Math.min(d.length - 1, Math.floor(d.length * 0.95))] : 0;
      const max = d.length ? d[d.length - 1] : 0;
      const slow = d.length ? d.filter((x) => x > LIMITS.slowFrame).length / d.length : 0;
      const pass = d.length > 0 && long.length === 0 && (phase === 'drag' ? p95 <= LIMITS.dragP95 && max <= LIMITS.dragMax : slow <= LIMITS.slowShare);
      return { phase, windows: w.length, frames: d.length, p95: +p95.toFixed(1), max: +max.toFixed(1), over20: `${(slow * 100).toFixed(1)} %`, longTasks: long.length, pass };
    });

    console.log('');
    console.log('phase    windows  frames   p95 ms   max ms   >20 ms   long tasks   result');
    for (const r of rows) {
      console.log(`${r.phase.padEnd(8)} ${String(r.windows).padStart(7)} ${String(r.frames).padStart(7)} ${String(r.p95).padStart(8)} ${String(r.max).padStart(8)} ${r.over20.padStart(8)} ${String(r.longTasks).padStart(12)}   ${r.pass ? 'PASS' : 'FAIL'}`);
    }
    const ua = await evaluate('navigator.userAgent');
    const out = path.join('scratch', 'duel-perf', `${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
    fs.mkdirSync(path.dirname(out), { recursive: true });
    fs.writeFileSync(out, JSON.stringify({ throttle: THROTTLE, tier: TIER, ua, limits: LIMITS, rows, raw: data }, null, 1));
    console.log(`\n${ua}\nSaved ${out}`);
    process.exitCode = rows.every((r) => r.pass) ? 0 : 1;
  } finally {
    try { await send('Emulation.setCPUThrottlingRate', { rate: 1 }); } catch {}
    try { await fetch(`${cdp}/json/close/${target.id}`); } catch {}
    ws.close();
  }
}

main().catch((e) => { console.error(e.message ?? e); process.exitCode = 1; });
