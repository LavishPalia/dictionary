'use client';

/**
 * The desk around the open book: in Day a soft cool window light from the right, in Evening the lamp's darkness (a
 * multiply vignette centred on the pool, which bookLight.ts moves through --dark-x/--dark-y). It lies behind
 * everything else on the Book page (z-index −1 in .app-main, which is isolated while the lamp is mounted), so it only
 * ever darkens or lights the desk itself, never the book or any text.
 */
export function BookDesk() {
  // Two siblings, not one wrapper: a wrapper at z-index −1 would be a stacking context of its own, and the darkness
  // would multiply with nothing (the wrapper's empty backdrop) instead of with the desk.
  return (
    <>
      <div className="book-desk-day" aria-hidden="true" />
      <div className="book-desk-dark" id="book-desk" aria-hidden="true" />
    </>
  );
}
