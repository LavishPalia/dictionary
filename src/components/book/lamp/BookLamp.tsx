'use client';

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { Light } from '@/lib/lighting';
import { readDesk, type LightVersion } from '@/lib/desk';
import type { LampSwitch } from '@/components/desk/useLampSwitch';
import { LampNote } from '@/components/desk/LampNote';
import { BookLightFilter } from './BookLightLayer';
import { BookDesk } from './BookDesk';
import { createBookLight, entryAim, type BookLight } from './bookLight';

/** The spread's own size, in the units the light uses on desktop. */
const SPREAD = { w: 1120, h: 640 };

/**
 * Which light the Book page draws, as on Today: B unless motion is reduced, the browser lacks SVG lighting filters, or
 * this device was found too slow for it (the `light: 'A'` flag Today shares). null until known (no layer is drawn).
 * `recheck` re-reads the flag when it changes (DictionaryApp passes the section, so a flag Today set is seen here).
 */
export function useBookLightVersion(reduced: boolean, recheck: unknown): [LightVersion | null, () => void] {
  const [version, setVersion] = useState<LightVersion | null>(null);
  useEffect(() => {
    const supported = typeof window !== 'undefined' && 'SVGFESpotLightElement' in window;
    setVersion(!reduced && supported && readDesk().light !== 'A' ? 'B' : 'A');
  }, [reduced, recheck]);
  return [version, () => setVersion('A')];
}

interface BookLampProps {
  phone: boolean;
  light: Light;
  /** The switch DictionaryApp made (the desktop lamp and the phone switch render outside this component). */
  sw: LampSwitch;
  onUseAuto: () => void;
  /** The light version DictionaryApp chose (useBookLightVersion), and what to do when this device proves too slow. */
  version: LightVersion | null;
  onSlow: () => void;
  reduced: boolean;
  /** The open word's headword when it is on the visible page(s) (Task 5 glides the pool to it). */
  focusEntry: string | null;
  /** A flip, riffle, page load or phone turn is running: the light holds still. */
  turning: boolean;
  /** Changes whenever the frame element is replaced (a phone shows "Page not available" with no #mobile-page, then a
   *  page again), so the controller is made again on the live frame instead of staying on a detached one. */
  frameKey: string;
}

/**
 * The lamp on the Book page: the filter, the desk around the book, the live region and the one-time note. It owns the
 * light's controller, which finds the frame, the desk, #book-spot and (on desktop) the drawn lamp by id. Mounted only
 * while the open book shows.
 */
export function BookLamp({ phone, light, sw, onUseAuto, version, onSlow, reduced, focusEntry, turning, frameKey }: BookLampProps) {
  const ctl = useRef<BookLight | null>(null);
  const turningRef = useRef(turning);
  turningRef.current = turning;
  const onSlowRef = useRef(onSlow);
  onSlowRef.current = onSlow;
  void light; // the desktop lamp (BookLampArt) gets the light from DictionaryApp
  const displaced = useRef(false); // the pool was sent to a word and hasn't gone back to rest

  // Before the first paint, so the filter never shows its placeholder aim.
  useLayoutEffect(() => {
    if (!version) return;
    const frame = document.getElementById(phone ? 'mobile-page' : 'book-spread-container');
    const desk = document.getElementById('book-desk');
    if (!frame || !desk) return;
    const size = phone ? { w: frame.offsetWidth, h: frame.offsetHeight } : SPREAD;
    // The drawn lamp (desktop): DictionaryApp renders it beside the spread, in ScaledSpread.
    const scaleBox = phone ? null : document.getElementById('book-scale');
    const button = phone ? null : document.getElementById('book-lamp');
    const art = phone ? null : document.querySelector('.book-lamp-art');
    const lamp = button instanceof HTMLButtonElement && art instanceof SVGSVGElement
      ? { button, art, scale: () => Number(scaleBox?.dataset.scale) || 1 } : undefined;
    const c = createBookLight({ frame, size, desk, phone, reduced, timed: version === 'B', onSlow: () => onSlowRef.current(), lamp });
    if (turningRef.current) c.hold(true);
    ctl.current = c;
    displaced.current = false;
    // The page's size (a phone page is as tall as its words) or place changed: re-measure.
    const refresh = () => c.refresh();
    const ro = new ResizeObserver(refresh);
    ro.observe(frame);
    ro.observe(desk);
    window.addEventListener('resize', refresh);
    // The spread's scale changed (a transform: the observer above doesn't see it): the lamp may no longer fit, or fit again.
    const mo = new MutationObserver(refresh);
    if (scaleBox) mo.observe(scaleBox, { attributes: true, attributeFilter: ['data-scale'] });
    // Content in the flow between the header and the spread (the offline notice, the share note) comes and goes as a sibling
    // of the header and moves the spread without resizing anything watched above: refit when one mounts or unmounts, or the
    // header itself changes size (it wraps), so the shade never ends up under the header (§4.2).
    const header = phone ? null : document.querySelector('.app-header');
    const mo2 = header?.parentElement ? new MutationObserver(refresh) : null;
    if (header?.parentElement) mo2?.observe(header.parentElement, { childList: true });
    if (header) ro.observe(header);
    return () => { ro.disconnect(); mo.disconnect(); mo2?.disconnect(); window.removeEventListener('resize', refresh); c.destroy(); ctl.current = null; };
  }, [phone, version, reduced, frameKey]);

  // A turn holds the light; when it lands the pool goes to the open word (if its entry is on the page), and back to rest when
  // the sheet closes. Runs after the controller is made, so a rebuilt one catches up too. A page turn alone never moves it.
  useEffect(() => {
    const c = ctl.current;
    if (!c) return;
    c.hold(turning);
    if (turning) return;
    if (focusEntry) {
      const frame = document.getElementById(phone ? 'mobile-page' : 'book-spread-container');
      const aim = frame ? entryAim(frame, focusEntry, frame.offsetWidth ? frame.getBoundingClientRect().width / frame.offsetWidth : 1) : null;
      if (aim) { c.glideTo(aim); displaced.current = true; }
    } else if (displaced.current) {
      displaced.current = false;
      c.glideTo(null);
    }
  }, [turning, focusEntry, phone, version, reduced, frameKey]);

  return (
    <>
      <BookDesk />
      <BookLightFilter version={version} phone={phone} />
      <p className="ui-visually-hidden" id="book-live" aria-live="polite">{sw.said}</p>
      <LampNote sw={sw} id="book-note" returnFocusTo={phone ? 'book-switch' : 'book-lamp'} onUseAuto={onUseAuto} />
    </>
  );
}
