// "Report a problem" with an entry: what a report may say, shared by the word card's form and /api/report.

export const ISSUES = [
  { id: 'hindi', en: 'The Hindi meaning is wrong', hi: 'हिंदी अर्थ गलत है' },
  { id: 'definition', en: 'The English definition is wrong', hi: 'अंग्रेज़ी परिभाषा गलत है' },
  { id: 'pronunciation', en: 'The pronunciation is wrong', hi: 'उच्चारण गलत है' },
  { id: 'pos', en: 'The word type is wrong (noun, verb…)', hi: 'शब्द का प्रकार गलत है' },
  { id: 'related', en: 'A similar or opposite word is wrong', hi: 'मिलता-जुलता या उल्टा शब्द गलत है' },
  { id: 'other', en: 'Something else', hi: 'कुछ और' },
] as const;

export type IssueId = typeof ISSUES[number]['id'];
export const NOTE_MAX = 500;

export interface ReportInput {
  headword: string;
  issues: IssueId[];
  note: string;
  /** The book build the reader saw, so a report can be matched to the text they read. */
  data_version: string;
}

/** Checks and tidies a report from the outside world; returns a message instead when it cannot be accepted. */
export function validateReport(raw: unknown): { ok: true; report: ReportInput } | { ok: false; error: string } {
  if (!raw || typeof raw !== 'object') return { ok: false, error: 'Not a report.' };
  const r = raw as Record<string, unknown>;
  const headword = typeof r.headword === 'string' ? r.headword.trim() : '';
  if (!headword || headword.length > 80) return { ok: false, error: 'Which word is this about?' };
  const ids = new Set<string>(ISSUES.map((i) => i.id));
  const list: unknown[] = Array.isArray(r.issues) ? r.issues : [];
  if (!list.length || list.some((i) => typeof i !== 'string' || !ids.has(i))) return { ok: false, error: 'Choose what is wrong.' };
  const issues = [...new Set(list as IssueId[])];
  // Notes are plain text: control characters dropped, whitespace tidied, length capped.
  const note = typeof r.note === 'string' ? r.note.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '').replace(/[ \t]+/g, ' ').trim() : '';
  if (note.length > NOTE_MAX) return { ok: false, error: `Please keep the note under ${NOTE_MAX} characters.` };
  const data_version = typeof r.data_version === 'string' ? r.data_version.slice(0, 40) : '';
  return { ok: true, report: { headword, issues, note, data_version } };
}

/**
 * At most `limit` reports per sender per window, to keep out floods. Kept in memory only (forgotten on restart);
 * the caller passes a hash of the address, never the address itself.
 */
export function rateLimiter(limit: number, windowMs = 3_600_000, maxSenders = 5000) {
  const recent = new Map<string, number[]>();
  return (sender: string, now = Date.now()): boolean => {
    const times = (recent.get(sender) ?? []).filter((t) => now - t < windowMs);
    const ok = times.length < limit;
    if (ok) times.push(now);
    recent.delete(sender);
    recent.set(sender, times); // most recent last, so the oldest senders are dropped first
    if (recent.size > maxSenders) recent.delete(recent.keys().next().value as string);
    return ok;
  };
}

// ── Reports waiting to be sent (offline), kept in this browser ──

export const QUEUE_KEY = 'panna_report_queue';
export type QueuedReport = ReportInput & { queued_at: number };

export function loadQueue(): QueuedReport[] {
  try { const q = JSON.parse(localStorage.getItem(QUEUE_KEY) || '[]'); return Array.isArray(q) ? q : []; } catch { return []; }
}

export function saveQueue(queue: QueuedReport[]): void {
  try {
    if (queue.length) localStorage.setItem(QUEUE_KEY, JSON.stringify(queue.slice(-50)));
    else localStorage.removeItem(QUEUE_KEY);
  } catch {}
}

/** Sends a report: 'sent', 'later' (offline, busy or the server is unavailable: keep it and retry) or 'rejected'. */
export async function sendReport(report: ReportInput): Promise<'sent' | 'later' | 'rejected'> {
  try {
    const res = await fetch('/api/report', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(report) });
    if (res.ok) return 'sent';
    return res.status >= 500 || res.status === 429 ? 'later' : 'rejected';
  } catch {
    return 'later';
  }
}

/** Sends any reports saved while offline; keeps the ones that still cannot go. */
export async function flushQueue(): Promise<number> {
  const queue = loadQueue();
  if (!queue.length) return 0;
  const left: QueuedReport[] = [];
  let sent = 0;
  for (const r of queue) {
    const outcome = await sendReport(r);
    if (outcome === 'sent') sent++;
    else if (outcome === 'later') left.push(r);
  }
  saveQueue(left);
  return sent;
}
