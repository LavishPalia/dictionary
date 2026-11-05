// The Duel talking to its server. The device owns its identity and a queue of finished games, so a game finished
// offline is sent later; the server recognises a game it has already seen, so a resend can't count twice.
import {
  BOARD_KEY, mergeOutbox, OUTBOX_KEY, outboxKey, PLAYER_KEY, readOutbox, readPlayer, REJECTED_KEY, WEEK_KEY,
  type Board, type CachedWeek, type DuelPlayer, type Me, type OutboxGame, type WeekPick,
} from '../../net-rules';
import { istToday } from '../../progress';
import { addWeeks, weekOf } from '../../week';
import type { DuelNet, Storage } from '../types';

const TIMEOUT_MS = 15_000;
const KEEP_REJECTED = 50;
/** How long the CDN may answer with an old board (s-maxage + stale-while-revalidate, src/duel/server/board.ts). */
const CDN_STALE_MS = 330_000;

/** The server can't take this now (offline, down, too many): stop, and try again at the next chance. */
class TryLater extends Error {}

const hex = (bytes: Uint8Array) => Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');

function newIdentity(): DuelPlayer {
  const b = crypto.getRandomValues(new Uint8Array(16));
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = hex(b);
  return { id: `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`, token: hex(crypto.getRandomValues(new Uint8Array(32))), name: null };
}

