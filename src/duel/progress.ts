// The Duel's progress rules, pure: IST days, finished games, won days, the streak, and which day Play opens.
// Shared by the game and by Panna's Today card. Callers pass the time in; nothing here reads the clock or storage.

const IST_OFFSET_MS = (5 * 60 + 30) * 60 * 1000;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Today's date (YYYY-MM-DD) in India: the Duel's day starts at 00:00 IST. */
export function istToday(now: Date): string {
  return new Date(now.getTime() + IST_OFFSET_MS).toISOString().slice(0, 10);
}

/** A YYYY-MM-DD date moved by n days. */
export function addDays(date: string, n: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** One finished daily game. `puzzle` is the published key ("p0002.v1"). */
export interface DuelResult { date: string; puzzle: string; you: number; quill: number; at: string }

export const RESULTS_KEY = 'panna_duel_results';
/** Set once this device has opened /play, so Panna shows the way in before launch. */
export const SEEN_KEY = 'panna_duel_seen';
export const gameKey = (date: string) => `panna_duel_game:${date}`;

/** The stored results, without anything malformed. Never throws. */
export function readResults(raw: unknown): DuelResult[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter((r): r is DuelResult => !!r && typeof r === 'object'
    && typeof r.date === 'string' && DATE_RE.test(r.date) && typeof r.puzzle === 'string'
    && Number.isFinite(r.you) && Number.isFinite(r.quill) && typeof r.at === 'string');
}

export function wonDays(results: DuelResult[]): Set<string> {
  return new Set(results.filter(r => r.you > r.quill).map(r => r.date));
}

/** Days in a row with that day's daily won, ending today, or yesterday while today is still open. */
export function streak(won: Set<string>, today: string): number {
  let day = won.has(today) ? today : addDays(today, -1);
  let n = 0;
  while (won.has(day)) { n++; day = addDays(day, -1); }
  return n;
}

/**
 * The day Play opens: today if it's scheduled and not won, else the most recent scheduled past day not won,
 * else today (its practice puzzle, or a replay of a won day).
 */
export function playDate(scheduled: string[], won: Set<string>, today: string): string {
  const open = scheduled.filter(d => d <= today && !won.has(d)).sort();
  if (open.includes(today)) return today;
  return open[open.length - 1] ?? today;
}

/** What a date's coin shows on the calendar (UI-DESIGN §3.2). `blank`: no daily that day. */
export interface DayCoin { date: string; kind: 'blank' | 'won' | 'open' | 'latest-open' | 'today' | 'future'; progress: number | null }

/** One month (YYYY-MM). `inProgress` says how far a game under way on a date has got, 0–1, or null. */
export function calendarMonth(month: string, scheduled: string[], results: DuelResult[], inProgress: (date: string) => number | null, today: string): { coins: DayCoin[]; won: number; total: number; sealed: boolean } {
  const [y, m] = month.split('-').map(Number);
  const length = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const days = new Set(scheduled), won = wonDays(results);
  const latestOpen = scheduled.filter(d => d < today && !won.has(d)).sort().pop();
  const coins: DayCoin[] = Array.from({ length }, (_, i) => {
    const date = `${month}-${String(i + 1).padStart(2, '0')}`;
    const kind: DayCoin['kind'] = !days.has(date) ? 'blank' : won.has(date) ? 'won' : date > today ? 'future'
      : date === today ? 'today' : date === latestOpen ? 'latest-open' : 'open';
    return { date, kind, progress: kind === 'blank' || kind === 'future' ? null : inProgress(date) };
  });
  const total = coins.filter(c => c.kind !== 'blank').length, wins = coins.filter(c => c.kind === 'won').length;
  return { coins, won: wins, total, sealed: total === length && wins === total };
}

/** The highest winning score on a date, across replays. */
export function bestFor(results: DuelResult[], date: string): { you: number; quill: number } | null {
  const wins = results.filter(r => r.date === date && r.you > r.quill).sort((a, b) => b.you - a.you);
  return wins.length ? { you: wins[0].you, quill: wins[0].quill } : null;
}

/** The months the calendar can browse: from the first scheduled one to this one. */
export function monthRange(scheduled: string[], today: string): { first: string; last: string } {
  const last = today.slice(0, 7), first = [...scheduled].sort()[0]?.slice(0, 7) ?? last;
  return { first: first < last ? first : last, last };
}
