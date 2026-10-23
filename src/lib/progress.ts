// Progress you can see: how many saved words are new, being learned or mastered, and which recent days had a review.
// Pure functions over the review records (src/lib/review.ts), shared by Today and Saved.
import { localDate, statusOf, type ReviewRecords, type ReviewStatus } from './review';

export interface Progress { total: number; new: number; learning: number; mastered: number }

export function progressOf(saved: string[], records: ReviewRecords): Progress {
  const p: Progress = { total: saved.length, new: 0, learning: 0, mastered: 0 };
  for (const key of saved) p[statusOf(records[key])]++;
  return p;
}

export interface CalendarDay { date: string; reviewed: boolean; today: boolean }

/** The last `n` days, oldest first, each marked if a review happened that day (reader's time zone). */
export function calendar(days: string[], now: number, n = 30): CalendarDay[] {
  const reviewed = new Set(days);
  const today = localDate(now);
  const out: CalendarDay[] = [];
  const d = new Date(now);
  d.setHours(12, 0, 0, 0); // midday, so daylight-saving changes never skip or repeat a date
  for (let i = n - 1; i >= 0; i--) {
    const day = localDate(new Date(d.getFullYear(), d.getMonth(), d.getDate() - i, 12).getTime());
    out.push({ date: day, reviewed: reviewed.has(day), today: day === today });
  }
  return out;
}

/** The longest run of consecutive review days ever recorded. */
export function bestStreak(days: string[]): number {
  const sorted = [...new Set(days)].sort();
  let best = 0;
  let run = 0;
  let prev: number | null = null;
  for (const day of sorted) {
    const [y, m, dd] = day.split('-').map(Number);
    const t = Date.UTC(y, m - 1, dd) / 86_400_000;
    run = prev !== null && t - prev === 1 ? run + 1 : 1;
    best = Math.max(best, run);
    prev = t;
  }
  return best;
}

export const STATUS_LABEL: Record<ReviewStatus, string> = { new: 'New', learning: 'Learning', mastered: 'Mastered' };
