'use client';

import { useEffect, useRef, useState } from 'react';
import { Sheet } from '@/components/ui';
import { LETTERS, letterForPage, markedPages, parsePageInput } from '@/lib/letters';

const fmt = (n: number) => n.toLocaleString('en-IN');

const MARK_LOOK = {
  ribbon: { icon: '🎗', name: 'Ribbon' },
  'dog-ear': { icon: '◸', name: 'Folded corner' },
  note: { icon: '✎', name: 'Note' },
} as const;

interface GoToSheetProps {
  open: boolean;
  onClose: () => void;
  currentPage: number;
  totalPages: number;
  thumbIndex: Record<string, number>;
  marks: ReturnType<typeof markedPages>;
  onGoToPage: (page: number) => void;
  onGoToLetter: (letter: string, page: number) => void;
}

// Opened from the page number: type a page, pick a letter, or one of the reader's marked pages.
export function GoToSheet({ open, onClose, currentPage, totalPages, thumbIndex, marks, onGoToPage, onGoToLetter }: GoToSheetProps) {
  const [text, setText] = useState('');
  const [error, setError] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Each opening starts fresh: the current page, selected, so typing replaces it.
  useEffect(() => {
    if (!open) return;
    setText(String(currentPage));
    setError(false);
    // After Sheet has focused itself (its effect runs first, as a child).
    const input = inputRef.current;
    if (input) { input.value = String(currentPage); input.focus(); input.select(); }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only on opening
  }, [open]);

  const currentLetter = letterForPage(currentPage, thumbIndex);

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    const page = parsePageInput(text, totalPages);
    if (page === null) { setError(true); inputRef.current?.focus(); return; }
    onClose();
    onGoToPage(page);
  };

  return (
    <Sheet open={open} onClose={onClose} title="Go to" id="goto-sheet" className="goto-sheet"
      returnFocusTo={() => document.getElementById('page-number-btn')}>
      <form className="goto-field" onSubmit={submit} noValidate>
        <input
          ref={inputRef}
          id="goto-page-input"
          className="goto-input"
          type="text"
          inputMode="numeric"
          autoComplete="off"
          aria-label="Page number"
          aria-describedby={error ? 'goto-error goto-hint' : 'goto-hint'}
          aria-invalid={error || undefined}
          value={text}
          onChange={(e) => { setText(e.target.value); if (error) setError(false); }}
        />
        <button type="submit" id="goto-go-btn" className="goto-go">Go</button>
      </form>
      {error && <p id="goto-error" className="goto-error" role="alert">Pick a page from 1 to {fmt(totalPages)}</p>}
      <p id="goto-hint" className="goto-label">of {fmt(totalPages)} pages · or pick a letter</p>
      <div className="goto-grid" role="group" aria-label="Letters">
        {LETTERS.map((letter) => {
          const page = thumbIndex[letter];
          return (
            <button key={letter} type="button" className="goto-letter" disabled={page === undefined}
              aria-label={page === undefined ? `Letter ${letter}, no pages` : `Letter ${letter}, page ${fmt(page)}`}
              aria-current={letter === currentLetter ? 'true' : undefined}
              onClick={() => { if (page === undefined) return; onClose(); onGoToLetter(letter, page); }}>
              {letter}
            </button>
          );
        })}
      </div>
      {marks.length > 0 && (
        <section id="goto-marks" aria-labelledby="goto-marks-title">
          <h3 id="goto-marks-title" className="goto-label">Your marked pages</h3>
          <div className="goto-marks">
            {marks.map(({ page, kind }) => (
              <button key={page} type="button" className="goto-mark" aria-label={`${MARK_LOOK[kind].name}, page ${fmt(page)}`}
                onClick={() => { onClose(); onGoToPage(page); }}>
                <span aria-hidden="true">{MARK_LOOK[kind].icon}</span> p. {fmt(page)}
              </button>
            ))}
          </div>
        </section>
      )}
    </Sheet>
  );
}
