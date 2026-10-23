'use client';

import React, { useEffect, useId, useMemo, useRef, useState } from 'react';
import type { SearchMatch, SearchResult } from '@/lib/book-data';
import { splitMatch } from '@/lib/highlight';
import { clearRecent, loadRecent, rememberRecent, type RecentWord } from '@/lib/recent';
import { NoEntryCard } from './NoEntryCard';
import { SearchIcon } from '@/components/ui/icons';
import { Chip } from '@/components/ui';

interface LookupBarProps {
  onSelectWord: (headword: string, pageNumber: number) => void;
  /** Recent words are looked up again: their stored page may be from an older build of the book. */
  onSelectRecent: (headword: string, savedPage: number) => void;
  onBrowseLetter: (letter: string) => void;
  totalEntries: number;
}

// Display order of result groups, and their labels. Hindi labels lead for Hindi groups, as in the mockups.
const GROUPS: Array<{ id: string; label: string; matches: SearchMatch[] }> = [
  { id: 'words', label: 'English words', matches: ['headword', 'form'] },
  { id: 'hinglish', label: 'हिंदी अर्थ से · Hindi in English letters', matches: ['hinglish'] },
  { id: 'hindi', label: 'हिंदी अर्थ से · from Hindi meanings', matches: ['hindi'] },
  { id: 'sound', label: 'उच्चारण से · sounds like', matches: ['pronunciation'] },
  { id: 'definition', label: 'Found in English definitions', matches: ['definition'] },
];

type Option = { kind: 'result'; result: SearchResult } | { kind: 'recent'; recent: RecentWord };

function Highlighted({ text, query }: { text: string; query: string }) {
  const [before, match, after] = splitMatch(text, query);
  return match ? <>{before}<mark className="lookup-mark">{match}</mark>{after}</> : <>{text}</>;
}

// A window of the definition around the matched words, so a long definition still shows why it matched.
function snippet(text: string, query: string): string {
  const at = text.toLowerCase().indexOf(query.toLowerCase());
  if (at < 0 || text.length <= 80) return text;
  const start = Math.max(0, at - 30);
  const end = Math.min(text.length, at + query.length + 40);
  return `${start > 0 ? '…' : ''}${text.slice(start, end).trim()}${end < text.length ? '…' : ''}`;
}

