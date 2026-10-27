// Backup and restore of everything a reader keeps in this browser: saved words, review progress, ribbons, folded
// pages, pencil notes, recent searches and settings. Pure functions over a plain key → JSON-value map, so tests can
// run without a browser; the menu does the downloading and the writing to localStorage.
import type { MarginNote } from './types';
import { isReviewRecord, type ReviewRecords } from './review';
import { relocateMarks, type MarkAnchors } from './marks';

export const BACKUP_FORMAT = 1;
export const LAST_BACKUP_KEY = 'panna_last_backup';

/** Everything that goes into a backup, by localStorage key. */
export const BACKUP_KEYS = [
  'panna_saved_words', 'panna_review', 'panna_bookmarks', 'panna_dog_ears', 'panna_marginalia',
  'panna_mark_anchors', 'panna_settings', 'panna_recent_searches', 'panna_tours',
] as const;
export type BackupKey = typeof BACKUP_KEYS[number];
export type BackupData = Partial<Record<BackupKey, unknown>>;

export interface Backup {
  app: 'panna';
  format: number;
  created_at: string;
  data_version: string;
  data: BackupData;
}

interface SavedWordLike { normalized: string; headword: string; saved_at?: number }

export function createBackup(data: BackupData, dataVersion: string, now = new Date()): Backup {
  return { app: 'panna', format: BACKUP_FORMAT, created_at: now.toISOString(), data_version: dataVersion, data };
}

export function backupFileName(now = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `panna-backup-${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}.json`;
}

const isArray = (v: unknown): v is unknown[] => Array.isArray(v);
const isObject = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);

const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const optionalString = (v: unknown) => v === undefined || typeof v === 'string';

/** A saved word whose text fields are really text, so a hand-edited file can't crash the Saved page. */
export function isSavedWord(w: unknown): boolean {
  return isObject(w) && typeof w.normalized === 'string' && typeof w.headword === 'string'
    && ['pos', 'pronunciation_deva', 'pronunciation_ipa', 'definition_en', 'meaning_hi', 'etymology'].every((k) => optionalString(w[k]))
    && (w.examples === undefined || (isArray(w.examples) && w.examples.every((e) => typeof e === 'string')))
    && (w.saved_at === undefined || isNum(w.saved_at))
    && (w.page_number === undefined || isNum(w.page_number));
}

export function isMarginNote(n: unknown): boolean {
  return isObject(n) && typeof n.id === 'string' && Number.isInteger(n.page_number) && typeof n.text === 'string'
    && ['blue', 'graphite', 'crimson'].includes(n.color as string) && (n.created_at === undefined || isNum(n.created_at))
    && (n.top_pct === undefined || isNum(n.top_pct)) && optionalString(n.anchor);
}

/** Keeps only the well-formed items of a stored list (a damaged item is dropped, not allowed to crash the app). */
export function keepValid<T>(value: unknown, valid: (item: unknown) => boolean): T[] {
  return isArray(value) ? (value.filter(valid) as T[]) : [];
}

export interface BackupSummary { words: number; reviewing: number; pages: number; notes: number; created_at: string }

/** Reads a backup file's text; explains plainly what is wrong if it is not a usable Panna backup. */
export function parseBackup(text: string): { ok: true; backup: Backup; summary: BackupSummary } | { ok: false; error: string } {
  let raw: unknown;
  try { raw = JSON.parse(text); } catch { return { ok: false, error: 'This file isn’t a Panna backup (it can’t be read).' }; }
  if (!isObject(raw) || raw.app !== 'panna' || !isObject(raw.data)) return { ok: false, error: 'This file isn’t a Panna backup.' };
  if (typeof raw.format !== 'number' || raw.format > BACKUP_FORMAT) return { ok: false, error: 'This backup was made by a newer version of Panna. Update the app and try again.' };
  const d = raw.data;
  const checks: Array<[BackupKey, (v: unknown) => boolean]> = [
    ['panna_saved_words', (v) => isArray(v) && v.every(isSavedWord)],
    ['panna_review', (v) => isObject(v) && Object.values(v).every(isReviewRecord)],
    ['panna_bookmarks', (v) => isArray(v) && v.every(Number.isInteger)],
    ['panna_dog_ears', (v) => isArray(v) && v.every(Number.isInteger)],
    ['panna_marginalia', (v) => isArray(v) && v.every(isMarginNote)],
    ['panna_mark_anchors', isObject],
    ['panna_settings', isObject],
    ['panna_recent_searches', isArray],
    ['panna_tours', isObject],
  ];
  for (const [key, valid] of checks) {
    if (d[key] !== undefined && !valid(d[key])) return { ok: false, error: 'This backup is damaged and can’t be restored.' };
  }
  const backup: Backup = {
    app: 'panna', format: raw.format, created_at: typeof raw.created_at === 'string' ? raw.created_at : '',
    data_version: typeof raw.data_version === 'string' ? raw.data_version : '', data: d as BackupData,
  };
  return {
    ok: true,
    backup,
    summary: {
      words: (d.panna_saved_words as unknown[] | undefined)?.length ?? 0,
      reviewing: Object.keys((d.panna_review as object | undefined) ?? {}).length,
      pages: ((d.panna_bookmarks as unknown[] | undefined)?.length ?? 0) + ((d.panna_dog_ears as unknown[] | undefined)?.length ?? 0),
      notes: (d.panna_marginalia as unknown[] | undefined)?.length ?? 0,
      created_at: backup.created_at,
    },
  };
}

