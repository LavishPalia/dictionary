'use client';

import type { ReactNode } from 'react';
import { Button, IconButton } from '@/components/ui';
import { BookIcon, MoreIcon, StarIcon } from '@/components/ui/icons';

// Top bar. Desktop: wordmark, search, Saved, ⋯. Phones: search and ⋯ only (Saved lives in the bottom bar).
// Which layout shows is decided in CSS at the same 1024px breakpoint the book uses.
export function AppHeader({ search, savedCount, onOpenSaved, savedActive, onOpenMenu, menuOpen }: {
  search: ReactNode;
  savedCount: number;
  onOpenSaved: () => void;
  savedActive: boolean;
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
      <Button variant="desk" id="open-bookmarks-btn" className="app-desktop-only" onClick={onOpenSaved} aria-pressed={savedActive}
        aria-label={`Saved: ${savedCount} item${savedCount === 1 ? '' : 's'}`}>
        <StarIcon /> Saved{savedCount > 0 && <span className="app-count">{savedCount}</span>}
      </Button>
      <IconButton id="menu-btn" aria-label="Reading settings and more" aria-haspopup="dialog" aria-expanded={menuOpen} onClick={onOpenMenu}>
        <MoreIcon />
      </IconButton>
    </header>
  );
}

export type Section = 'book' | 'saved';

export function BottomNav({ active, savedCount, onBook, onSaved }: {
  active: Section;
  savedCount: number;
  onBook: () => void;
  onSaved: () => void;
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
    </nav>
  );
}
