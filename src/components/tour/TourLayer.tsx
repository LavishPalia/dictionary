'use client';

import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { resolveTarget, stepText, type Tip, type Tour } from '@/lib/tours';
import { CloseIcon } from '@/components/ui/icons';

type Rect = { top: number; left: number; width: number; height: number };

// A guided tour step (modal: the page is dimmed except the target, and only the tip can be used) or a one-time tip
// (non-modal: a small card by its target that never takes focus). Both follow their target as the page moves, and
// draw above sheets. Phones get a card along the top or bottom edge, away from the target; desktop gets a pop-up
// beside it with an arrow.
export type TourLayerProps = { phone: boolean; reducedMotion: boolean } & (
  | { kind: 'tour'; tour: Tour; step: number; onNext: () => void; onBack: () => void; onEnd: () => void; onMissing: () => void }
  | { kind: 'tip'; tip: Tip; onShown: () => void; onGone: () => void; onDismiss: () => void; onTipsOff: () => void }
);

const MISSING_AFTER_MS = 1500;

/** English text with any Hindi words in it marked as Hindi, so a screen reader switches voice for them. */
function withHindi(text: string): React.ReactNode {
  return text.split(/([ऀ-ॿ]+(?:[\s,]+[ऀ-ॿ]+)*)/).map((part, i) =>
    (i % 2 ? <span key={i} lang="hi">{part}</span> : part));
}
const PAD = 6;
const GAP = 14;
const MARGIN = 12;

const sameRect = (a: Rect | null, b: Rect | null) =>
  a === b || (!!a && !!b && a.top === b.top && a.left === b.left && a.width === b.width && a.height === b.height);

