'use client';

import React, { useEffect, useRef, useState } from 'react';
import type { BookPage, DictionaryEntry, MarginNote } from '@/lib/types';
import type { ReviewStatus } from '@/lib/review';
import { ProgressBar } from '@/components/progress/Progress';
import { STATUS_LABEL, type Progress } from '@/lib/progress';
import { Button, IconButton, Segmented } from '@/components/ui';
import { BookIcon, CloseIcon } from '@/components/ui/icons';

/** A saved word; saved_at is missing for words saved before it was recorded. */
export type SavedWord = DictionaryEntry & { saved_at?: number };

export type SavedPageKind = 'ribbon' | 'dog-ear';

interface SavedScreenProps {
  words: SavedWord[];
  ribbonPages: number[];
  dogEaredPages: number[];
  notes: MarginNote[];
  loadPage: (page: number) => Promise<BookPage | null>;
  onOpenWord: (word: SavedWord) => void;
  onGoToPage: (page: number) => void;
  onRemoveWord: (word: SavedWord) => void;
  onRestoreWord: (word: SavedWord) => void;
  onRemovePage: (kind: SavedPageKind, page: number) => void;
  onRestorePage: (kind: SavedPageKind, page: number) => void;
  onDeleteNote: (note: MarginNote) => void;
  onRestoreNote: (note: MarginNote) => void;
  onBackToBook: () => void;
  /** "Back to the book" or "Back to Today": wherever Saved was opened from. */
  backLabel: string;
  statusFor: (normalized: string) => ReviewStatus;
  progress: Progress;
  dueCount: number;
  onReview: () => void;
  /** Starts the Saving and Review tour. */
  onHowItWorks: () => void;
}

type Tab = 'words' | 'pages' | 'notes';

const DAY = 24 * 60 * 60 * 1000;

// "Today", "Yesterday", "This week" or "Earlier", by calendar day in the reader's time zone.
function whenGroup(savedAt: number | undefined, now: Date): string {
  if (!savedAt) return 'Earlier';
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  if (savedAt >= startOfToday) return 'Today';
  if (savedAt >= startOfToday - DAY) return 'Yesterday';
  if (savedAt >= startOfToday - 6 * DAY) return 'This week';
  return 'Earlier';
}
const GROUP_ORDER = ['Today', 'Yesterday', 'This week', 'Earlier'];

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

// "Calm – Candle" for a page (or "Calm – Centre" for a two-page spread), once the pages have loaded.
function PageWords({ page, through = page, loadPage }: { page: number; through?: number; loadPage: SavedScreenProps['loadPage'] }) {
  const [label, setLabel] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    Promise.all([loadPage(page), through === page ? null : loadPage(through)]).then(([first, last]) => {
      const end = last ?? first;
      if (live && first && end) setLabel(`${first.first_headword} – ${end.last_headword}`);
    });
    return () => { live = false; };
  }, [page, through, loadPage]);
  return <span className="saved-sub">{label ?? ' '}</span>;
}

