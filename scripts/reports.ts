// Readers' problem reports, most-reported words first, with the entry as it is now.
// Usage: npm run reports [-- --since 2026-10-01] [-- --csv reports.csv]
import fs from 'fs';
import Database from 'better-sqlite3';
import { REPORTS_FILE, csv, issueText, readReports, summarise } from './lib/reports';

const args = process.argv.slice(2);
const arg = (name: string) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : undefined; };
const since = arg('--since');
const out = arg('--csv');

const { reports, damaged } = readReports();
const words = summarise(reports, since);
if (!reports.length) { console.log(`No reports yet (${REPORTS_FILE}).`); process.exit(0); }

type Current = { pos: string; meaning_hi: string; definition_en: string; page_number: number; reviewed: number };
const db = new Database('data/dictionary.db', { readonly: true, fileMustExist: true });
const current = db.prepare('SELECT pos, meaning_hi, definition_en, page_number, reviewed FROM entries WHERE normalized = ?');
const total = words.reduce((n, w) => n + w.reports, 0);
console.log(`${total} report${total === 1 ? '' : 's'} on ${words.length} word${words.length === 1 ? '' : 's'}${since ? ` since ${since}` : ''}` +
  `${damaged ? ` (${damaged} damaged line${damaged === 1 ? '' : 's'} skipped)` : ''}.\n`);
for (const w of words.slice(0, 40)) {
  const e = current.get(w.normalized) as Current | undefined;
  console.log(`${String(w.reports).padStart(3)}  ${w.headword} (p. ${e?.page_number ?? w.page_number}${e?.reviewed ? '' : ', machine-written'}): ${issueText(w.issues)}`);
  if (e) console.log(`       now: ${e.meaning_hi} · ${e.definition_en}`);
  for (const n of w.notes.slice(-3)) console.log(`       “${n}”`);
}
if (words.length > 40) console.log(`\n…and ${words.length - 40} more. Use --csv for all of them.`);

if (out) {
  const rows = [['headword', 'page', 'reports', 'problems', 'notes', 'meaning_hi now', 'definition now', 'pos', 'machine-written', 'last reported']];
  for (const w of words) {
    const e = current.get(w.normalized) as Current | undefined;
    rows.push([w.headword, String(e?.page_number ?? w.page_number), String(w.reports), issueText(w.issues), w.notes.join(' | '),
      e?.meaning_hi ?? '', e?.definition_en ?? '', e?.pos ?? '', e && !e.reviewed ? 'yes' : 'no', w.last.slice(0, 10)]);
  }
  // A byte-order mark so Excel opens the Hindi correctly.
  fs.writeFileSync(out, '﻿' + rows.map((r) => r.map(csv).join(',')).join('\r\n') + '\r\n', 'utf8');
  console.log(`\nWrote ${words.length} rows to ${out}.`);
}
