// Saves what a game needs to start with no connection into the service worker's Duel cache (public/sw.js): the /play
// page and its files, and the puzzles and pictures of the days likely to be played next. Keeps the cache name and the
// /play address in step with sw.js. Runs through the Cache API, so it works before the worker is in control.
import type { Puzzle } from '../../engine';
import { readResults, RESULTS_KEY, wonDays } from '../../progress';
import type { PuzzleSource, Storage } from '../types';
import { practice } from './puzzles';

const DUEL_CACHE = 'panna-duel-v1';
const SHELL_LIST = '/__panna/duel-shell';
const AHEAD = 6, BEHIND = 3;

/** Today, the next days on the schedule, and the latest days still open behind it. */
export function daysToSave(scheduled: string[], today: string, won: Set<string>): string[] {
  const days = [...scheduled].sort();
  const coming = days.filter(d => d >= today).slice(0, AHEAD + 1);
  const behind = days.filter(d => d < today && !won.has(d)).slice(-BEHIND);
  return [...coming, ...behind];
}

export const picturesOf = (p: Puzzle): string[] =>
  [...new Set(p.slots.flatMap(s => (s.clue.img ? [`/duel/pics/${s.clue.img}.svg`] : [])))];

/** The script files an HTML page names, as same-site paths. */
export function filesNamed(html: string): string[] {
  return [...new Set([...html.matchAll(/(?:\/_next\/)?static\/chunks\/[^"'\\\s)]+/g)].map(m => `/_next/${m[0].replace(/^\/_next\//, '')}`))];
}

const pathOf = (url: string) => { const u = new URL(url, location.origin); return u.origin === location.origin ? u.pathname + u.search : null; };

async function saveMissing(cache: Cache, urls: string[]): Promise<boolean> {
  const results = await Promise.all(urls.map(async (url) => {
    if (await cache.match(url)) return true;
    try { await cache.add(url); return true; } catch { return false; }
  }));
  return results.every(Boolean);
}

/** The shell, only when it matches this page's own code: otherwise a newer deploy is out, and its files aren't all here. */
async function saveShell(cache: Cache) {
  const res = await fetch('/play', { cache: 'no-cache' });
  if (!res.ok) return;
  const html = await res.clone().text();
  const loaded = [...performance.getEntriesByType('resource').map(e => e.name), ...[...document.scripts].map(s => s.src)]
    .flatMap(u => (u ? pathOf(u) ?? [] : []));
  if (!filesNamed(html).every(f => loaded.includes(f))) return;
  const files = [...new Set(loaded.filter(f => f.startsWith('/_next/static/') || f.startsWith('/duel/fonts/')))];
  if (!await saveMissing(cache, files)) return;
  const old = await cache.match(SHELL_LIST);
  if (old) for (const f of await old.json() as string[]) if (!files.includes(f)) await cache.delete(f);
  await cache.put(SHELL_LIST, new Response(JSON.stringify(files), { headers: { 'Content-Type': 'application/json' } }));
  await cache.put('/play', res);
}

export function webOffline(storage: Storage, puzzles: PuzzleSource, extraFiles: () => string[] = () => []) {
  let running: Promise<void> | null = null;
  const prepare = async (today: string) => {
    await practice(); // its chunk loads now, so the file list below has it: practice is what plays past the schedule
    const cache = await caches.open(DUEL_CACHE);
    await saveShell(cache);
    await saveMissing(cache, extraFiles());
    const schedule = await puzzles.schedule();
    const won = wonDays(readResults(storage.get(RESULTS_KEY)));
    await cache.put('/duel/schedule.json', new Response(JSON.stringify(schedule), { headers: { 'Content-Type': 'application/json' } }));
    for (const date of daysToSave(Object.keys(schedule.dates), today, won)) {
      const file = `/duel/p/${schedule.files[schedule.dates[date]]}`;
      if (!await saveMissing(cache, [file])) continue;
      const hit = await cache.match(file);
      if (hit) await saveMissing(cache, picturesOf(await hit.json() as Puzzle));
    }
  };
  return (today: string): Promise<void> => {
    if (typeof caches === 'undefined') return Promise.resolve();
    running ??= prepare(today).catch(() => {}).finally(() => { running = null; });
    return running;
  };
}
