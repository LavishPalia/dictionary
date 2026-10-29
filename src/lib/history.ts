// Every word the reader looks up, newest first, kept on this device. Each word carries the times it was
// looked up in the last 30 days so the app can notice a word that keeps coming back.
export type LookupSource = 'search' | 'voice' | 'share' | 'book' | 'other';

export interface HistoryWord {
  normalized: string;
  headword: string;
  meaning_hi: string;
  first_at: number;
  last_at: number;
  count: number;
  lookups: number[]; // timestamps within the last 30 days
  source: LookupSource;
  page: number | null;
  nudged?: boolean;
}

export interface LookupWord {
  normalized: string;
  headword: string;
  meaning_hi?: string;
  page?: number | null;
}

export const HISTORY_KEY = 'panna_history';
export const HISTORY_MAX = 1000;
export const REPEAT_MS = 600_000;
export const WINDOW_MS = 30 * 86_400_000;
export const NUDGE_AT = 3;

const RECENT_KEY = 'panna_recent_searches';
const SOURCES: readonly string[] = ['search', 'voice', 'share', 'book', 'other'];
const WEEK_MS = 7 * 86_400_000;

export function isHistoryWord(v: unknown): v is HistoryWord {
  if (!v || typeof v !== 'object') return false;
  const w = v as Record<string, unknown>;
  return typeof w.normalized === 'string' && w.normalized !== ''
    && typeof w.headword === 'string'
    && typeof w.meaning_hi === 'string'
    && Number.isFinite(w.first_at) && Number.isFinite(w.last_at) && Number.isFinite(w.count)
    && Array.isArray(w.lookups) && w.lookups.every((t) => Number.isFinite(t))
    && typeof w.source === 'string' && SOURCES.includes(w.source)
    && (w.page === null || Number.isFinite(w.page))
    && (w.nudged === undefined || typeof w.nudged === 'boolean');
}

const inWindow = (lookups: number[], now: number) => lookups.filter((t) => t > now - WINDOW_MS);

export function recordLookup(list: HistoryWord[], word: LookupWord, source: LookupSource, now: number): HistoryWord[] {
  const existing = list.find((w) => w.normalized === word.normalized);
  const rest = list.filter((w) => w.normalized !== word.normalized);
  const page = word.page ?? null;
  let next: HistoryWord;
  if (!existing) {
    next = {
      normalized: word.normalized, headword: word.headword, meaning_hi: word.meaning_hi ?? '',
      first_at: now, last_at: now, count: 1, lookups: [now], source, page,
    };
  } else if (now - existing.last_at < REPEAT_MS) {
    next = {
      ...existing, headword: word.headword, meaning_hi: word.meaning_hi || existing.meaning_hi,
      last_at: now, lookups: inWindow(existing.lookups, now), source, page,
    };
  } else {
    next = {
      ...existing, headword: word.headword, meaning_hi: word.meaning_hi || existing.meaning_hi,
      last_at: now, count: existing.count + 1, lookups: [...inWindow(existing.lookups, now), now], source, page,
    };
  }
  return [next, ...rest].slice(0, HISTORY_MAX);
}

export function touchWord(list: HistoryWord[], normalized: string, now: number): HistoryWord[] {
  const existing = list.find((w) => w.normalized === normalized);
  if (!existing) return list;
  return [{ ...existing, last_at: now }, ...list.filter((w) => w.normalized !== normalized)];
}

export function removeWord(list: HistoryWord[], normalized: string): HistoryWord[] {
  return list.filter((w) => w.normalized !== normalized);
}

export function markNudged(list: HistoryWord[], normalized: string): HistoryWord[] {
  return list.map((w) => (w.normalized === normalized ? { ...w, nudged: true } : w));
}

export function shouldNudge(word: HistoryWord | undefined, saved: boolean, now: number): { times: number; span: 'week' | 'month' } | null {
  if (!word || saved || word.nudged) return null;
  const recent = inWindow(word.lookups, now);
  if (recent.length < NUDGE_AT) return null;
  return { times: recent.length, span: now - Math.min(...recent) <= WEEK_MS ? 'week' : 'month' };
}

// The old "recent searches" list becomes history: same order, one lookup each, just now.
export function foldRecent(recent: unknown, now: number): HistoryWord[] {
  if (!Array.isArray(recent)) return [];
  const items = recent.filter((r): r is { headword: string; page?: unknown } => typeof r?.headword === 'string' && r.headword !== '');
  return items.map((r, i) => {
    const at = now - i;
    return {
      normalized: r.headword.toLowerCase(), headword: r.headword, meaning_hi: '',
      first_at: at, last_at: at, count: 1, lookups: [at], source: 'search' as const,
      page: Number.isInteger(r.page) ? (r.page as number) : null,
    };
  });
}

export function mergeHistory(a: HistoryWord[], b: HistoryWord[]): HistoryWord[] {
  const now = Math.max(0, ...a.map((w) => w.last_at), ...b.map((w) => w.last_at));
  const byWord = new Map<string, HistoryWord>();
  for (const w of [...a, ...b]) {
    const have = byWord.get(w.normalized);
    if (!have) { byWord.set(w.normalized, w); continue; }
    const newer = w.last_at > have.last_at ? w : have;
    const older = newer === w ? have : w;
    const nudged = have.nudged || w.nudged;
    byWord.set(w.normalized, {
      ...newer,
      meaning_hi: newer.meaning_hi || older.meaning_hi,
      first_at: Math.min(have.first_at, w.first_at),
      last_at: newer.last_at,
      count: Math.max(have.count, w.count),
      lookups: inWindow([...new Set([...have.lookups, ...w.lookups])], now).sort((x, y) => x - y),
      ...(nudged ? { nudged: true } : {}),
    });
  }
  return [...byWord.values()].sort((x, y) => y.last_at - x.last_at).slice(0, HISTORY_MAX);
}

export function loadHistory(): HistoryWord[] {
  try {
    const raw = localStorage.getItem(HISTORY_KEY);
    if (raw === null) {
      const folded = foldRecent(JSON.parse(localStorage.getItem(RECENT_KEY) || '[]'), Date.now());
      return saveHistory(folded);
    }
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter(isHistoryWord).slice(0, HISTORY_MAX) : [];
  } catch {
    return [];
  }
}

export function saveHistory(list: HistoryWord[]): HistoryWord[] {
  try { localStorage.setItem(HISTORY_KEY, JSON.stringify(list)); } catch {}
  return list;
}

export function sourceLabel(word: HistoryWord): string {
  switch (word.source) {
    case 'search': return 'searched';
    case 'voice': return 'spoken';
    case 'share': return 'shared';
    case 'book': return word.page ? `on page ${word.page}` : 'in the book';
    default: return '';
  }
}

/** A search-box recent: a history word seen from the search box. Its page may be from an older build of the book, so
 *  callers look the headword up again rather than trusting it. */
export interface RecentWord {
  headword: string;
  page: number;
}

export const RECENT_MAX = 8;

/** The search box's recent words: the newest history words, whatever their source. */
export function recentWords(list: HistoryWord[]): RecentWord[] {
  return list.slice(0, RECENT_MAX).map((w) => ({ headword: w.headword, page: w.page ?? 1 }));
}
