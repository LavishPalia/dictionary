import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { getMeta, getWordEntry } from '@/lib/book-data';
import { REPORTS_ENABLED, rateLimiter, validateReport } from '@/lib/report';

export const dynamic = 'force-dynamic';

// POST /api/report: a reader reports a problem with an entry ("Report a problem" on the word card).
// Saved as one JSON line in REPORTS_FILE (default data/reports/reports.jsonl), and also sent to REPORTS_WEBHOOK_URL
// when that is set (for hosts that cannot keep files). No personal data is stored: not the IP address, not the
// browser. Read them with `npm run reports`.
const REPORTS_FILE = process.env.REPORTS_FILE || path.join(process.cwd(), 'data', 'reports', 'reports.jsonl');
const WEBHOOK = process.env.REPORTS_WEBHOOK_URL;
const LIMIT_PER_HOUR = Number(process.env.REPORTS_PER_HOUR || 20);
const MAX_BODY = 4096;

const allowed = rateLimiter(LIMIT_PER_HOUR);

export async function POST(request: NextRequest) {
  if (!REPORTS_ENABLED) return NextResponse.json({ error: 'Not found.' }, { status: 404 });
  const text = await request.text();
  if (text.length > MAX_BODY) return NextResponse.json({ error: 'Too long.' }, { status: 413 });
  let body: unknown;
  try { body = JSON.parse(text); } catch { return NextResponse.json({ error: 'Not a report.' }, { status: 400 }); }
  const checked = validateReport(body);
  if (!checked.ok) return NextResponse.json({ error: checked.error }, { status: 400 });
  const { report } = checked;

  const found = getWordEntry(report.headword);
  if (!found.entry) return NextResponse.json({ error: 'That word is not in Panna.' }, { status: 404 });

  // A hash of the address, so the limit works without keeping the address itself.
  const sender = crypto.createHash('sha256').update(request.headers.get('x-forwarded-for')?.split(',')[0].trim() || 'local').digest('hex');
  if (!allowed(sender)) return NextResponse.json({ error: 'Too many reports for now. Please try again later.' }, { status: 429 });

  const record = {
    id: crypto.randomUUID(),
    received_at: new Date().toISOString(),
    headword: found.entry.headword,
    normalized: found.entry.normalized,
    page_number: found.entry.page_number,
    reviewed: found.entry.reviewed,
    issues: report.issues,
    note: report.note,
    seen_in: report.data_version, // the book build the reader was reading
    book_version: getMeta().data_version,
  };

  let stored = false;
  try {
    await fs.mkdir(path.dirname(REPORTS_FILE), { recursive: true });
    await fs.appendFile(REPORTS_FILE, `${JSON.stringify(record)}\n`, 'utf8');
    stored = true;
  } catch (err) {
    console.error('Could not save a report:', (err as Error).message);
  }
  if (WEBHOOK) {
    try {
      const res = await fetch(WEBHOOK, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(record), signal: AbortSignal.timeout(5000),
      });
      stored ||= res.ok;
    } catch (err) {
      console.error('Could not forward a report:', (err as Error).message);
    }
  }
  if (!stored) return NextResponse.json({ error: 'Reports can’t be saved right now.' }, { status: 503 });
  return NextResponse.json({ ok: true, id: record.id });
}
