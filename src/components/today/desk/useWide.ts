'use client';

import { useEffect, useState } from 'react';

/** The desk scene shows from this width up; the strip below it. desk.css uses the same number. */
export const DESK_QUERY = '(min-width: 900px)';

/** Whether the desk scene shows: null until known (server render and first client render). */
export function useWide(): boolean | null {
  const [wide, setWide] = useState<boolean | null>(null);
  useEffect(() => {
    const media = window.matchMedia(DESK_QUERY);
    const update = () => setWide(media.matches);
    update();
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, []);
  return wide;
}
