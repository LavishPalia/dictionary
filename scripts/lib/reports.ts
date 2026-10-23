// Readers' problem reports (data/reports/reports.jsonl, written by /api/report): read, and summarised per word with
// the most-reported first, for the Hindi review. Used by scripts/reports.ts.
import fs from 'fs';
import path from 'path';

export const REPORTS_FILE = process.env.REPORTS_FILE || path.join(process.cwd(), 'data', 'reports', 'reports.jsonl');

export interface ReportRecord {
  id: string; received_at: string; headword: string; normalized: string; page_number: number; reviewed: number;
  issues: string[]; note: string; seen_in: string; book_version: string;
}

export interface WordSummary {
  headword: string; normalized: string; page_number: number; reviewed: number;
  reports: number; issues: Record<string, number>; notes: string[]; last: string;
}

/** Reads the reports file; damaged lines are skipped (and counted). */
export function readReports(file = REPORTS_FILE): { reports: ReportRecord[]; damaged: number } {
  if (!fs.existsSync(file)) return { reports: [], damaged: 0 };
  let damaged = 0;
  const reports: ReportRecord[] = [];
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    if (!line.trim()) continue;
    try { reports.push(JSON.parse(line)); } catch { damaged++; }
  }
  return { reports, damaged };
}

/** One row per word: how many reports, which problems, the notes; most reported first, then most recent. */
export function summarise(reports: ReportRecord[], since?: string): WordSummary[] {
  const by = new Map<string, WordSummary>();
  for (const r of reports) {
    if (since && r.received_at < since) continue;
    const s = by.get(r.normalized) ?? { headword: r.headword, normalized: r.normalized, page_number: r.page_number, reviewed: r.reviewed,
      reports: 0, issues: {}, notes: [], last: '' };
    s.reports++;
    for (const i of r.issues) s.issues[i] = (s.issues[i] ?? 0) + 1;
    if (r.note) s.notes.push(r.note);
    if (r.received_at > s.last) { s.last = r.received_at; s.page_number = r.page_number; s.reviewed = r.reviewed; }
    by.set(r.normalized, s);
  }
  return [...by.values()].sort((a, b) => b.reports - a.reports || (a.last < b.last ? 1 : -1));
}

export const issueText = (issues: Record<string, number>) =>
  Object.entries(issues).sort((a, b) => b[1] - a[1]).map(([k, n]) => (n > 1 ? `${k}×${n}` : k)).join(', ');

/** A CSV cell: quoted, with quotes doubled. */
export const csv = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;
