import React from 'react';

interface PronunciationFooterProps {
  hints: string;
}

export const PronunciationFooter: React.FC<PronunciationFooterProps> = ({ hints }) => {
  return (
    <div
      style={{
        borderTop: '1px solid #8a7452',
        paddingTop: '8px',
        textAlign: 'center',
        fontFamily: 'var(--font-deva)',
        fontSize: '13px',
        color: '#4a3a2c',
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
