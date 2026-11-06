// A real Postgres for tests, in this process: the same SQL the server runs on Neon, with no account or network.
import { PGlite } from '@electric-sql/pglite';
import type { Db } from '../../src/duel/server/db';

export async function testDb(): Promise<Db & { clear(): Promise<void> }> {
  const pg = new PGlite();
  return {
    query: async (text, params = []) => (await pg.query(text, params)).rows,
    clear: async () => { await pg.exec('truncate rate_events, weekly_totals, games, players cascade'); },
  };
}
