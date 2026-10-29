'use client';

import React from 'react';
import type { NextStep } from '@/lib/learn';
import { LEARN_SECTIONS, LEARN_TITLE, NEXT_STEP_TEXT, NEXT_STEP_TITLE, type LearnAction } from '@/lib/learn-content';
import { Button, Card } from '@/components/ui';

interface LearnScreenProps {
  /** null until the saved words are read from this device (the server and first paint do not know them). */
  step: NextStep | null;
  /** Review estimate for the 'review' step, as Today shows it. */
  dueMinutes: number;
  onAction: (a: LearnAction) => void;
  /** Whether this browser can do an action (e.g. Install, offline saving); a tip without one keeps its text. */
  canDo?: (a: LearnAction) => boolean;
  onBack: () => void;
  backLabel: string;
}

// "How to learn with Panna": the reader's next step, then the method, a 15-minute day, tips, mistakes to avoid,
// and how to keep their words. Every tip that names a feature has a button that opens it.
export function LearnScreen(props: LearnScreenProps) {
  const { step, onAction } = props;
  const next = step ? NEXT_STEP_TEXT[step.id](step.count, props.dueMinutes) : null;
  const can = (a?: LearnAction): a is LearnAction => Boolean(a) && (props.canDo?.(a!) ?? true);

  return (
    <section className="learn" id="learn-screen" aria-labelledby="learn-title">
      <div className="learn-head">
        <div>
          <h1 id="learn-title" className="learn-title" tabIndex={-1}>{LEARN_TITLE.en}</h1>
          <p className="learn-hi learn-title-hi" lang="hi">{LEARN_TITLE.hi}</p>
        </div>
        <Button variant="desk" id="learn-back" onClick={props.onBack}><span aria-hidden="true">‹</span> {props.backLabel}</Button>
      </div>

      <Card className="learn-card learn-next" id="learn-next">
        <h2 className="ui-label learn-next-label" id="learn-next-title">{NEXT_STEP_TITLE.en} <span className="learn-hi learn-next-label-hi" lang="hi">{NEXT_STEP_TITLE.hi}</span></h2>
        {next ? (
          <>
            <p className="learn-next-text">{next.en}</p>
            <p className="learn-hi" lang="hi">{next.hi}</p>
          </>
        ) : (
          // Held open at its usual height until the saved words are known, so nothing jumps.
          <p className="learn-next-text learn-next-pending" aria-hidden="true">{' '}<br />{' '}</p>
        )}
        {next && can(next.action) && (
          <Button variant="primary" className="learn-next-btn" onClick={() => onAction(next.action!)}>{next.actionLabel}</Button>
        )}
      </Card>

      {LEARN_SECTIONS.map((section) => {
        const List = section.id === 'method' ? 'ol' : 'ul';
        return (
          <section key={section.id} id={`learn-${section.id}`} className={`learn-card ui-card learn-section learn-section--${section.id}`}
            aria-labelledby={`learn-${section.id}-title`}>
            <h2 className="learn-h2" id={`learn-${section.id}-title`}>{section.title.en}</h2>
            <p className="learn-hi learn-h2-hi" lang="hi">{section.title.hi}</p>
            {/* role="list": list-style:none drops list semantics in Safari/VoiceOver. */}
            <List className="learn-list" role="list">
              {section.items.filter((item) => !item.hideUnlessAvailable || can(item.action)).map((item) => (
                <li key={item.en} className="learn-item">
                  <p className="learn-en">{item.en}</p>
                  <p className="learn-hi" lang="hi">{item.hi}</p>
                  {can(item.action) && (
                    <Button className="learn-btn" onClick={() => onAction(item.action!)}>{item.actionLabel}</Button>
                  )}
                </li>
              ))}
            </List>
          </section>
        );
      })}
    </section>
  );
}
