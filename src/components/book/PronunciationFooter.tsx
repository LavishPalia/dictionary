import React from 'react';

interface PronunciationFooterProps {
  hints: string;
}

export const PronunciationFooter: React.FC<PronunciationFooterProps> = ({ hints }) => {
  return (
    <div
      className="pronunciation-footer"
      style={{
        borderTop: '1px solid var(--sepia)',
        paddingTop: '8px',
        textAlign: 'center',
        fontFamily: 'var(--font-deva)',
        fontSize: '13px',
        color: 'var(--color-ink-secondary)',
        letterSpacing: '0.02em',
        userSelect: 'none',
        whiteSpace: 'nowrap',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
      }}
    >
      {/* "Calm काम · Camel कैमल": each Hindi half is marked as Hindi, so screen readers read it with a Hindi voice. */}
      {hints.split(' · ').map((hint, i) => {
        const at = hint.search(/[ऀ-ॿ]/);
        return (
          <React.Fragment key={i}>
            {i > 0 && ' · '}
            {at > 0 ? <>{hint.slice(0, at)}<span lang="hi">{hint.slice(at)}</span></> : hint}
          </React.Fragment>
        );
      })}
    </div>
  );
};
