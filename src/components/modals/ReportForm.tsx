'use client';

import React, { useEffect, useRef, useState } from 'react';
import type { DictionaryEntry } from '@/lib/types';
import { ISSUES, NOTE_MAX, loadQueue, saveQueue, sendReport, type IssueId } from '@/lib/report';
import { Button } from '@/components/ui';

// "Report a problem" inside the word card: what is wrong, an optional correction, then a thank-you. Offline, the
// report waits on this device and is sent when the connection returns (DictionaryApp flushes the queue).
export function ReportForm({ entry, dataVersion, onBack }: { entry: DictionaryEntry; dataVersion: string; onBack: () => void }) {
  const [issues, setIssues] = useState<Set<IssueId>>(new Set());
  const [note, setNote] = useState('');
  const [state, setState] = useState<'editing' | 'sending' | 'sent' | 'queued' | 'rejected'>('editing');
  const headingRef = useRef<HTMLHeadingElement>(null);
  const doneRef = useRef<HTMLButtonElement>(null);

  useEffect(() => { headingRef.current?.focus(); }, []);
  useEffect(() => { if (state === 'sent' || state === 'queued') doneRef.current?.focus(); }, [state]);

  const toggle = (id: IssueId) => setIssues((prev) => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });

  const send = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!issues.size || state === 'sending') return;
    setState('sending');
    const report = { headword: entry.headword, issues: [...issues], note: note.trim(), data_version: dataVersion };
    const outcome = await sendReport(report);
    if (outcome === 'later') saveQueue([...loadQueue(), { ...report, queued_at: Date.now() }]);
    setState(outcome === 'sent' ? 'sent' : outcome === 'later' ? 'queued' : 'rejected');
  };

  if (state === 'sent' || state === 'queued') {
    return (
      <div className="report" id="report-done" role="status">
        <p className="report-title">Thank you!</p>
        <p className="report-hi" lang="hi">धन्यवाद! आपकी रिपोर्ट से पन्ना बेहतर बनेगा।</p>
        <p className="report-text">
          {state === 'sent'
            ? 'Your report has been sent. It helps fix Panna for everyone.'
            : 'You’re offline, so the report is saved on this device. It will be sent when you’re back online.'}
        </p>
        <Button ref={doneRef} id="report-done-btn" onClick={onBack}>‹ Back to the word</Button>
      </div>
    );
  }

  return (
    <form className="report" id="report-form" onSubmit={send} aria-labelledby="report-title">
      <h3 className="report-title" id="report-title" tabIndex={-1} ref={headingRef}>Report a problem with “{entry.headword}”</h3>
      <p className="report-hi" lang="hi">इस शब्द में कोई गलती बताएँ</p>
      <fieldset className="report-issues">
        <legend className="ui-label">What’s wrong? Choose any that apply.</legend>
        {ISSUES.map((issue) => (
          <label key={issue.id} className="report-issue">
            <input type="checkbox" id={`report-issue-${issue.id}`} checked={issues.has(issue.id)} onChange={() => toggle(issue.id)} />
            <span>
              <span className="report-issue-en">{issue.en}</span>
              <span className="report-issue-hi" lang="hi">{issue.hi}</span>
            </span>
          </label>
        ))}
      </fieldset>
      <label className="ui-label" htmlFor="report-note">Your correction or note (optional)</label>
      <textarea id="report-note" className="report-note" rows={3} maxLength={NOTE_MAX} value={note}
        onChange={(e) => setNote(e.target.value)} placeholder="For example, a better Hindi meaning" />
      {state === 'rejected' && <p className="report-error" role="alert">This report couldn’t be sent. Please check it and try again.</p>}
      <div className="report-actions">
        <Button type="button" id="report-cancel-btn" onClick={onBack}>Cancel</Button>
        <Button type="submit" variant="primary" id="report-send-btn" disabled={!issues.size || state === 'sending'}>
          {state === 'sending' ? 'Sending…' : 'Send report'}
        </Button>
      </div>
      {!issues.size && <p className="report-hint">Choose at least one problem to send the report.</p>}
    </form>
  );
}
