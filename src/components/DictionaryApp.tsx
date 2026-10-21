'use client';

import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { BookSpread } from '@/components/book/BookSpread';
import { MobilePage } from '@/components/book/MobilePage';
import { LookupBar } from '@/components/search/LookupBar';
import { WordDetailDrawer } from '@/components/modals/WordDetailDrawer';
import { BookmarksModal } from '@/components/modals/BookmarksModal';
import { CreditsModal } from '@/components/modals/CreditsModal';
import { CoverCinematic } from '@/components/book/CoverCinematic';
import { BookMeta, BookPage, DictionaryEntry, MarginNote } from '@/lib/types';
import { soundEngine } from '@/lib/audio';

// Pages kept in memory. The prefetch window (current spread ± 1 spread = 6 pages) is refreshed on every page
// change, so the pages on screen are never the least recently used.
const MAX_CACHED_PAGES = 20;

// Left pages are even; page 1 is a right-hand page facing the endpaper.
const spreadLeftOf = (p: number): number => (p % 2 === 0 ? p : p - 1);

export interface DictionaryAppProps {
  initialMeta: BookMeta;
  /** Server-rendered pages of the initial spread. */
  initialPages: BookPage[];
  initialPage: number;
  /** Entry to open in the word drawer (deep link /word/[headword]). */
  initialEntry?: DictionaryEntry | null;
}

