'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { DictionaryEntry } from '@/lib/types';
import { localDate } from '@/lib/review';
import {
  TIPS, emptyToursState, firstWordOnPage, loadToursState, saveToursState, tipAllowed, tourById,
  type TipId, type TourId, type ToursState,
} from '@/lib/tours';
import type { TourLayerProps } from './TourLayer';

type Screen = 'today' | 'book' | 'saved' | 'review';

/** What a tour needs from the app to set up each step's scene. */
export interface TourApp {
  section: Screen;
  goTo: (section: Screen) => void;
  setMenu: (open: boolean) => void;
  /** Opens the word card on this entry, without changing the address; null closes it. */
  openWord: (entry: DictionaryEntry | null) => void;
  /** An entry on the pages showing now. */
  findVisibleEntry: (headword: string) => DictionaryEntry | null;
  fetchWord: (headword: string) => Promise<{ entry: DictionaryEntry } | null>;
  /** The word card open now, if any (a tour puts it back afterwards). */
  currentWord: DictionaryEntry | null;
  phone: boolean;
  reducedMotion: boolean;
}

interface ActiveTour {
  id: TourId;
  step: number;
  dir: 1 | -1;
  /** Where the reader was, to return there afterwards. */
  start: Screen;
  opener: HTMLElement | null;
  demo: DictionaryEntry | null;
  startWord: DictionaryEntry | null;
}

// Words likely to have similar and opposite words, for the word card tour when the word of the day has none.
const DEMO_WORDS = ['happy', 'rich', 'big', 'good', 'strong', 'above', 'also'];
const hasRelated = (e: DictionaryEntry | null | undefined) => !!e && Boolean(e.similar?.length || e.opposite?.length);

async function pickDemoWord(fetchWord: TourApp['fetchWord']): Promise<DictionaryEntry | null> {
  let today: DictionaryEntry | null = null;
  try {
    const res = await fetch(`/api/today?date=${localDate(Date.now())}`);
    today = res.ok ? (await res.json()).word ?? null : null;
  } catch {}
  if (hasRelated(today)) return today;
  for (const w of DEMO_WORDS) {
    const found = await fetchWord(w);
    if (hasRelated(found?.entry)) return found!.entry;
  }
  return today ?? (await fetchWord('camel'))?.entry ?? null;
}

