'use client';

import React from 'react';

export interface RecoverySuggestion {
  headword: string;
  normalized: string;
  page_number: number;
  preview: string;
  matched_form?: string;
}

interface NoEntryCardProps {
  query: string;
  suggestions: RecoverySuggestion[];
  onSelect: (suggestion: RecoverySuggestion) => void;
}

export const NoEntryCard: React.FC<NoEntryCardProps> = ({ query, suggestions, onSelect }) => (
  <div role="status" aria-live="polite" style={{ padding: '14px 16px' }}>
    <div style={{ fontFamily: '"IM Fell English", serif', fontSize: '17px', color: '#2a1e14' }}>
      No direct entry found for “{query}”.
    </div>
    {suggestions.length ? (
      <>
        <div className="guide-word" style={{ marginTop: '5px', fontSize: '12px', color: '#7a2b22' }}>
          Did you mean?
        </div>
        <div style={{ display: 'grid', gap: '4px', marginTop: '7px' }}>
          {suggestions.map((item) => (
            <button
              key={item.normalized}
              type="button"
              onClick={() => onSelect(item)}
              style={{
                border: '1px solid #cbb78c', borderRadius: '3px', padding: '7px 9px',
                background: '#e5d5ad', color: '#2a1e14', textAlign: 'left', cursor: 'pointer',
                font: '16px "IM Fell English", serif',
              }}
            >
              {item.headword}
              {item.matched_form && item.matched_form.toLowerCase() !== item.headword.toLowerCase() && (
                <span className="guide-word" style={{ marginLeft: '8px', fontSize: '11px' }}>
                  close form: {item.matched_form}
                </span>
              )}
            </button>
          ))}
        </div>
      </>
    ) : (
      <div className="guide-word" style={{ marginTop: '6px', fontSize: '12px' }}>
        Try another spelling or search for a shorter part of the word.
      </div>
    )}
  </div>
);
