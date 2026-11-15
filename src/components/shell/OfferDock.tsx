'use client';

import type { ReactNode } from 'react';
import { Button, Card } from '@/components/ui';
import type { Offer } from '@/lib/offers';

// The offer dock: one small card over whatever screen is showing (src/lib/offers.ts picks which), bottom right on
// desktop, above the bottom bar on phones. It never covers the word card, a sheet or a tour: the app hides it then.
export function OfferDock({ offer, hidden, children }: { offer: Offer | null; hidden: boolean; children: ReactNode }) {
  if (hidden || offer === null) return null;
  return (
    <div className="offer-dock" id="offer-dock" role="region" aria-label="Suggestion">
      {children}
    </div>
  );
}

/** A first visit's card over the book: what to do with it. */
export function FirstVisitHint({ onTour, onDismiss }: { onTour: () => void; onDismiss: () => void }) {
  return (
    <Card className="today-card offer-card" id="first-visit-hint" aria-labelledby="first-visit-title">
      <span className="ui-label">New to Panna?</span>
      <p className="today-big" id="first-visit-title">Tap any word for its Hindi meaning</p>
      <p className="tour-hi" lang="hi">किसी भी शब्द को छुएँ — उसका हिंदी अर्थ दिखेगा।</p>
      <p className="today-muted">☆ saves it, and Panna quizzes you on it later.</p>
      <div className="today-actions">
        <Button variant="primary" id="first-visit-tour" onClick={onTour}>Take the 1-minute tour</Button>
        <Button id="first-visit-ok" onClick={onDismiss}>Got it</Button>
      </div>
    </Card>
  );
}