// Guided tours and one-time tips: what has been seen (saved), the tour in progress, and the tip on screen.
export function useTours(app: TourApp) {
  const appRef = useRef(app);
  appRef.current = app;
  const [state, setState] = useState<ToursState>(emptyToursState);
  const [loaded, setLoaded] = useState(false);
  const stateRef = useRef(state);
  stateRef.current = state;
  useEffect(() => { setState(loadToursState()); setLoaded(true); }, []);
  const update = useCallback((change: (s: ToursState) => ToursState) => {
    const next = change(stateRef.current);
    stateRef.current = next;
    setState(next);
    saveToursState(next);
  }, []);

  const [tour, setTour] = useState<ActiveTour | null>(null);
  const tourRef = useRef(tour);
  tourRef.current = tour;
  const [tip, setTip] = useState<TipId | null>(null);
  const tipRef = useRef(tip);
  tipRef.current = tip;
  const [sheetOpen, setSheetOpen] = useState(false);
  // Moving between screens for a step can fire popstate (closing Saved goes Back); those must not end the tour.
  const ignorePopUntil = useRef(0);
  const quietHistory = () => { ignorePopUntil.current = Date.now() + 1200; };

  /** Show a one-time tip if it is allowed now. `replace` lets it take over from another tip on screen. */
  const offerTip = useCallback((id: TipId, replace = false) => {
    if (!loaded || tourRef.current || (tipRef.current && !replace) || tipRef.current === id) return;
    if (!tipAllowed(stateRef.current, id)) return;
    setTip(id);
  }, [loaded]);

  // Once a tour is over, or put off, show where tours live (once; not to someone who has opened the list).
  const pointToTours = useCallback(() => { window.setTimeout(() => offerTip('tours-here'), 800); }, [offerTip]);

  /** Starts a tour; `demo` is the word the word card tour shows (the open card's word when started from it). */
  const startTour = useCallback(async (id: TourId, demoWord?: DictionaryEntry) => {
    const a = appRef.current;
    const opener = document.activeElement as HTMLElement | null;
    setSheetOpen(false);
    a.setMenu(false);
    setTip(null);
    update((s) => ({ ...s, welcomeDone: true }));
    const startWord = a.currentWord;
    const demo = id === 'word' ? demoWord ?? await pickDemoWord(a.fetchWord) : null;
    setTour({ id, step: 0, dir: 1, start: a.section, opener, demo, startWord });
  }, [update]);

  const endTour = useCallback(() => {
    const t = tourRef.current;
    if (!t) return;
    const a = appRef.current;
    update((s) => ({ ...s, seen: { ...s.seen, [t.id]: Date.now() }, welcomeDone: true }));
    setTour(null);
    quietHistory();
    a.setMenu(false);
    a.openWord(t.startWord);
    if (a.section !== t.start) a.goTo(t.start);
    requestAnimationFrame(() => {
      const back = t.opener?.isConnected ? t.opener : document.getElementById('menu-btn');
      back?.focus();
    });
    pointToTours();
  }, [update, pointToTours]);

  const next = useCallback(() => {
    const t = tourRef.current;
    if (!t) return;
    if (t.step + 1 < tourById(t.id).steps.length) setTour({ ...t, step: t.step + 1, dir: 1 });
    else endTour();
  }, [endTour]);
  const back = useCallback(() => {
    const t = tourRef.current;
    if (t && t.step > 0) setTour({ ...t, step: t.step - 1, dir: -1 });
  }, []);
  // A step whose target is not on screen (say, no similar words for this word) is passed over in the direction of travel.
  const missing = useCallback(() => {
    const t = tourRef.current;
    if (!t) return;
    if (t.dir === -1 && t.step > 0) back(); else next();
  }, [back, next]);

  // Set up the scene for each step.
  useEffect(() => {
    if (!tour) return;
    const a = appRef.current;
    const { scene } = tourById(tour.id).steps[tour.step];
    quietHistory();
    a.setMenu(Boolean(scene.menu));
    if (scene.section && scene.section !== a.section) a.goTo(scene.section);
    if (scene.word === 'demo') { a.openWord(tour.demo); return; }
    if (scene.word !== 'first-on-page') { a.openWord(null); return; }
    // The first word on the page, once the page is showing.
    let tries = 0;
    let timer = 0;
    const open = () => {
      const headword = firstWordOnPage()?.querySelector('.entry-headword')?.textContent?.trim();
      const entry = headword ? appRef.current.findVisibleEntry(headword) : null;
      if (entry || ++tries > 10) appRef.current.openWord(entry);
      else timer = window.setTimeout(open, 100);
    };
    open();
    return () => clearTimeout(timer);
  }, [tour]);

  // Back (the phone's, or the browser's) during a tour ends it where the reader went.
  useEffect(() => {
    if (!tour) return;
    const onPop = () => {
      if (Date.now() < ignorePopUntil.current) return;
      const t = tourRef.current;
      if (!t) return;
      update((s) => ({ ...s, seen: { ...s.seen, [t.id]: Date.now() } }));
      setTour(null);
      pointToTours();
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, [tour, update, pointToTours]);

  const layer: TourLayerProps | null = tour
    ? { kind: 'tour', tour: tourById(tour.id), step: tour.step, phone: app.phone, reducedMotion: app.reducedMotion,
        onNext: next, onBack: back, onEnd: endTour, onMissing: missing }
    : tip
      ? { kind: 'tip', tip: TIPS[tip], phone: app.phone, reducedMotion: app.reducedMotion,
          onShown: () => update((s) => ({ ...s, tips: { ...s.tips, [tip]: Date.now() } })),
          onGone: () => setTip(null),
          onDismiss: () => setTip(null),
          onTipsOff: () => { update((s) => ({ ...s, tipsOff: true })); setTip(null); } }
      : null;

  return {
    state,
    loaded,
    active: tour !== null,
    layer,
    startTour,
    offerTip,
    showWelcome: loaded && !state.welcomeDone && !state.seen.start,
    dismissWelcome: () => { update((s) => ({ ...s, welcomeDone: true })); pointToTours(); },
    sheetOpen,
    openSheet: () => { update((s) => ({ ...s, listOpened: true })); setSheetOpen(true); },
    closeSheet: () => setSheetOpen(false),
    tipsAgain: () => update((s) => ({ ...s, tips: {}, tipsOff: false })),
    tipsOff: () => update((s) => ({ ...s, tipsOff: true })),
  };
}
