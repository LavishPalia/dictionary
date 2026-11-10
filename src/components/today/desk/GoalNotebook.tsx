'use client';

import { useRef } from 'react';
import type { TodayWord } from '@/lib/today-words';
import { GoalEditor } from './GoalEditor';

const SHOWN = 4;

/** "3 of 10", for the count's accessible name. */
export const countLabel = (n: number, goal: number) => `${n} of ${goal} words today`;

// The goal notebook on the desk: today's count in handwriting, the latest words on ruled lines, and a pencil
// that turns the page into the goal editor.
export function GoalNotebook({ words, goal, editing, onEdit, onClose, onSave }: {
  words: TodayWord[];
  goal: number;
  editing: boolean;
  onEdit: () => void;
  onClose: () => void;
  onSave: (n: number) => void;
}) {
  const pencil = useRef<HTMLButtonElement>(null);
  const close = (after?: () => void) => { after?.(); onClose(); window.setTimeout(() => pencil.current?.focus(), 0); };
  const n = words.length;
  const more = Math.max(0, n - SHOWN);

  return (
    <section className={`desk-notebook${editing ? ' desk-notebook--editing' : ''}`} id="desk-notebook" aria-labelledby="desk-notebook-title">
      <h2 className="ui-visually-hidden" id="desk-notebook-title">Today’s words</h2>
      {editing ? (
        <GoalEditor id="desk-goal-editor" goal={goal} onCancel={() => close()} onSave={(g) => close(() => onSave(g))} />
      ) : (
        <>
          <div className="desk-goal-label" aria-hidden="true">Today’s words</div>
          <div className="desk-goal-count" id="desk-goal-count" role="img" aria-label={countLabel(n, goal)}>{n}<small> of {goal}</small></div>
          <button type="button" ref={pencil} className="desk-goal-pencil" id="desk-goal-edit" aria-label={`Change today’s goal (now ${goal} words)`} onClick={onEdit}>
            <svg viewBox="0 0 20 20" width="16" height="16" aria-hidden="true"><path d="M3 17l1-4L13.5 3.5a1.4 1.4 0 0 1 2 0l1 1a1.4 1.4 0 0 1 0 2L7 16z M12 5l3 3" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" /></svg>
          </button>
          <ul className="desk-goal-words">
            {n === 0 && <li className="desk-goal-empty">Save or review a word and it is written here.</li>}
            {more > 0 && <li className="desk-goal-more">+ {more} more</li>}
            {words.slice(-SHOWN).map((w) => <li key={w.normalized}>{w.word}</li>)}
          </ul>
          {n >= goal && <GoalReached goal={goal} />}
        </>
      )}
    </section>
  );
}

export function GoalReached({ goal }: { goal: number }) {
  return (
    <p className="desk-goal-full" id="desk-goal-full">Today’s page is full.<span lang="hi">आज के {goal} शब्द पूरे।</span></p>
  );
}