export const LookupBar: React.FC<LookupBarProps> = ({ onSelectWord, onSelectRecent, onBrowseLetter, totalEntries }) => {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  // The query the current results belong to, so nothing (not even "No entry") shows for a stale query.
  const [resultsFor, setResultsFor] = useState('');
  // Offline answers come from the book pages saved on this device (public/sw.js): all of them, or only those visited.
  // 'unreachable': no connection and nothing to answer from.
  const [offline, setOffline] = useState<null | 'saved' | 'partial' | 'unreachable'>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [recent, setRecent] = useState<RecentWord[]>([]);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listboxId = useId();
  const optionId = (i: number) => `${listboxId}-opt-${i}`;
  // The headword we just inserted ourselves, so our own setQuery() cannot
  // re-open the dropdown. Cleared by any user edit or by the next search.
  const justSelectedRef = useRef<string | null>(null);

  useEffect(() => { setRecent(loadRecent()); }, []);

  // Debounced search; a newer query aborts the request for an older one.
  useEffect(() => {
    const q = query.trim();
    if (!q) {
      setResults([]);
      setResultsFor('');
      justSelectedRef.current = null;
      return;
    }

    if (justSelectedRef.current === query) {
      // Our own selection filled the box: keep the list closed, don't re-search.
      justSelectedRef.current = null;
      setResults([]);
      setResultsFor('');
      return;
    }
    justSelectedRef.current = null;

    const controller = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(q)}`, { signal: controller.signal });
        if (res.ok) {
          const data = await res.json();
          setResults(data.results || []);
          setOffline(data.offline ? (data.complete ? 'saved' : 'partial') : null);
          setResultsFor(q);
          setIsOpen(true);
          setSelectedIndex(0);
        }
      } catch (err) {
        if ((err as Error).name === 'AbortError') return;
        setResults([]);
        setOffline('unreachable');
        setResultsFor(q);
        setIsOpen(true);
      }
    }, 150);

    return () => { clearTimeout(timer); controller.abort(); };
  }, [query]);

  // Click outside listener
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // "/" jumps to the search box from anywhere, unless the reader is already typing somewhere.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== '/' || e.ctrlKey || e.metaKey || e.altKey || e.defaultPrevented) return;
      const target = e.target as HTMLElement | null;
      if (target && (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName))) return;
      if (document.querySelector('[role="dialog"]')) return;
      e.preventDefault();
      inputRef.current?.focus();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  const trimmed = query.trim();
  const showRecent = !trimmed && recent.length > 0;
  const fresh = trimmed !== '' && resultsFor === trimmed;
  const noEntry = fresh && (results.length === 0 || Boolean(results[0]?.suggestion));

  // Results in display order (grouped), which is also the order the arrow keys move through.
  const groups = useMemo(() => {
    if (!fresh || noEntry) return [];
    return GROUPS
      .map((g) => ({ ...g, items: results.filter((r) => g.matches.includes(r.match)) }))
      .filter((g) => g.items.length > 0);
  }, [fresh, noEntry, results]);

  const options: Option[] = useMemo(() => {
    if (showRecent) return recent.map((r) => ({ kind: 'recent' as const, recent: r }));
    if (noEntry) return results.map((r) => ({ kind: 'result' as const, result: r }));
    return groups.flatMap((g) => g.items.map((r) => ({ kind: 'result' as const, result: r })));
  }, [showRecent, recent, noEntry, results, groups]);

  const panelOpen = isOpen && (showRecent || fresh);
  const active = panelOpen && options[selectedIndex] ? selectedIndex : -1;

  useEffect(() => {
    if (active >= 0) document.getElementById(optionId(active))?.scrollIntoView({ block: 'nearest' });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);

  const handleSelect = (item: SearchResult) => {
    justSelectedRef.current = item.headword;
    setQuery(item.headword);
    setIsOpen(false);
    setRecent(rememberRecent({ headword: item.headword, page: item.page_number }));
    onSelectWord(item.headword, item.page_number);
  };

  const handleSelectRecent = (item: RecentWord) => {
    justSelectedRef.current = item.headword;
    setQuery(item.headword);
    setIsOpen(false);
    setRecent(rememberRecent(item));
    onSelectRecent(item.headword, item.page);
  };

  const choose = (option: Option) => (option.kind === 'recent' ? handleSelectRecent(option.recent) : handleSelect(option.result));

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      if (!panelOpen) { setIsOpen(true); setSelectedIndex(0); return; }
      const n = Math.max(1, options.length);
      setSelectedIndex((prev) => (prev + (e.key === 'ArrowDown' ? 1 : -1) + n) % n);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (panelOpen && options[selectedIndex]) choose(options[selectedIndex]);
    } else if (e.key === 'Escape') {
      if (panelOpen) setIsOpen(false);
      else if (query) setQuery('');
    }
  };

  const clearQuery = () => {
    setQuery('');
    setIsOpen(true);
    setSelectedIndex(0);
    inputRef.current?.focus();
  };

  // One row of the list; `index` is its place in `options`.
  const renderResult = (item: SearchResult, index: number) => {
    return (
      <div
        key={item.normalized}
        id={optionId(index)}
        role="option"
        aria-selected={index === active}
        className="lookup-option"
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => handleSelect(item)}
        onMouseEnter={() => setSelectedIndex(index)}
      >
        <div className="lookup-option-main">
          <div>
            <span className="lookup-hw">{item.match === 'headword' ? <Highlighted text={item.headword} query={trimmed} /> : item.headword}</span>
            {item.pos && <span className="ui-pos"> {item.pos}</span>}
            {(item.match === 'form' || item.match === 'suggestion') && item.matched_form && item.matched_form.toLowerCase() !== item.normalized && (
              <span className="lookup-note"> · from <i>{item.matched_form}</i></span>
            )}
          </div>
          {item.meaning_hi && (
            <div className="lookup-hi" lang="hi">
              {item.match === 'hindi' ? <Highlighted text={item.meaning_hi} query={trimmed} />
                : item.match === 'hinglish' && item.matched_hi ? <Highlighted text={item.meaning_hi} query={item.matched_hi} />
                : item.meaning_hi}
            </div>
          )}
          {item.match === 'definition' && item.definition_en && (
            <div className="lookup-def"><Highlighted text={snippet(item.definition_en, trimmed)} query={trimmed} /></div>
          )}
          {item.match === 'pronunciation' && <div className="lookup-note">sounds like “{trimmed}”</div>}
        </div>
        <span className="lookup-page">p. {item.page_number.toLocaleString('en-IN')}</span>
      </div>
    );
  };

  let statusText = '';
  if (panelOpen && showRecent) statusText = `${recent.length} recent word${recent.length === 1 ? '' : 's'}`;
  else if (panelOpen && noEntry) statusText = results.length ? `No entry for ${trimmed}. ${results.length} suggestion${results.length === 1 ? '' : 's'}.` : `No entry for ${trimmed}.`;
  else if (panelOpen) statusText = `${options.length} result${options.length === 1 ? '' : 's'}`;

  return (
    <div ref={containerRef} className="app-lookup" style={{ zIndex: 50 }}>
      <SearchIcon />
      <label htmlFor="lookup-input" className="ui-visually-hidden">Look up a word in English or Hindi</label>
      <input
        ref={inputRef}
        id="lookup-input"
        type="text"
        role="combobox"
        aria-expanded={panelOpen}
        aria-controls={listboxId}
        aria-autocomplete="list"
        aria-activedescendant={active >= 0 ? optionId(active) : undefined}
        autoComplete="off"
        spellCheck="false"
        value={query}
        onChange={(e) => {
          justSelectedRef.current = null;
          setQuery(e.target.value);
          setIsOpen(true);
        }}
        onFocus={() => { setRecent(loadRecent()); setIsOpen(true); setSelectedIndex(0); }}
        onKeyDown={handleKeyDown}
        placeholder="Search English or हिंदी…"
      />
      {query ? (
        <button type="button" className="lookup-clear" aria-label="Clear search" onClick={clearQuery}>✕</button>
      ) : (
        <span className="app-lookup-key app-desktop-only" aria-hidden="true">Press <kbd>/</kbd></span>
      )}
      <div className="ui-visually-hidden" role="status" aria-live="polite">{statusText}</div>

      {panelOpen && (
        <div className="lookup-panel" id="lookup-panel">
          {showRecent ? (
            <>
              <div className="lookup-group lookup-group--row">
                <span id={`${listboxId}-recent`}>Recent</span>
                <button type="button" className="lookup-link" onMouseDown={(e) => e.preventDefault()}
                  onClick={() => { setRecent(clearRecent()); inputRef.current?.focus(); }}>Clear</button>
              </div>
              <div id={listboxId} role="listbox" aria-labelledby={`${listboxId}-recent`}>
                {recent.map((r, i) => (
                  <div key={r.headword} id={optionId(i)} role="option" aria-selected={i === active} className="lookup-option lookup-option--recent"
                    onMouseDown={(e) => e.preventDefault()} onClick={() => handleSelectRecent(r)} onMouseEnter={() => setSelectedIndex(i)}>
                    <span className="lookup-recent-word">{r.headword}</span>
                    <span className="lookup-page" aria-hidden="true">⟲</span>
                  </div>
                ))}
              </div>
            </>
          ) : noEntry && offline ? (
            <div className="noentry" id="lookup-offline">
              <div className="noentry-title">You’re offline</div>
              <p className="noentry-sub" lang="hi">आप ऑफ़लाइन हैं</p>
              <div className="noentry-sub">
                {offline === 'saved'
                  ? <>No entry for “{trimmed}” in the book saved on this device.</>
                  : <>Search needs a connection for pages you haven’t opened. To search the whole book offline, use ⋯ → <b>Save the book for offline</b>.</>}
              </div>
              {/^[a-z]/i.test(trimmed) && (
                <div className="noentry-ways">
                  <Chip onMouseDown={(e) => e.preventDefault()} onClick={() => { setIsOpen(false); onBrowseLetter(trimmed[0].toUpperCase()); }}>Browse {trimmed[0].toUpperCase()} ›</Chip>
                </div>
              )}
            </div>
          ) : noEntry ? (
            <NoEntryCard
              query={trimmed}
              listboxId={listboxId}
              totalEntries={totalEntries}
              onBrowseLetter={/^[a-z]/i.test(trimmed) ? () => { setIsOpen(false); onBrowseLetter(trimmed[0].toUpperCase()); } : undefined}
            >
              {results.map((item, i) => renderResult(item, i))}
            </NoEntryCard>
          ) : (
            <div id={listboxId} role="listbox" aria-label="Search results">
              {offline === 'partial' && <div className="lookup-group" id="lookup-offline-note">Offline · only pages you’ve opened</div>}
              {(() => {
                let index = 0;
                return groups.map((g) => (
                  <div key={g.id} role="group" aria-labelledby={`${listboxId}-${g.id}`}>
                    <div className="lookup-group" id={`${listboxId}-${g.id}`}>{g.label}</div>
                    {g.items.map((item) => renderResult(item, index++))}
                  </div>
                ));
              })()}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
