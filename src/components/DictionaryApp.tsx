'use client';

import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { BookSpread } from '@/components/book/BookSpread';
import { ScaledSpread } from '@/components/book/ScaledSpread';
import { MobilePage } from '@/components/book/MobilePage';
import { LookupBar } from '@/components/search/LookupBar';
import { WordDetailDrawer } from '@/components/modals/WordDetailDrawer';
import { SavedScreen, type SavedPageKind, type SavedWord } from '@/components/saved/SavedScreen';
import { ReviewScreen } from '@/components/review/ReviewScreen';
import { TodayScreen } from '@/components/today/TodayScreen';
import { answer, comesBackLabel, daysUntil, dueWords, loadRecords, loadReviewDays, newRecord, nextDue, saveRecords, saveReviewDays, statusOf, streak, withReviewDay, type ReviewRecords } from '@/lib/review';
import type { Section } from '@/components/shell/AppChrome';
import { ANCHORS_KEY, anchorWords, emptyAnchors, noteAnchor, pageAnchor, relocateMarks, type MarkAnchors } from '@/lib/marks';
import { CreditsModal } from '@/components/modals/CreditsModal';
import { CoverCinematic } from '@/components/book/CoverCinematic';
import { AppHeader, BottomNav } from '@/components/shell/AppChrome';
import { ReadingMenu } from '@/components/shell/ReadingMenu';
import { BackupManager, lastBackupLabel, type BackupHandle } from '@/components/shell/BackupManager';
import { LAST_BACKUP_KEY, isMarginNote, isSavedWord, keepValid } from '@/lib/backup';
import { BookMeta, BookPage, DictionaryEntry, MarginNote, RelatedWord } from '@/lib/types';
import { soundEngine } from '@/lib/audio';
import { flushSync } from 'react-dom';
import { useReducedMotion, visibleElement } from '@/lib/motion';
import type { PageTurnSpeed } from '@/components/shell/ReadingMenu';
import { TourLayer } from '@/components/tour/TourLayer';
import { ToursSheet } from '@/components/tour/ToursSheet';
import { useTours } from '@/components/tour/useTours';
import { unseenTours } from '@/lib/tours';
import { bestStreak, calendar, progressOf } from '@/lib/progress';
import { useOffline } from '@/components/shell/useOffline';
import { REPORTS_ENABLED, flushQueue } from '@/lib/report';

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
  /** The front page (/) opens on Today; links to pages and words open the book. */
  initialSection?: Section;
}

