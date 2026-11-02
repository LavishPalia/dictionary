// Build step (npm run build:data): copies the published Duel puzzles to public/duel/p/<key>.<hash8>.json (immutable
// names, so they can be cached forever) and writes public/duel/schedule.json { dates, files } for the client.
// Every copy is checked against its hash in data/duel/published.json; a mismatch fails the build.
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

/** data/duel/published.json: puzzle key ("p0002.v1") → its sha256, the batch and the candidate it came from. */
export type Published = Record<string, { hash: string; batch: string; from: string }>;
/** data/duel/schedule.json: date ("2026-09-01") → puzzle key. */
export type Schedule = Record<string, string>;
export const sha256 = (bytes: Buffer | string) => createHash('sha256').update(bytes).digest('hex');

export interface ClientSchedule { dates: Schedule; files: Record<string, string> }

export function copyPublished(dir = 'data/duel', out = 'public/duel'): ClientSchedule {
  const published: Published = existsSync(join(dir, 'published.json')) ? JSON.parse(readFileSync(join(dir, 'published.json'), 'utf8')) : {};
  const dates: Schedule = existsSync(join(dir, 'schedule.json')) ? JSON.parse(readFileSync(join(dir, 'schedule.json'), 'utf8')) : {};
  const target = join(out, 'p');
  mkdirSync(target, { recursive: true });
  for (const f of readdirSync(target)) rmSync(join(target, f));
  const files: Record<string, string> = {};
  for (const [key, { hash }] of Object.entries(published)) {
    const bytes = readFileSync(join(dir, 'puzzles', `${key}.json`));
    if (sha256(bytes) !== hash) throw new Error(`data/duel/puzzles/${key}.json does not match its published hash; publish a new version instead of editing it`);
    files[key] = `${key}.${hash.slice(0, 8)}.json`;
    writeFileSync(join(target, files[key]), bytes);
  }
  for (const [date, key] of Object.entries(dates)) if (!files[key]) throw new Error(`schedule ${date}: ${key} is not published`);
  const schedule: ClientSchedule = { dates, files };
  writeFileSync(join(out, 'schedule.json'), JSON.stringify(schedule) + '\n');
  return schedule;
}
