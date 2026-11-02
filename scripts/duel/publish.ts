// npm run duel:publish -- --batch NNN [--from YYYY-MM-DD] [--to YYYY-MM-DD] [--allow-repeats]
// Publishes the puzzles of a reviewed batch: any puzzle with a row marked `bad` in data/duel/review/batch-NNN.csv is
// dropped (its bad clues go to rejected-clues.jsonl, so the bank never offers them again); the rest get the next free
// ids, are re-checked and written once as data/duel/puzzles/pNNNN.v1.json, with their sha256 in published.json.
// Published files never change: a fix publishes vK+1. Then the schedule is extended over --from..--to, appending only.
// Default window: 2026-09-01..2026-12-29, 3 months before an assumed 1 Dec 2026 launch plus 4 weeks (not decided yet).
import { appendFileSync, existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Puzzle } from '../../src/duel/engine/types';
import { type Published, type Schedule, sha256 } from './build-copy';
import { type CheckContext, checkPuzzle, defaultContext } from './check';
import { fetchPics, PIC_DIR } from './pics';

export const WINDOW = { from: '2026-09-01', to: '2026-12-29' };
export const MIN_GAP_DAYS = 7;

const readJson = <T>(f: string, empty: T): T => (existsSync(f) ? (JSON.parse(readFileSync(f, 'utf8')) as T) : empty);
const writeJson = (f: string, v: unknown) => writeFileSync(f, JSON.stringify(v, null, 1) + '\n');
const sortKeys = <T>(o: Record<string, T>) => Object.fromEntries(Object.entries(o).sort(([a], [b]) => (a < b ? -1 : 1)));

const DAY = 86400000;
const toDay = (d: string) => Date.parse(`${d}T00:00:00Z`) / DAY;
const fromDay = (n: number) => new Date(n * DAY).toISOString().slice(0, 10);

/** Minimal CSV reader for the review sheets (quoted fields, doubled quotes, newlines inside quotes). */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [], field = '', quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (ch === '"') quoted = false;
      else field += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ',') { row.push(field); field = ''; }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(field); rows.push(row); row = []; field = '';
    } else field += ch;
  }
  if (field || row.length) { row.push(field); rows.push(row); }
  return rows.filter(r => r.some(Boolean));
}

/**
 * Extends the schedule over from..to without touching dates already set. Each new date takes the never-used puzzle
 * with the lowest id; once none is left it stops, unless repeats are allowed: then it takes the puzzle whose nearest
 * use is furthest away, if that is at least 7 days. Throws when no puzzle qualifies.
 */
export function extendSchedule(schedule: Schedule, keys: string[], from: string, to: string, allowRepeats: boolean): { schedule: Schedule; added: number; unscheduled: number } {
  const out = { ...schedule };
  const uses = new Map<string, number[]>(keys.map(k => [k, []]));
  for (const [d, k] of Object.entries(out)) uses.get(k)?.push(toDay(d));
  const sorted = [...keys].sort();
  let added = 0, unscheduled = 0;
  for (let day = toDay(from); day <= toDay(to); day++) {
    const date = fromDay(day);
    if (out[date]) continue;
    let pick = sorted.find(k => !uses.get(k)!.length);
    if (!pick && allowRepeats) {
      let best = -1;
      for (const k of sorted) {
        const gap = Math.min(...uses.get(k)!.map(u => Math.abs(u - day)));
        if (gap >= MIN_GAP_DAYS && gap > best) { best = gap; pick = k; }
      }
      if (!pick) throw new Error(`no puzzle can go on ${date}: every one was used within ${MIN_GAP_DAYS} days`);
    }
    if (!pick) { unscheduled++; continue; }
    out[date] = pick;
    uses.get(pick)!.push(day);
    added++;
  }
  return { schedule: sortKeys(out), added, unscheduled };
}

export interface PublishOptions {
  batch: string; // "001"
  from?: string; to?: string; allowRepeats?: boolean;
  dir?: string; picDir?: string;
  fetch?: (keys: string[], dir: string) => Promise<string[]>;
  ctx?: CheckContext;
  log?: (m: string) => void;
}

