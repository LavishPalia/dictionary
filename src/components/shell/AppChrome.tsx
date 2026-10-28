'use client';

import type { ReactNode } from 'react';
import { Button, IconButton } from '@/components/ui';
import { BookIcon, CardsIcon, MoreIcon, StarIcon, SunIcon } from '@/components/ui/icons';

// Top bar. Desktop: wordmark, search, Saved, ⋯. Phones: search and ⋯ only (Saved lives in the bottom bar).
// Which layout shows is decided in CSS at the same 1024px breakpoint the book uses.
export function AppHeader({ search, savedCount, onOpenToday, onOpenSaved, onOpenReview, section, dueCount, onOpenMenu, menuOpen }: {
  search: ReactNode;
  onOpenToday: () => void;
  savedCount: number;
  onOpenSaved: () => void;
  onOpenReview: () => void;
  section: Section;
  dueCount: number;
  onOpenMenu: () => void;
  menuOpen: boolean;
}) {
  return (
    <header className="app-header">
      <div className="app-wordmark app-desktop-only" aria-hidden="true">
        <span className="app-wordmark-hi">पन्ना</span>
        <span className="app-wordmark-en">English → हिंदी</span>
      </div>
      <div className="app-search">{search}</div>
      <Button variant="desk" id="open-today-btn" className="app-desktop-only" onClick={onOpenToday} aria-pressed={section === 'today'}>
        <SunIcon /> Today
      </Button>
      <Button variant="desk" id="open-bookmarks-btn" className="app-desktop-only" onClick={onOpenSaved} aria-pressed={section === 'saved'}>
        <StarIcon /> Saved<SavedCount count={savedCount} />
      </Button>
      <Button variant="desk" id="open-review-btn" className="app-desktop-only" onClick={onOpenReview} aria-pressed={section === 'review'}>
        <CardsIcon /> Review<DueCount count={dueCount} />
      </Button>
      <IconButton id="menu-btn" aria-label="Reading settings and more" aria-haspopup="dialog" aria-expanded={menuOpen} onClick={onOpenMenu}>
        <MoreIcon />
      </IconButton>
    </header>
  );
}

// The counts next to Saved and Review. The button's name is its visible text plus a few hidden words ("Saved 3 items",
// "Review 2 words due"), so it says what is on screen, as voice control needs.
function SavedCount({ count }: { count: number }) {
  if (count <= 0) return null;
  return <>{' '}<span className="app-count">{count}</span><span className="ui-visually-hidden"> item{count === 1 ? '' : 's'}</span></>;
}
function DueCount({ count }: { count: number }) {
  if (count <= 0) return null;
  return <>{' '}<span className="ui-badge">{count > 99 ? '99+' : count}</span><span className="ui-visually-hidden"> word{count === 1 ? '' : 's'} due</span></>;
}

export type Section = 'today' | 'book' | 'saved' | 'review' | 'learn';

export function BottomNav({ active, savedCount, dueCount, onToday, onBook, onSaved, onReview }: {
  active: Section;
  onToday: () => void;
  savedCount: number;
  dueCount: number;
  onBook: () => void;
  onSaved: () => void;
  onReview: () => void;
}) {
  return (
    <nav className="app-bottomnav" aria-label="Sections">
      <button type="button" id="nav-today-btn" aria-current={active === 'today' ? 'page' : undefined} onClick={onToday}>
        <SunIcon />Today
      </button>
      <button type="button" id="nav-book-btn" aria-current={active === 'book' ? 'page' : undefined} onClick={onBook}>
        <BookIcon />Book
      </button>
      <button type="button" id="nav-saved-btn" aria-current={active === 'saved' ? 'page' : undefined} onClick={onSaved}>
        <StarIcon />Saved<SavedCount count={savedCount} />
      </button>
      <button type="button" id="nav-review-btn" aria-current={active === 'review' ? 'page' : undefined} onClick={onReview}>
        <CardsIcon />Review<DueCount count={dueCount} />
      </button>
    </nav>
  );
}
