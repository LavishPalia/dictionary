// "Report a problem": what a report may contain, the flood limit, and the summary behind `npm run reports`.
// Usage: npx tsx scripts/test-report.ts
import fs from 'fs';
import os from 'os';
import path from 'path';
import { NOTE_MAX, rateLimiter, validateReport } from '../src/lib/report';
import { csv, issueText, readReports, summarise, type ReportRecord } from './lib/reports';

let failures = 0;
function check(label: string, ok: boolean, detail?: unknown) {
  if (ok) console.log(`✓ ${label}`);
  else { failures++; console.error(`✗ ${label}${detail !== undefined ? ` — ${JSON.stringify(detail)}` : ''}`); }
}

const good = validateReport({ headword: ' Camel ', issues: ['hindi', 'hindi', 'pos'], note: '  ऊँट  नहीं,\u0007 टेढ़ा   ', data_version: 'abc' });
check('a report is tidied: trimmed word, issues once each, control characters and extra spaces gone',
  good.ok && good.report.headword === 'Camel' && good.report.issues.join() === 'hindi,pos' && good.report.note === 'ऊँट नहीं, टेढ़ा', good);
check('a report must say what is wrong', !validateReport({ headword: 'Camel', issues: [] }).ok);
check('unknown problems are refused', !validateReport({ headword: 'Camel', issues: ['hindi', 'bogus'] }).ok);
check('a word is required', !validateReport({ issues: ['hindi'] }).ok && !validateReport({ headword: '   ', issues: ['hindi'] }).ok);
check(`notes over ${NOTE_MAX} characters are refused`, !validateReport({ headword: 'Camel', issues: ['other'], note: 'x'.repeat(NOTE_MAX + 1) }).ok);
check('anything that is not a report is refused', !validateReport(null).ok && !validateReport('hi').ok && !validateReport([1]).ok);
check('the note is optional', (() => { const r = validateReport({ headword: 'Camel', issues: ['other'] }); return r.ok && r.report.note === ''; })());

const allow = rateLimiter(3, 1000, 2);
check('the flood limit allows a few reports, then refuses', [0, 1, 2].every((t) => allow('a', t)) && !allow('a', 3));
check('each sender has their own limit', allow('b', 4));
check('the limit lifts after the window', allow('a', 1500));
const small = rateLimiter(1, 1000, 2);
small('x', 0); small('y', 0); small('z', 0);
check('the limiter forgets the oldest senders when full', small('x', 10));

const at = (d: number) => new Date(Date.UTC(2026, 9, d)).toISOString();
const rec = (word: string, d: number, issues: string[], note = ''): ReportRecord => ({
  id: `${word}${d}`, received_at: at(d), headword: word[0].toUpperCase() + word.slice(1), normalized: word, page_number: 16, reviewed: 0,
  issues, note, seen_in: 'v1', book_version: 'v1',
});
const words = summarise([rec('camel', 1, ['hindi'], 'ऊँट'), rec('calm', 3, ['pos']), rec('camel', 2, ['hindi', 'definition'], 'too long'), rec('canal', 4, ['other'])]);
check('the most-reported word comes first, then the most recent', words.map((w) => w.normalized).join() === 'camel,canal,calm', words.map((w) => w.normalized));
check('problems are counted and notes kept', issueText(words[0].issues) === 'hindi×2, definition' && words[0].notes.join('|') === 'ऊँट|too long', words[0]);
check('--since leaves out older reports', summarise([rec('camel', 1, ['hindi']), rec('calm', 5, ['pos'])], at(3)).map((w) => w.normalized).join() === 'calm');
check('CSV cells are quoted, with quotes doubled', csv('say "hi", ok') === '"say ""hi"", ok"');

const tmp = path.join(os.tmpdir(), `panna-reports-${process.pid}.jsonl`);
fs.writeFileSync(tmp, `${JSON.stringify(rec('camel', 1, ['hindi']))}\nnot json\n\n${JSON.stringify(rec('calm', 2, ['pos']))}\n`);
const read = readReports(tmp);
check('a damaged line is skipped, not fatal', read.reports.length === 2 && read.damaged === 1, read);
check('no reports file means no reports', readReports(tmp + '.missing').reports.length === 0);
fs.rmSync(tmp, { force: true });

if (failures) { console.error(`\n${failures} report check(s) failed.`); process.exit(1); }
console.log('Report checks passed.');
