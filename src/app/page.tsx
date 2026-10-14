'use client';

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { BookSpread } from '@/components/book/BookSpread';
import { MobilePage } from '@/components/book/MobilePage';
import { LookupBar } from '@/components/search/LookupBar';
import { BookPage, BookCatalog } from '@/lib/types';
import { soundEngine } from '@/lib/audio';
import catalogData from '../../data/book/catalog.json';

const catalog = catalogData as unknown as BookCatalog;

export default function DictionaryApp() {
  // Current page state (starts at Page 92 matching Main.dc.html)
  const [currentPage, setCurrentPage] = useState<number>(92);
  const [highlightedWord, setHighlightedWord] = useState<string>('Ceremony');
  const [isMobile, setIsMobile] = useState<boolean>(false);
  const [showCover, setShowCover] = useState<boolean>(false);
  const [isMuted, setIsMuted] = useState<boolean>(false);
  const [isLampLit, setIsLampLit] = useState<boolean>(false);
  const [speedMode, setSpeedMode] = useState<'realistic' | 'brisk' | 'slow'>('realistic');

  const flipDuration = useMemo(() => {
    switch (speedMode) {
      case 'brisk': return 650;
      case 'slow': return 1400;
      case 'realistic':
      default: return 1050;
    }
  }, [speedMode]);

  // 3D Flip & Riffle Animation Orchestration State
  const [isFlipping, setIsFlipping] = useState<boolean>(false);
  const [targetPage, setTargetPage] = useState<number>(92);
  const [flipDirection, setFlipDirection] = useState<'forward' | 'backward'>('forward');
  const [isRiffle, setIsRiffle] = useState<boolean>(false);
  const [jumpDistance, setJumpDistance] = useState<number>(1);
  const [riffleInfo, setRiffleInfo] = useState<{ from: number; to: number; pages: number } | null>(null);

  // Detect mobile screen
  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 1024);
    };
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  // Compute active left and right page for current spread
  const leftPageNum = currentPage % 2 === 0 ? currentPage : currentPage - 1;
  const rightPageNum = leftPageNum + 1;

  const leftPage = useMemo<BookPage | null>(() => {
    return catalog.pages[leftPageNum] || null;
  }, [leftPageNum]);

  const rightPage = useMemo<BookPage | null>(() => {
    return catalog.pages[rightPageNum] || null;
  }, [rightPageNum]);

  // Compute target left and right page during flip animation
  const targetLeftNum = targetPage % 2 === 0 ? targetPage : targetPage - 1;
  const targetRightNum = targetLeftNum + 1;

  const targetLeftPage = useMemo<BookPage | null>(() => {
    return catalog.pages[targetLeftNum] || null;
  }, [targetLeftNum]);

  const targetRightPage = useMemo<BookPage | null>(() => {
    return catalog.pages[targetRightNum] || null;
  }, [targetRightNum]);

  const singleMobilePage = useMemo<BookPage | null>(() => {
    return catalog.pages[currentPage] || leftPage || rightPage;
  }, [currentPage, leftPage, rightPage]);

  // Determine active letter based on first headword of spread
  const activeLetter = useMemo<string>(() => {
    const word = leftPage?.first_headword || rightPage?.first_headword || 'C';
    return word[0].toUpperCase();
  }, [leftPage, rightPage]);

  // Trigger 3D Page Turn / Multi-Page Riffle
  const turnToPage = useCallback((newTarget: number, wordToHighlight?: string) => {
    if (isFlipping) return;

    const clampedTarget = Math.max(1, Math.min(catalog.total_pages, newTarget));
    if (clampedTarget === currentPage) {
      if (wordToHighlight) setHighlightedWord(wordToHighlight);
      return;
    }

    const dist = Math.abs(clampedTarget - currentPage);
    const direction = clampedTarget > currentPage ? 'forward' : 'backward';
    const riffleMode = dist > 4;

    if (wordToHighlight !== undefined) {
      setHighlightedWord(wordToHighlight);
    }

    setTargetPage(clampedTarget);
    setFlipDirection(direction);
    setIsRiffle(riffleMode);
    setJumpDistance(dist);

    if (riffleMode) {
      setRiffleInfo({
        from: currentPage,
        to: clampedTarget,
        pages: dist,
      });
    }

    setIsFlipping(true);
  }, [currentPage, isFlipping]);

  const handleFlipComplete = useCallback(() => {
    setCurrentPage(targetPage);
    setIsFlipping(false);
    setRiffleInfo(null);
  }, [targetPage]);

  // Search selection handler
  const handleSelectWord = (headword: string, destPage: number) => {
    turnToPage(destPage, headword);
  };

  // Thumb tab selection handler
  const handleSelectLetter = (letter: string, destPage: number) => {
    setHighlightedWord('');
    turnToPage(destPage);
  };

  const handlePrevSpread = () => {
    const allPageNums = Object.keys(catalog.pages).map(Number).sort((a, b) => a - b);
    const prevPages = allPageNums.filter(p => p < leftPageNum);
    if (prevPages.length > 0) {
      const prev = prevPages[prevPages.length - 1];
      turnToPage(prev % 2 === 0 ? prev : prev - 1);
    }
  };

  const handleNextSpread = () => {
    const allPageNums = Object.keys(catalog.pages).map(Number).sort((a, b) => a - b);
    const nextPages = allPageNums.filter(p => p > rightPageNum);
    if (nextPages.length > 0) {
      const next = nextPages[0];
      turnToPage(next % 2 === 0 ? next : next - 1);
    }
  };

  const handleToggleSound = () => {
    const next = !isMuted;
    setIsMuted(next);
    soundEngine.setMuted(next);
  };

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.tagName === 'INPUT') return;

      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        handlePrevSpread();
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        handleNextSpread();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  });

  return (
    <main
      style={{
        minHeight: '100vh',
        width: '100vw',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        padding: '24px 16px 40px',
        position: 'relative',
        boxSizing: 'border-box',
        background: isLampLit
          ? 'radial-gradient(ellipse at 50% 35%, #2a1a0e 0%, #120a06 85%)'
          : 'radial-gradient(ellipse at 50% 40%, var(--color-desk-center) 0%, var(--color-desk-edge) 75%)',
        transition: 'background 0.5s ease',
      }}
    >
      {/* Top Header Controls & Search Bar */}
      <header
        style={{
          width: '100%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: '12px',
          marginBottom: '28px',
          zIndex: 40,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap', justifyContent: 'center' }}>
          <LookupBar
            currentPage={currentPage}
            onSelectWord={handleSelectWord}
            onPageChange={turnToPage}
          />

          {/* Book Cover toggle button */}
          <button
            onClick={() => setShowCover(prev => !prev)}
            style={{
              height: '48px',
              padding: '0 16px',
              background: '#5b1f19',
              border: '1px solid #c9a24a',
              borderRadius: '4px',
              color: '#e0bd68',
              font: '13px "IM Fell English SC", serif',
              letterSpacing: '0.08em',
              cursor: 'pointer',
              whiteSpace: 'nowrap',
              boxShadow: '0 2px 8px rgba(0,0,0,.4)',
              transition: 'all 0.2s',
            }}
            title="View original cloth cover"
          >
            {showCover ? 'Open Spread' : 'Cover'}
          </button>

          {/* Lamp-lit Night Mode toggle button */}
          <button
            onClick={() => setIsLampLit(prev => !prev)}
            style={{
              height: '48px',
              padding: '0 14px',
              background: isLampLit ? '#c9a24a' : '#3e2a1b',
              border: '1px solid #8a7452',
              borderRadius: '4px',
              color: isLampLit ? '#2a1e14' : '#e8d3a0',
              font: '13px "IM Fell English SC", serif',
              cursor: 'pointer',
              boxShadow: '0 2px 8px rgba(0,0,0,.4)',
              transition: 'all 0.2s',
            }}
            title={isLampLit ? 'Switch to daylight desk' : 'Switch to lamp-lit night mode'}
          >
            {isLampLit ? '🕯️ Lamp-lit' : '💡 Desk'}
          </button>

          {/* Reading Pace / Speed Customization Button */}
          <button
            onClick={() => {
              setSpeedMode(prev => prev === 'realistic' ? 'brisk' : prev === 'brisk' ? 'slow' : 'realistic');
            }}
            style={{
              height: '48px',
              padding: '0 14px',
              background: '#3e2a1b',
              border: '1px solid #8a7452',
              borderRadius: '4px',
              color: '#e8d3a0',
              font: '13px "IM Fell English SC", serif',
              cursor: 'pointer',
              boxShadow: '0 2px 8px rgba(0,0,0,.4)',
              transition: 'all 0.2s',
            }}
            title="Adjust page turning speed (Realistic 1.0s / Brisk 0.65s / Slow & Tactile 1.4s)"
          >
            {speedMode === 'realistic' ? '⏱️ Pace: 1.0s' : speedMode === 'brisk' ? '⚡ Pace: 0.65s' : '🐌 Pace: 1.4s'}
          </button>

          {/* Sound Mute/Unmute toggle button */}
          <button
            onClick={handleToggleSound}
            style={{
              height: '48px',
              padding: '0 12px',
              background: '#3e2a1b',
              border: '1px solid #8a7452',
              borderRadius: '4px',
              color: isMuted ? '#8a7452' : '#e8d3a0',
              fontSize: '18px',
              cursor: 'pointer',
              boxShadow: '0 2px 8px rgba(0,0,0,.4)',
              transition: 'all 0.2s',
            }}
            title={isMuted ? 'Unmute paper turning sounds' : 'Mute paper turning sounds'}
          >
            {isMuted ? '🔇' : '🔊'}
          </button>
        </div>

        {/* Dynamic Riffle indicator banner (Matching Flip.dc.html) */}
        {riffleInfo && (
          <div
            className="guide-word"
            style={{
              background: '#efe3c0',
              border: '1px solid #8a7452',
              borderRadius: '20px',
              padding: '4px 22px',
              height: '36px',
              lineHeight: '36px',
              whiteSpace: 'nowrap',
              boxShadow: '0 4px 12px rgba(0,0,0,.4)',
              animation: 'pulse 0.4s infinite alternate',
              zIndex: 50,
            }}
          >
            Page {riffleInfo.from} → {riffleInfo.to} · riffling through {riffleInfo.pages} pages
          </div>
        )}
      </header>

      {/* Main Reading Canvas */}
      {showCover ? (
        /* VINTAGE HARDCOVER PRESENTATION (Matching Cover.dc.html) */
        <div
          onClick={() => setShowCover(false)}
          style={{
            cursor: 'pointer',
            width: '640px',
            maxWidth: '92vw',
            height: '860px',
            maxHeight: '80vh',
            boxSizing: 'border-box',
            padding: '48px',
            background: 'radial-gradient(ellipse at 30% 20%, #7a2b22, #4a1712 85%)',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '22px',
            position: 'relative',
            boxShadow: '0 30px 60px rgba(0,0,0,.8)',
            borderRadius: '4px',
            transition: 'transform 0.3s ease',
          }}
        >
          {/* Gilt Double Border */}
          <div style={{ position: 'absolute', inset: '26px', border: '3px double #c9a24a', pointerEvents: 'none' }} />
          {/* Leather spine edge */}
          <div
            style={{
              position: 'absolute',
              left: 0,
              top: 0,
              bottom: 0,
              width: '46px',
              background: 'linear-gradient(to right, #2f0d0a, #5b1f19)',
              borderRight: '2px solid #2f0d0a',
              pointerEvents: 'none',
            }}
          />
          <p style={{ margin: 0, font: '14px "IM Fell English SC", serif', letterSpacing: '.3em', color: '#c9a24a' }}>
            A POCKET DICTIONARY
          </p>
          <h1
            style={{
              margin: 0,
              font: '400 130px/1 "Tiro Devanagari Hindi", serif',
              color: '#e0bd68',
              textShadow: '0 2px 0 #2f0d0a',
            }}
          >
            पन्ना
          </h1>
          <h2 style={{ margin: 0, font: '400 56px "IM Fell English", serif', fontStyle: 'italic', color: '#e0bd68' }}>
            Panna
          </h2>
          <div style={{ width: '160px', height: '2px', background: '#c9a24a' }} />
          <p style={{ margin: 0, font: '22px "IM Fell English", serif', color: '#e8d3a0', textAlign: 'center' }}>
            English into Hindi<br />with the words around them
          </p>
          <p style={{ position: 'absolute', bottom: '40px', margin: 0, font: '13px "IM Fell English SC", serif', letterSpacing: '.2em', color: '#c9a24a' }}>
            CLICK TO OPEN SPREAD
          </p>
        </div>
      ) : isMobile ? (
        /* Mobile single-page layout */
        <MobilePage
          page={singleMobilePage}
          highlightedWord={highlightedWord}
          onSelectWord={(word) => setHighlightedWord(word)}
          onPrevPage={handlePrevSpread}
          onNextPage={handleNextSpread}
        />
      ) : (
        /* Desktop Two-Page Spread with 3D Engine & Hybrid Overlay */
        <div style={{ transform: 'scale(1)', transformOrigin: 'top center' }}>
          <BookSpread
            leftPage={leftPage}
            rightPage={rightPage}
            targetLeftPage={targetLeftPage}
            targetRightPage={targetRightPage}
            highlightedWord={highlightedWord}
            activeLetter={activeLetter}
            thumbMap={catalog.thumb_index}
            isFlipping={isFlipping}
            flipDirection={flipDirection}
            isRiffle={isRiffle}
            jumpDistance={jumpDistance}
            flipDuration={flipDuration}
            onFlipComplete={handleFlipComplete}
            onInteractiveDragEnd={(completed) => {
              if (completed) handleNextSpread();
            }}
            onSelectWord={(word) => setHighlightedWord(word)}
            onSelectLetter={handleSelectLetter}
            onPrevPage={handlePrevSpread}
            onNextPage={handleNextSpread}
          />
        </div>
      )}

      {/* Footer provenance note */}
      <footer
        style={{
          marginTop: '36px',
          textAlign: 'center',
          fontFamily: '"IM Fell English SC", serif',
          fontSize: '12px',
          color: '#8a7452',
          letterSpacing: '0.08em',
        }}
      >
        <span>पन्ना · Vintage Pocket Dictionary · 3D Three.js & Hybrid DOM Engine</span>
      </footer>
    </main>
  );
}
