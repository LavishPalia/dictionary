'use client';

import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { BookSpread } from '@/components/book/BookSpread';
import { MobilePage } from '@/components/book/MobilePage';
import { LookupBar } from '@/components/search/LookupBar';
import { WordDetailDrawer } from '@/components/modals/WordDetailDrawer';
import { SavedScreen, type SavedPageKind, type SavedWord } from '@/components/saved/SavedScreen';
import { ReviewScreen } from '@/components/review/ReviewScreen';
import { answer, comesBackLabel, daysUntil, dueWords, loadRecords, newRecord, saveRecords, statusOf, type ReviewRecords } from '@/lib/review';
import type { Section } from '@/components/shell/AppChrome';
import { CreditsModal } from '@/components/modals/CreditsModal';
import { CoverCinematic } from '@/components/book/CoverCinematic';
import { AppHeader, BottomNav } from '@/components/shell/AppChrome';
import { ReadingMenu } from '@/components/shell/ReadingMenu';
import { BookMeta, BookPage, DictionaryEntry, MarginNote } from '@/lib/types';
import { soundEngine } from '@/lib/audio';
import { flushSync } from 'react-dom';
import { useReducedMotion, visibleElement } from '@/lib/motion';
import type { PageTurnSpeed } from '@/components/shell/ReadingMenu';

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
  const [speedMode, setSpeedMode] = useState<PageTurnSpeed>('realistic');
  const reducedMotion = useReducedMotion();
  // Turn pages without the 3D flip: phones (no flip engine), the "Instant" speed, or a reduce-motion setting.
  const instantTurns = isMobile || speedMode === 'instant' || reducedMotion;

  // Reading settings survive a reload. settingsLoaded is state, not a ref, so it flips in the same render as the
  // loaded values: saving can never run with the defaults first and overwrite what was stored.
  const [settingsLoaded, setSettingsLoaded] = useState(false);
  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem('panna_settings') || '{}');
      if (typeof saved.evening === 'boolean') setIsLampLit(saved.evening);
      if (['slow', 'realistic', 'brisk', 'instant'].includes(saved.speed)) setSpeedMode(saved.speed);
      if (typeof saved.sounds === 'boolean') { setIsMuted(!saved.sounds); soundEngine.setMuted(!saved.sounds); }
    } catch {}
    setSettingsLoaded(true);
  }, []);
  useEffect(() => {
    if (!settingsLoaded) return;
    try { localStorage.setItem('panna_settings', JSON.stringify({ evening: isLampLit, speed: speedMode, sounds: !isMuted })); } catch {}
  }, [settingsLoaded, isLampLit, speedMode, isMuted]);

  // Dog-Eared Pages & Handwritten Pencil Marginalia State
  const [dogEaredPages, setDogEaredPages] = useState<number[]>([]);
  const [marginNotes, setMarginNotes] = useState<MarginNote[]>([]);

  // Word Detail Drawer & Bookmarks State
  const [activeWordEntry, setActiveWordEntry] = useState<DictionaryEntry | null>(initialEntry);
  const [showWordDrawer, setShowWordDrawer] = useState<boolean>(Boolean(initialEntry));
  // Which screen is showing. The book stays mounted (hidden) under Saved and Review, so its place and state survive.
  const [section, setSection] = useState<Section>('book');
  // Bumped each time Review opens, so every visit starts a fresh round.
  const [reviewRound, setReviewRound] = useState(0);
  const [reviewRecords, setReviewRecords] = useState<ReviewRecords>({});
  // True while the history entry for an open Saved/Review screen is one this visit pushed, so Back can pop it.
  const sectionEntryRef = useRef(false);
  // Re-reads "now" every minute so the due count changes at midnight without a reload.
  const [clock, setClock] = useState(0);
  useEffect(() => {
    setReviewRecords(loadRecords());
    // Browsers keep history state across reloads: a reload while Saved or Review was open must not leave a stale
    // entry that "Back to the book" would step onto.
    if (window.history.state?.panna) {
      const { panna, ...rest } = window.history.state;
      window.history.replaceState(rest, '', window.location.pathname);
    }
    const timer = setInterval(() => setClock(Date.now()), 60_000);
    return () => clearInterval(timer);
  }, []);
  const [showCreditsModal, setShowCreditsModal] = useState<boolean>(false);
  const [showMenu, setShowMenu] = useState<boolean>(false);
  const [bookmarkedPages, setBookmarkedPages] = useState<number[]>([]);
  const [bookmarkedWords, setBookmarkedWords] = useState<SavedWord[]>([]);

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
      case 'instant': return 0;
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
    const riffleMode = !instantTurns && dist > 4;

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

    if (instantTurns) {
      // Nothing to animate: apply the page change immediately, and never latch
      // isFlipping (desktop parity for the paper sound is kept here instead of
      // in the flip midpoint callback).
      soundEngine.playPageTurn();
      setCurrentPage(clampedTarget);
      setIsFlipping(false);
      return;
    }

    setIsFlipping(true);
  }, [currentPage, isFlipping, isMobile, instantTurns, meta.total_pages, fetchPage]);

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
      const shown = window.history.state?.panna;
      sectionEntryRef.current = shown === 'saved' || shown === 'review';
      setSection(shown === 'saved' || shown === 'review' ? shown : 'book');
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
      const open = () => { setActiveWordEntry(found); setShowWordDrawer(true); };
      // The tapped headword glides into the sheet's title (View Transitions). Elsewhere the sheet just opens.
      const doc = document as Document & { startViewTransition?: (update: () => void) => unknown };
      const source = reducedMotion || !doc.startViewTransition ? null : visibleElement('.entry-headword',
        (el) => el.textContent?.trim() === found.headword && (el.closest('.entry-text') as HTMLElement | null)?.style.cursor === 'pointer');
      if (source && doc.startViewTransition) {
        source.style.setProperty('view-transition-name', 'word-headword');
        doc.startViewTransition(() => {
          source.style.removeProperty('view-transition-name');
          flushSync(open);
        });
      } else {
        open();
      }
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
        : [...prev, { ...entry, saved_at: Date.now() }];
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

  // ── Saved and Review screens ────────────────────────────────────────────
  // Opening one from the book adds a history entry, so the phone's Back button returns to the book; switching
  // between them replaces that entry.
  const openSection = (next: Exclude<Section, 'book'>) => {
    if (section === next) return;
    setShowMenu(false);
    if (next === 'review') setReviewRound(n => n + 1);
    if (section === 'book') {
      window.history.pushState({ panna: next }, '', `/page/${currentPage}`);
      sectionEntryRef.current = true;
    } else {
      window.history.replaceState({ ...window.history.state, panna: next }, '', window.location.pathname);
    }
    setSection(next);
    window.scrollTo(0, 0);
  };
  // viaBack: undo the history entry (Book tab, "Back to the book"); otherwise replace it, because the caller is
  // about to navigate somewhere new.
  const leaveSection = (viaBack: boolean) => {
    if (viaBack && sectionEntryRef.current && window.history.state?.panna) {
      window.history.back(); // the popstate handler shows the book
      return;
    }
    if (window.history.state?.panna) {
      const { panna, ...rest } = window.history.state; // keep Next.js's own router state
      window.history.replaceState(rest, '', window.location.pathname);
    }
    sectionEntryRef.current = false;
    setSection('book');
  };
  const handleReviewAnswer = useCallback((key: string, correct: boolean) => {
    setReviewRecords(prev => {
      const now = Date.now();
      const next = { ...prev, [key]: answer(prev[key] ?? newRecord(now), correct, now) };
      saveRecords(next);
      return next;
    });
  }, []);
  const dueCount = useMemo(
    () => dueWords(bookmarkedWords.map(w => w.normalized), reviewRecords, Date.now(), Infinity).length,
    // clock: recount as time passes
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [bookmarkedWords, reviewRecords, clock],
  );
  // "In review · comes back in 3 days" under Save in the word sheet.
  const reviewNoteFor = (entry: DictionaryEntry | null): string | null => {
    if (!entry || !bookmarkedWords.some(w => w.normalized === entry.normalized)) return null;
    const record = reviewRecords[entry.normalized];
    if (!record || record.due_at <= Date.now()) return 'In review · due now';
    return `In review · ${statusOf(record) === 'mastered' ? 'mastered · ' : ''}comes back ${comesBackLabel(daysUntil(record, Date.now()))}`;
  };
  const persistList = <T,>(key: string, list: T[]) => { try { localStorage.setItem(key, JSON.stringify(list)); } catch {} return list; };
  const savedPageSetters: Record<SavedPageKind, [React.Dispatch<React.SetStateAction<number[]>>, string]> = {
    'ribbon': [setBookmarkedPages, 'panna_bookmarks'],
    'dog-ear': [setDogEaredPages, 'panna_dog_ears'],
  };
  const handleOpenSavedWord = async (word: SavedWord) => {
    const found = await fetchWord(word.headword); // the stored copy may be from an older build of the book
    setActiveWordEntry(found ? found.entry : word);
    setShowWordDrawer(true);
  };

  const savedCount = bookmarkedPages.length + dogEaredPages.length + marginNotes.length + bookmarkedWords.length;

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

  // The tab title follows what is on screen, in the same format the server uses for each URL.
  useEffect(() => {
    const brand = 'पन्ना (Panna)';
    let title: string | null = null;
    if (section === 'saved') title = `Saved — ${brand}`;
    else if (section === 'review') title = `Review — ${brand}`;
    else if (showWordDrawer && activeWordEntry) {
      const pron = activeWordEntry.pronunciation_deva ? ` (${activeWordEntry.pronunciation_deva})` : '';
      title = `${activeWordEntry.headword}${pron} — ${brand} Dictionary`;
    } else {
      const pages = (isMobile ? [singleMobilePage] : [leftPage, rightPage]).filter((p): p is BookPage => p !== null);
      if (pages.length) {
        const label = pages.length === 2 ? `Pages ${pages[0].page_number}–${pages[1].page_number}` : `Page ${pages[0].page_number}`;
        title = `${label} (${pages[0].guide_left} to ${pages[pages.length - 1].guide_right}) — ${brand}`;
      }
    }
    if (title) document.title = title;
  }, [section, showWordDrawer, activeWordEntry, isMobile, singleMobilePage, leftPage, rightPage]);

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.tagName === 'INPUT') return;
      // A control already used the key (e.g. arrows in a segmented control), or a dialog is in front of the book.
      if (e.defaultPrevented || document.querySelector('[role="dialog"]') || section !== 'book') return;
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
  }, [isFlipping, handlePrevSpread, handleNextSpread, section]);

  return (
    <main
      className="app-main"
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
      <AppHeader
        search={
          <LookupBar
            onSelectWord={handleSelectWord}
            onSelectRecent={handleSelectSavedWord}
            onBrowseLetter={(letter) => { const page = meta.thumb_index[letter]; if (page) handleSelectLetter(letter, page); }}
            totalEntries={meta.total_entries}
          />
        }
        savedCount={savedCount}
        onOpenSaved={() => (section === 'saved' ? leaveSection(true) : openSection('saved'))}
        onOpenReview={() => (section === 'review' ? leaveSection(true) : openSection('review'))}
        section={section}
        dueCount={dueCount}
        onOpenMenu={() => setShowMenu(true)}
        menuOpen={showMenu}
      />

      <div style={{ display: section === 'book' ? 'contents' : 'none' }}>
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

      {/* Main Reading Canvas */}
      {!isBookOpen ? (
        /* VINTAGE HARDCOVER PRESENTATION WITH 3D OPENING CINEMATIC */
        <CoverCinematic
          reducedMotion={reducedMotion}
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
      </div>

      {section === 'saved' && (
        <SavedScreen
          words={bookmarkedWords}
          ribbonPages={bookmarkedPages}
          dogEaredPages={dogEaredPages}
          notes={marginNotes}
          loadPage={fetchPage}
          onOpenWord={handleOpenSavedWord}
          onGoToPage={(page) => { leaveSection(false); setHighlightedWord(''); turnToPage(page); }}
          onRemoveWord={(w) => setBookmarkedWords(prev => persistList('panna_saved_words', prev.filter(x => x.normalized !== w.normalized)))}
          onRestoreWord={(w) => setBookmarkedWords(prev => prev.some(x => x.normalized === w.normalized) ? prev : persistList('panna_saved_words', [...prev, w]))}
          onRemovePage={(kind, page) => { const [set, key] = savedPageSetters[kind]; set(prev => persistList(key, prev.filter(p => p !== page))); }}
          onRestorePage={(kind, page) => { const [set, key] = savedPageSetters[kind]; set(prev => prev.includes(page) ? prev : persistList(key, [...prev, page].sort((a, b) => a - b))); }}
          onDeleteNote={(note) => handleDeleteMarginNote(note.id)}
          onRestoreNote={(note) => setMarginNotes(prev => prev.some(n => n.id === note.id) ? prev : persistList('panna_marginalia', [...prev, note]))}
          onBackToBook={() => leaveSection(true)}
          statusFor={(key) => statusOf(reviewRecords[key])}
          dueCount={dueCount}
          onReview={() => openSection('review')}
        />
      )}

      {section === 'review' && (
        <ReviewScreen
          key={reviewRound}
          saved={bookmarkedWords}
          records={reviewRecords}
          onAnswer={handleReviewAnswer}
          onClose={() => leaveSection(true)}
          onOpenSaved={() => openSection('saved')}
        />
      )}

      {/* Word Detail Inspection Drawer */}
      <WordDetailDrawer
        entry={activeWordEntry}
        pageNumber={activeWordEntry?.page_number ?? currentPage}
        isOpen={showWordDrawer}
        onClose={handleCloseWordDrawer}
        onSelectWord={(word, destPage) => {
          if (section !== 'book') leaveSection(false);
          if (destPage) turnToPage(destPage, word);
          else handleSelectWord(word, currentPage);
        }}
        isBookmarked={activeWordEntry ? bookmarkedWords.some(w => w.normalized === activeWordEntry.normalized) : false}
        onToggleBookmark={handleToggleWordBookmark}
        reviewNote={reviewNoteFor(activeWordEntry)}
      />

      <CreditsModal isOpen={showCreditsModal} onClose={() => setShowCreditsModal(false)} />

      <ReadingMenu
        open={showMenu}
        onClose={() => setShowMenu(false)}
        evening={isLampLit}
        onEveningChange={setIsLampLit}
        speed={speedMode}
        reducedMotion={reducedMotion}
        onSpeedChange={setSpeedMode}
        soundsOn={!isMuted}
        onSoundsChange={(on) => { setIsMuted(!on); soundEngine.setMuted(!on); }}
        currentPage={currentPage}
        totalPages={meta.total_pages}
        busy={isFlipping}
        onGoToPage={(n) => { setHighlightedWord(''); turnToPage(n); }}
        onRandomPage={handleRandomExplore}
        bookOpen={isBookOpen}
        onToggleBook={() => setIsBookOpen(prev => !prev)}
        onOpenCredits={() => setShowCreditsModal(true)}
      />

      <BottomNav
        active={section}
        savedCount={savedCount}
        dueCount={dueCount}
        onBook={() => { if (section !== 'book') leaveSection(true); if (!isBookOpen) setIsBookOpen(true); }}
        onSaved={() => openSection('saved')}
        onReview={() => openSection('review')}
      />
    </main>
  );
}
