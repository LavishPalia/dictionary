'use client';

import React, { useRef, useState } from 'react';
import { LETTERS, letterAtOffset, letterForPage, nearestAvailable } from '@/lib/letters';

interface LetterRailProps {
  thumbIndex: Record<string, number>;
  currentPage: number;
  onSelectLetter: (letter: string, page: number) => void;
}

// A release this far outside the rail still counts (a thumb drifts); further out cancels the jump.
const SLACK = 24;

/** The phone A–Z rail: slide a thumb along it to pick a letter, let go to jump. Hidden from screen readers; the Go to
 *  panel's letter grid is the accessible way to jump by letter. */
export const LetterRail: React.FC<LetterRailProps> = ({ thumbIndex, currentPage, onSelectLetter }) => {
  const railRef = useRef<HTMLDivElement>(null);
  // The letter under the thumb, and where the thumb is (rail-relative y); null when not dragging.
  const [drag, setDrag] = useState<{ letter: string; y: number; inside: boolean } | null>(null);
  const dragRef = useRef<typeof drag>(null);
  const update = (next: typeof drag) => { dragRef.current = next; setDrag(next); };
  const current = letterForPage(currentPage, thumbIndex);

  const read = (e: React.PointerEvent) => {
    const box = railRef.current!.getBoundingClientRect();
    const inside = e.clientX >= box.left - SLACK && e.clientX <= box.right + SLACK
      && e.clientY >= box.top - SLACK && e.clientY <= box.bottom + SLACK;
    const raw = letterAtOffset(e.clientY, box.top, box.height);
    // A letter with no pages is skipped: to the next one the thumb is moving towards, else back the other way.
    const was = dragRef.current?.letter;
    const dir: 1 | -1 = was && LETTERS.indexOf(raw) < LETTERS.indexOf(was) ? -1 : 1;
    const letter = nearestAvailable(raw, thumbIndex, dir) ?? nearestAvailable(raw, thumbIndex, dir === 1 ? -1 : 1);
    const y = Math.min(box.height, Math.max(0, e.clientY - box.top));
    return letter ? { letter, y, inside } : null;
  };

  const handleDown = (e: React.PointerEvent) => {
    if (e.button !== 0) return;
    e.preventDefault();
    railRef.current?.setPointerCapture(e.pointerId);
    update(read(e));
  };
  const handleMove = (e: React.PointerEvent) => {
    if (!dragRef.current) return;
    const next = read(e);
    if (next && next.inside && next.letter !== dragRef.current.letter) navigator.vibrate?.(8);
    update(next);
  };
  const handleUp = (e: React.PointerEvent) => {
    if (!dragRef.current) return;
    const end = read(e);
    update(null);
    if (end?.inside) onSelectLetter(end.letter, thumbIndex[end.letter]);
  };
  const cancel = () => { if (dragRef.current) update(null); };

  return (
    <div
      ref={railRef}
      id="letter-rail"
      className="letter-rail"
      aria-hidden="true"
      onPointerDown={handleDown}
      onPointerMove={handleMove}
      onPointerUp={handleUp}
      onPointerCancel={cancel}
      onLostPointerCapture={cancel}
      // The page's swipe-to-turn listens for touches: none of them start here.
      onTouchStart={(e) => e.stopPropagation()}
      onTouchMove={(e) => e.stopPropagation()}
      onTouchEnd={(e) => e.stopPropagation()}
      onTouchCancel={(e) => e.stopPropagation()}
    >
      {LETTERS.map((l) => (
        <span key={l} className="letter-rail-letter" data-current={l === current ? 'true' : undefined}
          data-missing={thumbIndex[l] === undefined ? 'true' : undefined}>
          {l}
        </span>
      ))}
      {drag && drag.inside && (
        <div id="letter-bubble" className="letter-bubble" style={{ transform: `translateY(${drag.y}px)` }}>
          <span className="letter-bubble-letter">{drag.letter}</span>
          <span className="letter-bubble-page">p. {thumbIndex[drag.letter].toLocaleString('en-IN')}</span>
        </div>
      )}
    </div>
  );
};
