'use client';

import React from 'react';
import { Chip } from '@/components/ui';

interface NoEntryCardProps {
  query: string;
  /** Suggestion rows (role="option"), rendered by the search list so the arrow keys reach them. */
  children?: React.ReactNode;
  listboxId: string;
  totalEntries: number;
  onBrowseLetter?: () => void;
}

// Shown when a search finds no entry: the closest spellings if there are any, other ways to find the word,
// and an honest note about what the dictionary covers.
export const NoEntryCard: React.FC<NoEntryCardProps> = ({ query, children, listboxId, totalEntries, onBrowseLetter }) => {
  const hasSuggestions = React.Children.count(children) > 0;
  return (
    <div className="noentry">
      <div className="noentry-title">No entry for “{query}”</div>
      {hasSuggestions ? (
        <>
          <div className="noentry-sub" id={`${listboxId}-dym`}>Did you mean:</div>
          <div id={listboxId} role="listbox" aria-labelledby={`${listboxId}-dym`} className="noentry-suggestions">{children}</div>
        </>
      ) : (
        <div className="noentry-sub">Try another spelling, or search for a shorter part of the word.</div>
      )}
      <hr className="ui-divider" />
      <div className="ui-label">Other ways to find it</div>
      <div className="noentry-ways">
        {onBrowseLetter && <Chip onMouseDown={(e) => e.preventDefault()} onClick={onBrowseLetter}>Browse {query[0].toUpperCase()} ›</Chip>}
        <span className="noentry-tip">Type the Hindi meaning instead, e.g. <span className="ui-hi">समारोह</span></span>
      </div>
      <p className="noentry-note">
        Panna has {totalEntries.toLocaleString('en-IN')} common words. Rare words, names and slang may be missing.
        Plurals and tenses work too: <i>ceremonies</i> opens <i>Ceremony</i>.
      </p>
    </div>
  );
};
