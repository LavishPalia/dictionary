import type { ReactNode } from 'react';
import { initialOf, isDevanagari, type Emblem } from '@/lib/bookplate';

// The eight bookplate emblems: one engraved line on a 48 grid, in currentColor (the plate's crimson).
const PATHS: Record<Exclude<Emblem, 'initial'>, ReactNode> = {
  lotus: (
    <>
      <path d="M24 10c4 5 5 11 0 22c-5-11-4-17 0-22z" /><path d="M24 32c-2-8-7-13-13-14c0 8 5 13 13 14z" /><path d="M24 32c2-8 7-13 13-14c0 8-5 13-13 14z" />
      <path d="M24 32c-6-1-12-1-17 3c5 2 12 1 17-3z" /><path d="M24 32c6-1 12-1 17 3c-5 2-12 1-17-3z" /><path d="M12 39c8 2 16 2 24 0" /><path d="M24 16v12" opacity=".5" />
    </>
  ),
  peacock: (
    <>
      <path d="M33 8c-9 1-16 9-16 19c0 5 2 8 5 9" /><path d="M33 8c4 7 2 18-6 24c-2 2-4 3-5 4" />
      <ellipse cx="27" cy="19" rx="5" ry="6.5" transform="rotate(25 27 19)" /><ellipse cx="27.3" cy="19.6" rx="2.3" ry="3" transform="rotate(25 27 19)" fill="currentColor" />
      <path d="M22 36c-3 3-5 5-8 7" /><path d="M19 24l-5-2M18 29l-5 0M21 33l-4 3M31 30l3 3M34 24l4 1M35 17l4-1" opacity=".6" />
    </>
  ),
  diya: (
    <>
      <path d="M24 9c3 4 4 7 4 9a4 4 0 0 1-8 0c0-2 1-5 4-9z" /><path d="M24 15c1 2 1.5 3 1.5 4" opacity=".6" />
      <path d="M8 27c3 0 9 1 16 1s13-1 16-1c-1 7-8 11-16 11S9 34 8 27z" /><path d="M40 27c2-1 3-2 4-4" /><path d="M14 38l-2 3h24l-2-3" /><path d="M22 23c0 2 1 4 2 5c1-1 2-3 2-5" />
    </>
  ),
  owl: (
    <>
      <path d="M14 12l4 4h12l4-4v14c0 9-5 14-10 14s-10-5-10-14z" /><circle cx="19" cy="21" r="4" /><circle cx="29" cy="21" r="4" />
      <circle cx="19" cy="21" r="1.2" fill="currentColor" /><circle cx="29" cy="21" r="1.2" fill="currentColor" /><path d="M22.5 25l1.5 3l1.5-3" />
      <path d="M19 31c2 1 3 1 5 1s3 0 5-1M20 34.5c1.5.8 2.5 1 4 1s2.5-.2 4-1" opacity=".6" /><path d="M8 40h32" /><path d="M19 40v-3M29 40v-3" />
    </>
  ),
  banyan: (
    <>
      <path d="M10 24c-4-1-5-7-1-9c0-5 6-8 10-5c3-4 10-4 12 0c4-2 9 1 8 6c4 2 3 8-1 8c-2 3-7 3-9 1H19c-2 2-7 2-9-1z" />
      <path d="M22 25v15M26 25v15M22 33c-2 2-4 3-7 3M26 32c2 2 4 3 7 3" /><path d="M14 25v8M34 25v8M18 25v5M30 25v5" opacity=".55" /><path d="M8 40h32" />
    </>
  ),
  kite: (
    <>
      <path d="M24 5l13 14l-13 15l-13-15z" /><path d="M24 5v29M11 19h26" opacity=".6" /><path d="M14 18c4-3 16-3 20 0" />
      <path d="M24 34l-2 4l4 0l-2-4" /><path d="M24 38c-3 2-1 4-4 6M24 38c3 2 1 4 4 5" opacity=".7" />
    </>
  ),
  quill: (
    <>
      <path d="M39 6c-12 2-20 11-22 24l3 1c8-6 15-14 19-25z" /><path d="M36 10L18 31" opacity=".6" /><path d="M24 20l-4-1M28 16l-4-1M31 13l-3-1" opacity=".55" />
      <path d="M18 31l-2 5" /><path d="M8 34h14v8H8z" /><path d="M10 34v-2h10v2" /><path d="M6 42h18" />
    </>
  ),
  moon: (
    <>
      <path d="M30 8a16 16 0 1 0 10 27a13 13 0 1 1-10-27z" /><path d="M33 16l1.6 3.4l3.6.4l-2.7 2.5l.8 3.6l-3.3-1.9l-3.3 1.9l.8-3.6l-2.7-2.5l3.6-.4z" />
      <circle cx="14" cy="12" r="1" fill="currentColor" /><circle cx="40" cy="9" r="1" fill="currentColor" /><circle cx="20" cy="41" r=".9" fill="currentColor" />
    </>
  ),
};

/** The emblems' names, for the picker's labels. Hindi goes on the Hindi check list. */
export const EMBLEM_NAMES: Record<Emblem, { en: string; hi: string }> = {
  lotus: { en: 'Lotus', hi: 'कमल' },
  peacock: { en: 'Peacock feather', hi: 'मोर पंख' },
  diya: { en: 'Diya', hi: 'दीया' },
  owl: { en: 'Owl', hi: 'उल्लू' },
  banyan: { en: 'Banyan', hi: 'बरगद' },
  kite: { en: 'Kite', hi: 'पतंग' },
  quill: { en: 'Quill and ink', hi: 'क़लम' },
  moon: { en: 'Moon and star', hi: 'चाँद-तारा' },
  initial: { en: 'Your initial', hi: 'आपका अक्षर' },
};

/** One emblem, or the name's initial as a monogram. Decorative: the label sits beside it. */
export function EmblemMark({ emblem, name, className, at }: {
  emblem: Emblem; name: string; className?: string;
  /** Placed inside another drawing: its position and size there. */
  at?: { x: number; y: number; size: number };
}) {
  if (emblem === 'initial') {
    const letter = initialOf(name) || 'P';
    return <span className={`bp-monogram${isDevanagari(letter) ? ' bp-monogram--deva' : ''}${className ? ` ${className}` : ''}`} aria-hidden="true">{letter}</span>;
  }
  return (
    <svg className={className} viewBox="0 0 48 48" aria-hidden="true" focusable="false"
      {...(at ? { x: at.x, y: at.y, width: at.size, height: at.size } : {})}
      fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round">
      {PATHS[emblem]}
    </svg>
  );
}
