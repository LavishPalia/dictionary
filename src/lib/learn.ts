// The study guide's "next step" rules. First match wins.
import { localDate } from './review';

export const NEW_WORDS_PER_DAY = 10;
export const BACKUP_AFTER_DAYS = 30;

export type StepId = 'first-save' | 'review' | 'backup' | 'add-words' | 'done-today';

export interface LearnState {
  saved: Array<{ normalized: string; saved_at?: number }>;
  dueCount: number;
  lastBackupAt: number | null;
  now: number;
}

export interface NextStep { id: StepId; count?: number }

/** Words saved during the reader's local day. Words with no saved_at never count. */
export function savedToday(saved: LearnState['saved'], now: number): number {
  const today = localDate(now);
  return saved.filter((w) => w.saved_at !== undefined && localDate(w.saved_at) === today).length;
}

export function nextStep(s: LearnState): NextStep {
  if (s.saved.length === 0) return { id: 'first-save' };
  if (s.dueCount > 0) return { id: 'review', count: s.dueCount };
  const backupStale = s.lastBackupAt === null || s.now - s.lastBackupAt > BACKUP_AFTER_DAYS * 24 * 60 * 60 * 1000;
  if (s.saved.length >= 20 && backupStale) return { id: 'backup' };
  const today = savedToday(s.saved, s.now);
  if (today < NEW_WORDS_PER_DAY) return { id: 'add-words', count: NEW_WORDS_PER_DAY - today };
  return { id: 'done-today' };
}
