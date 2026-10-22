'use client';

import { Button, Sheet } from '@/components/ui';
import { ChevronIcon } from '@/components/ui/icons';
import { TOURS, type TourId, type ToursState } from '@/lib/tours';

// ⋯ → Guided tours: every tour, with a tick once seen, and the switch for one-time tips.
export function ToursSheet({ open, state, onClose, onStart, onTipsAgain, onTipsOff }: {
  open: boolean;
  state: ToursState;
  onClose: () => void;
  onStart: (id: TourId) => void;
  onTipsAgain: () => void;
  onTipsOff: () => void;
}) {
  const anyTipShown = Object.keys(state.tips).length > 0;
  return (
    <Sheet open={open} onClose={onClose} title="Guided tours" id="tours-sheet" returnFocusTo={() => document.getElementById('menu-btn')}>
      <ul className="tours-list">
        {TOURS.map((tour) => (
          <li key={tour.id}>
            <button type="button" className="tours-item" id={`tour-start-${tour.id}`} onClick={() => onStart(tour.id)}>
              <span className="tours-item-text">
                <span className="tours-item-title">{tour.title}</span>
                <span className="tours-item-sub">{tour.en} · {tour.steps.length} steps</span>
                <span className="tours-item-hi" lang="hi">{tour.hi}</span>
              </span>
              {state.seen[tour.id] && <span className="tours-seen">✓ Seen</span>}
              <ChevronIcon />
            </button>
          </li>
        ))}
      </ul>
      <div className="tours-foot">
        <span className="tours-note">
          {state.tipsOff ? 'Tips are off.' : 'Short tips appear the first time you use something.'}
        </span>
        {state.tipsOff || anyTipShown
          ? <Button size="small" id="tips-again-btn" onClick={onTipsAgain}>Show tips again</Button>
          : <Button size="small" id="tips-off-sheet-btn" onClick={onTipsOff}>Turn off tips</Button>}
      </div>
    </Sheet>
  );
}
