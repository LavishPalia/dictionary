import React from 'react';

interface GuideWordsProps {
  guideLeft: string;
  pageNumber: number;
  guideRight: string;
}

export const GuideWords: React.FC<GuideWordsProps> = ({
  guideLeft,
  pageNumber,
  guideRight,
}) => {
  return (
    <div
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        borderBottom: '1px solid #8a7452',
        paddingBottom: '6px',
        marginBottom: '16px',
        userSelect: 'none',
      }}
    >
      <span className="guide-word" style={{ minWidth: '80px', textAlign: 'left' }}>
        {guideLeft}
      </span>
      <span className="guide-word" style={{ fontWeight: 600 }}>
        {pageNumber}
      </span>
      <span className="guide-word guide-right" style={{ minWidth: '80px', textAlign: 'right' }}>
        {guideRight}
      </span>
    </div>
  );
};
