'use client';

import React from 'react';
import type { CalendarDay, Progress } from '@/lib/progress';

const SEGMENTS = [
  { key: 'mastered', label: 'mastered' },
  { key: 'learning', label: 'learning' },
  { key: 'new', label: 'new' },
] as const;

export const progressText = (p: Progress) =>
  SEGMENTS.map((s) => `${p[s.key]} ${s.label}`).join(', ');

/** Saved words by status: a bar in three parts, and the counts as text (the bar alone says nothing to a screen reader). */
export function ProgressBar({ progress, surface = 'paper', id }: { progress: Progress; surface?: 'paper' | 'desk'; id?: string }) {
  return (
    <div className={`progress progress--${surface}`} id={id}>
      <div className="progress-bar" role="img" aria-label={`Saved words: ${progressText(progress)}`}>
        {SEGMENTS.map((s) => progress[s.key] > 0 && (
          <span key={s.key} className={`progress-seg progress-seg--${s.key}`} style={{ flexGrow: progress[s.key] }} />
        ))}
      </div>
      <ul className="progress-legend" aria-hidden="true">
        {SEGMENTS.map((s) => (
          <li key={s.key}><span className={`progress-dot progress-seg--${s.key}`} /><b>{progress[s.key]}</b> {s.label}</li>
        ))}
      </ul>
    </div>
  );
}

/** The last 30 days, one mark per day, filled on days with a review; today is outlined. */
export function ReviewCalendar({ days, id }: { days: CalendarDay[]; id?: string }) {
  const count = days.filter((d) => d.reviewed).length;
  const fmt = (date: string) => new Date(`${date}T12:00:00`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
  return (
    <div className="calendar" id={id}>
      <div className="calendar-days" role="img" aria-label={`Reviewed on ${count} of the last ${days.length} days${days[days.length - 1]?.reviewed ? ', including today' : ''}`}>
        {days.map((d) => (
          <span key={d.date} className={`calendar-day${d.reviewed ? ' calendar-day--on' : ''}${d.today ? ' calendar-day--today' : ''}`}
            title={`${fmt(d.date)}${d.reviewed ? ': reviewed' : ''}`} />
        ))}
      </div>
      <div className="calendar-caption" aria-hidden="true">
        <span>{fmt(days[0].date)}</span>
        <span>Reviewed on {count} of the last {days.length} days</span>
        <span>Today</span>
      </div>
    </div>
  );
}
