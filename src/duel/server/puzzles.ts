// The published puzzles, as the server replays them. A file must match its hash in data/duel/published.json.
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import type { Puzzle } from '../engine';

const dir = () => path.join(process.cwd(), 'data', 'duel');
const loaded = new Map<string, Puzzle>();
let published: Record<string, { hash: string }> | null = null;

/** The puzzle a key ("p0067.v1") names, or null when no such puzzle was published (practice puzzles never were). */
export function loadPublished(key: string): Puzzle | null {
  const hit = loaded.get(key);
  if (hit) return hit;
  published ??= JSON.parse(readFileSync(path.join(dir(), 'published.json'), 'utf8')) as Record<string, { hash: string }>;
  if (!/^p\d{4}\.v\d+$/.test(key) || !Object.hasOwn(published, key)) return null;
  const bytes = readFileSync(path.join(dir(), 'puzzles', `${key}.json`));
  if (createHash('sha256').update(bytes).digest('hex') !== published[key].hash) throw new Error(`puzzle ${key} does not match its hash`);
  const puzzle = JSON.parse(bytes.toString('utf8')) as Puzzle;
  loaded.set(key, puzzle);
  return puzzle;
}
