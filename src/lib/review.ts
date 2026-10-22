// Spaced review of saved words, as simple boxes the reader can understand ("comes back in 3 days").
// A right answer moves a word to the next box; a wrong one sends it back to tomorrow. Pure functions: the
// app keeps the records in localStorage, tests call these directly.

export interface ReviewRecord {
  /** 0 = new, then one box per interval in INTERVAL_DAYS. */
  box: number;
  /** When the word is next due (ms since epoch). */
  due_at: number;
  last_at?: number;
  right: number;
  wrong: number;
}

export type ReviewRecords = Record<string, ReviewRecord>;

/** Days until the next review after reaching box n (index n - 1). */
export const INTERVAL_DAYS = [1, 3, 7, 16, 35];
/** From this box on a word counts as mastered (it comes back after 16 days or more). */
export const MASTERED_BOX = 4;
export const SESSION_SIZE = 20;

const DAY = 24 * 60 * 60 * 1000;

export function newRecord(now: number): ReviewRecord {
  return { box: 0, due_at: now, right: 0, wrong: 0 };
}

/** Start of the reader's day, so "due tomorrow" means tomorrow morning, not 24 hours from now. */
function startOfDay(at: number): number {
  const d = new Date(at);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

export function answer(record: ReviewRecord, correct: boolean, now: number): ReviewRecord {
  const box = correct ? Math.min(record.box + 1, INTERVAL_DAYS.length) : 1;
  const days = INTERVAL_DAYS[box - 1];
  return {
    box,
    due_at: startOfDay(now) + days * DAY,
    last_at: now,
    right: record.right + (correct ? 1 : 0),
    wrong: record.wrong + (correct ? 0 : 1),
  };
}

/** Days until a record next comes back, counted in calendar days. */
export function daysUntil(record: ReviewRecord, now: number): number {
  return Math.max(0, Math.round((startOfDay(record.due_at) - startOfDay(now)) / DAY));
}

export function comesBackLabel(days: number): string {
  if (days <= 0) return 'later today';
  if (days === 1) return 'tomorrow';
  return `in ${days} days`;
}

export type ReviewStatus = 'new' | 'learning' | 'mastered';

export function statusOf(record: ReviewRecord | undefined): ReviewStatus {
  if (!record || (record.right === 0 && record.wrong === 0)) return 'new';
  return record.box >= MASTERED_BOX ? 'mastered' : 'learning';
}

/** Saved words due now, most overdue first, at most SESSION_SIZE. Saved words without a record are new and due. */
export function dueWords(saved: string[], records: ReviewRecords, now: number, limit = SESSION_SIZE): string[] {
  return saved
    .map((key) => ({ key, due: records[key]?.due_at ?? 0 }))
    .filter((w) => w.due <= now)
    .sort((a, b) => a.due - b.due || a.key.localeCompare(b.key))
    .slice(0, limit)
    .map((w) => w.key);
}

/** The earliest future review among saved words, for "Next review tomorrow". */
export function nextDue(saved: string[], records: ReviewRecords, now: number): { at: number; count: number } | null {
  const future = saved.map((k) => records[k]?.due_at ?? 0).filter((at) => at > now);
  if (!future.length) return null;
  const day = startOfDay(Math.min(...future));
  return { at: day, count: future.filter((at) => startOfDay(at) === day).length };
}

export type QuestionKind = 'meaning' | 'word-from-hindi' | 'word-from-definition';

/** New and shaky words get the easiest question (English → Hindi); later boxes mix in the reverse directions. */
export function questionKind(record: ReviewRecord | undefined, seed: number): QuestionKind {
  const box = record?.box ?? 0;
  if (box < 2) return 'meaning';
  const kinds: QuestionKind[] = ['meaning', 'word-from-hindi', 'word-from-definition'];
  return kinds[Math.abs(seed) % kinds.length];
}

const STORAGE_KEY = 'panna_review';

export function loadRecords(): ReviewRecords {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

export function saveRecords(records: ReviewRecords): void {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(records)); } catch {}
}
