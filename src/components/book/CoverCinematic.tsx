'use client';

import React, { useState } from 'react';
import { soundEngine } from '@/lib/audio';

interface CoverCinematicProps {
  isOpen: boolean;
  onOpen: () => void;
}

export const CoverCinematic: React.FC<CoverCinematicProps> = ({
  isOpen,
  onOpen,
}) => {
  const [isAnimating, setIsAnimating] = useState(false);

  const handleOpenClick = () => {
    if (isAnimating) return;
    soundEngine.playPageTurn();
    setIsAnimating(true);
    setTimeout(() => {
      onOpen();
      setIsAnimating(false);
    }, 950);
  };

  if (isOpen && !isAnimating) return null;

  return (
    <div
      id="cover-cinematic-container"
      style={{
        position: 'relative',
        width: '560px',
        maxWidth: '92vw',
        height: '660px',
        perspective: '2500px',
        perspectiveOrigin: '20% 50%',
        margin: '20px auto 0',
        zIndex: 50,
      }}
    >
      {/* Resting under-block of pages visible when cover swings open */}
      <div
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          width: '560px',
          height: '640px',
          background: 'linear-gradient(to right, #d8c494 0%, #efe3c0 15%, #ecdfba 100%)',
          borderRadius: '0 4px 4px 0',
          boxShadow: '15px 25px 50px rgba(0,0,0,0.65)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          border: '1px solid #8a7452',
          boxSizing: 'border-box',
          padding: '40px',
        }}
      >
        <div style={{ textAlign: 'center', color: '#6e5532', fontStyle: 'italic', fontFamily: '"IM Fell English", serif' }}>
          <h3 style={{ fontSize: '26px', margin: '0 0 10px', color: '#2a1e14', fontStyle: 'normal' }}>
            पन्ना · Panna
          </h3>
          <p style={{ margin: 0, fontSize: '15px' }}>
            Opening the physical dictionary pages...
          </p>
        </div>
      </div>

      {/* The 3D Turning Front Cover Leaf */}
      <div
        id="book-front-cover"
        onClick={handleOpenClick}
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          width: '560px',
          height: '640px',
          transformStyle: 'preserve-3d',
          transformOrigin: 'left center',
          transform: isAnimating ? 'rotateY(-180deg)' : 'rotateY(0deg)',
          transition: 'transform 0.95s cubic-bezier(0.25, 1, 0.45, 1)',
          cursor: isAnimating ? 'default' : 'pointer',
          borderRadius: '0 6px 6px 0',
          boxShadow: isAnimating
            ? '-10px 20px 40px rgba(0,0,0,0.5)'
            : '0 25px 60px rgba(0,0,0,0.7), -10px 0 25px rgba(0,0,0,0.4)',
        }}
      >
        {/* FRONT COVER FACE: Deep maroon cloth with gold-foil lettering */}
        <div
          style={{
            position: 'absolute',
            inset: 0,
            backfaceVisibility: 'hidden',
            background: 'linear-gradient(135deg, #6b201a 0%, #541914 55%, #3d110d 100%)',
            border: '2px solid #3d110d',
            borderRadius: '0 6px 6px 0',
            boxSizing: 'border-box',
            padding: '44px 38px',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'space-between',
            boxShadow: 'inset 0 0 60px rgba(0,0,0,0.6)',
          }}
        >
          {/* Left spine shadow & vertical faux hinge ribs */}
          <div
            style={{
              position: 'absolute',
              left: 0,
              top: 0,
              bottom: 0,
              width: '28px',
              background: 'linear-gradient(to right, rgba(0,0,0,0.6) 0%, rgba(0,0,0,0.2) 60%, transparent 100%)',
              borderRight: '1px solid rgba(201, 162, 74, 0.25)',
              pointerEvents: 'none',
            }}
          />

          {/* Ornate Gold Border Filigree */}
          <div
            style={{
              position: 'absolute',
              inset: '16px',
              border: '2px solid #c9a24a',
              borderRadius: '3px',
              pointerEvents: 'none',
              boxShadow: 'inset 0 0 12px rgba(201, 162, 74, 0.3)',
            }}
          >
            <div
              style={{
                position: 'absolute',
                inset: '5px',
                border: '1px double #c9a24a',
                opacity: 0.75,
              }}
            />
          </div>

          {/* Top Vintage Ornament */}
          <div style={{ marginTop: '16px', color: '#c9a24a', fontSize: '18px', letterSpacing: '0.2em' }}>
            ✦ · ✤ · ✦
          </div>

          {/* Center Titles */}
          <div style={{ textAlign: 'center', zIndex: 2 }}>
            <h1
              style={{
                margin: '0 0 6px',
                fontFamily: '"Tiro Devanagari Hindi", serif',
                fontSize: '54px',
                color: '#f3e5c8',
                fontWeight: 600,
                textShadow: '0 2px 4px rgba(0,0,0,0.6), 0 0 20px rgba(201, 162, 74, 0.3)',
                letterSpacing: '0.02em',
              }}
            >
              पन्ना
            </h1>

            <h2
              style={{
                margin: '0 0 16px',
                fontFamily: '"IM Fell English SC", serif',
                fontSize: '32px',
                color: '#c9a24a',
                letterSpacing: '0.18em',
                textShadow: '0 1px 3px rgba(0,0,0,0.8)',
              }}
            >
              PANNA
            </h2>

            <div style={{ width: '140px', height: '2px', background: '#c9a24a', margin: '0 auto 18px', opacity: 0.85 }} />

            <p
              style={{
                margin: '0 0 8px',
                fontFamily: '"IM Fell English", serif',
                fontSize: '22px',
                color: '#eedcb2',
                fontStyle: 'italic',
                textShadow: '0 1px 2px rgba(0,0,0,0.8)',
              }}
            >
              An English into Hindi Pocket Dictionary
            </p>

            <p
              style={{
                margin: 0,
                fontFamily: '"IM Fell English SC", serif',
                fontSize: '13px',
                color: '#c9a24a',
                letterSpacing: '0.1em',
              }}
            >
              With the words around them
            </p>
          </div>

          {/* Bottom Call-To-Action Button */}
          <div
            id="open-book-cta"
            style={{
              padding: '10px 24px',
              background: 'rgba(201, 162, 74, 0.15)',
              border: '1px solid #c9a24a',
              borderRadius: '20px',
              fontFamily: '"IM Fell English SC", serif',
              fontSize: '13px',
              color: '#f1e4c4',
              letterSpacing: '0.16em',
              boxShadow: '0 4px 14px rgba(0,0,0,0.4)',
              transition: 'all 0.2s ease',
              marginBottom: '16px',
              zIndex: 2,
            }}
          >
            ✦ CLICK TO OPEN BOOK ✦
          </div>
        </div>

        {/* BACK FACE OF FRONT COVER: Marbled Endpapers */}
        <div
          style={{
            position: 'absolute',
            inset: 0,
            backfaceVisibility: 'hidden',
            transform: 'rotateY(180deg)',
            background: 'linear-gradient(135deg, #3d5a45 0%, #2a3d31 35%, #593b2b 70%, #2f4035 100%)',
            border: '2px solid #2a3d31',
            borderRadius: '6px 0 0 6px',
            boxSizing: 'border-box',
            padding: '36px',
            boxShadow: 'inset 0 0 50px rgba(0,0,0,0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          {/* Faux Marbled Pattern Texture */}
          <div
            style={{
              width: '100%',
              height: '100%',
              border: '1px solid rgba(201, 162, 74, 0.4)',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#d4c5a0',
              fontFamily: '"IM Fell English SC", serif',
              fontSize: '14px',
              letterSpacing: '0.12em',
              textAlign: 'center',
              background: 'radial-gradient(ellipse at center, rgba(0,0,0,0.2) 0%, rgba(0,0,0,0.5) 100%)',
            }}
          >
            <span>ANTIQUE ENDPAPERS</span>
            <span style={{ fontSize: '11px', marginTop: '6px', color: '#c9a24a' }}>
              CALCUTTA & ALLAHABAD · 1928
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};
