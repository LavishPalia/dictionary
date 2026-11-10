'use client';

import { useEffect, useId, useRef, useState } from 'react';
import type { Light } from '@/lib/lighting';
import { lampLabel } from '@/components/desk/LampArt';

const SINK_MS = 120;

/** The brass push-switch's art: a round brass collar with a domed cap, and a faint warm ring round it while the lamp is on. */
export function PushSwitchArt({ light }: { light: Light }) {
  const id = useId().replace(/:/g, '');
  return (
    <span className="book-switch-art" data-on={light === 'evening' ? 'true' : 'false'} aria-hidden="true">
      <svg width="44" height="44" viewBox="0 0 44 44" focusable="false">
        <defs>
          <linearGradient id={`bs-br-${id}`} x1="0" x2="1">
            <stop offset="0" stopColor="#7a5a1c" /><stop offset=".45" stopColor="#e2c27a" /><stop offset="1" stopColor="#8a6420" />
          </linearGradient>
          <radialGradient id={`bs-cap-${id}`} cx=".4" cy=".35" r=".7">
            <stop offset="0" stopColor="#fff1c4" /><stop offset=".5" stopColor="#d9b25e" /><stop offset="1" stopColor="#7a5a1c" />
          </radialGradient>
        </defs>
        <circle cx="22" cy="22" r="17" fill={`url(#bs-br-${id})`} stroke="#5b4213" strokeWidth="1.5" />
        <circle className="book-switch-cap" cx="22" cy="22" r="10" fill={`url(#bs-cap-${id})`} stroke="#6b4c16" />
        <circle className="book-switch-glow" data-glow cx="22" cy="22" r="20" fill="none" stroke="#ffd596" strokeOpacity=".55" strokeWidth="2" />
      </svg>
    </span>
  );
}

/** The lamp's switch on a phone's page foot: 44 × 44, one activation per tap, Space or Enter (a button's click), no more. */
export function PushSwitch({ light, onToggle }: { light: Light; onToggle(): void }) {
  const [sunk, setSunk] = useState(false);
  const timer = useRef<number | null>(null);
  useEffect(() => () => { if (timer.current !== null) window.clearTimeout(timer.current); }, []);
  const click = () => {
    // The cap sinks for a moment (CSS drops it under reduced motion).
    setSunk(true);
    if (timer.current !== null) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => { timer.current = null; setSunk(false); }, SINK_MS);
    onToggle();
  };
  return (
    <button type="button" id="book-switch" className="book-switch" aria-pressed={light === 'evening'} aria-label={lampLabel(light)}
      data-sunk={sunk ? 'true' : undefined} onClick={click}>
      <PushSwitchArt light={light} />
    </button>
  );
}
