'use client';

import type { ReactNode } from 'react';
import { Badge, Button, IconButton } from '@/components/ui';
import { BookIcon, CardsIcon, MoreIcon, StarIcon } from '@/components/ui/icons';

// Top bar. Desktop: wordmark, search, Saved, ⋯. Phones: search and ⋯ only (Saved lives in the bottom bar).
// Which layout shows is decided in CSS at the same 1024px breakpoint the book uses.
export function AppHeader({ search, savedCount, onOpenSaved, onOpenReview, section, dueCount, onOpenMenu, menuOpen }: {
  search: ReactNode;
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
      <Button variant="desk" id="open-bookmarks-btn" className="app-desktop-only" onClick={onOpenSaved} aria-pressed={section === 'saved'}
        aria-label={`Saved: ${savedCount} item${savedCount === 1 ? '' : 's'}`}>
        <StarIcon /> Saved{savedCount > 0 && <span className="app-count">{savedCount}</span>}
      </Button>
      <Button variant="desk" id="open-review-btn" className="app-desktop-only" onClick={onOpenReview} aria-pressed={section === 'review'}
        aria-label={dueCount ? `Review: ${dueCount} word${dueCount === 1 ? '' : 's'} due` : 'Review'}>
        <CardsIcon /> Review<Badge count={dueCount} label="" />
      </Button>
      <IconButton id="menu-btn" aria-label="Reading settings and more" aria-haspopup="dialog" aria-expanded={menuOpen} onClick={onOpenMenu}>
        <MoreIcon />
      </IconButton>
    </header>
  );
}

export type Section = 'book' | 'saved' | 'review';

export function BottomNav({ active, savedCount, dueCount, onBook, onSaved, onReview }: {
  active: Section;
  savedCount: number;
  dueCount: number;
  onBook: () => void;
  onSaved: () => void;
  onReview: () => void;
}) {
  return (
    <nav className="app-bottomnav" aria-label="Sections">
      <button type="button" id="nav-book-btn" aria-current={active === 'book' ? 'page' : undefined} onClick={onBook}>
        <BookIcon />Book
      </button>
      <button type="button" id="nav-saved-btn" aria-current={active === 'saved' ? 'page' : undefined} onClick={onSaved}
        aria-label={`Saved: ${savedCount} item${savedCount === 1 ? '' : 's'}`}>
        <StarIcon />Saved{savedCount > 0 && <span className="app-count">{savedCount}</span>}
      </button>
      <button type="button" id="nav-review-btn" aria-current={active === 'review' ? 'page' : undefined} onClick={onReview}
        aria-label={dueCount ? `Review: ${dueCount} word${dueCount === 1 ? '' : 's'} due` : 'Review'}>
        <CardsIcon />Review<Badge count={dueCount} label="" />
      </button>
    </nav>
  );
}
