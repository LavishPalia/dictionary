'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { clampGoal, GOAL_MAX, GOAL_MIN } from '@/lib/today-words';

const PRESETS = [5, 10, 20];

// Changes the daily goal in place: a number with − and + steppers, quick picks, Cancel and Save. Enter saves, Esc
// cancels. Focus starts in the field; whoever opened it takes focus back on close.
export function GoalEditor({ goal, onSave, onCancel, id }: { goal: number; onSave: (n: number) => void; onCancel: () => void; id?: string }) {
  const [draft, setDraft] = useState(String(goal));
  const input = useRef<HTMLInputElement>(null);
  const labelId = useId();
  useEffect(() => { input.current?.focus(); input.current?.select(); }, []);
  const value = clampGoal(Number(draft));
  const step = (d: number) => setDraft(String(clampGoal(value + d)));
  const save = () => onSave(value);

  return (
    <div className="desk-goal-editor" id={id} role="group" aria-labelledby={labelId}
      onKeyDown={(e) => {
        if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); onCancel(); }
        else if (e.key === 'Enter' && (e.target as HTMLElement).tagName === 'INPUT') { e.preventDefault(); save(); }
      }}>
      <span className="desk-goal-label" id={labelId}>Words a day</span>
      <div className="desk-goal-stepper">
        <button type="button" aria-label="One fewer" disabled={value <= GOAL_MIN} onClick={() => step(-1)}>−</button>
        <input ref={input} type="text" inputMode="numeric" pattern="[0-9]*" maxLength={2} aria-label="Words a day" value={draft}
          onChange={(e) => setDraft(e.target.value.replace(/[^0-9]/g, ''))} onBlur={() => setDraft(String(value))} />
        <button type="button" aria-label="One more" disabled={value >= GOAL_MAX} onClick={() => step(1)}>+</button>
      </div>
      <div className="desk-goal-presets">
        {PRESETS.map((n) => (
          <button key={n} type="button" aria-pressed={value === n} onClick={() => setDraft(String(n))}>{n}</button>
        ))}
      </div>
      <p className="desk-goal-help">Every word you save or review today counts once.</p>
      <div className="desk-goal-actions">
        <button type="button" className="desk-goal-cancel" onClick={onCancel}>Cancel</button>
        <button type="button" className="desk-goal-save" onClick={save}>✓ Save</button>
      </div>
    </div>
  );
}
