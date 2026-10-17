'use client';

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { BookSpread } from '@/components/book/BookSpread';
import { MobilePage } from '@/components/book/MobilePage';
import { LookupBar } from '@/components/search/LookupBar';
import { WordDetailDrawer } from '@/components/modals/WordDetailDrawer';
import { BookmarksModal } from '@/components/modals/BookmarksModal';
import { CoverCinematic } from '@/components/book/CoverCinematic';
import { BookPage, BookCatalog, DictionaryEntry, MarginNote } from '@/lib/types';
import { soundEngine } from '@/lib/audio';
import catalogData from '../../data/book/catalog.json';

const catalog = catalogData as unknown as BookCatalog;

// Only real catalog pages are valid entry points; anything else (undefined, 0,
// out of range) falls back to the default spread.
const resolveInitialPage = (p?: number): number =>
  p !== undefined && catalog.pages[p] ? p : 92;

export interface DictionaryAppProps {
  initialPage?: number;
  initialWord?: string;
}

export default function DictionaryApp({ initialPage, initialWord }: DictionaryAppProps) {
  // Current page state (defaults to Page 92 matching Main.dc.html)
  const [currentPage, setCurrentPage] = useState<number>(() => resolveInitialPage(initialPage));
  const [highlightedWord, setHighlightedWord] = useState<string>(initialWord || 'Ceremony');
  const [isMobile, setIsMobile] = useState<boolean>(false);
  const [isBookOpen, setIsBookOpen] = useState<boolean>(true);
  const [isMuted, setIsMuted] = useState<boolean>(false);
  const [isLampLit, setIsLampLit] = useState<boolean>(false);
  const [speedMode, setSpeedMode] = useState<'realistic' | 'brisk' | 'slow'>('realistic');

  // Dog-Eared Pages & Handwritten Pencil Marginalia State
  const [dogEaredPages, setDogEaredPages] = useState<number[]>([]);
  const [marginNotes, setMarginNotes] = useState<MarginNote[]>([]);

  // Word Detail Drawer & Bookmarks State
  const initialWordData = useMemo(() => {
    if (!initialWord) return null;
    const norm = initialWord.toLowerCase().trim();
    const pNum = catalog.word_to_page[norm] || resolveInitialPage(initialPage);
    const pageObj = catalog.pages[pNum];
    if (pageObj) {
      return [...(pageObj.column1 || []), ...(pageObj.column2 || [])].find(e => e.normalized === norm) || null;
    }
    return null;
  }, [initialWord, initialPage]);

  const [activeWordEntry, setActiveWordEntry] = useState<DictionaryEntry | null>(initialWordData);
  const [showWordDrawer, setShowWordDrawer] = useState<boolean>(Boolean(initialWordData));
  const [showBookmarksModal, setShowBookmarksModal] = useState<boolean>(false);
  const [bookmarkedPages, setBookmarkedPages] = useState<number[]>([]);
  const [bookmarkedWords, setBookmarkedWords] = useState<DictionaryEntry[]>([]);

  useEffect(() => {
    if (initialWordData) {
      setActiveWordEntry(initialWordData);
      setShowWordDrawer(true);
    }
  }, [initialWordData]);

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
  const [targetPage, setTargetPage] = useState<number>(() => resolveInitialPage(initialPage));
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

  // Load saved bookmarks, dog-ears, and marginalia from localStorage
  useEffect(() => {
    try {
      const savedPages = localStorage.getItem('panna_bookmarks');
      if (savedPages) setBookmarkedPages(JSON.parse(savedPages));

      const savedWords = localStorage.getItem('panna_saved_words');
      if (savedWords) setBookmarkedWords(JSON.parse(savedWords));

      const savedDogEars = localStorage.getItem('panna_dog_ears');
      if (savedDogEars) setDogEaredPages(JSON.parse(savedDogEars));

      const savedNotes = localStorage.getItem('panna_marginalia');
      if (savedNotes) setMarginNotes(JSON.parse(savedNotes));
    } catch (e) {
      console.warn('LocalStorage not available:', e);
    }
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

  // Check if current spread has a ribbon bookmark
  const isSpreadBookmarked = useMemo(() => {
    return bookmarkedPages.includes(leftPageNum);
  }, [bookmarkedPages, leftPageNum]);

  // Trigger 3D Page Turn / Multi-Page Riffle with URL sync
  const turnToPage = useCallback((newTarget: number, wordToHighlight?: string) => {
    if (isFlipping) return;

    const clampedTarget = Math.max(1, Math.min(catalog.total_pages, newTarget));
    if (clampedTarget === currentPage) {
      if (wordToHighlight) setHighlightedWord(wordToHighlight);
      return;
    }

    const dist = Math.abs(clampedTarget - currentPage);
    const direction = clampedTarget > currentPage ? 'forward' : 'backward';
    // Mobile has no CSS-3D flip engine (BookSpread is unmounted there), so a
    // "flip" would never report completion and isFlipping would latch forever.
    const riffleMode = !isMobile && dist > 4;

    if (wordToHighlight !== undefined) {
      setHighlightedWord(wordToHighlight);
    }

    setTargetPage(clampedTarget);
    setFlipDirection(direction);
    setJumpDistance(dist);

    if (riffleMode) {
      setIsRiffle(true);
      setRiffleInfo({
        from: currentPage,
        to: clampedTarget,
        pages: dist,
      });
    } else {
      setIsRiffle(false);
      setRiffleInfo(null);
    }

    // Client-side URL history update without full page reload
    if (typeof window !== 'undefined') {
      const url = wordToHighlight
        ? `/word/${encodeURIComponent(wordToHighlight)}`
        : `/page/${clampedTarget}`;
      if (window.location.pathname !== url) {
        window.history.pushState(null, '', url);
      }
    }

    if (isMobile) {
      // Nothing to animate: apply the page change immediately, and never latch
      // isFlipping (desktop parity for the paper sound is kept here instead of
      // in the flip midpoint callback).
      soundEngine.playPageTurn();
      setCurrentPage(clampedTarget);
      setIsFlipping(false);
      return;
    }

    setIsFlipping(true);
  }, [currentPage, isFlipping, isMobile]);

  const handleFlipComplete = useCallback(() => {
    setCurrentPage(targetPage);
    setIsFlipping(false);
    setRiffleInfo(null);
  }, [targetPage]);

  // Watchdog: if the leaf never reports completion (backgrounded tab with no
  // rAF frames, cancelled animation, engine unmounted), apply the pending page
  // anyway so navigation can never freeze.
  useEffect(() => {
    if (!isFlipping) return;
    const timer = setTimeout(() => {
      setCurrentPage(targetPage);
      setIsFlipping(false);
      setIsRiffle(false);
      setRiffleInfo(null);
    }, Math.max(flipDuration + 900, 2500));
    return () => clearTimeout(timer);
  }, [isFlipping, targetPage, flipDuration]);

  // Popstate listener for browser Back/Forward buttons
  useEffect(() => {
    const handlePopState = () => {
      const path = window.location.pathname;
      if (path.startsWith('/page/')) {
        const pNum = parseInt(path.replace('/page/', ''), 10);
        setShowWordDrawer(false);
        if (!isNaN(pNum) && pNum !== currentPage) {
          turnToPage(pNum);
        }
      } else if (path.startsWith('/word/')) {
        const w = decodeURIComponent(path.replace('/word/', '')).trim();
        const norm = w.toLowerCase();
        const pNum = catalog.word_to_page[norm];
        if (pNum) {
          const pageObj = catalog.pages[pNum];
          const found = [...(pageObj?.column1 || []), ...(pageObj?.column2 || [])].find(e => e.normalized === norm);
          if (found) {
            setActiveWordEntry(found);
            setShowWordDrawer(true);
            setHighlightedWord(found.headword);
          }
          if (pNum !== currentPage) {
            turnToPage(pNum, w);
          }
        }
      }
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, [currentPage, turnToPage]);

  // Search selection handler
  const handleSelectWord = (headword: string, destPage: number) => {
    turnToPage(destPage, headword);
  };

  // Thumb tab selection handler
  const handleSelectLetter = (letter: string, destPage: number) => {
    setHighlightedWord('');
    turnToPage(destPage);
  };

  // Entry click handler -> opens Word Detail Drawer & syncs URL
  const handleEntryClick = (headword: string) => {
    setHighlightedWord(headword);
    const norm = headword.toLowerCase().trim();
    const pNum = catalog.word_to_page[norm] || currentPage;
    const pageObj = catalog.pages[pNum] || leftPage || rightPage;
    const found = [...(pageObj?.column1 || []), ...(pageObj?.column2 || [])].find(e => e.normalized === norm);
    if (found) {
      setActiveWordEntry(found);
      setShowWordDrawer(true);
      if (typeof window !== 'undefined') {
        const url = `/word/${encodeURIComponent(found.headword)}`;
        if (window.location.pathname !== url) {
          window.history.pushState(null, '', url);
        }
      }
    }
  };

  const handleCloseWordDrawer = () => {
    setShowWordDrawer(false);
    if (typeof window !== 'undefined') {
      const url = `/page/${currentPage}`;
      if (window.location.pathname !== url && !window.location.pathname.startsWith('/page/')) {
        window.history.pushState(null, '', url);
      }
    }
  };

  // Bookmark toggles
  const handleToggleSpreadBookmark = () => {
    soundEngine.playPageTurn();
    setBookmarkedPages(prev => {
      const exists = prev.includes(leftPageNum);
      const updated = exists ? prev.filter(p => p !== leftPageNum) : [...prev, leftPageNum].sort((a,b)=>a-b);
      try { localStorage.setItem('panna_bookmarks', JSON.stringify(updated)); } catch(e){}
      return updated;
    });
  };

  const handleToggleWordBookmark = (entry: DictionaryEntry) => {
    setBookmarkedWords(prev => {
      const exists = prev.some(w => w.normalized === entry.normalized);
      const updated = exists
        ? prev.filter(w => w.normalized !== entry.normalized)
        : [...prev, entry];
      try { localStorage.setItem('panna_saved_words', JSON.stringify(updated)); } catch(e){}
      return updated;
    });
  };

  // Dog-ear corner fold toggle handler
  const handleToggleDogEar = useCallback((pageNum: number) => {
    soundEngine.playPageTurn();
    setDogEaredPages(prev => {
      const exists = prev.includes(pageNum);
      const updated = exists ? prev.filter(p => p !== pageNum) : [...prev, pageNum].sort((a, b) => a - b);
      try { localStorage.setItem('panna_dog_ears', JSON.stringify(updated)); } catch(e){}
      return updated;
    });
  }, []);

  // Handwritten margin note add & delete handlers
  const handleAddMarginNote = useCallback((
    pageNum: number,
    text: string,
    color: 'blue' | 'graphite' | 'crimson',
    topPct: number
  ) => {
    soundEngine.playPaperSlide();
    const newNote: MarginNote = {
      id: `note_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      page_number: pageNum,
      text,
      color,
      created_at: Date.now(),
      top_pct: topPct,
    };
    setMarginNotes(prev => {
      const updated = [...prev, newNote];
      try { localStorage.setItem('panna_marginalia', JSON.stringify(updated)); } catch(e){}
      return updated;
    });
  }, []);

  const handleDeleteMarginNote = useCallback((noteId: string) => {
    soundEngine.playPaperSlide();
    setMarginNotes(prev => {
      const updated = prev.filter(n => n.id !== noteId);
      try { localStorage.setItem('panna_marginalia', JSON.stringify(updated)); } catch(e){}
      return updated;
    });
  }, []);

  // Random Explore action
  const handleRandomExplore = () => {
    if (isFlipping) return;
    const allPages = Object.keys(catalog.pages).map(Number);
    const candidatePages = allPages.filter(p => p !== leftPageNum && p !== rightPageNum);
    if (candidatePages.length === 0) return;
    const randomPage = candidatePages[Math.floor(Math.random() * candidatePages.length)];
    const randomPageObj = catalog.pages[randomPage];
    const randomWord = randomPageObj?.first_headword || '';
    turnToPage(randomPage, randomWord);
  };

  const canPrev = useMemo(() => {
    const allPageNums = Object.keys(catalog.pages).map(Number).sort((a, b) => a - b);
    return allPageNums.some(p => p < leftPageNum);
  }, [leftPageNum]);

  const canNext = useMemo(() => {
    const allPageNums = Object.keys(catalog.pages).map(Number).sort((a, b) => a - b);
    return allPageNums.some(p => p > rightPageNum);
  }, [rightPageNum]);

  const handlePrevSpread = useCallback(() => {
    if (isFlipping) return;
    const allPageNums = Object.keys(catalog.pages).map(Number).sort((a, b) => a - b);
    const prevPages = allPageNums.filter(p => p < leftPageNum);
    if (prevPages.length > 0) {
      const prev = prevPages[prevPages.length - 1];
      turnToPage(prev % 2 === 0 ? prev : prev - 1);
    }
  }, [isFlipping, leftPageNum, turnToPage]);

  const handleNextSpread = useCallback(() => {
    if (isFlipping) return;
    const allPageNums = Object.keys(catalog.pages).map(Number).sort((a, b) => a - b);
    const nextPages = allPageNums.filter(p => p > rightPageNum);
    if (nextPages.length > 0) {
      const next = nextPages[0];
      turnToPage(next % 2 === 0 ? next : next - 1);
    }
  }, [isFlipping, rightPageNum, turnToPage]);

  // ── Mobile single-page stepping ─────────────────────────────────────────
  // The mobile view shows one page, so it must step through existing catalog
  // pages one at a time (92 → 93 → 94), not jump spread-to-spread (92 → 94).
  const mobilePageNums = useMemo(
    () => Object.keys(catalog.pages).map(Number).sort((a, b) => a - b),
    []
  );

  const handleMobilePrev = useCallback(() => {
    const prev = mobilePageNums.slice().reverse().find(p => p < currentPage);
    if (prev !== undefined) turnToPage(prev);
  }, [mobilePageNums, currentPage, turnToPage]);

  const handleMobileNext = useCallback(() => {
    const next = mobilePageNums.find(p => p > currentPage);
    if (next !== undefined) turnToPage(next);
  }, [mobilePageNums, currentPage, turnToPage]);

  const canPrevMobile = useMemo(
    () => mobilePageNums.some(p => p < currentPage),
    [mobilePageNums, currentPage]
  );
  const canNextMobile = useMemo(
    () => mobilePageNums.some(p => p > currentPage),
    [mobilePageNums, currentPage]
  );

  const handleToggleSound = () => {
    const next = !isMuted;
    setIsMuted(next);
    soundEngine.setMuted(next);
  };

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.tagName === 'INPUT') return;
      if (isFlipping) return;

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
  }, [isFlipping, handlePrevSpread, handleNextSpread]);

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
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap', justifyContent: 'center' }}>
          <LookupBar
            currentPage={currentPage}
            onSelectWord={handleSelectWord}
            onPageChange={turnToPage}
          />

          {/* Random Explore button */}
          <button
            id="explore-btn"
            onClick={handleRandomExplore}
            disabled={isFlipping}
            style={{
              height: '48px',
              padding: '0 14px',
              background: '#3e2a1b',
              border: '1px solid #8a7452',
              borderRadius: '4px',
              color: '#e8d3a0',
              font: '13px "IM Fell English SC", serif',
              cursor: isFlipping ? 'not-allowed' : 'pointer',
              whiteSpace: 'nowrap',
              boxShadow: '0 2px 8px rgba(0,0,0,.4)',
              transition: 'all 0.2s',
            }}
            title="Explore a random dictionary spread"
          >
            🎲 Explore
          </button>

          {/* Bookmarks manager button */}
          <button
            id="open-bookmarks-btn"
            onClick={() => setShowBookmarksModal(true)}
            style={{
              height: '48px',
              padding: '0 14px',
              background: (bookmarkedPages.length + dogEaredPages.length + marginNotes.length + bookmarkedWords.length) > 0 ? '#5b1f19' : '#3e2a1b',
              border: '1px solid #c9a24a',
              borderRadius: '4px',
              color: '#e0bd68',
              font: '13px "IM Fell English SC", serif',
              letterSpacing: '0.06em',
              cursor: 'pointer',
              whiteSpace: 'nowrap',
              boxShadow: '0 2px 8px rgba(0,0,0,.4)',
              transition: 'all 0.2s',
            }}
            title="View saved bookmarked spreads, dog-ears, notes, and vocabulary"
          >
            📑 Bookmarks ({bookmarkedPages.length + dogEaredPages.length + marginNotes.length + bookmarkedWords.length})
          </button>

          {/* Book Cover toggle button */}
          <button
            id="cover-toggle-btn"
            onClick={() => setIsBookOpen(prev => !prev)}
            style={{
              height: '48px',
              padding: '0 14px',
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
            title="View closed antique cover with 3D opening animation"
          >
            {isBookOpen ? '📕 Close Book' : '📖 Open Book'}
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
      {!isBookOpen ? (
        /* VINTAGE HARDCOVER PRESENTATION WITH 3D OPENING CINEMATIC */
        <CoverCinematic
          isOpen={isBookOpen}
          onOpen={() => setIsBookOpen(true)}
        />
      ) : isMobile ? (
        /* Mobile single-page layout */
        <MobilePage
          page={singleMobilePage}
          highlightedWord={highlightedWord}
          isBookmarked={isSpreadBookmarked}
          onToggleBookmark={handleToggleSpreadBookmark}
          onSelectWord={handleEntryClick}
          onPrevPage={handleMobilePrev}
          onNextPage={handleMobileNext}
          canPrev={canPrevMobile}
          canNext={canNextMobile}
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
            canPrev={canPrev}
            canNext={canNext}
            isBookmarked={isSpreadBookmarked}
            dogEaredPages={dogEaredPages}
            marginNotes={marginNotes}
            onToggleBookmark={handleToggleSpreadBookmark}
            onToggleDogEar={handleToggleDogEar}
            onAddMarginNote={handleAddMarginNote}
            onDeleteMarginNote={handleDeleteMarginNote}
            onFlipComplete={handleFlipComplete}
            onInteractiveDragEnd={(completed) => {
              if (completed) handleNextSpread();
            }}
            onSelectWord={handleEntryClick}
            onSelectLetter={handleSelectLetter}
            onPrevPage={handlePrevSpread}
            onNextPage={handleNextSpread}
          />
        </div>
      )}

      {/* Word Detail Inspection Drawer */}
      <WordDetailDrawer
        entry={activeWordEntry}
        pageNumber={activeWordEntry?.page_number ?? currentPage}
        isOpen={showWordDrawer}
        onClose={handleCloseWordDrawer}
        onSelectWord={(word, destPage) => {
          if (destPage) turnToPage(destPage, word);
          else handleSelectWord(word, currentPage);
        }}
        isBookmarked={activeWordEntry ? bookmarkedWords.some(w => w.normalized === activeWordEntry.normalized) : false}
        onToggleBookmark={handleToggleWordBookmark}
      />

      {/* Bookmarks & Reading History Modal */}
      <BookmarksModal
        isOpen={showBookmarksModal}
        onClose={() => setShowBookmarksModal(false)}
        bookmarkedPages={bookmarkedPages}
        dogEaredPages={dogEaredPages}
        marginNotes={marginNotes}
        bookmarkedWords={bookmarkedWords}
        onSelectPage={(pNum) => turnToPage(pNum)}
        onSelectWord={(word, destPage) => turnToPage(destPage, word)}
        onRemovePageBookmark={(pNum) => {
          setBookmarkedPages(prev => {
            const next = prev.filter(p => p !== pNum);
            try { localStorage.setItem('panna_bookmarks', JSON.stringify(next)); } catch(e){}
            return next;
          });
        }}
        onRemoveDogEar={(pNum) => {
          handleToggleDogEar(pNum);
        }}
        onDeleteMarginNote={handleDeleteMarginNote}
        onRemoveWordBookmark={(headword) => {
          const norm = headword.toLowerCase().trim();
          setBookmarkedWords(prev => {
            const next = prev.filter(w => w.normalized !== norm);
            try { localStorage.setItem('panna_saved_words', JSON.stringify(next)); } catch(e){}
            return next;
          });
        }}
      />

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
        <span>पन्ना · Vintage Pocket Dictionary · CSS 3D & Hybrid DOM Engine</span>
      </footer>
    </main>
  );
}
