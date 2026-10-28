'use client';

import { forwardRef, useEffect, useId, useRef } from 'react';
import type { ButtonHTMLAttributes, HTMLAttributes, KeyboardEvent, ReactNode } from 'react';

// Shared building blocks for the redesign. Styling lives in src/styles/ui.css.
const cx = (...names: Array<string | false | null | undefined>) => names.filter(Boolean).join(' ');

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'paper' | 'primary' | 'desk';
  size?: 'normal' | 'small';
  full?: boolean;
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'paper', size = 'normal', full, className, type = 'button', ...rest }, ref) {
  return (
    <button
      ref={ref}
      type={type}
      className={cx('ui-btn', variant !== 'paper' && `ui-btn--${variant}`, size === 'small' && 'ui-btn--small', full && 'ui-btn--full', className)}
      {...rest}
    />
  );
});

// Icon-only buttons must say what they do.
type IconButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & { 'aria-label': string; surface?: 'desk' | 'paper' };

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  { surface = 'desk', className, type = 'button', ...rest }, ref) {
  return <button ref={ref} type={type} className={cx('ui-iconbtn', surface === 'paper' && 'ui-iconbtn--paper', className)} {...rest} />;
});

export function Chip({ className, type = 'button', ...rest }: ButtonHTMLAttributes<HTMLButtonElement>) {
  return <button type={type} className={cx('ui-chip', className)} {...rest} />;
}

export function Card({ className, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cx('ui-card', className)} {...rest} />;
}

export function Badge({ count, label }: { count: number; label: string }) {
  if (count <= 0) return null;
  return <span className="ui-badge" {...(label ? { 'aria-label': label } : { 'aria-hidden': true })}>{count > 99 ? '99+' : count}</span>;
}

// A radio group drawn as joined pills. Arrow keys move between options, as for native radios.
export function Segmented<T extends string>({ label, options, value, onChange }: {
  label: string;
  options: Array<{ value: T; label: ReactNode }>;
  value: T;
  onChange: (value: T) => void;
}) {
  const refs = useRef<Array<HTMLButtonElement | null>>([]);
  const onKeyDown = (event: KeyboardEvent, index: number) => {
    const step = event.key === 'ArrowRight' || event.key === 'ArrowDown' ? 1 : event.key === 'ArrowLeft' || event.key === 'ArrowUp' ? -1 : 0;
    if (!step) return;
    event.preventDefault();
    const next = (index + step + options.length) % options.length;
    onChange(options[next].value);
    refs.current[next]?.focus();
  };
  return (
    <div className="ui-seg" role="radiogroup" aria-label={label}>
      {options.map((option, index) => {
        const checked = option.value === value;
        return (
          <button
            key={option.value}
            ref={(el) => { refs.current[index] = el; }}
            type="button"
            role="radio"
            aria-checked={checked}
            tabIndex={checked ? 0 : -1}
            onClick={() => onChange(option.value)}
            onKeyDown={(event) => onKeyDown(event, index)}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

export function Switch({ checked, onChange, label, id }: { checked: boolean; onChange: (checked: boolean) => void; label: string; id?: string }) {
  return <button id={id} type="button" role="switch" aria-checked={checked} aria-label={label} className="ui-switch" onClick={() => onChange(!checked)} />;
}

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

// Modal sheet: slides up from the bottom on phones, centred on wider screens. Closes on Escape or a tap
// outside, keeps Tab inside, locks page scroll, and returns focus to whatever opened it. Pass returnFocusTo
// when the opener is known: Safari does not focus a button when it is clicked, so "whatever had focus" is not it.
// variant "side" docks to the right edge on wide screens (still a bottom sheet on phones). Pass labelledBy to
// use a heading inside children as the dialog's name instead of the built-in title, or ariaLabel to name it without one.
export function Sheet({ open, onClose, title, hideTitle, labelledBy, ariaLabel, children, id, scrimId, className, returnFocusTo, variant = 'center' }: {
  open: boolean;
  onClose: () => void;
  title?: string;
  hideTitle?: boolean;
  labelledBy?: string;
  ariaLabel?: string;
  scrimId?: string;
  variant?: 'center' | 'side';
  children: ReactNode;
  id?: string;
  className?: string;
  returnFocusTo?: () => HTMLElement | null;
}) {
  const panel = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const returnFocusRef = useRef(returnFocusTo);
  returnFocusRef.current = returnFocusTo;

  useEffect(() => {
    if (!open) return;
    const opener = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    // Focus the sheet itself: screen readers announce its name, and no button shows a focus ring
    // before the reader has pressed a key. Tab then reaches the first control.
    panel.current?.focus();
    const onKey = (event: globalThis.KeyboardEvent) => {
      if (event.key === 'Escape') { event.stopPropagation(); onCloseRef.current(); return; }
      if (event.key !== 'Tab' || !panel.current) return;
      const items = Array.from(panel.current.querySelectorAll<HTMLElement>(FOCUSABLE));
      if (!items.length) return;
      const [head, tail] = [items[0], items[items.length - 1]];
      if (event.shiftKey && (document.activeElement === head || document.activeElement === panel.current)) { event.preventDefault(); tail.focus(); }
      else if (!event.shiftKey && document.activeElement === tail) { event.preventDefault(); head.focus(); }
    };
    document.addEventListener('keydown', onKey, true);
    return () => {
      document.removeEventListener('keydown', onKey, true);
      document.body.style.overflow = overflow;
      const target = returnFocusRef.current?.() ?? opener;
      if (target && target !== document.body) target.focus();
    };
  }, [open]);

  if (!open) return null;
  return (
    <div id={scrimId} className={cx('ui-scrim', variant === 'side' && 'ui-scrim--side')}
      onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <div
        ref={panel}
        id={id}
        role="dialog"
        aria-modal="true"
        aria-label={ariaLabel}
        aria-labelledby={ariaLabel ? undefined : labelledBy ?? titleId}
        tabIndex={-1}
        className={cx('ui-sheet', variant === 'side' && 'ui-sheet--side', className)}
      >
        <div className="ui-sheet-grab" aria-hidden="true" />
        {!labelledBy && !ariaLabel && <h2 id={titleId} className={hideTitle ? 'ui-visually-hidden' : 'ui-sheet-title'}>{title}</h2>}
        {children}
      </div>
    </div>
  );
}