export async function publish(o: PublishOptions): Promise<{ published: string[]; dropped: string[]; added: number; unscheduled: number }> {
  const dir = o.dir ?? 'data/duel', picDir = o.picDir ?? PIC_DIR, log = o.log ?? (m => process.stderr.write(m + '\n'));
  const batch = `batch-${o.batch.padStart(3, '0')}`;
  const sheet = join(dir, 'review', `${batch}.csv`), candDir = join(dir, 'candidates', batch);
  if (!existsSync(sheet) || !existsSync(candDir)) throw new Error(`${batch}: no review sheet or candidates in ${dir}`);

  const [head, ...rows] = parseCsv(readFileSync(sheet, 'utf8'));
  const col = (name: string) => { const i = head.indexOf(name); if (i < 0) throw new Error(`${sheet}: no "${name}" column`); return i; };
  const [P, A, C, B] = ['puzzle', 'answer', 'clue', 'bad'].map(col);
  const badRows = rows.filter(r => (r[B] ?? '').trim());
  const dropped = [...new Set(badRows.map(r => r[P]))].sort();

  const publishedFile = join(dir, 'published.json'), scheduleFile = join(dir, 'schedule.json'), rejectedFile = join(dir, 'rejected-clues.jsonl');
  const published = readJson<Published>(publishedFile, {});
  const done = new Set(Object.values(published).map(p => p.from));
  const known = new Set(existsSync(rejectedFile) ? readFileSync(rejectedFile, 'utf8').split(/\r?\n/).filter(Boolean) : []);
  for (const r of badRows) {
    const line = JSON.stringify({ word: r[A].toLowerCase(), full: r[C], batch });
    if (!known.has(line)) { appendFileSync(rejectedFile, line + '\n'); known.add(line); }
  }

  const candidates = readdirSync(candDir).filter(f => f.endsWith('.json')).sort()
    .map(f => JSON.parse(readFileSync(join(candDir, f), 'utf8')) as Puzzle)
    .filter(p => !dropped.includes(p.id) && !done.has(p.id));
  await (o.fetch ?? fetchPics)(candidates.flatMap(p => p.slots.map(s => s.clue.img).filter((k): k is string => !!k)), picDir);

  let next = 1 + Math.max(1, ...Object.keys(published).map(k => Number(k.slice(1, 5))));
  const ctx = o.ctx ?? { ...defaultContext(), picDir, hasPic: (k: string) => existsSync(`${picDir}/${k}.svg`) };
  const newKeys: string[] = [];
  for (const cand of candidates) {
    const id = `p${String(next).padStart(4, '0')}`;
    const p: Puzzle = { ...cand, id, version: 1 };
    const problems = checkPuzzle(p, ctx);
    if (problems.length) { log(`${cand.id}: not published, ${problems[0]}`); continue; }
    const key = `${id}.v1`, file = join(dir, 'puzzles', `${key}.json`);
    if (existsSync(file)) throw new Error(`${file} exists; published files are never overwritten`);
    const bytes = JSON.stringify(p, null, 1) + '\n';
    writeFileSync(file, bytes);
    published[key] = { hash: sha256(bytes), batch, from: cand.id };
    newKeys.push(key);
    next++;
  }
  writeJson(publishedFile, sortKeys(published));

  const { schedule, added, unscheduled } = extendSchedule(readJson<Schedule>(scheduleFile, {}), Object.keys(published), o.from ?? WINDOW.from, o.to ?? WINDOW.to, !!o.allowRepeats);
  writeJson(scheduleFile, schedule);
  return { published: newKeys, dropped, added, unscheduled };
}

if (process.argv[1]?.endsWith('publish.ts')) {
  const arg = (name: string) => { const i = process.argv.indexOf(`--${name}`); return i > 0 ? process.argv[i + 1] : undefined; };
  const batch = arg('batch');
  if (!batch) { console.error('Usage: npm run duel:publish -- --batch NNN [--from YYYY-MM-DD] [--to YYYY-MM-DD] [--allow-repeats]'); process.exit(1); }
  publish({ batch, from: arg('from'), to: arg('to'), allowRepeats: process.argv.includes('--allow-repeats') }).then(r => {
    console.log(`published ${r.published.length} (${r.published.join(' ') || 'none'}); dropped ${r.dropped.length} marked bad; ${r.added} date(s) scheduled`);
    if (r.unscheduled) console.log(`${r.unscheduled} date(s) in the window still have no puzzle: publish more, or pass --allow-repeats`);
  }, err => { console.error(err.message); process.exit(1); });
}
