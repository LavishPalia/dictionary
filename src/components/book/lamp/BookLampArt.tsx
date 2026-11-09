'use client';

import type { Light } from '@/lib/lighting';
import { BOOK_DEFAULT_AIM, BOOK_REACH, bookElbow } from '@/lib/desk';
import { LampArt, lampLabel, shadeHitStyle } from '@/components/desk/LampArt';

/** The spread's own size: the lamp is drawn in its units, beside it. */
const W = 1120, H = 640;
/** The part of the desk the art covers (spread units): the gutter left of the spread, up past the top of the screen. */
const VIEW = { x: -700, y: -800, w: 700, h: 1000 };
/** The elbow (bookLight.ts moves it with the fitted reach): far up and to the left, so the base and the lower arm are off
 *  the top of the screen and only the upper arm, the hinge and the shade lean in (the arm stays left of the header). */
const ELBOW_AT = bookElbow(BOOK_REACH);
// Drawn for the resting aim; bookLight.ts moves the head and the button to the stored aim before the first paint.
const AT = { x: BOOK_DEFAULT_AIM.x * W, y: BOOK_DEFAULT_AIM.y * H };
const ART_STYLE = { left: VIEW.x, top: VIEW.y };
const HIT_STYLE = shadeHitStyle(AT, BOOK_REACH);

/**
 * The desk lamp on the Book page (desktop): it leans in from the top-left corner of the desk, beside the spread. Its
 * shade is the switch, and dragging it aims the light (bookLight.ts). A second child of ScaledSpread, so it is drawn in
 * the spread's units and shrinks with it. bookLight.ts fits it to the gutter beside the book (its place, its head's size and
 * how far it turns) and hides it (the `hidden` attribute) only where even the smallest head doesn't fit.
 */
export function BookLampArt({ light, onToggle }: { light: Light; onToggle: () => void }) {
  return (
    <>
      {/* Hidden until bookLight.ts has checked that it fits (so it never flashes over the spread on a narrow window). */}
      <LampArt target={AT} reach={BOOK_REACH} idPrefix="book" viewBox={`${VIEW.x} ${VIEW.y} ${VIEW.w} ${VIEW.h}`} elbow={ELBOW_AT}
        className="book-lamp-art" style={ART_STYLE} hidden />
      <button type="button" id="book-lamp" className="book-lamp-hit" style={HIT_STYLE} aria-describedby="book-lamp-hint" hidden
        aria-label={lampLabel(light)} aria-pressed={light === 'evening'} onClick={onToggle} />
      <span className="ui-visually-hidden" id="book-lamp-hint">Drag the shade to aim the light. Arrow keys aim it; Home puts it back.</span>
    </>
  );
}