export function SavedScreen(props: SavedScreenProps) {
  const { words, ribbonPages, dogEaredPages, notes } = props;
  const [tab, setTab] = useState<Tab>('words');
  // Words by review status: all, or only new / learning / mastered.
  const [filter, setFilter] = useState<'all' | ReviewStatus>('all');
  const [toast, setToast] = useState<{ text: string; undo: () => void } | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout>>();
  const headingRef = useRef<HTMLHeadingElement>(null);

  // Move focus to the screen's heading so keyboard and screen-reader users start here.
  useEffect(() => { headingRef.current?.focus(); }, []);
  useEffect(() => () => clearTimeout(toastTimer.current), []);

  const removed = (text: string, undo: () => void) => {
    clearTimeout(toastTimer.current);
    setToast({ text, undo });
    toastTimer.current = setTimeout(() => setToast(null), 6000);
  };

  const pages = [
    ...ribbonPages.map((page) => ({ kind: 'ribbon' as const, page })),
    ...dogEaredPages.map((page) => ({ kind: 'dog-ear' as const, page })),
  ].sort((a, b) => a.page - b.page || a.kind.localeCompare(b.kind));

  const now = new Date();
  const groups = GROUP_ORDER
    .map((name) => ({
      name,
      items: words
        .filter((w) => whenGroup(w.saved_at, now) === name && (filter === 'all' || props.statusFor(w.normalized) === filter))
        .sort((a, b) => (b.saved_at ?? 0) - (a.saved_at ?? 0) || a.headword.localeCompare(b.headword)),
    }))
    .filter((g) => g.items.length > 0);

  const total = words.length + pages.length + notes.length;

  return (
    <section className="saved" id="saved-screen" aria-labelledby="saved-title">
      <div className="saved-head">
        <div>
          <h1 id="saved-title" className="saved-title" tabIndex={-1} ref={headingRef}>Saved</h1>
          <p className="saved-summary">{total ? `${plural(words.length, 'word')} · ${plural(pages.length, 'page')} · ${plural(notes.length, 'note')}` : 'Nothing saved yet'}</p>
          <button type="button" className="lookup-link tour-howlink tour-howlink--desk" id="saved-how-btn" onClick={props.onHowItWorks}>How saving works ›</button>
        </div>
        <Button variant="desk" className="app-desktop-only" id="close-saved-btn" onClick={props.onBackToBook}>
          <BookIcon /> {props.backLabel}
        </Button>
      </div>

      <div className="saved-tabs">
        <Segmented<Tab>
          label="Show saved"
          value={tab}
          onChange={setTab}
          options={[
            { value: 'words', label: `Words · ${words.length}` },
            { value: 'pages', label: `Pages · ${pages.length}` },
            { value: 'notes', label: `Notes · ${notes.length}` },
          ]}
        />
      </div>

      {tab === 'words' && props.dueCount > 0 && (
        <Button variant="primary" full id="saved-review-btn" className="saved-review" onClick={props.onReview}>
          Review {props.dueCount} word{props.dueCount === 1 ? '' : 's'} now ›
        </Button>
      )}

      {tab === 'words' && words.length > 0 && (
        <>
          <ProgressBar progress={props.progress} surface="desk" id="saved-progress" />
          <div className="saved-filter">
            <Segmented<'all' | ReviewStatus>
              label="Show words"
              value={filter}
              onChange={setFilter}
              options={[
                { value: 'all', label: `All · ${words.length}` },
                ...(['new', 'learning', 'mastered'] as const).map((s) => ({ value: s, label: `${STATUS_LABEL[s]} · ${props.progress[s]}` })),
              ]}
            />
          </div>
        </>
      )}

      {tab === 'words' && (
        groups.length === 0 ? (
          words.length > 0 ? (
            <p className="saved-filter-empty" id="saved-filter-empty">
              {filter === 'mastered'
                ? 'No words mastered yet. A word is mastered after four right answers in a row, spread over a couple of weeks.'
                : filter === 'learning'
                  ? 'No words being learned right now. Words move here after their first review.'
                  : 'No new words. Every saved word has had at least one review.'}
            </p>
          ) : (
            <p className="saved-empty">No saved words yet. Open any word and tap <b>Save word</b> to keep it here.</p>
          )
        ) : (
          <div className="ui-list saved-list">
            {groups.map((g) => (
              <div key={g.name} role="group" aria-label={g.name}>
                <div className="ui-list-group">{g.name}</div>
                {g.items.map((w) => (
                  <div key={w.normalized} className="ui-list-item saved-item">
                    <button type="button" className="saved-open" onClick={() => props.onOpenWord(w)}>
                      <span className="saved-hw">{w.headword}</span>
                      <span className="saved-hi" lang="hi">{w.meaning_hi}</span>
                    </button>
                    {props.statusFor(w.normalized) !== 'new' && (
                      <span className={`ui-tag review-status ui-tag--${props.statusFor(w.normalized)}`}>
                        {props.statusFor(w.normalized) === 'mastered' ? 'Mastered' : 'Learning'}
                      </span>
                    )}
                    <IconButton surface="paper" aria-label={`Remove ${w.headword} from saved words`}
                      onClick={() => { props.onRemoveWord(w); removed(`Removed “${w.headword}”`, () => props.onRestoreWord(w)); }}>
                      <CloseIcon />
                    </IconButton>
                  </div>
                ))}
              </div>
            ))}
          </div>
        )
      )}

      {tab === 'pages' && (
        pages.length === 0 ? (
          <p className="saved-empty">No marked pages yet. Tap the ribbon to mark a spread, or fold a page’s top corner.</p>
        ) : (
          <div className="ui-list saved-list">
            {pages.map(({ kind, page }) => {
              const label = kind === 'ribbon' ? `Pages ${page}–${page + 1}` : `Page ${page}`;
              return (
                <div key={`${kind}-${page}`} className="ui-list-item saved-item">
                  <button type="button" className="saved-open" onClick={() => props.onGoToPage(page)}>
                    <span className="saved-hw">{label}</span>
                    <PageWords page={page} through={kind === 'ribbon' ? page + 1 : page} loadPage={props.loadPage} />
                  </button>
                  <span className="ui-tag">{kind === 'ribbon' ? 'Ribbon' : 'Folded corner'}</span>
                  <IconButton surface="paper" aria-label={`Remove the ${kind === 'ribbon' ? 'ribbon from' : 'fold on'} ${label.toLowerCase()}`}
                    onClick={() => { props.onRemovePage(kind, page); removed(`Removed the ${kind === 'ribbon' ? 'ribbon' : 'fold'} from ${label.toLowerCase()}`, () => props.onRestorePage(kind, page)); }}>
                    <CloseIcon />
                  </IconButton>
                </div>
              );
            })}
          </div>
        )
      )}

      {tab === 'notes' && (
        notes.length === 0 ? (
          <p className="saved-empty">No pencil notes yet. Tap a page’s outer margin to write one.</p>
        ) : (
          <div className="ui-list saved-list">
            {[...notes].sort((a, b) => b.created_at - a.created_at).map((note) => (
              <div key={note.id} className="ui-list-item saved-item">
                <button type="button" className="saved-open" onClick={() => props.onGoToPage(note.page_number)}>
                  <span className={`saved-note saved-note--${note.color}`}>{note.text}</span>
                  <span className="saved-sub">on page {note.page_number}</span>
                </button>
                <IconButton surface="paper" aria-label={`Delete the note on page ${note.page_number}`}
                  onClick={() => { props.onDeleteNote(note); removed('Deleted a pencil note', () => props.onRestoreNote(note)); }}>
                  <CloseIcon />
                </IconButton>
              </div>
            ))}
          </div>
        )
      )}

      <div className="saved-toast-slot" role="status" aria-live="polite">
        {toast && (
          <div className="saved-toast">
            <span>{toast.text}</span>
            <button type="button" className="saved-undo" onClick={() => { toast.undo(); clearTimeout(toastTimer.current); setToast(null); }}>Undo</button>
          </div>
        )}
      </div>
    </section>
  );
}
