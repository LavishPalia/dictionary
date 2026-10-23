'use client';

import React from 'react';
import { soundEngine } from '@/lib/audio';

interface DogEarProps {
  pageNumber: number;
  isLeftPage: boolean;
  isDogEared: boolean;
  onToggle: (pageNumber: number) => void;
}

export const DogEar: React.FC<DogEarProps> = ({
  pageNumber,
  isLeftPage,
  isDogEared,
  onToggle,
}) => {
  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    soundEngine.playPageTurn();
    onToggle(pageNumber);
  };

  const foldSize = 46; // size in pixels

  if (isDogEared) {
    return (
      <button
        type="button"
        id={`dog-ear-corner-${pageNumber}`}
        className="book-control"
        onClick={handleClick}
        aria-pressed={true}
        aria-label={`Page ${pageNumber}: corner folded. Unfold it`}
        title={`Page ${pageNumber} is dog-eared! Click to unfold corner`}
        style={{
        border: 0, padding: 0, margin: 0, display: 'block',
          background: 'transparent',
          position: 'absolute',
          top: 0,
          left: isLeftPage ? 0 : 'auto',
          right: isLeftPage ? 'auto' : 0,
          width: `${foldSize}px`,
          height: `${foldSize}px`,
          cursor: 'pointer',
          zIndex: 26,
          filter: isLeftPage
            ? 'drop-shadow(2px 3px 5px rgba(60,35,10,0.45))'
            : 'drop-shadow(-2px 3px 5px rgba(60,35,10,0.45))',
          transition: 'transform 0.18s ease',
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.transform = 'scale(1.05)';
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.transform = 'scale(1)';
        }}
      >
        {/* Cutout parchment under-layer hole shadow */}
        <div
          style={{
            position: 'absolute',
            inset: 0,
            clipPath: isLeftPage
              ? `polygon(0 0, 100% 0, 0 100%)`
              : `polygon(0 0, 100% 0, 100% 100%)`,
            background: 'linear-gradient(135deg, #a48253 0%, #7d5b2c 100%)',
            opacity: 0.35,
          }}
        />

        {/* Turned flap triangle showing underside of parchment paper */}
        <div
          style={{
            position: 'absolute',
            inset: 0,
            clipPath: isLeftPage
              ? `polygon(0 0, 100% 100%, 0 100%)`
              : `polygon(100% 0, 0 100%, 100% 100%)`,
            background: isLeftPage
              ? 'linear-gradient(135deg, #dfcca2 0%, #cbb17b 60%, #bca167 100%)'
              : 'linear-gradient(225deg, #dfcca2 0%, #cbb17b 60%, #bca167 100%)',
            borderBottom: '1px solid rgba(138, 116, 82, 0.7)',
            borderRight: isLeftPage ? '1px solid rgba(138, 116, 82, 0.7)' : 'none',
            borderLeft: !isLeftPage ? '1px solid rgba(138, 116, 82, 0.7)' : 'none',
          }}
        >
          {/* Subtle fold crease line along hypotenuse */}
          <div
            style={{
              position: 'absolute',
              inset: 0,
              background: isLeftPage
                ? 'linear-gradient(135deg, rgba(255,255,255,0.4) 0%, transparent 40%)'
                : 'linear-gradient(225deg, rgba(255,255,255,0.4) 0%, transparent 40%)',
            }}
          />
        </div>
      </button>
    );
  }

  // Unfolded state: subtle interactive peel hover target
  return (
    <button
      type="button"
      id={`dog-ear-trigger-${pageNumber}`}
      className="book-control"
      onClick={handleClick}
      aria-pressed={false}
      aria-label={`Fold the corner of page ${pageNumber}`}
      title={`Fold corner of Page ${pageNumber} (dog-ear)`}
      style={{
        border: 0, padding: 0, margin: 0, display: 'block',
        position: 'absolute',
        top: 0,
        left: isLeftPage ? 0 : 'auto',
        right: isLeftPage ? 'auto' : 0,
        width: '38px',
        height: '38px',
        cursor: 'pointer',
        zIndex: 26,
        background: isLeftPage
          ? 'linear-gradient(135deg, rgba(120,80,30,0.12) 0%, transparent 60%)'
          : 'linear-gradient(225deg, rgba(120,80,30,0.12) 0%, transparent 60%)',
        transition: 'all 0.2s ease',
        opacity: 0.6,
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.opacity = '1';
        e.currentTarget.style.background = isLeftPage
          ? 'linear-gradient(135deg, rgba(120,80,30,0.28) 0%, transparent 75%)'
          : 'linear-gradient(225deg, rgba(120,80,30,0.28) 0%, transparent 75%)';
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.opacity = '0.6';
        e.currentTarget.style.background = isLeftPage
          ? 'linear-gradient(135deg, rgba(120,80,30,0.12) 0%, transparent 60%)'
          : 'linear-gradient(225deg, rgba(120,80,30,0.12) 0%, transparent 60%)';
      }}
    />
  );
};
