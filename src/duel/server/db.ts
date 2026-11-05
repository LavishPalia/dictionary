// The one door to the database: Neon's HTTP driver in production, anything with the same shape in tests.
import { SCHEMA } from './schema';

export interface Db { query(text: string, params?: unknown[]): Promise<unknown[]> }

/** No database is configured or it can't be reached. The client treats this as being offline. */
export class DbUnavailable extends Error {}

let current: Db | null = null;

export function setDb(db: Db | null) { current = db; }

async function open(): Promise<Db> {
  if (current) return current;
  const url = process.env.DATABASE_URL;
  if (!url) throw new DbUnavailable('DATABASE_URL is not set');
  const { neon } = await import('@neondatabase/serverless');
  const sql = neon(url);
  current = { query: (text, params = []) => sql.query(text, params as never[]) as unknown as Promise<unknown[]> };
  return current;
}

/** Postgres's error code, when Postgres itself answered. */
const codeOf = (e: unknown) => { const c = (e as { code?: unknown })?.code; return typeof c === 'string' && /^[0-9A-Z]{5}$/.test(c) ? c : null; };

export async function query<T>(text: string, params: unknown[] = []): Promise<T[]> {
  const db = await open();
  try {
    return await db.query(text, params) as T[];
  } catch (e) {
    const code = codeOf(e);
    if (code === '42P01') { // no such table: a new database or a new preview branch
      for (const statement of SCHEMA) await db.query(statement);
      return await db.query(text, params) as T[];
    }
    if (code === null || /^(08|53|57)/.test(code)) throw new DbUnavailable(e instanceof Error ? e.message : 'database error');
    throw e;
  }
}
