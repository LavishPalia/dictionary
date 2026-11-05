// Anonymous players. The device makes its own id and secret, so registering can be repeated safely (a lost reply
// leaves no orphan), and the identity exists before the first contact, for backups.
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { checkNameShape, generateName, nameKey, tidyName } from '../names';
import { authenticate, hashToken, sameHash, TOKEN_RE, UUID_RE } from './auth';
import { query } from './db';
import { guard, json, readJson } from './http';
import { BOT_NAMES } from './housebots';
import { noteEvent, overLimit } from './rate';

const MAX_BODY = 1024;
const NEW_PLAYERS_PER_HOUR = 10;
const RENAMES_PER_HOUR = 10;

let blocked: string[] | null = null;
function blockedWords(): string[] {
  if (blocked) return blocked;
  const read = (file: string) => readFileSync(path.join(process.cwd(), file), 'utf8').split(/\r?\n/).map(l => l.trim().toLowerCase()).filter(l => l && !l.startsWith('#'));
  blocked = [...read('data/sources/blocklist.txt'), ...read('data/duel/names-blocked.txt'), ...BOT_NAMES.map(nameKey), 'quill', 'panna', 'admin'];
  return blocked;
}

/** Spaces gone and common letter swaps undone, so "f 4 c k" can't slip through. */
const SWAPS: Record<string, string> = { '0': 'o', '1': 'i', '3': 'e', '4': 'a', '5': 's', '7': 't', '@': 'a', '$': 's' };
const normal = (name: string) => name.toLowerCase().replace(/[0-9@$]/g, c => SWAPS[c] ?? '').replace(/\s+/g, '');

export const isBlockedName = (name: string) => { const n = normal(name); return blockedWords().some(w => n.includes(w)); };

const senderKey = (req: Request) => {
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0].trim() || 'local';
  return `ip:${createHash('sha256').update(ip).digest('hex')}`;
};

/** A free generated name; tries a number only when the words keep colliding. */
async function insertWithName(id: string, tokenHash: string): Promise<string | null> {
  for (let i = 0; i < 8; i++) {
    let name = generateName(Math.random);
    if (i >= 5) name = `${name.slice(0, 17)} ${String(Math.floor(Math.random() * 90) + 10)}`;
    if (isBlockedName(name)) continue;
    const rows = await query<{ name: string }>(
      `insert into players (id, token_hash, name, name_key) values ($1, $2, $3, $4) on conflict do nothing returning name`,
      [id, tokenHash, name, nameKey(name)]);
    if (rows[0]) return rows[0].name;
    const [taken] = await query<{ token_hash: string }>(`select token_hash from players where id = $1`, [id]);
    if (taken) return null; // another send of this registration got in first
  }
  throw new Error('no free name');
}

/** POST /api/duel/players */
export const registerPlayer = (req: Request) => guard(async () => {
  const read = await readJson(req, MAX_BODY);
  if ('reply' in read) return read.reply;
  const { id, token } = (read.body ?? {}) as { id?: unknown; token?: unknown };
  if (typeof id !== 'string' || !UUID_RE.test(id) || typeof token !== 'string' || !TOKEN_RE.test(token)) return json({ error: 'bad_request' }, 400);

  const existing = async () => {
    const [row] = await query<{ token_hash: string; name: string }>(`select token_hash, name from players where id = $1`, [id]);
    if (!row) return null;
    return sameHash(row.token_hash, hashToken(token)) ? json({ name: row.name, created: false }) : json({ error: 'id_taken' }, 409);
  };
  const known = await existing();
  if (known) return known;

  const sender = senderKey(req);
  if (await overLimit(sender, NEW_PLAYERS_PER_HOUR)) return json({ error: 'too_many' }, 429, { 'Retry-After': '3600' });
  const name = await insertWithName(id, hashToken(token));
  if (name === null) return (await existing())!;
  await noteEvent(sender);
  return json({ name, created: true });
});

/** PATCH /api/duel/players/me */
export const renamePlayer = (req: Request) => guard(async () => {
  const me = await authenticate(req);
  if (!me) return json({ error: 'unauthorized' }, 401);
  const read = await readJson(req, MAX_BODY);
  if ('reply' in read) return read.reply;
  const raw = (read.body as { name?: unknown } | null)?.name;
  if (typeof raw !== 'string') return json({ error: 'bad_request' }, 400);
  const shape = checkNameShape(raw);
  if (shape) return json({ error: shape }, 400);
  const name = tidyName(raw);
  if (isBlockedName(name)) return json({ error: 'blocked' }, 400);

  const key = `rename:${me.id}`;
  if (await overLimit(key, RENAMES_PER_HOUR)) return json({ error: 'too_many' }, 429, { 'Retry-After': '3600' });
  const rows = await query<{ name: string }>(
    `update players set name = $2, name_key = $3 where id = $1
     and not exists (select 1 from players where name_key = $3 and id <> $1) returning name`, [me.id, name, nameKey(name)])
    .catch((e) => { if ((e as { code?: string }).code === '23505') return []; throw e; }); // two renames racing for one name
  if (!rows[0]) return json({ error: 'taken' }, 400);
  await noteEvent(key);
  return json({ name: rows[0].name });
});
