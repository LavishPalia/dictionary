import { useEffect, useId, useRef, type ReactNode } from 'react';

/**
 * A modal sheet (a bottom sheet on phones, a centred card on desktop): focus moves in, stays in, Escape
 * closes it, and focus goes back to whatever opened it.
 */
export function Sheet({ kind = 'sheet', focus = 'button:not(:disabled)', onClose, children }: {
  kind?: 'sheet' | 'confirm'; focus?: string; onClose: () => void; children: (titleId: string) => ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const titleId = useId();

  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    ref.current?.querySelector<HTMLElement>(focus)?.focus();
    return () => { if (opener && opener.isConnected) opener.focus(); };
    // Once, as it opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') { e.preventDefault(); onClose(); return; }
    if (e.key !== 'Tab' || !ref.current) return;
    const items = [...ref.current.querySelectorAll<HTMLElement>('input:not(:disabled), button:not(:disabled), [href]')];
    if (!items.length) return;
    const first = items[0], last = items[items.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  };

  return (
    <>
      <div className="duel-scrim" onClick={onClose} aria-hidden="true" />
      <div ref={ref} role="dialog" aria-modal="true" aria-labelledby={titleId}
        className={kind === 'confirm' ? 'duel-confirm' : 'duel-sheet'} onKeyDown={onKeyDown}>
        {children(titleId)}
      </div>
    </>
  );
}