export default function DictionaryApp({ initialMeta, initialPages, initialPage, initialEntry = null, initialSection = 'book' }: DictionaryAppProps) {
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
    try {
      // Nothing to remember until the reader changes something: a browser that has never been set up must not
      // look as if it chose the defaults (a restored backup's settings would otherwise lose to them).
      const untouched = !isLampLit && speedMode === 'realistic' && !isMuted;
      if (untouched && localStorage.getItem('panna_settings') === null) return;
      localStorage.setItem('panna_settings', JSON.stringify({ evening: isLampLit, speed: speedMode, sounds: !isMuted }));
    } catch {}
  }, [settingsLoaded, isLampLit, speedMode, isMuted]);

  // Dog-Eared Pages & Handwritten Pencil Marginalia State
  const [dogEaredPages, setDogEaredPages] = useState<number[]>([]);
  const [marginNotes, setMarginNotes] = useState<MarginNote[]>([]);
  // Anchor words for the marks above; null until loaded (and, after a rebuild, relocated).
  const [markAnchors, setMarkAnchors] = useState<MarkAnchors | null>(null);

  // Word Detail Drawer & Bookmarks State
  const [activeWordEntry, setActiveWordEntry] = useState<DictionaryEntry | null>(initialEntry);
  const [showWordDrawer, setShowWordDrawer] = useState<boolean>(Boolean(initialEntry));
  // Which screen is showing. The book stays mounted (hidden) under Saved and Review, so its place and state survive.
  const [section, setSection] = useState<Section>(initialSection);
  // The home screen (Today or Book) that Saved and Review return to.
  const [homeSection, setHomeSection] = useState<Section>(initialSection);
  // Last page read, for "Continue reading" on Today. null until known.
  const [lastReadPage, setLastReadPage] = useState<number | null>(null);
  const [reviewDays, setReviewDays] = useState<string[]>([]);
  // Bumped each time Review opens, so every visit starts a fresh round.
  const [reviewRound, setReviewRound] = useState(0);
  const [reviewRecords, setReviewRecords] = useState<ReviewRecords>({});
  // True while the history entry for an open Saved/Review screen is one this visit pushed, so Back can pop it.
  const sectionEntryRef = useRef(false);
  // Re-reads "now" every minute so the due count changes at midnight without a reload.
  const [clock, setClock] = useState(0);
  useEffect(() => {
    setReviewRecords(loadRecords());
    setReviewDays(loadReviewDays());
    try { const last = Number(localStorage.getItem('panna_last_page')); if (Number.isInteger(last) && last >= 1) setLastReadPage(last); } catch {}
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
  const backupRef = useRef<BackupHandle>(null);
  const [lastBackupAt, setLastBackupAt] = useState<number | null>(null);
  useEffect(() => {
    try { const at = Number(localStorage.getItem(LAST_BACKUP_KEY)); if (at) setLastBackupAt(at); } catch {}
  }, []);
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

  // Load saved bookmarks, dog-ears, and marginalia from localStorage. Marks made under an older build of the book
  // are first moved to the pages their anchor words are on now (src/lib/marks.ts).
  useEffect(() => {
    let live = true;
    const read = <T,>(key: string, fallback: T): T => {
      try { const raw = localStorage.getItem(key); return raw ? JSON.parse(raw) : fallback; } catch { return fallback; }
    };
    const savedWords = keepValid<SavedWord>(read<unknown>('panna_saved_words', []), isSavedWord);
    if (savedWords.length) setBookmarkedWords(savedWords);
    const marks = {
      ribbons: keepValid<number>(read<unknown>('panna_bookmarks', []), Number.isInteger),
      dogEars: keepValid<number>(read<unknown>('panna_dog_ears', []), Number.isInteger),
      notes: keepValid<MarginNote>(read<unknown>('panna_marginalia', []), isMarginNote),
    };
    const stored = read<MarkAnchors | null>(ANCHORS_KEY, null);
    const apply = (m: typeof marks, anchors: MarkAnchors) => {
      if (!live) return;
      setBookmarkedPages(m.ribbons);
      setDogEaredPages(m.dogEars);
      setMarginNotes(m.notes);
      setMarkAnchors(anchors);
    };
    if (stored && stored.data_version !== meta.data_version) {
      const words = anchorWords(stored, marks.notes);
      fetch(`/api/locate?${words.map((w) => `w=${encodeURIComponent(w)}`).join('&')}`)
        .then((res) => (res.ok ? res.json() : Promise.reject(new Error(String(res.status)))))
        .then(({ pages }: { pages: Record<string, number> }) => {
          const moved = relocateMarks(marks, stored, pages, meta.total_pages, meta.data_version);
          try {
            localStorage.setItem('panna_bookmarks', JSON.stringify(moved.ribbons));
            localStorage.setItem('panna_dog_ears', JSON.stringify(moved.dogEars));
            localStorage.setItem('panna_marginalia', JSON.stringify(moved.notes));
            localStorage.setItem(ANCHORS_KEY, JSON.stringify(moved.anchors));
          } catch {}
          apply({ ribbons: moved.ribbons, dogEars: moved.dogEars, notes: moved.notes }, moved.anchors);
        })
        // Offline or failed: show the marks where they were and try again next time (the stored anchors are kept).
        .catch(() => apply(marks, { ...stored, data_version: '' }));
    } else {
      // Same build, or marks from before anchors existed: page numbers are taken as current.
      apply(marks, stored ?? emptyAnchors(meta.data_version));
    }
    return () => { live = false; };
  // meta is fixed for the life of the page
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Give every mark an anchor word (new marks, and marks made before anchors existed), loading pages as needed, and
  // drop anchors of removed marks. Skipped while anchors are being relocated, or after a failed relocation.
  useEffect(() => {
    if (!markAnchors || markAnchors.data_version !== meta.data_version) return;
    const next: MarkAnchors = { data_version: meta.data_version, ribbons: {}, dogEars: {} };
    const fill = (pages: number[], from: Record<number, string>, to: Record<number, string>) => {
      for (const page of pages) {
        const anchor = from[page] ?? pageAnchor(getCachedPage(page));
        if (anchor) to[page] = anchor;
        else fetchPage(page); // arrives later and re-runs this effect
      }
    };
    fill(bookmarkedPages, markAnchors.ribbons, next.ribbons);
    fill(dogEaredPages, markAnchors.dogEars, next.dogEars);
    if (JSON.stringify(next) !== JSON.stringify(markAnchors)) {
      setMarkAnchors(next);
      try { localStorage.setItem(ANCHORS_KEY, JSON.stringify(next)); } catch {}
    }
    const unanchored = marginNotes.filter((n) => !n.anchor);
    if (unanchored.length) {
      let changed = false;
      const notes = marginNotes.map((n) => {
        if (n.anchor) return n;
        const anchor = noteAnchor(getCachedPage(n.page_number), n.top_pct);
        if (!anchor) { fetchPage(n.page_number); return n; }
        changed = true;
        return { ...n, anchor };
      });
      if (changed) {
        setMarginNotes(notes);
        try { localStorage.setItem('panna_marginalia', JSON.stringify(notes)); } catch {}
      }
    }
  }, [markAnchors, bookmarkedPages, dogEaredPages, marginNotes, getCachedPage, fetchPage, meta.data_version]);

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
    // Client-side URL history update without full page reload
    const showInAddress = () => {
      const url = wordToHighlight
        ? `/word/${encodeURIComponent(wordToHighlight)}`
        : `/page/${clampedTarget}`;
      if (window.location.pathname !== url) {
        window.history.pushState(null, '', url);
      }
    };
    if (clampedTarget === currentPage) {
      if (wordToHighlight) setHighlightedWord(wordToHighlight);
      showInAddress(); // e.g. a search from Today for a word on the page the book is already open at
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

    showInAddress();

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
      const path = window.location.pathname;
      const isSection = shown === 'saved' || shown === 'review' || shown === 'today';
      sectionEntryRef.current = isSection;
      // The front page with no screen recorded is Today.
      const next: Section = isSection ? shown : path === '/' ? 'today' : 'book';
      setSection(next);
      if (next === 'book' || next === 'today') setHomeSection(next);
      if (path.startsWith('/page/')) {
        const pNum = parseInt(path.replace('/page/', ''), 10);
        setShowWordDrawer(false);
        if (!isNaN(pNum) && pNum !== currentPage) {
          turnToPage(pNum);
        }
      } else if (path.startsWith('/word/')) {
        const rawWord = path.replace('/word/', '');
        const w = (() => { try { return decodeURIComponent(rawWord); } catch { return rawWord; } })().trim();
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
        // The front page is Today (set above); the book stays where the reader left it.
        setShowWordDrawer(false);
      }
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, [currentPage, turnToPage, fetchWord]);

  // The search box is on every screen: what it finds is shown in the book.
  const showBookForSearch = () => {
    if (section !== 'book') showBookForNavigation();
  };

  // Search selection handler
  const handleSelectWord = (headword: string, destPage: number) => {
    showBookForSearch();
    turnToPage(destPage, headword);
  };

  // Saved words keep the page number they had when saved, which changes when the book is rebuilt: look them up again.
  const handleSelectSavedWord = async (headword: string, savedPage: number) => {
    showBookForSearch();
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
      // Only a sheet opened from the book changes the address (to /word/…); give the page address back. Sheets opened
      // over Today, Saved or Review leave the address alone.
      if (window.location.pathname.startsWith('/word/')) {
        window.history.pushState(null, '', `/page/${currentPage}`);
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
    // The very first save gets a one-time tip saying when the word comes back.
    if (bookmarkedWords.length === 0) tours.offerTip('first-save', true);
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
      anchor: noteAnchor(pageCacheRef.current.get(pageNum) ?? null, topPct),
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

  // ── Screens and history ─────────────────────────────────────────────────
  // Today and Book are the two home screens; Saved and Review open over whichever one the reader came from, with one
  // history entry, so the phone's Back button (or ✕ / Done) returns there. Moving from Book to Today also adds an
  // entry, so Back returns to the book.
  const isHome = (s: Section) => s === 'book' || s === 'today';
  const stripSection = () => {
    const { panna, ...rest } = window.history.state ?? {}; // keep Next.js's own router state
    return rest;
  };
  const goTo = (target: Section) => {
    if (target === section) return;
    setShowMenu(false);
    if (target === 'review') setReviewRound(n => n + 1);
    window.scrollTo(0, 0);
    if (!isHome(target)) {
      if (isHome(section)) {
        window.history.pushState({ panna: target }, '', window.location.pathname);
        sectionEntryRef.current = true;
      } else {
        window.history.replaceState({ ...window.history.state, panna: target }, '', window.location.pathname);
      }
      setSection(target);
      return;
    }
    // Closing Saved or Review back to the screen it opened over: undo its history entry.
    if (!isHome(section) && target === homeSection && sectionEntryRef.current && window.history.state?.panna) {
      window.history.back(); // the popstate handler shows the home screen
      return;
    }
    if (!isHome(section)) {
      window.history.replaceState(stripSection(), '', window.location.pathname);
      sectionEntryRef.current = false;
    }
    if (target === 'today') {
      window.history.pushState({ ...stripSection(), panna: 'today' }, '', '/');
      sectionEntryRef.current = true;
    } else if (homeSection === 'today' && section === 'today' && sectionEntryRef.current && window.history.state?.panna === 'today') {
      window.history.back(); // Today was opened from the book: Back returns to it
      return;
    } else if (window.location.pathname === '/') {
      window.history.pushState({}, '', `/page/${currentPage}`);
    }
    setHomeSection(target);
    setSection(target);
  };
  // Leave Saved / Review / Today for the book because the caller is about to turn to a page (which adds its own
  // history entry): no Back step is spent on the screen being left.
  const showBookForNavigation = () => {
    if (window.history.state?.panna) window.history.replaceState(stripSection(), '', window.location.pathname);
    sectionEntryRef.current = false;
    setHomeSection('book');
    setSection('book');
  };
  // Guided tours and one-time tips (src/components/tour). A tour step sets up its own scene through these.
  const offline = useOffline(meta, initialPages.map(p => p.page_number));
  // Problem reports written offline are sent once the connection is back (and on the next visit).
  useEffect(() => { if (REPORTS_ENABLED && offline.online) flushQueue(); }, [offline.online]);
  const tours = useTours({
    section,
    goTo,
    setMenu: setShowMenu,
    openWord: (entry) => {
      if (entry) { setActiveWordEntry(entry); setShowWordDrawer(true); } else setShowWordDrawer(false);
    },
    findVisibleEntry: (headword) => {
      const norm = headword.toLowerCase().trim();
      return [leftPage, rightPage, singleMobilePage].flatMap(p => (p ? [...p.column1, ...p.column2] : [])).find(e => e.normalized === norm) ?? null;
    },
    fetchWord,
    currentWord: showWordDrawer ? activeWordEntry : null,
    phone: isMobile,
    reducedMotion: reducedMotion || speedMode === 'instant',
  });
  const { offerTip } = tours;
  // One-time tips, the first time each thing is used (never during a tour; the layer waits for its target).
  useEffect(() => {
    if (section !== 'book' || showWordDrawer || showMenu || !isBookOpen) return;
    const timer = setTimeout(() => offerTip('book'), 900);
    return () => clearTimeout(timer);
  }, [section, showWordDrawer, showMenu, isBookOpen, offerTip]);
  useEffect(() => {
    if (!showWordDrawer) return;
    const timer = setTimeout(() => offerTip('word-card'), 500);
    return () => clearTimeout(timer);
  }, [showWordDrawer, offerTip]);
  useEffect(() => {
    if (section === 'review') offerTip('review');
  }, [section, offerTip]);
  // "?" opens Guided tours (desktop keyboards), unless typing or something is already open.
  const openToursSheet = tours.openSheet;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== '?' || e.ctrlKey || e.metaKey || e.altKey || tours.active || document.querySelector('[role="dialog"]')) return;
      const target = e.target as HTMLElement | null;
      if (target && (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName))) return;
      e.preventDefault();
      openToursSheet();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [openToursSheet, tours.active]);

  const handleReviewAnswer = useCallback((key: string, correct: boolean) => {
    setReviewRecords(prev => {
      const now = Date.now();
      const next = { ...prev, [key]: answer(prev[key] ?? newRecord(now), correct, now) };
      saveRecords(next);
      return next;
    });
    setReviewDays(prev => {
      const next = withReviewDay(prev, Date.now());
      if (next !== prev) saveReviewDays(next);
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
  // A similar or opposite word takes over the open sheet; the book stays where it is. Opened from the book, the address
  // follows the sheet without adding a Back step. The tapped chip is gone, so focus goes to the sheet (which reads out
  // the new word) at its top.
  // Words passed through by tapping similar/opposite chips, so the sheet can step back. `at` is the word the trail
  // leads to: if the sheet shows any other word (opened from search, the book, a tour…), the trail no longer applies.
  const [wordTrail, setWordTrail] = useState<{ back: DictionaryEntry[]; at: string }>({ back: [], at: '' });
  const showInSheet = (entry: DictionaryEntry) => {
    setActiveWordEntry(entry);
    if (window.location.pathname.startsWith('/word/')) {
      window.history.replaceState(window.history.state, '', `/word/${encodeURIComponent(entry.headword)}`);
    }
    requestAnimationFrame(() => {
      const sheet = document.getElementById('word-sheet');
      sheet?.scrollTo({ top: 0 });
      sheet?.focus();
    });
  };
  const handleOpenRelated = async (word: RelatedWord) => {
    const from = activeWordEntry;
    const found = await fetchWord(word.headword);
    if (!found) return;
    if (from) {
      const back = wordTrail.at === from.normalized ? wordTrail.back : [];
      setWordTrail({ back: [...back, from].slice(-50), at: found.entry.normalized });
    }
    showInSheet(found.entry);
  };
  const trailBack = activeWordEntry && wordTrail.at === activeWordEntry.normalized ? wordTrail.back : [];
  const handleWordBack = () => {
    const prev = trailBack[trailBack.length - 1];
    if (!prev) return;
    setWordTrail({ back: trailBack.slice(0, -1), at: prev.normalized });
    showInSheet(prev);
  };
  useEffect(() => { if (!showWordDrawer) setWordTrail({ back: [], at: '' }); }, [showWordDrawer]);

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

  // Remember the page being read, for "Continue reading" on Today.
  useEffect(() => {
    if (section !== 'book') return;
    setLastReadPage(currentPage);
    try { localStorage.setItem('panna_last_page', String(currentPage)); } catch {}
  }, [section, currentPage]);

  // "tomorrow (4 words)" for Today when nothing is due.
  const nextReviewLabel = useMemo(() => {
    const now = Date.now();
    const next = nextDue(bookmarkedWords.map(w => w.normalized), reviewRecords, now);
    if (!next) return null;
    const label = comesBackLabel(daysUntil({ box: 0, due_at: next.at, right: 0, wrong: 0 }, now));
    return `${label} (${next.count} word${next.count === 1 ? '' : 's'})`;
  // clock: recount as time passes
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bookmarkedWords, reviewRecords, clock]);

  // The tab title follows what is on screen, in the same format the server uses for each URL.
  useEffect(() => {
    const brand = 'पन्ना (Panna)';
    let title: string | null = null;
    if (section === 'today') title = `${brand} — A Pocket Dictionary`;
    else if (section === 'saved') title = `Saved — ${brand}`;
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
            onBrowseLetter={(letter) => { const page = meta.thumb_index[letter]; if (page) { showBookForSearch(); handleSelectLetter(letter, page); } }}
            totalEntries={meta.total_entries}
          />
        }
        savedCount={savedCount}
        onOpenSaved={() => goTo(section === 'saved' ? homeSection : 'saved')}
        onOpenReview={() => goTo(section === 'review' ? homeSection : 'review')}
        onOpenToday={() => goTo(section === 'today' ? 'book' : 'today')}
        section={section}
        dueCount={dueCount}
        onOpenMenu={() => setShowMenu(true)}
        menuOpen={showMenu}
      />

      {!offline.online && (
        <p className="app-offline" id="offline-notice" role="status">
          You’re offline. {offline.savedCurrent ? 'The whole book is saved on this device.' : 'Pages you’ve opened still work.'}
          <span lang="hi" className="app-offline-hi"> आप ऑफ़लाइन हैं।</span>
        </p>
      )}

      <div style={{ display: section === 'book' ? 'contents' : 'none' }}>
        <h1 className="ui-visually-hidden" id="book-title">
          {isMobile ? `Page ${currentPage}` : `Pages ${leftPageNum}–${rightPageNum}`}
        </h1>
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
          animate={!reducedMotion && speedMode !== 'instant'}
        />
      ) : (
        /* Desktop Two-Page Spread with 3D Engine & Hybrid Overlay */
        <ScaledSpread>
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
        </ScaledSpread>
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
          onGoToPage={(page) => { showBookForNavigation(); setHighlightedWord(''); turnToPage(page); }}
          onRemoveWord={(w) => setBookmarkedWords(prev => persistList('panna_saved_words', prev.filter(x => x.normalized !== w.normalized)))}
          onRestoreWord={(w) => setBookmarkedWords(prev => prev.some(x => x.normalized === w.normalized) ? prev : persistList('panna_saved_words', [...prev, w]))}
          onRemovePage={(kind, page) => { const [set, key] = savedPageSetters[kind]; set(prev => persistList(key, prev.filter(p => p !== page))); }}
          onRestorePage={(kind, page) => { const [set, key] = savedPageSetters[kind]; set(prev => prev.includes(page) ? prev : persistList(key, [...prev, page].sort((a, b) => a - b))); }}
          onDeleteNote={(note) => handleDeleteMarginNote(note.id)}
          onRestoreNote={(note) => setMarginNotes(prev => prev.some(n => n.id === note.id) ? prev : persistList('panna_marginalia', [...prev, note]))}
          onBackToBook={() => goTo(homeSection)}
          backLabel={homeSection === 'today' ? 'Back to Today' : 'Back to the book'}
          statusFor={(key) => statusOf(reviewRecords[key])}
          progress={progressOf(bookmarkedWords.map(w => w.normalized), reviewRecords)}
          dueCount={dueCount}
          onReview={() => goTo('review')}
          onHowItWorks={() => tours.startTour('review')}
        />
      )}

      {section === 'today' && (
        <TodayScreen
          dueCount={dueCount}
          savedWords={bookmarkedWords.length}
          nextReview={nextReviewLabel}
          streak={streak(reviewDays, Date.now())}
          progress={progressOf(bookmarkedWords.map(w => w.normalized), reviewRecords)}
          calendar={calendar(reviewDays, Date.now())}
          bestStreak={bestStreak(reviewDays)}
          lastPage={lastReadPage}
          loadPage={fetchPage}
          isSaved={(key) => bookmarkedWords.some(w => w.normalized === key)}
          onStartReview={() => goTo('review')}
          onContinueReading={(page) => { showBookForNavigation(); setHighlightedWord(''); turnToPage(page); }}
          onOpenWord={(entry) => { setActiveWordEntry(entry); setShowWordDrawer(true); }}
          onToggleSave={handleToggleWordBookmark}
          showWelcome={tours.showWelcome}
          onTakeTour={() => tours.startTour('start')}
          onDismissWelcome={tours.dismissWelcome}
        />
      )}

      {section === 'review' && (
        <ReviewScreen
          key={reviewRound}
          saved={bookmarkedWords}
          records={reviewRecords}
          onAnswer={handleReviewAnswer}
          onClose={() => goTo(homeSection)}
          onOpenSaved={() => goTo('saved')}
          onHowItWorks={() => tours.startTour('review')}
        />
      )}

      {/* Word Detail Inspection Drawer */}
      <WordDetailDrawer
        entry={activeWordEntry}
        pageNumber={activeWordEntry?.page_number ?? currentPage}
        isOpen={showWordDrawer}
        onClose={handleCloseWordDrawer}
        onOpenRelated={handleOpenRelated}
        backTo={trailBack.length ? trailBack[trailBack.length - 1].headword : null}
        onBack={handleWordBack}
        onTourCard={() => { if (activeWordEntry) tours.startTour('word', activeWordEntry); }}
        onSelectWord={(word, destPage) => {
          if (section !== 'book') showBookForNavigation();
          if (destPage) turnToPage(destPage, word);
          else handleSelectWord(word, currentPage);
        }}
        isBookmarked={activeWordEntry ? bookmarkedWords.some(w => w.normalized === activeWordEntry.normalized) : false}
        onToggleBookmark={handleToggleWordBookmark}
        reviewNote={reviewNoteFor(activeWordEntry)}
        dataVersion={meta.data_version}
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
        onBackup={() => backupRef.current?.backup()}
        onRestore={() => backupRef.current?.restore()}
        onOpenTours={tours.openSheet}
        toursUnseen={unseenTours(tours.state)}
        offline={{ available: offline.available, status: offline.status, saving: offline.saving, onSave: offline.save }}
        onInstall={offline.install}
        installHint={offline.installHint}
        backupLabel={lastBackupLabel(lastBackupAt)}
      />

      <ToursSheet
        open={tours.sheetOpen}
        state={tours.state}
        onClose={tours.closeSheet}
        onStart={(id) => tours.startTour(id)}
        onTipsAgain={tours.tipsAgain}
        onTipsOff={tours.tipsOff}
      />
      {tours.layer && <TourLayer key={tours.layer.kind} {...tours.layer} />}

      <BackupManager ref={backupRef} dataVersion={meta.data_version} totalPages={meta.total_pages} onBackedUp={setLastBackupAt} />

      <BottomNav
        active={section}
        savedCount={savedCount}
        dueCount={dueCount}
        onBook={() => { goTo('book'); if (!isBookOpen) setIsBookOpen(true); }}
        onSaved={() => goTo('saved')}
        onToday={() => goTo('today')}
        onReview={() => goTo('review')}
      />
    </main>
  );
}
