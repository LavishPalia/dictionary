'use client';

import React, { useState, useEffect, useRef } from 'react';
import { NoEntryCard } from './NoEntryCard';
import { SearchIcon } from '@/components/ui/icons';

interface SearchResult {
  headword: string;
  normalized: string;
  page_number: number;
  preview: string;
  matched_form?: string;
  suggestion?: boolean;
}

interface LookupBarProps {
  onSelectWord: (headword: string, pageNumber: number) => void;
}

export const LookupBar: React.FC<LookupBarProps> = ({ onSelectWord }) => {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  // The headword we just inserted ourselves, so our own setQuery() cannot
  // re-open the dropdown. Cleared by any user edit or by the next search.
  const justSelectedRef = useRef<string | null>(null);

  // Debounced search
  useEffect(() => {
    if (!query.trim()) {
      setResults([]);
      setIsOpen(false);
      justSelectedRef.current = null;
      return;
    }

    if (justSelectedRef.current === query) {
      // Our own selection filled the box: keep the list closed, don't re-search.
      justSelectedRef.current = null;
      setResults([]);
      return;
    }
    justSelectedRef.current = null;

    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(query)}`);
        if (res.ok) {
          const data = await res.json();
          setResults(data.results || []);
          setIsOpen(true);
          setSelectedIndex(0);
        }
      } catch (err) {
        console.error('Search error:', err);
      }
    }, 150);

    return () => clearTimeout(timer);
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

  const handleSelect = (item: SearchResult) => {
    justSelectedRef.current = item.headword;
    setQuery(item.headword);
    setIsOpen(false);
    onSelectWord(item.headword, item.page_number);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex(prev => (prev + 1) % Math.max(1, results.length));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex(prev => (prev - 1 + results.length) % Math.max(1, results.length));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (results.length > 0 && results[selectedIndex]) {
        handleSelect(results[selectedIndex]);
      }
    } else if (e.key === 'Escape') {
      setIsOpen(false);
    }
  };

  return (
    <div ref={containerRef} className="app-lookup" style={{ zIndex: 50 }}>
      <SearchIcon />
      <label htmlFor="lookup-input" className="ui-visually-hidden">Look up a word in English or Hindi</label>
      <input
        ref={inputRef}
        id="lookup-input"
        type="text"
        autoComplete="off"
        spellCheck="false"
        value={query}
        onChange={(e) => {
          justSelectedRef.current = null;
          setQuery(e.target.value);
        }}
        onKeyDown={handleKeyDown}
        placeholder="Search English or हिंदी…"
      />
      {!query && (
        <span className="app-lookup-key app-desktop-only" aria-hidden="true">Press <kbd>/</kbd></span>
      )}

      {/* Auto-suggest dropdown with vintage parchment styling */}
      {isOpen && (
        <div
          style={{
            position: 'absolute',
            top: '52px',
            left: 0,
            right: 0,
            background: '#efe3c0',
            border: '1px solid #8a7452',
            borderRadius: '4px',
            boxShadow: '0 8px 24px rgba(0,0,0,.5)',
            maxHeight: '260px',
            overflowY: 'auto',
            zIndex: 100,
          }}
        >
          {results.length === 0 ? (
            <NoEntryCard query={query} suggestions={[]} onSelect={handleSelect} />
          ) : results[0]?.suggestion ? (
            <NoEntryCard query={query} suggestions={results} onSelect={handleSelect} />
          ) : results.map((item, idx) => (
            <div
              key={item.normalized}
              onClick={() => handleSelect(item)}
              onMouseEnter={() => setSelectedIndex(idx)}
              style={{
                padding: '8px 14px',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                cursor: 'pointer',
                background: idx === selectedIndex ? '#dfcca2' : 'transparent',
                borderBottom: '1px solid #d8c49e',
                transition: 'background 0.15s ease',
              }}
            >
              <div>
                <span style={{ fontWeight: 700, fontSize: '16px', color: '#2a1e14' }}>
                  {item.headword}
                </span>
                <span
                  style={{
                    marginLeft: '8px',
                    fontFamily: 'var(--font-deva)',
                    color: '#7a2b22',
                    fontSize: '13px',
                  }}
                >
                  {item.preview}
                </span>
              </div>
              <span className="guide-word" style={{ fontSize: '12px' }}>
                p. {item.page_number}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
