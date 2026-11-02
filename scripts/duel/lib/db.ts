// Read-only access to Panna's built dictionary and the Duel's word lists, for the offline puzzle pipeline.
import Database from 'better-sqlite3';
import { readFileSync } from 'node:fs';

let db: Database.Database | undefined;
/** data/dictionary.db, opened read-only once (run `npm run build:data` first). */
export function dictionary(): Database.Database {
  return (db ??= new Database('data/dictionary.db', { readonly: true, fileMustExist: true }));
}

const words = (file: string) => readFileSync(file, 'utf8').split(/\r?\n/).map(s => s.trim().toLowerCase()).filter(s => s && !s.startsWith('#'));

let blocked: Set<string> | undefined;
/** Words never used as answers: Panna's blocklist plus the Duel's family-game extras. */
export function blocklist(): Set<string> {
  return (blocked ??= new Set([...words('data/sources/blocklist.txt'), ...words('data/duel/blocklist-extra.txt')]));
}
