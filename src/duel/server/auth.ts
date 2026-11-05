// Who is asking: `Authorization: Bearer <id>.<token>`. Only a hash of the token is stored.
import { createHash, timingSafeEqual } from 'node:crypto';
import { query } from './db';

export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
export const TOKEN_RE = /^[0-9a-f]{64}$/;

export const hashToken = (token: string) => createHash('sha256').update(token).digest('hex');

export function sameHash(a: string, b: string): boolean {
  const x = Buffer.from(a), y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

export async function authenticate(req: Request): Promise<{ id: string; name: string } | null> {
  const m = /^Bearer ([0-9a-f-]{36})\.([0-9a-f]{64})$/.exec(req.headers.get('authorization') ?? '');
  if (!m || !UUID_RE.test(m[1])) return null;
  const [row] = await query<{ token_hash: string; name: string; stale: boolean }>(
    `select token_hash, name, last_seen < now() - interval '1 day' as stale from players where id = $1`, [m[1]]);
  if (!row || !sameHash(row.token_hash, hashToken(m[2]))) return null;
  if (row.stale) await query(`update players set last_seen = now() where id = $1`, [m[1]]);
  return { id: m[1], name: row.name };
}
