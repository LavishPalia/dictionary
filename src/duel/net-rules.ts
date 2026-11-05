// What the device keeps about the server: its player, the queue of finished games and the last known week. Pure.

export const PLAYER_KEY = 'panna_duel_player';
export const OUTBOX_KEY = 'panna_duel_outbox';
export const REJECTED_KEY = 'panna_duel_rejected';
/** Caches of what the server said: never backed up, and cleared when a restore may change the player. */
export const WEEK_KEY = 'panna_duel_week';
export const BOARD_KEY = 'panna_duel_board';

/** `name` is null until the server has given one. */
export interface DuelPlayer { id: string; token: string; name: string | null }

/** A finished game waiting to be sent. Its identity is puzzle + seed: see src/duel/server/games.ts. */
export interface OutboxGame {
  puzzle: string; date: string; seed: number; rules: string; actions: unknown[];
  startedAt: string; finishedAt: string; claimedScore: number;
}

/** The last known week. `dayRank` is the rank when `day` began; `seen` is what the Ranks screen last showed. */
export interface CachedWeek {
  week: string; points: number; rank: number | null;
  day: string; dayRank: number | null;
  seen: { rank: number | null; points: number } | null;
}

export interface BoardRow { rank: number; name: string; points: number; bot: boolean }
export interface Board { week: string; endsAt: string; players: number; rows: BoardRow[] }
export interface Me { name: string; week: string; points: number; games: number; rank: number | null; of: number }

export type WeekPick = 'this' | 'last';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const TOKEN_RE = /^[0-9a-f]{64}$/;

export function readPlayer(raw: unknown): DuelPlayer | null {
  const p = raw as Partial<DuelPlayer> | null;
  if (!p || typeof p !== 'object' || typeof p.id !== 'string' || !UUID_RE.test(p.id) || typeof p.token !== 'string' || !TOKEN_RE.test(p.token)) return null;
  return { id: p.id, token: p.token, name: typeof p.name === 'string' ? p.name : null };
}

export function isOutboxGame(g: unknown): g is OutboxGame {
  const x = g as Partial<OutboxGame> | null;
  return !!x && typeof x === 'object' && typeof x.puzzle === 'string' && typeof x.date === 'string' && Number.isInteger(x.seed)
    && typeof x.rules === 'string' && Array.isArray(x.actions) && typeof x.startedAt === 'string' && typeof x.finishedAt === 'string' && Number.isInteger(x.claimedScore);
}

export const readOutbox = (raw: unknown): OutboxGame[] => (Array.isArray(raw) ? raw.filter(isOutboxGame) : []);

export const outboxKey = (g: { puzzle: string; seed: number }) => `${g.puzzle}:${g.seed}`;

/** The queue with a game added, keeping the first copy of any game already in it. */
export function mergeOutbox(a: OutboxGame[], b: OutboxGame[]): OutboxGame[] {
  const seen = new Set<string>();
  return [...a, ...b].filter((g) => { const k = outboxKey(g); if (seen.has(k)) return false; seen.add(k); return true; });
}