/** Anchor words in a backup whose page numbers come from a different book build (to look up before restoring). */
export function wordsToLocate(backup: Backup, currentVersion: string): string[] {
  const anchors = backup.data.panna_mark_anchors as MarkAnchors | undefined;
  if (!anchors || anchors.data_version === currentVersion) return [];
  const notes = (backup.data.panna_marginalia as MarginNote[] | undefined) ?? [];
  return [...new Set([...Object.values(anchors.ribbons ?? {}), ...Object.values(anchors.dogEars ?? {}), ...notes.map((n) => n.anchor).filter((a): a is string => !!a)])];
}

type ToursLike = { seen?: Record<string, number>; tips?: Record<string, number>; welcomeDone?: boolean; tipsOff?: boolean; listOpened?: boolean };

/** Tours and tips seen on either side stay seen; this browser's choice about tips wins. */
function mergeTours(current: unknown, backup: unknown): ToursLike {
  const c = (isObject(current) ? current : {}) as ToursLike;
  const b = (isObject(backup) ? backup : {}) as ToursLike;
  const earliest = (x: Record<string, number> = {}, y: Record<string, number> = {}) => {
    const out = { ...y };
    for (const [k, v] of Object.entries(x)) out[k] = out[k] === undefined ? v : Math.min(out[k], v);
    return out;
  };
  return {
    seen: earliest(c.seen, b.seen), tips: earliest(c.tips, b.tips),
    welcomeDone: Boolean(c.welcomeDone || b.welcomeDone), tipsOff: c.tipsOff ?? b.tipsOff ?? false,
    listOpened: Boolean(c.listOpened || b.listOpened),
  };
}

/**
 * The data to write after restoring. "replace" makes this browser match the backup; "merge" keeps both: words and
 * notes are combined, for review progress the more recently studied copy of each word wins, and this browser's
 * settings stay. Marks from another book build are first moved using `located` (anchor word → current page).
 */
export function restoreData(
  current: BackupData, backup: Backup, mode: 'merge' | 'replace',
  book: { dataVersion: string; totalPages: number }, located: Record<string, number> = {},
): BackupData {
  const b = { ...backup.data };
  const anchors = b.panna_mark_anchors as MarkAnchors | undefined;
  if (anchors && anchors.data_version !== book.dataVersion) {
    const moved = relocateMarks(
      { ribbons: (b.panna_bookmarks as number[]) ?? [], dogEars: (b.panna_dog_ears as number[]) ?? [], notes: (b.panna_marginalia as MarginNote[]) ?? [] },
      { data_version: anchors.data_version, ribbons: anchors.ribbons ?? {}, dogEars: anchors.dogEars ?? {} },
      located, book.totalPages, book.dataVersion,
    );
    Object.assign(b, { panna_bookmarks: moved.ribbons, panna_dog_ears: moved.dogEars, panna_marginalia: moved.notes, panna_mark_anchors: moved.anchors });
  }
  if (mode === 'replace') {
    return Object.fromEntries(BACKUP_KEYS.map((k) => [k, b[k] ?? (k === 'panna_review' || k === 'panna_settings' || k === 'panna_tours' ? {} : [])])) as BackupData;
  }

  const words = new Map<string, SavedWordLike>();
  for (const w of [...((current.panna_saved_words as SavedWordLike[]) ?? []), ...((b.panna_saved_words as SavedWordLike[]) ?? [])]) {
    const prior = words.get(w.normalized);
    // Keep the earliest save date, so "saved today" does not reset for words saved long ago.
    if (!prior || (w.saved_at ?? Infinity) < (prior.saved_at ?? Infinity)) words.set(w.normalized, prior ? { ...prior, saved_at: w.saved_at } : w);
  }
  const review: ReviewRecords = { ...((current.panna_review as ReviewRecords) ?? {}) };
  for (const [key, rec] of Object.entries((b.panna_review as ReviewRecords) ?? {})) {
    if (!review[key] || (rec.last_at ?? 0) > (review[key].last_at ?? 0)) review[key] = rec;
  }
  const union = (a: unknown, c: unknown) => [...new Set([...((a as number[]) ?? []), ...((c as number[]) ?? [])])].sort((x, y) => x - y);
  const notes = new Map<string, MarginNote>();
  for (const n of [...((current.panna_marginalia as MarginNote[]) ?? []), ...((b.panna_marginalia as MarginNote[]) ?? [])]) if (!notes.has(n.id)) notes.set(n.id, n);
  const curAnchors = current.panna_mark_anchors as MarkAnchors | undefined;
  const bAnchors = b.panna_mark_anchors as MarkAnchors | undefined;
  const recent = [...((current.panna_recent_searches as Array<{ headword: string }>) ?? []), ...((b.panna_recent_searches as Array<{ headword: string }>) ?? [])]
    .filter((r, i, all) => all.findIndex((x) => x.headword.toLowerCase() === r.headword.toLowerCase()) === i).slice(0, 8);
  return {
    panna_saved_words: [...words.values()],
    panna_review: review,
    panna_bookmarks: union(current.panna_bookmarks, b.panna_bookmarks),
    panna_dog_ears: union(current.panna_dog_ears, b.panna_dog_ears),
    panna_marginalia: [...notes.values()],
    panna_mark_anchors: {
      data_version: book.dataVersion,
      ribbons: { ...(bAnchors?.ribbons ?? {}), ...(curAnchors?.ribbons ?? {}) },
      dogEars: { ...(bAnchors?.dogEars ?? {}), ...(curAnchors?.dogEars ?? {}) },
    },
    panna_settings: current.panna_settings ?? b.panna_settings ?? {},
    panna_recent_searches: recent,
    panna_tours: mergeTours(current.panna_tours, b.panna_tours),
  };
}
