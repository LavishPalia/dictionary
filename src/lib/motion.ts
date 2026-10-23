'use client';

import { useEffect, useState } from 'react';

// Motion helpers. Every animation in the app checks the reader's "reduce motion" setting: page turns become
// instant, the cover opens without swinging, and decorative flourishes are skipped.

const QUERY = '(prefers-reduced-motion: reduce)';

export function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia(QUERY).matches;
}

export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return;
    const media = window.matchMedia(QUERY);
    const update = () => setReduced(media.matches);
    update();
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, []);
  return reduced;
}

/** The first element matching `selector` that is actually on screen (the desktop book also renders hidden copies). */
export function visibleElement(selector: string, test: (el: HTMLElement) => boolean = () => true): HTMLElement | null {
  for (const el of Array.from(document.querySelectorAll<HTMLElement>(selector))) {
    const r = el.getBoundingClientRect();
    if (r.width > 0 && r.height > 0 && r.bottom > 0 && r.top < innerHeight && getComputedStyle(el).visibility !== 'hidden' && test(el)) return el;
  }
  return null;
}

/**
 * A small star flies from `from` to the Saved button that is on screen (header on desktop, bottom bar on phones),
 * so the reader sees where saved words go. Skipped when motion is reduced or nothing to fly to is visible.
 */
export function flyToSaved(from: HTMLElement): void {
  if (prefersReducedMotion()) return;
  const target = visibleElement('#nav-saved-btn') ?? visibleElement('#open-bookmarks-btn');
  if (!target || typeof document.body.animate !== 'function') return;
  const a = from.getBoundingClientRect();
  const b = target.getBoundingClientRect();
  const star = document.createElement('div');
  star.className = 'motion-flying-star';
  star.setAttribute('aria-hidden', 'true');
  star.textContent = '★';
  document.body.appendChild(star);
  const [x0, y0] = [a.left + a.width / 2 - 12, a.top + a.height / 2 - 12];
  const [x1, y1] = [b.left + b.width / 2 - 12, b.top + b.height / 2 - 12];
  const lift = Math.min(y0, y1) - 60;
  star.animate([
    { transform: `translate(${x0}px, ${y0}px) scale(1)`, opacity: 1 },
    { transform: `translate(${(x0 + x1) / 2}px, ${lift}px) scale(1.3)`, opacity: 1, offset: 0.45 },
    { transform: `translate(${x1}px, ${y1}px) scale(0.5)`, opacity: 0.2 },
  ], { duration: 650, easing: 'cubic-bezier(.4, 0, .2, 1)' }).finished
    .catch(() => undefined)
    .then(() => {
      star.remove();
      target.animate([{ transform: 'scale(1)' }, { transform: 'scale(1.18)' }, { transform: 'scale(1)' }], { duration: 300, easing: 'ease-out' });
    });
}
