'use client';

import React, { forwardRef, useImperativeHandle, useRef, useState } from 'react';
import {
  BACKUP_KEYS, LAST_BACKUP_KEY, backupFileName, createBackup, parseBackup, restoreData, wordsToLocate,
  type Backup, type BackupData, type BackupSummary,
} from '@/lib/backup';
import { Button, Sheet } from '@/components/ui';

export interface BackupHandle {
  /** Download everything kept in this browser as one file. */
  backup: () => void;
  /** Ask for a backup file and offer to restore it. */
  restore: () => void;
}

function readAll(): BackupData {
  const data: BackupData = {};
  for (const key of BACKUP_KEYS) {
    try { const raw = localStorage.getItem(key); if (raw !== null) data[key] = JSON.parse(raw); } catch {}
  }
  return data;
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const describe = (s: BackupSummary) =>
  [plural(s.words, 'saved word'), `${s.reviewing} in review`, plural(s.pages, 'marked page'), plural(s.notes, 'note')].join(' · ');

/** "3 days ago", "today", "never": for the menu's reminder. */
export function lastBackupLabel(at: number | null, now = Date.now()): string {
  if (!at) return 'Never backed up';
  const days = Math.floor((new Date(now).setHours(0, 0, 0, 0) - new Date(at).setHours(0, 0, 0, 0)) / 86_400_000);
  return `Last backup ${days <= 0 ? 'today' : days === 1 ? 'yesterday' : `${days} days ago`}`;
}

// Owns the hidden file picker and the restore sheet; the ⋯ menu calls backup() and restore().
export const BackupManager = forwardRef<BackupHandle, { dataVersion: string; totalPages: number; onBackedUp: (at: number) => void }>(
  function BackupManager({ dataVersion, totalPages, onBackedUp }, ref) {
    const fileRef = useRef<HTMLInputElement>(null);
    const [pending, setPending] = useState<{ backup: Backup; summary: BackupSummary } | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [status, setStatus] = useState<'idle' | 'working' | 'done'>('idle');
    const open = Boolean(pending || error);

    useImperativeHandle(ref, () => ({
      backup() {
        const file = new Blob([JSON.stringify(createBackup(readAll(), dataVersion), null, 1)], { type: 'application/json' });
        const url = URL.createObjectURL(file);
        const a = document.createElement('a');
        a.href = url;
        a.download = backupFileName();
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
        const at = Date.now();
        try { localStorage.setItem(LAST_BACKUP_KEY, String(at)); } catch {}
        onBackedUp(at);
      },
      restore() {
        if (fileRef.current) { fileRef.current.value = ''; fileRef.current.click(); }
      },
    }), [dataVersion, onBackedUp]);

    const onFile = async (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      if (!file) return;
      setStatus('idle');
      if (file.size > 20_000_000) { setPending(null); setError('This file is too large to be a Panna backup.'); return; }
      const parsed = parseBackup(await file.text());
      if (parsed.ok) { setError(null); setPending({ backup: parsed.backup, summary: parsed.summary }); }
      else { setPending(null); setError(parsed.error); }
    };

    const apply = async (mode: 'merge' | 'replace') => {
      if (!pending) return;
      setStatus('working');
      let located: Record<string, number> = {};
      const words = wordsToLocate(pending.backup, dataVersion);
      if (words.length) {
        try {
          const res = await fetch(`/api/locate?${words.map((w) => `w=${encodeURIComponent(w)}`).join('&')}`);
          if (res.ok) located = (await res.json()).pages;
        } catch {} // offline: marks keep their old page numbers
      }
      const data = restoreData(readAll(), pending.backup, mode, { dataVersion, totalPages }, located);
      try {
        for (const key of BACKUP_KEYS) {
          if (data[key] === undefined) localStorage.removeItem(key);
          else localStorage.setItem(key, JSON.stringify(data[key]));
        }
      } catch {
        setStatus('idle');
        setError('This browser would not save the restored data (storage may be full or blocked).');
        return;
      }
      setStatus('done');
      // Reload so every screen starts from the restored data.
      setTimeout(() => window.location.reload(), 700);
    };

    const close = () => { if (status !== 'working') { setPending(null); setError(null); setStatus('idle'); } };
    const created = pending?.summary.created_at ? new Date(pending.summary.created_at) : null;

    return (
      <>
        <input ref={fileRef} type="file" accept=".json,application/json" hidden id="restore-file-input" onChange={onFile} />
        <Sheet open={open} onClose={close} title="Restore from a backup" id="restore-sheet">
          {error && (
            <>
              <p className="menu-title" role="alert">{error}</p>
              <div className="restore-actions">
                <Button onClick={() => fileRef.current?.click()}>Choose another file</Button>
                <Button onClick={close}>Cancel</Button>
              </div>
            </>
          )}
          {pending && status === 'done' && <p className="menu-title" role="status">Restored. Opening your book…</p>}
          {pending && status !== 'done' && (
            <>
              <p className="menu-sub restore-from">
                Backup from {created && !Number.isNaN(created.getTime())
                  ? created.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : 'an unknown date'}
              </p>
              <p className="menu-title restore-summary">{describe(pending.summary)}</p>
              <div className="restore-actions">
                <Button variant="primary" full id="restore-merge-btn" disabled={status === 'working'} onClick={() => apply('merge')}>
                  Add to what’s on this device
                </Button>
                <p className="menu-sub">Words and notes from both are kept; for each word, the more recent review progress wins.</p>
                <Button full id="restore-replace-btn" disabled={status === 'working'} onClick={() => apply('replace')}>
                  Replace everything on this device
                </Button>
                <p className="menu-sub">This device’s saved words, progress, marks and settings are replaced by the backup’s.</p>
              </div>
            </>
          )}
        </Sheet>
      </>
    );
  },
);