export default function DictionaryApp({ initialMeta, initialPages, initialPage, initialEntry = null }: DictionaryAppProps) {
  const meta = initialMeta;
  const [currentPage, setCurrentPage] = useState<number>(initialPage);
  const [highlightedWord, setHighlightedWord] = useState<string>(initialEntry?.headword || '');
  const [isMobile, setIsMobile] = useState<boolean>(false);
  const [isBookOpen, setIsBookOpen] = useState<boolean>(true);
  const [isMuted, setIsMuted] = useState<boolean>(false);
  const [isLampLit, setIsLampLit] = useState<boolean>(false);
  const [speedMode, setSpeedMode] = useState<'realistic' | 'brisk' | 'slow'>('realistic');

  // Dog-Eared Pages & Handwritten Pencil Marginalia State
  const [dogEaredPages, setDogEaredPages] = useState<number[]>([]);
  const [marginNotes, setMarginNotes] = useState<MarginNote[]>([]);

  // Word Detail Drawer & Bookmarks State
  const [activeWordEntry, setActiveWordEntry] = useState<DictionaryEntry | null>(initialEntry);
  const [showWordDrawer, setShowWordDrawer] = useState<boolean>(Boolean(initialEntry));
  const [showBookmarksModal, setShowBookmarksModal] = useState<boolean>(false);
  const [showCreditsModal, setShowCreditsModal] = useState<boolean>(false);
  const [bookmarkedPages, setBookmarkedPages] = useState<number[]>([]);
  const [bookmarkedWords, setBookmarkedWords] = useState<DictionaryEntry[]>([]);

  // ── Page cache & prefetching ────────────────────────────────────────────
  // Pages arrive from /api/page/[n]; the map is LRU-ordered (oldest first) and cacheVersion re-renders on arrival.
  const pageCacheRef = useRef<Map<number, BookPage>>(new Map(initialPages.map(p => [p.page_number, p])));
  const inflightRef = useRef<Map<number, Promise<BookPage | null>>>(new Map());
  const [cacheVersion, setCacheVersion] = useState(0);

  const fetchPage = useCallback((n: number): Promise<BookPage | null> => {
    if (!Number.isInteger(n) || n < 1 || n > meta.total_pages) return Promise.resolve(null);
    const cache = pageCacheRef.current;
    const cached = cache.get(n);
    if (cached) {
      cache.delete(n);
      cache.set(n, cached);
      return Promise.resolve(cached);
    }
    const inflight = inflightRef.current.get(n);
    if (inflight) return inflight;
    const request = fetch(`/api/page/${n}?v=${meta.data_version}`)
      .then(res => (res.ok ? (res.json() as Promise<BookPage>) : null))
      .then(page => {
        if (page) {
          cache.set(n, page);
          while (cache.size > MAX_CACHED_PAGES) cache.delete(cache.keys().next().value as number);
          setCacheVersion(v => v + 1);
        }
        return page;
      })
      .catch(err => {
        console.warn(`Could not load page ${n}:`, err);
        return null;
      })
      .finally(() => inflightRef.current.delete(n));
    inflightRef.current.set(n, request);
    return request;
  }, [meta.total_pages, meta.data_version]);

  const getCachedPage = useCallback(
    (n: number): BookPage | null => pageCacheRef.current.get(n) ?? null,
    // cacheVersion is the signal that the (mutable) cache changed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [cacheVersion]
  );

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
  const [targetPage, setTargetPage] = useState<number>(initialPage);
  const [flipDirection, setFlipDirection] = useState<'forward' | 'backward'>('forward');
  const [isRiffle, setIsRiffle] = useState<boolean>(false);
  const [jumpDistance, setJumpDistance] = useState<number>(1);
  const [riffleInfo, setRiffleInfo] = useState<{ from: number; to: number; pages: number } | null>(null);
  // True while a navigation waits for its target pages to load (blocks a second navigation meanwhile).
  const loadingTargetRef = useRef<boolean>(false);

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
  const leftPageNum = spreadLeftOf(currentPage);
  const rightPageNum = leftPageNum + 1;

  // Prefetch the neighbouring spreads (currentPage ± 2 pages) so the next flip is already in memory.
  useEffect(() => {
    for (let p = leftPageNum - 2; p <= rightPageNum + 2; p++) fetchPage(p);
  }, [leftPageNum, rightPageNum, fetchPage]);

  const leftPage = useMemo(() => getCachedPage(leftPageNum), [getCachedPage, leftPageNum]);
  const rightPage = useMemo(() => getCachedPage(rightPageNum), [getCachedPage, rightPageNum]);

  // Compute target left and right page during flip animation
  const targetLeftNum = spreadLeftOf(targetPage);
  const targetRightNum = targetLeftNum + 1;

  const targetLeftPage = useMemo(() => getCachedPage(targetLeftNum), [getCachedPage, targetLeftNum]);
  const targetRightPage = useMemo(() => getCachedPage(targetRightNum), [getCachedPage, targetRightNum]);

  const singleMobilePage = useMemo<BookPage | null>(() => {
    return getCachedPage(currentPage) || leftPage || rightPage;
  }, [getCachedPage, currentPage, leftPage, rightPage]);

  // Determine active letter based on first headword of spread
  const activeLetter = useMemo<string>(() => {
    const word = leftPage?.first_headword || rightPage?.first_headword || 'A';
    return word[0].toUpperCase();
  }, [leftPage, rightPage]);

  // Check if current spread has a ribbon bookmark
  const isSpreadBookmarked = useMemo(() => {
    return bookmarkedPages.includes(leftPageNum);
  }, [bookmarkedPages, leftPageNum]);

  // Trigger 3D Page Turn / Multi-Page Riffle with URL sync. The target pages are loaded before the flip
  // starts, so the leaf never lands on a blank page.
  const turnToPage = useCallback(async (newTarget: number, wordToHighlight?: string) => {
    if (isFlipping || loadingTargetRef.current) return;

    const clampedTarget = Math.max(1, Math.min(meta.total_pages, newTarget));
    if (clampedTarget === currentPage) {
      if (wordToHighlight) setHighlightedWord(wordToHighlight);
      return;
    }

    loadingTargetRef.current = true;
    try {
      const targetLeft = spreadLeftOf(clampedTarget);
      await Promise.all(isMobile ? [fetchPage(clampedTarget)] : [fetchPage(targetLeft), fetchPage(targetLeft + 1)]);
    } finally {
      loadingTargetRef.current = false;
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
  }, [currentPage, isFlipping, isMobile, meta.total_pages, fetchPage]);

  // Looks a headword up on the server (its page changes whenever the book is rebuilt).
  const fetchWord = useCallback(async (headword: string): Promise<{ entry: DictionaryEntry; pageNumber: number } | null> => {
    try {
      const res = await fetch(`/api/word/${encodeURIComponent(headword)}`);
      if (!res.ok) return null;
      const data = await res.json();
      return data.entry ? { entry: data.entry, pageNumber: data.pageNumber } : null;
    } catch {
      return null;
    }
  }, []);

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
    const handlePopState = async () => {
      const path = window.location.pathname;
      if (path.startsWith('/page/')) {
        const pNum = parseInt(path.replace('/page/', ''), 10);
        setShowWordDrawer(false);
        if (!isNaN(pNum) && pNum !== currentPage) {
          turnToPage(pNum);
        }
      } else if (path.startsWith('/word/')) {
        const w = decodeURIComponent(path.replace('/word/', '')).trim();
        const found = await fetchWord(w);
        if (found) {
          setActiveWordEntry(found.entry);
          setShowWordDrawer(true);
          setHighlightedWord(found.entry.headword);
          if (found.pageNumber !== currentPage) {
            turnToPage(found.pageNumber, w);
          }
        }
      } else if (path === '/') {
        setShowWordDrawer(false);
        if (currentPage !== 1) turnToPage(1);
      }
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, [currentPage, turnToPage, fetchWord]);

  // Search selection handler
  const handleSelectWord = (headword: string, destPage: number) => {
    turnToPage(destPage, headword);
  };

  // Saved words keep the page number they had when saved, which changes when the book is rebuilt: look them up again.
  const handleSelectSavedWord = async (headword: string, savedPage: number) => {
    const found = await fetchWord(headword);
    turnToPage(found ? found.pageNumber : savedPage, found ? found.entry.headword : headword);
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
    const visible = [leftPage, rightPage, singleMobilePage].flatMap(p => (p ? [...p.column1, ...p.column2] : []));
    const found = visible.find(e => e.normalized === norm);
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
  const handleRandomExplore = async () => {
    if (isFlipping) return;
    const candidatePages: number[] = [];
    for (let p = 1; p <= meta.total_pages; p++) {
      if (p !== leftPageNum && p !== rightPageNum) candidatePages.push(p);
    }
    if (candidatePages.length === 0) return;
    const randomPage = candidatePages[Math.floor(Math.random() * candidatePages.length)];
    const randomPageObj = await fetchPage(randomPage);
    turnToPage(randomPage, randomPageObj?.first_headword || '');
  };

  const canPrev = leftPageNum > 1;
  const canNext = rightPageNum < meta.total_pages;

  const handlePrevSpread = useCallback(() => {
    if (isFlipping || leftPageNum <= 1) return;
    turnToPage(Math.max(1, leftPageNum - 2));
  }, [isFlipping, leftPageNum, turnToPage]);

  const handleNextSpread = useCallback(() => {
    if (isFlipping || rightPageNum >= meta.total_pages) return;
    turnToPage(rightPageNum + 1);
  }, [isFlipping, rightPageNum, meta.total_pages, turnToPage]);

  // ── Mobile single-page stepping ─────────────────────────────────────────
  // The mobile view shows one page, so it steps one page at a time (92 → 93 → 94).
  const handleMobilePrev = useCallback(() => {
    if (currentPage > 1) turnToPage(currentPage - 1);
  }, [currentPage, turnToPage]);

  const handleMobileNext = useCallback(() => {
    if (currentPage < meta.total_pages) turnToPage(currentPage + 1);
  }, [currentPage, meta.total_pages, turnToPage]);

  const canPrevMobile = currentPage > 1;
  const canNextMobile = currentPage < meta.total_pages;

  // "Go to page" input in the footer
  const [goToValue, setGoToValue] = useState('');
  const handleGoToPage = (e: React.FormEvent) => {
    e.preventDefault();
    const n = parseInt(goToValue, 10);
    if (Number.isInteger(n)) {
      setHighlightedWord('');
      turnToPage(n);
    }
    setGoToValue('');
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

          <button
            id="open-credits-btn"
            onClick={() => setShowCreditsModal(true)}
            style={{ height: '48px', padding: '0 12px', background: '#3e2a1b', border: '1px solid #8a7452', borderRadius: '4px', color: '#e8d3a0', font: '13px "IM Fell English SC", serif', cursor: 'pointer', whiteSpace: 'nowrap', boxShadow: '0 2px 8px rgba(0,0,0,.4)' }}
            title="View dictionary sources and review status"
          >
            Credits
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
            thumbMap={meta.thumb_index}
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
        onSelectWord={handleSelectSavedWord}
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

      <CreditsModal isOpen={showCreditsModal} onClose={() => setShowCreditsModal(false)} />

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
        <form
          id="goto-page-form"
          onSubmit={handleGoToPage}
          style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', marginBottom: '10px' }}
        >
          <label htmlFor="goto-page-input">Go to page</label>
          <input
            id="goto-page-input"
            type="number"
            inputMode="numeric"
            min={1}
            max={meta.total_pages}
            value={goToValue}
            onChange={(e) => setGoToValue(e.target.value)}
            placeholder={String(currentPage)}
            style={{
              width: '64px',
              padding: '4px 6px',
              background: '#efe3c0',
              border: '1px solid #8a7452',
              borderRadius: '3px',
              color: '#2a1e14',
              font: '13px "IM Fell English", serif',
              textAlign: 'center',
            }}
          />
          <span>of {meta.total_pages}</span>
          <button
            type="submit"
            disabled={isFlipping}
            style={{
              padding: '4px 10px',
              background: '#3e2a1b',
              border: '1px solid #8a7452',
              borderRadius: '3px',
              color: '#e8d3a0',
              font: '12px "IM Fell English SC", serif',
              cursor: isFlipping ? 'not-allowed' : 'pointer',
            }}
          >
            Go
          </button>
        </form>
        <div>पन्ना · Vintage Pocket Dictionary · CSS 3D & Hybrid DOM Engine</div>
      </footer>
    </main>
  );
}
