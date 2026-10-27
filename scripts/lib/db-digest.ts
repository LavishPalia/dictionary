// SHA-256 digest of every table in a built dictionary.db, streamed in primary-key order.
// Two builds with the same digest are identical row for row, whatever the SQLite file bytes look like.
import crypto from 'crypto';
import Database from 'better-sqlite3';

const TABLES: Array<[table: string, orderBy: string]> = [
  ['entries', 'rowid'],
  ['forms', 'normalized_form, lemma_id'],
  ['related', 'entry_id, kind, rank'], // every column incl. source (SELECT *)
  ['hinglish', 'key, entry_id, hi'],
  ['pages', 'page_number'],
  ['meta', 'key'],
];

export function digestDatabase(file: string): { digest: string; tables: Record<string, string> } {
  const db = new Database(file, { readonly: true, fileMustExist: true });
  try {
    const all = crypto.createHash('sha256');
    const tables: Record<string, string> = {};
    for (const [table, orderBy] of TABLES) {
      const h = crypto.createHash('sha256');
      for (const row of db.prepare(`SELECT * FROM ${table} ORDER BY ${orderBy}`).iterate()) {
        h.update(JSON.stringify(row) + '\n');
      }
      tables[table] = h.digest('hex');
      all.update(`${table}:${tables[table]}\n`);
    }
    return { digest: all.digest('hex'), tables };
  } finally {
    db.close();
  }
}
