'use client';

import type { CSSProperties } from 'react';
import type { LightVersion } from '@/lib/desk';
import { BOOK_DEFAULT_AIM, PHONE_POOL } from '@/lib/desk';
import { BOOK_LIGHT } from './bookLight';

const B = BOOK_LIGHT.b;

/**
 * The Book page's spotlight on paper grain (light B): one filter for the whole spread, so both pages share one source.
 * Its region is each lit page's own box, and its primitives are in the user space of the page that uses it, which each
 * layer shifts so that it is spread units: every page's light comes from the same lamp. No feComposite: where the lamp
 * doesn't reach, the result is black, and `screen` leaves the paper as it was. bookLight.ts moves #book-spot.
 */
export function BookLightFilter({ version, phone }: { version: LightVersion | null; phone: boolean }) {
  if (version !== 'B') return null;
  const src = phone ? BOOK_LIGHT.source.phone : BOOK_LIGHT.source.desktop;
  // Near the resting aim; bookLight.ts sets the real one before the first paint (a phone page's size isn't known here).
  const at = phone ? { x: PHONE_POOL.x * 360, y: PHONE_POOL.y * 640 } : { x: BOOK_DEFAULT_AIM.x * 1120, y: BOOK_DEFAULT_AIM.y * 640 };
  return (
    <svg className="book-light-defs" width="0" height="0" aria-hidden="true" focusable="false">
      <filter id="book-spot-filter" filterUnits="objectBoundingBox" x="0" y="0" width="1" height="1" primitiveUnits="userSpaceOnUse"
        colorInterpolationFilters="sRGB">
        <feTurbulence type="fractalNoise" baseFrequency={B.baseFrequency} numOctaves={2} seed={4} result="grain" />
        <feDiffuseLighting in="grain" surfaceScale={B.surfaceScale} diffuseConstant={B.diffuseConstant} lightingColor={B.color}>
          <feSpotLight id="book-spot" x={src.x} y={src.y} z={B.z} pointsAtX={at.x} pointsAtY={at.y} pointsAtZ={0}
            specularExponent={B.specularExponent} limitingConeAngle={B.coneAngle} />
        </feDiffuseLighting>
      </filter>
    </svg>
  );
}

/**
 * The light on one page: its first child, under all its text (z-index −1 in the page, which is isolated), and it only
 * adds light (screen). `originX` is the page's left edge in the frame (560 for the spread's right page). Width and height
 * default to the page's own box.
 */
export function BookLightLayer({ originX, width, height, version }: { originX: number; width?: number; height?: number; version: LightVersion }) {
  const cls = `book-light book-light--${version.toLowerCase()}`;
  if (version === 'A') return <div className={cls} aria-hidden="true" style={{ '--light-origin': `${originX}px` } as CSSProperties} />;
  return (
    <svg className={cls} aria-hidden="true" focusable="false">
      <g transform={`translate(${-originX} 0)`}>
        <rect x={originX} y={0} width={width ?? '100%'} height={height ?? '100%'} filter="url(#book-spot-filter)" />
      </g>
    </svg>
  );
}
