'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useReducedMotion } from '@/lib/motion';
import type { BookPage, DictionaryEntry } from '@/lib/types';

const PER_PAGE = 4;
/** Press and hold the clasp this long to close the book. */
export const HOLD_MS = 750;
/** Closed for about 1.4 s after the 0.95 s turn, then it opens again on its own. */
const OPEN_AGAIN_MS = 2350, OPEN_AGAIN_REDUCED_MS = 1200, SETTLE_MS = 950;

interface Dust { id: number; x: number; y: number; dx: number; dy: number }

function MiniPage({ entries, foot }: { entries: DictionaryEntry[]; foot?: string }) {
  const shown = entries.slice(0, PER_PAGE);
  return (
    <>
      {shown.length > 0 && (
        <div className="desk-mini-guide"><span>{shown[0].headword}</span><span>{shown[shown.length - 1].headword}</span></div>
      )}
      {shown.map((e) => (
        <p className="desk-mini-entry" key={e.id ?? e.normalized}>
          <b>{e.headword}</b> {e.meaning_hi && <span lang="hi">{e.meaning_hi}</span>} {e.definition_en && <>— {e.definition_en}</>}
        </p>
      ))}
      {foot && <div className="desk-page-foot">{foot}</div>}
    </>
  );
}

// The open book on the desk. For a returning reader it is a miniature of the page they left off on (real text, from
// the page Today already loads) and opens that page; on a first visit it is the welcome card, with the film on the
// right. While the page loads, or offline, it shows blank ruled pages and the tag still works.
export function DeskBook({ page, pageNumber, started, welcome, film, onOpen, onAnnounce }: {
  page: BookPage | null;
  pageNumber: number;
  /** A last page is known (Continue reading) rather than a first start on page 1. */
  started: boolean;
  /** First visit: the welcome (left page) and the film (right page) stand in for the miniature. */
  welcome?: ReactNode;
  film?: ReactNode;
  onOpen: () => void;
  /** Says something in Today's live region. */
  onAnnounce?: (text: string) => void;
}) {
  // Close the book: hold the clasp; the left leaf turns over the spine, dust puffs out, and it reopens by itself.
  const reduced = useReducedMotion();
  const [holding, setHolding] = useState(false);
  const [closed, setClosed] = useState(false);
  const [dust, setDust] = useState<Dust[]>([]);
  const busy = useRef(false);
  const holdTimer = useRef<number | null>(null);
  const timers = useRef<number[]>([]);
  const later = (fn: () => void, ms: number) => { timers.current.push(window.setTimeout(fn, ms)); };
  useEffect(() => () => { timers.current.forEach(clearTimeout); if (holdTimer.current) clearTimeout(holdTimer.current); }, []);
  const close = () => {
    holdTimer.current = null;
    setHolding(false);
    busy.current = true;
    setClosed(true);
    onAnnounce?.('The book closes, and opens again.');
    if (!reduced) later(() => {
      // from the fore-edges of the closed book (it sits over the right half) and its foot
      setDust(Array.from({ length: 18 }, (_, i) => {
        const side = i % 3;
        const x = side === 0 ? 208 : side === 1 ? 416 : 208 + Math.random() * 208;
        const y = side === 2 ? 300 : Math.random() * 300;
        return { id: i, x, y, dx: (side === 0 ? -1 : side === 1 ? 1 : Math.random() - 0.5) * (20 + Math.random() * 40), dy: side === 2 ? 10 + Math.random() * 20 : (Math.random() - 0.6) * 40 };
      }));
      later(() => setDust([]), 1500);
    }, 900);
    later(() => { setClosed(false); later(() => { busy.current = false; }, reduced ? 300 : SETTLE_MS); }, reduced ? OPEN_AGAIN_REDUCED_MS : OPEN_AGAIN_MS);
  };
  const startHold = () => {
    if (busy.current || holdTimer.current !== null) return;
    setHolding(true);
    holdTimer.current = window.setTimeout(close, HOLD_MS);
  };
  const stopHold = () => {
    if (holdTimer.current === null) return;
    clearTimeout(holdTimer.current);
    holdTimer.current = null;
    setHolding(false);
  };

  const number = pageNumber.toLocaleString('en-IN');
  const words = page ? ` · ${page.first_headword} – ${page.last_headword}` : '';
  const label = started
    ? `Continue reading: page ${pageNumber}${page ? `, ${page.first_headword} to ${page.last_headword}` : ''}`
    : `Start reading: page ${pageNumber}`;
  const tag = started ? `Page ${number}${words} · Open book ›` : `Start reading · Page ${number} ›`;
  const blank = !page && !welcome;

  return (
    <div className={`desk-book${closed ? ' desk-book--closed' : ''}`}>
      <div className="desk-book-half desk-book-half--right">
        <div className="desk-book-cloth" />
        <div className="desk-book-edge" />
        <div className={`desk-page${blank ? ' desk-page--blank' : ''}`}>
          {welcome ? film : page && <MiniPage entries={page.column2} />}
          <div className="desk-page-shade" aria-hidden="true" />
        </div>
      </div>
      {/* the left leaf turns over the spine when the book closes; its back is the cover */}
      <div className="desk-book-half desk-book-half--left">
        <div className="desk-leaf-face desk-leaf-front">
          <div className="desk-book-cloth" />
          <div className="desk-book-edge" />
          <div className={`desk-page${blank ? ' desk-page--blank' : ''}`}>
            {welcome ?? (page && <MiniPage entries={page.column1} foot={number} />)}
            <div className="desk-page-shade" aria-hidden="true" />
          </div>
        </div>
        <div className="desk-leaf-face desk-leaf-back" aria-hidden="true"><div className="desk-cover-ornament" /></div>
      </div>
      {/* reduced motion: the cover fades in over the right half instead */}
      <div className="desk-book-cover" aria-hidden="true"><div className="desk-cover-ornament" /></div>
      {welcome && <span className="desk-book-tag" aria-hidden="true">The 37-second film · tap ▶ to play</span>}
      {!welcome && (
        <>
          <button type="button" className="desk-book-open" id="today-continue-btn" aria-label={label}
            onClick={() => { if (!busy.current) onOpen(); }} />
          <span className="desk-book-tag" id="desk-book-tag" aria-hidden="true">{tag}</span>
          <button type="button" className={`desk-clasp${holding ? ' desk-clasp--holding' : ''}`} id="desk-clasp" aria-label="Close the book (press and hold)"
            onPointerDown={(e) => { if (e.button === 0) { e.preventDefault(); startHold(); } }}
            onPointerUp={stopHold} onPointerLeave={stopHold} onPointerCancel={stopHold}
            onKeyDown={(e) => { if ((e.key === ' ' || e.key === 'Enter') && !e.repeat) { e.preventDefault(); startHold(); } }}
            onKeyUp={(e) => { if (e.key === ' ' || e.key === 'Enter') stopHold(); }}
            onBlur={stopHold} onClick={(e) => e.preventDefault()} onContextMenu={(e) => e.preventDefault()}>
            <span className="desk-clasp-body" aria-hidden="true" />
            <svg className="desk-clasp-ring" viewBox="0 0 52 56" aria-hidden="true" focusable="false"><circle cx="26" cy="28" r="25" /></svg>
          </button>
          <span className="desk-clasp-tip" aria-hidden="true">Hold to close</span>
        </>
      )}
      {dust.map((d) => (
        <span key={d.id} className="desk-dust" aria-hidden="true"
          style={{ left: d.x, top: d.y, '--dx': `${d.dx}px`, '--dy': `${d.dy}px` } as React.CSSProperties} />
      ))}
    </div>
  );
}
