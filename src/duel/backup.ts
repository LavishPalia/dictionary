// The Duel inside Panna's backup file [user, 6 Nov]: games, progress, help and the player, id and token included,
// so a backup restores everything on a cleared or new phone. Pure; src/components/shell/BackupManager.tsx does the
// reading and writing of localStorage.
//
// A file made before this has no Duel data, and restoring it leaves the Duel alone, even with "Replace everything".
// Unsent scores are never dropped: they go out as whichever player the device ends up with.
//
// Two devices restored from one file share one player: one leaderboard row and one total, and each deal counts once
// (see src/duel/server/games.ts). Stars, streak and hints stay separate on each device.
import { HELP_KEY } from './help-rules';
import { BOARD_KEY, isOutboxGame, mergeOutbox, OUTBOX_KEY, PLAYER_KEY, readOutbox, readPlayer, REJECTED_KEY, WEEK_KEY } from './net-rules';
import { readResults, RESULTS_KEY, wonDays, type DuelResult } from './progress';
import { SETTINGS_KEY } from './settings';

const PREFIX = 'panna_duel';
const GUIDE_KEY = 'panna_duel_guide';
const SEALS_KEY = 'panna_duel_home';

type Values = Record<string, unknown>;

const isObject = (v: unknown): v is Values => !!v && typeof v === 'object' && !Array.isArray(v);
const isCache = (key: string) => key === WEEK_KEY || key === BOARD_KEY;

/** What goes into a backup, from localStorage's raw strings. The caches stay out; an unreadable value is skipped. */
export function collectDuel(entries: Record<string, string>): Values {
  const out: Values = {};
  for (const [key, raw] of Object.entries(entries)) {
    if (!key.startsWith(PREFIX) || isCache(key)) continue;
    try { out[key] = JSON.parse(raw); } catch {}
  }
  return out;
}

/** A hand-edited file can't reach Panna's own keys through here, or hand the Duel a player it can't read. */
export function isDuelBackup(v: unknown): boolean {
  if (!isObject(v) || !Object.keys(v).every(k => k.startsWith(PREFIX) && !isCache(k))) return false;
  if (v[PLAYER_KEY] !== undefined && !readPlayer(v[PLAYER_KEY])) return false;
  if (v[OUTBOX_KEY] !== undefined && !(Array.isArray(v[OUTBOX_KEY]) && v[OUTBOX_KEY].every(isOutboxGame))) return false;
  return v[RESULTS_KEY] === undefined || Array.isArray(v[RESULTS_KEY]);
}

export function duelSummary(v: unknown): { won: number; name: string | null } {
  if (!isObject(v)) return { won: 0, name: null };
  return { won: wonDays(readResults(v[RESULTS_KEY])).size, name: readPlayer(v[PLAYER_KEY])?.name ?? null };
}

/** A device that only opened the Duel once has a section in its file, but nothing in it to restore. */
export function hasDuelData(v: unknown): v is Values {
  if (!isObject(v)) return false;
  return !!readPlayer(v[PLAYER_KEY]) || readResults(v[RESULTS_KEY]).length > 0 || readOutbox(v[OUTBOX_KEY]).length > 0
    || Object.keys(v).some(k => k.startsWith('panna_duel_game:'));
}

const unionStrings = (a: unknown, b: unknown) => [...new Set([...(Array.isArray(a) ? a : []), ...(Array.isArray(b) ? b : [])])];

/** The backup's player takes over [user, 6 Nov]; if it is the same one, this device's copy has the newer name. */
function playerAfter(current: unknown, backup: unknown) {
  const here = readPlayer(current), there = readPlayer(backup);
  return !there || here?.id === there.id ? here : there;
}

function mergeResults(a: unknown, b: unknown): DuelResult[] {
  const seen = new Set<string>();
  return [...readResults(a), ...readResults(b)]
    .filter((r) => { const k = `${r.date}|${r.at}`; if (seen.has(k)) return false; seen.add(k); return true; })
    .sort((x, y) => x.at.localeCompare(y.at));
}

/** Hints and Words earned: the higher of each. Today's free ones are this device's. */
function mergeHelp(here: unknown, there: unknown): unknown {
  if (!isObject(here) || !isObject(here.earned)) return there ?? here;
  if (!isObject(there) || !isObject(there.earned)) return here;
  const a = here.earned as { hint?: number; word?: number }, b = there.earned as { hint?: number; word?: number };
  return { ...here, earned: { hint: Math.max(a.hint ?? 0, b.hint ?? 0), word: Math.max(a.word ?? 0, b.word ?? 0) } };
}

function mergeValue(key: string, here: unknown, there: unknown): unknown {
  switch (key) {
    case RESULTS_KEY: return mergeResults(here, there);
    case HELP_KEY: return mergeHelp(here, there);
    case REJECTED_KEY: return unionStrings(here, there);
    case GUIDE_KEY: return { ...(isObject(there) ? there : {}), ...(isObject(here) ? here : {}), tips: unionStrings((here as Values | null)?.tips, (there as Values | null)?.tips) };
    case SEALS_KEY: return { ...(isObject(there) ? there : {}), ...(isObject(here) ? here : {}), seals: unionStrings((here as Values | null)?.seals, (there as Values | null)?.seals) };
    case SETTINGS_KEY:
    default: return here ?? there; // settings, and each date's game in progress: this device's copy wins
  }
}

/**
 * What to write after a restore. "merge" keeps both sides; "replace" makes the Duel match the backup, except that
 * this device's unsent scores stay. Null: the file has no Duel data, so leave the Duel alone.
 */
export function restoreDuel(current: Values, backup: unknown, mode: 'merge' | 'replace'): { set: Values; remove: string[] } | null {
  if (!hasDuelData(backup)) return null;
  const set: Values = {};
  if (mode === 'merge') {
    for (const key of new Set([...Object.keys(current), ...Object.keys(backup)])) {
      if (!isCache(key)) set[key] = mergeValue(key, current[key], backup[key]);
    }
  } else {
    Object.assign(set, backup);
  }
  // Both modes: the player above, and every unsent game from both sides. The caches may describe another player.
  const player = playerAfter(current[PLAYER_KEY], backup[PLAYER_KEY]);
  if (player) set[PLAYER_KEY] = player; else delete set[PLAYER_KEY];
  const outbox = mergeOutbox(readOutbox(current[OUTBOX_KEY]), readOutbox(backup[OUTBOX_KEY]));
  if (outbox.length) set[OUTBOX_KEY] = outbox; else delete set[OUTBOX_KEY];
  const remove = [WEEK_KEY, BOARD_KEY, ...Object.keys(current).filter(k => !(k in set) && !isCache(k))];
  return { set, remove };
}
