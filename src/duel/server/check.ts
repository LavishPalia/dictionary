// Checking a reported game (tech design §4.2): the server replays the moves and keeps its own score.
import { replay, RULES_ID, type Action } from '../engine';
import { istToday } from '../progress';
import { loadPublished } from './puzzles';

const MAX_ACTIONS = 600;
const MIN_GAME_MS = 60_000;

export type RejectReason = 'puzzle' | 'rules' | 'illegal' | 'unfinished' | 'mismatch' | 'future' | 'times' | 'too_fast';

export interface ReportedGame {
  puzzle: string; date: string; seed: number; rules: string; actions: Action[];
  startedAt: string; finishedAt: string; claimedScore: number;
}

export interface CheckResult { reason: RejectReason | null; score: number; quillScore: number }

const isInt = (v: unknown): v is number => Number.isInteger(v);
const isTime = (v: unknown): v is string => typeof v === 'string' && v.length <= 40 && !Number.isNaN(Date.parse(v));

function isDate(v: unknown): v is string {
  if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return false;
  const d = new Date(`${v}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v;
}

/** A clean copy of an action, or null. Replay never sees a string where a number belongs. */
function cleanAction(a: unknown): Action | null {
  if (!a || typeof a !== 'object') return null;
  const x = a as Record<string, unknown>;
  switch (x.t) {
    case 'pass': return { t: 'pass' };
    case 'hint': return { t: 'hint' };
    case 'reveal': return typeof x.slot === 'string' && x.slot.length <= 16 ? { t: 'reveal', slot: x.slot } : null;
    case 'swap':
      return Array.isArray(x.rackSlots) && x.rackSlots.length <= 5 && x.rackSlots.every(isInt) ? { t: 'swap', rackSlots: x.rackSlots as number[] } : null;
    case 'submit': {
      if (!Array.isArray(x.place) || x.place.length > 5) return null;
      const place = x.place.map((p) => (p && typeof p === 'object' && isInt((p as { cell?: unknown }).cell) && isInt((p as { rackSlot?: unknown }).rackSlot)
        ? { cell: (p as { cell: number }).cell, rackSlot: (p as { rackSlot: number }).rackSlot } : null));
      return place.every(Boolean) ? { t: 'submit', place: place as { cell: number; rackSlot: number }[] } : null;
    }
    default: return null;
  }
}

/** The body as a clean report, or null when it isn't one at all. */
export function readReport(body: unknown): ReportedGame | null {
  if (!body || typeof body !== 'object') return null;
  const b = body as Record<string, unknown>;
  if (typeof b.puzzle !== 'string' || !/^p\d{4}\.v\d+$/.test(b.puzzle) || !isDate(b.date) || typeof b.rules !== 'string' || b.rules.length > 40) return null;
  if (!isInt(b.seed) || b.seed < 0 || b.seed > 0xffffffff || !isInt(b.claimedScore) || !isTime(b.startedAt) || !isTime(b.finishedAt)) return null;
  if (!Array.isArray(b.actions) || b.actions.length > MAX_ACTIONS) return null;
  const actions = b.actions.map(cleanAction);
  if (!actions.every(Boolean)) return null;
  return { puzzle: b.puzzle, date: b.date, seed: b.seed, rules: b.rules, actions: actions as Action[], startedAt: b.startedAt, finishedAt: b.finishedAt, claimedScore: b.claimedScore };
}

/** Overlapping games are fine: each date keeps its own save, and two devices can share a player. */
export function checkGame(g: ReportedGame, now: Date): CheckResult {
  const rejected = (reason: RejectReason, score = 0, quillScore = 0): CheckResult => ({ reason, score, quillScore });
  const puzzle = loadPublished(g.puzzle);
  if (!puzzle) return rejected('puzzle');
  if (g.rules !== RULES_ID) return rejected('rules');
  if (g.date > istToday(now)) return rejected('future');
  // The device's own two times, so a clock that is simply fast still gives a true length of game.
  const length = Date.parse(g.finishedAt) - Date.parse(g.startedAt);
  if (length < 0) return rejected('times');
  if (length < MIN_GAME_MS) return rejected('too_fast');

  let end;
  try { end = replay(puzzle, g.seed, g.actions); } catch { return rejected('illegal'); }
  if (!end.over) return rejected('unfinished', end.scores.you, end.scores.quill);
  if (g.claimedScore !== end.scores.you) return rejected('mismatch', end.scores.you, end.scores.quill);
  return { reason: null, score: end.scores.you, quillScore: end.scores.quill };
}
