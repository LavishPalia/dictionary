'use client';

import { forwardRef } from 'react';

const MAX_MARKS = 10;

// The phone's goal: "Today's words · 3 of 10" with tally marks (at most 10, scaled to the goal). A tap opens the
// editor as a card under the strip.
export const GoalChip = forwardRef<HTMLButtonElement, { count: number; goal: number; open: boolean; onToggle: () => void }>(
  function GoalChip({ count, goal, open, onToggle }, ref) {
    const marks = Math.min(goal, MAX_MARKS);
    const lit = Math.min(marks, Math.floor((Math.min(count, goal) / goal) * marks));
    return (
      <button type="button" ref={ref} className="desk-goal-chip" id="desk-goal-chip" aria-expanded={open} aria-controls="desk-goal-editor"
        onClick={onToggle}>
        <span>
          <span className="desk-goal-chip-label">Today’s words</span>
          <span className="desk-goal-chip-count">{count}<small> of {goal}</small></span>
          <span className="ui-visually-hidden">, change the goal</span>
        </span>
        <span className="desk-goal-tally" aria-hidden="true">
          {Array.from({ length: marks }, (_, i) => <i key={i} className={`${i < lit ? 'on' : ''}${i % 5 === 4 ? ' five' : ''}`} />)}
        </span>
      </button>
    );
  });
