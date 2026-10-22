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
      {hints}
    </div>
  );
};