export function webNet(storage: Storage, fetchFn: typeof fetch = (...a) => fetch(...a), now: () => Date = () => new Date()): DuelNet {
  const listeners = new Set<() => void>();
  const changed = () => { for (const fn of listeners) fn(); };

  const player = () => readPlayer(storage.get(PLAYER_KEY));
  const auth = (p: DuelPlayer) => ({ Authorization: `Bearer ${p.id}.${p.token}` });

  async function call(path: string, init: RequestInit = {}): Promise<Response> {
    // Not AbortSignal.timeout: iPhones before iOS 16 don't have it.
    const abort = new AbortController();
    const timer = setTimeout(() => abort.abort(), TIMEOUT_MS);
    try {
      return await fetchFn(`/api/duel/${path}`, { ...init, signal: abort.signal });
    } catch {
      throw new TryLater();
    } finally {
      clearTimeout(timer);
    }
  }
  const sendJson = (method: string, body: unknown, headers: Record<string, string> = {}): RequestInit =>
    ({ method, headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body) });

  const setName = (name: string) => {
    const p = player();
    if (p && p.name !== name) { storage.set(PLAYER_KEY, { ...p, name }); changed(); }
  };

  /** Makes this device's player known to the server. An id another device took means a new identity. */
  async function register(): Promise<DuelPlayer> {
    let p = player();
    if (!p) { p = newIdentity(); storage.set(PLAYER_KEY, p); }
    let res = await call('players', sendJson('POST', { id: p.id, token: p.token }));
    if (res.status === 409) {
      p = newIdentity();
      storage.set(PLAYER_KEY, p);
      storage.remove(WEEK_KEY);
      res = await call('players', sendJson('POST', { id: p.id, token: p.token }));
    }
    if (!res.ok) throw new TryLater();
    const { name } = await res.json() as { name: string };
    p = { ...p, name };
    storage.set(PLAYER_KEY, p);
    changed();
    return p;
  }

  function readWeek(): CachedWeek | null {
    const w = storage.get<CachedWeek>(WEEK_KEY);
    return w && typeof w === 'object' && w.week === weekOf(now()) && Number.isFinite(w.points) ? w : null;
  }

  function setWeek(points: number, rank: number | null) {
    const old = readWeek(), day = istToday(now());
    const next: CachedWeek = {
      week: weekOf(now()), points, rank, day,
      dayRank: old?.day === day ? old.dayRank : old?.rank ?? null,
      seen: old?.seen ?? null,
    };
    storage.set(WEEK_KEY, next);
    changed();
  }

  const removeFromOutbox = (key: string) => storage.set(OUTBOX_KEY, readOutbox(storage.get(OUTBOX_KEY)).filter(g => outboxKey(g) !== key));

  function markRejected(key: string) {
    const list = storage.get<string[]>(REJECTED_KEY);
    storage.set(REJECTED_KEY, [...(Array.isArray(list) ? list : []), key].slice(-KEEP_REJECTED));
  }

  /** Oldest first. A game the server refused leaves the queue, so it can't block the ones behind it. */
  async function sendAll() {
    if (!readOutbox(storage.get(OUTBOX_KEY)).length) return;
    let p = player();
    if (!p?.name) p = await register();
    for (;;) {
      const game = readOutbox(storage.get(OUTBOX_KEY))[0];
      if (!game) return;
      const post = () => call('games', sendJson('POST', game, auth(p!)));
      let res = await post();
      if (res.status === 401) { p = await register(); res = await post(); }
      if (res.status === 400 || res.status === 413) {
        removeFromOutbox(outboxKey(game));
        markRejected(outboxKey(game));
        changed();
        continue;
      }
      if (!res.ok) throw new TryLater();
      const body = await res.json() as { status: string; weekTotal: number; rank: number | null };
      removeFromOutbox(outboxKey(game));
      if (body.status !== 'ok') markRejected(outboxKey(game));
      setWeek(body.weekTotal, body.rank);
    }
  }

  /** The last copy of a week's board, if it is still that week's. */
  function lastBoard(week: WeekPick): Board | null {
    const copy = storage.get<Partial<Record<WeekPick, Board>>>(BOARD_KEY)?.[week];
    return copy && copy.week === (week === 'this' ? weekOf(now()) : addWeeks(weekOf(now()), -1)) && Array.isArray(copy.rows) ? copy : null;
  }

  let freshUntil = 0;
  let flushing: Promise<void> | null = null;
  let again = false;

  async function sendOnce() {
    const quietly = () => sendAll().catch((e) => { if (!(e instanceof TryLater)) console.error('Duel: could not send scores'); });
    // One tab at a time where the browser can arrange it; the server's game identity covers the rest.
    const locks = typeof navigator !== 'undefined' ? navigator.locks : undefined;
    if (locks) await locks.request('panna-duel-flush', quietly).catch(() => {});
    else await quietly();
  }

  /** A flush asked for during another runs once more after it: the connection may have just come back. */
  function flush(): Promise<void> {
    if (flushing) { again = true; return flushing; }
    flushing = (async () => {
      do { again = false; await sendOnce(); } while (again);
      flushing = null;
    })();
    return flushing;
  }

  return {
    enqueue(game: OutboxGame) {
      storage.set(OUTBOX_KEY, mergeOutbox(readOutbox(storage.get(OUTBOX_KEY)), [game]));
      changed();
      void flush();
    },
    flush,
    player,
    week: readWeek,
    unsent: () => readOutbox(storage.get(OUTBOX_KEY)),
    statusOf(puzzle, seed) {
      const key = outboxKey({ puzzle, seed });
      if (readOutbox(storage.get(OUTBOX_KEY)).some(g => outboxKey(g) === key)) return 'waiting';
      const rejected = storage.get<string[]>(REJECTED_KEY);
      return Array.isArray(rejected) && rejected.includes(key) ? 'rejected' : 'sent';
    },
    lastBoard,
    async board(week: WeekPick) {
      const cached = lastBoard(week);
      const wanted = week === 'this' ? weekOf(now()) : addWeeks(weekOf(now()), -1);
      // The CDN's copy can't be used just after a rename (it still has the old name) or just after Monday midnight.
      const ask = (fresh: boolean) => call(`leaderboard?week=${week}${fresh ? `&t=${now().getTime()}` : ''}`);
      try {
        let res = await ask(now().getTime() < freshUntil);
        if (!res.ok) return { data: cached, stale: true };
        let data = await res.json() as Board;
        if (data.week !== wanted) {
          res = await ask(true);
          if (!res.ok) return { data: cached, stale: true };
          data = await res.json() as Board;
        }
        storage.set(BOARD_KEY, { ...(storage.get<Partial<Record<WeekPick, Board>>>(BOARD_KEY) ?? {}), [week]: data });
        return { data, stale: false };
      } catch {
        return { data: cached, stale: true };
      }
    },
    async me(week: WeekPick): Promise<Me | null> {
      const p = player();
      if (!p?.name) return null;
      try {
        const res = await call(`leaderboard/me?week=${week}`, { headers: auth(p) });
        if (!res.ok) return null;
        const me = await res.json() as Me;
        setName(me.name); // a new name given on another device comes through here
        if (week === 'this') setWeek(me.points, me.rank);
        return me;
      } catch {
        return null;
      }
    },
    async rename(name: string) {
      const p = player();
      if (!p?.name) return { ok: false, error: 'offline' };
      try {
        const res = await call('players/me', sendJson('PATCH', { name }, auth(p)));
        const body = await res.json().catch(() => ({})) as { name?: string; error?: string };
        if (res.ok && body.name) {
          setName(body.name);
          freshUntil = now().getTime() + CDN_STALE_MS;
          return { ok: true };
        }
        return { ok: false, error: body.error ?? 'offline' };
      } catch {
        return { ok: false, error: 'offline' };
      }
    },
    markSeen(rank: number | null, points: number) {
      const w = readWeek();
      if (w) storage.set(WEEK_KEY, { ...w, seen: { rank, points } });
    },
    subscribe(fn) { listeners.add(fn); return () => { listeners.delete(fn); }; },
  };
}
