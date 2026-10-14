import React from 'react';
import { DictionaryEntry } from '@/lib/types';

interface PageColumnProps {
  entries: DictionaryEntry[];
  highlightedWord?: string;
  onSelectWord?: (headword: string) => void;
}

export const PageColumn: React.FC<PageColumnProps> = ({
  entries,
  highlightedWord,
  onSelectWord,
}) => {
  const normHighlight = highlightedWord?.toLowerCase().trim();

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
      {entries.map((entry) => {
        const isHighlighted = normHighlight && entry.normalized === normHighlight;

        return (
          <p
            key={entry.id}
            className="entry-text"
            style={{
              cursor: onSelectWord ? 'pointer' : 'default',
              userSelect: 'text',
            }}
            onClick={() => onSelectWord && onSelectWord(entry.headword)}
          >
            <b
              className={`entry-headword ${isHighlighted ? 'pencil-underlined' : ''}`}
            >
              {entry.headword}
            </b>{' '}
            <span className="entry-pronunciation">{entry.pronunciation_deva}</span>{' '}
            <i className="entry-pos">{entry.pos}</i>{' '}
            <span>{entry.definition_en}</span>{' '}
            <span className="entry-hindi">{entry.meaning_hi}</span>
          </p>
        );
      })}
    </div>
  );
};