export function TourLayer(props: TourLayerProps) {
  const { phone, reducedMotion } = props;
  const isTour = props.kind === 'tour';
  const target = isTour ? props.tour.steps[props.step].target : props.tip.target;
  const stepKey = isTour ? `${props.tour.id}-${props.step}` : props.tip.id;
  const [rect, setRect] = useState<Rect | null>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  const tipRef = useRef<HTMLElement>(null);
  const propsRef = useRef(props);
  propsRef.current = props;

  // Track the target every frame (sheets slide, pages turn, the layout changes size). A tour step whose target never
  // appears is skipped; a tip whose target goes away is over.
  useEffect(() => {
    setRect(null);
    let frame = 0;
    let since = performance.now();
    let seen = false;
    let scrolled = false;
    let last: Rect | null = null;
    const tick = () => {
      const el = resolveTarget(target, phone);
      const r = el?.getBoundingClientRect();
      const next = r && r.width > 0 && r.height > 0 ? { top: r.top, left: r.left, width: r.width, height: r.height } : null;
      if (next && !scrolled) {
        scrolled = true;
        if (next.top < 0 || next.top + next.height > window.innerHeight) {
          (el as HTMLElement).scrollIntoView({ block: 'center', behavior: reducedMotion ? 'auto' : 'smooth' });
        }
      }
      if (!sameRect(next, last)) { last = next; setRect(next); }
      const p = propsRef.current;
      if (next) {
        since = performance.now();
        if (!seen) { seen = true; if (p.kind === 'tip') p.onShown(); }
      } else if (performance.now() - since > (p.kind === 'tip' && !seen ? 4000 : MISSING_AFTER_MS)) {
        if (p.kind === 'tour') p.onMissing(); else p.onGone();
        return;
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  // a new step or tip restarts tracking
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stepKey, phone]);

  useLayoutEffect(() => {
    const el = tipRef.current;
    if (el && (el.offsetWidth !== size.width || el.offsetHeight !== size.height)) setSize({ width: el.offsetWidth, height: el.offsetHeight });
  });

  // Tours: the tip has focus, keys go to the tour first (Esc ends it, ← → move, Tab stays in the tip), and nothing
  // behind it reacts to keys. Registered on window in the capture phase, so it runs before a sheet's own handler.
  useEffect(() => {
    if (!isTour) return;
    const onKey = (event: KeyboardEvent) => {
      const p = propsRef.current;
      if (p.kind !== 'tour') return;
      const tip = tipRef.current;
      const inside = !!tip && tip.contains(document.activeElement);
      event.stopPropagation();
      if (event.key === 'Escape') { event.preventDefault(); p.onEnd(); return; }
      if (event.key === 'ArrowRight') { event.preventDefault(); p.onNext(); return; }
      if (event.key === 'ArrowLeft') { event.preventDefault(); if (p.step > 0) p.onBack(); return; }
      if (event.key === 'Tab' && tip) {
        event.preventDefault();
        const items = [...tip.querySelectorAll<HTMLElement>('button')];
        const at = items.indexOf(document.activeElement as HTMLElement);
        const next = at === -1 ? (event.shiftKey ? items.length - 1 : 0) : (at + (event.shiftKey ? -1 : 1) + items.length) % items.length;
        items[next]?.focus();
        return;
      }
      if (!inside) event.preventDefault();
    };
    // Something behind the tour (a sheet opening) taking focus gives it back to the tip.
    const onFocus = (event: FocusEvent) => {
      const tip = tipRef.current;
      if (tip && !tip.contains(event.target as Node)) tip.focus();
    };
    window.addEventListener('keydown', onKey, true);
    document.addEventListener('focusin', onFocus);
    return () => { window.removeEventListener('keydown', onKey, true); document.removeEventListener('focusin', onFocus); };
  }, [isTour]);

  // Each step: focus the tip itself, so screen readers read its title and text, once it is in place.
  useEffect(() => {
    if (isTour && rect) tipRef.current?.focus({ preventScroll: true });
  // only when a step first finds its target
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stepKey, isTour, !!rect]);

  // Tips: Escape dismisses one only when the reader is in it.
  useEffect(() => {
    if (isTour) return;
    const onKey = (event: KeyboardEvent) => {
      const p = propsRef.current;
      if (event.key === 'Escape' && p.kind === 'tip' && tipRef.current?.contains(document.activeElement)) { event.stopPropagation(); p.onDismiss(); }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [isTour]);

  if (typeof document === 'undefined') return null;
  if (!isTour && !rect) return null;

  // Where the tip goes.
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  let tipStyle: React.CSSProperties = {};
  let arrow: { left: number; side: 'top' | 'bottom' } | null = null;
  if (phone) {
    const lowTarget = rect ? rect.top + rect.height / 2 > vh * 0.5 : false;
    tipStyle = lowTarget ? { top: MARGIN } : { bottom: 72 };
  } else if (rect) {
    const width = Math.min(340, vw - 2 * MARGIN);
    const left = Math.max(MARGIN, Math.min(rect.left + rect.width / 2 - width / 2, vw - width - MARGIN));
    const below = rect.top + rect.height + PAD + GAP;
    const fitsBelow = below + size.height + MARGIN <= vh;
    const top = fitsBelow ? below : Math.max(MARGIN, rect.top - PAD - GAP - size.height);
    tipStyle = { top, left, width };
    arrow = { left: Math.max(18, Math.min(rect.left + rect.width / 2 - left, width - 18)), side: fitsBelow ? 'top' : 'bottom' };
  } else {
    tipStyle = { top: '30%', left: '50%', transform: 'translateX(-50%)', width: 340 };
  }

  const motion = reducedMotion ? ' tour--still' : '';
  const titleId = 'tour-tip-title';

  if (props.kind === 'tip') {
    const { tip } = props;
    return createPortal(
      <div className={`tour-layer tour-layer--tip${motion}`}>
        <div className="tour-ring" style={{ top: rect!.top - PAD, left: rect!.left - PAD, width: rect!.width + 2 * PAD, height: rect!.height + 2 * PAD }} />
        {/* Not a dialog: page shortcuts (← →, 1–4, /) pause while a dialog is open, and a tip must not stop them. */}
        <aside ref={tipRef} id="tip-card" className={`tour-tip tour-tip--small${phone ? ' tour-tip--phone' : ''}`} style={tipStyle}
          aria-labelledby={titleId} aria-live="polite">
          {arrow && <span className={`tour-arrow tour-arrow--${arrow.side}`} style={{ left: arrow.left }} aria-hidden="true" />}
          <div className="tour-kicker">Tip</div>
          <h2 className="tour-title" id={titleId}>{tip.title}</h2>
          <p className="tour-en">{withHindi(tip.en)}</p>
          <p className="tour-hi" lang="hi">{tip.hi}</p>
          <div className="tour-btns">
            <button type="button" className="tour-link" id="tip-off-btn" onClick={props.onTipsOff}>Turn off tips</button>
            <button type="button" className="tour-btn tour-btn--primary" id="tip-got-it-btn" onClick={props.onDismiss}>Got it</button>
          </div>
        </aside>
      </div>,
      document.body,
    );
  }

  const { tour, step } = props;
  const s = tour.steps[step];
  const last = step === tour.steps.length - 1;
  return createPortal(
    <div className={`tour-layer${motion}`} id="tour-layer">
      <div className="tour-blocker" onMouseDown={(e) => e.preventDefault()} onClick={(e) => e.preventDefault()} />
      {rect
        ? <div className="tour-spot" style={{ top: rect.top - PAD, left: rect.left - PAD, width: rect.width + 2 * PAD, height: rect.height + 2 * PAD }} />
        : <div className="tour-dim" />}
      <div ref={tipRef as React.RefObject<HTMLDivElement>} id="tour-tip" className={`tour-tip${phone ? ' tour-tip--phone' : ''}`} style={tipStyle} tabIndex={-1}
        role="dialog" aria-modal="true" aria-labelledby={titleId} aria-describedby="tour-tip-text">
        {arrow && rect && <span className={`tour-arrow tour-arrow--${arrow.side}`} style={{ left: arrow.left }} aria-hidden="true" />}
        <button type="button" className="tour-close" id="tour-close-btn" aria-label="End the tour" onClick={props.onEnd}><CloseIcon /></button>
        <div className="tour-kicker" id="tour-count">{tour.title} · {step + 1} of {tour.steps.length}</div>
        <h2 className="tour-title" id={titleId}>{s.title}</h2>
        <div id="tour-tip-text">
          <p className="tour-en">{withHindi(stepText(s, phone))}</p>
          <p className="tour-hi" lang="hi">{s.hi}</p>
        </div>
        <div className="tour-btns">
          {!last && <button type="button" className="tour-link" id="tour-skip-btn" onClick={props.onEnd}>Skip tour</button>}
          {step > 0 && <button type="button" className="tour-btn" id="tour-back-btn" onClick={props.onBack}>Back</button>}
          <button type="button" className="tour-btn tour-btn--primary" id="tour-next-btn" onClick={props.onNext}>{last ? 'Done' : 'Next ›'}</button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
