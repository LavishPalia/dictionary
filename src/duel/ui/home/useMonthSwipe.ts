// Swiping the calendar: the month follows the finger, then the next one slides in. Touch and pen only (a mouse has
// the arrows), and a mostly vertical move is left to the page's scroll.
import { useCallback, useEffect, useLayoutEffect, useRef } from 'react';
import { EASE } from '../fx/timings';

const START = 10, CHANGE = 56, FLICK = 0.5; // px, px, px per ms
const SLIDE = 220, FADE = 120;

export function useMonthSwipe({ month, canPrev, canNext, reduced, onMonth }: {
  month: string; canPrev: boolean; canNext: boolean; reduced: boolean; onMonth: (step: -1 | 1) => void;
}) {
  const grid = useRef<HTMLDivElement | null>(null);
  const gesture = useRef<{ id: number; x: number; y: number; at: number; swiping: boolean; done: boolean; lastDx: number } | null>(null);
  const swallowClick = useRef(false);
  const incoming = useRef<-1 | 1 | null>(null);

  /** Changes the month, with the new one coming in from the side it was asked for. */
  const go = useCallback((step: -1 | 1) => { incoming.current = step; onMonth(step); }, [onMonth]);

  useLayoutEffect(() => {
    const step = incoming.current, el = grid.current;
    incoming.current = null;
    if (!step || !el) return;
    if (reduced) { el.animate([{ opacity: 0 }, { opacity: 1 }], { duration: FADE, easing: 'ease-out' }); return; }
    el.animate([{ transform: `translateX(${step * 100}%)`, opacity: 0.4 }, { transform: 'none', opacity: 1 }], { duration: SLIDE, easing: EASE.out });
  }, [month, reduced]);

  useEffect(() => () => { gesture.current = null; }, []);

  const settle = (el: HTMLElement) => {
    el.style.transform = '';
    const from = gesture.current?.lastDx ?? 0;
    if (!reduced && from) el.animate([{ transform: `translateX(${from}px)` }, { transform: 'none' }], { duration: SLIDE, easing: EASE.spring });
  };

  const bind = {
    onPointerDown(e: React.PointerEvent<HTMLDivElement>) {
      swallowClick.current = false;
      if (e.pointerType === 'mouse') return;
      gesture.current = { id: e.pointerId, x: e.clientX, y: e.clientY, at: e.timeStamp, swiping: false, done: false, lastDx: 0 };
    },
    onPointerMove(e: React.PointerEvent<HTMLDivElement>) {
      const g = gesture.current;
      if (!g || g.id !== e.pointerId || g.done) return;
      const dx = e.clientX - g.x, dy = e.clientY - g.y;
      if (!g.swiping) {
        if (Math.abs(dx) < START && Math.abs(dy) < START) return;
        if (Math.abs(dx) <= 1.5 * Math.abs(dy)) { g.done = true; return; } // a scroll, not a swipe
        g.swiping = true;
        e.currentTarget.setPointerCapture(e.pointerId);
      }
      // Past the first or last month the page only stretches a little.
      const blocked = (dx > 0 && !canPrev) || (dx < 0 && !canNext);
      g.lastDx = blocked ? dx * 0.2 : dx;
      if (!reduced) e.currentTarget.style.transform = `translateX(${g.lastDx}px)`;
    },
    onPointerUp(e: React.PointerEvent<HTMLDivElement>) {
      const g = gesture.current;
      gesture.current = null;
      if (!g || g.id !== e.pointerId || !g.swiping) return;
      swallowClick.current = true; // a swipe that started on a day doesn't open it
      const dx = e.clientX - g.x, fast = Math.abs(dx) / Math.max(1, e.timeStamp - g.at) > FLICK;
      const step: -1 | 1 = dx < 0 ? 1 : -1;
      const can = step === 1 ? canNext : canPrev;
      if (can && (Math.abs(dx) >= CHANGE || fast)) { e.currentTarget.style.transform = ''; go(step); return; }
      gesture.current = g;
      settle(e.currentTarget);
      gesture.current = null;
    },
    onPointerCancel(e: React.PointerEvent<HTMLDivElement>) {
      if (gesture.current?.swiping) settle(e.currentTarget);
      gesture.current = null;
    },
    onClickCapture(e: React.MouseEvent) {
      if (!swallowClick.current) return;
      swallowClick.current = false;
      e.preventDefault();
      e.stopPropagation();
    },
  };

  return { grid, bind, go };
}
