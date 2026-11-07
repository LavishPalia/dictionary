'use client';

import { useRef, useState } from 'react';
import type { Light } from '@/lib/lighting';
import { lampLabel } from './DeskLamp';

/** A pull longer than this switches the lamp when let go. */
export const PULL_SWITCH_PX = 12;
const PULL_MAX = 26;

// The phone's lamp: the edge of its shade and a brass bead on a string. Pull the bead down and let go, or tap it.
export function LampCord({ light, onToggle }: { light: Light; onToggle: () => void }) {
  const [pull, setPull] = useState(0);
  const [dragging, setDragging] = useState(false);
  const drag = useRef<{ y0: number; moved: boolean; pulled: number } | null>(null);
  // A pointer press handles its own switch; the click that follows it must not switch again.
  const handled = useRef(false);

  const end = () => {
    const d = drag.current;
    if (!d) return;
    drag.current = null;
    setDragging(false);
    handled.current = true;
    if (d.moved) {
      setPull(0);
      if (d.pulled > PULL_SWITCH_PX) onToggle();
    } else {
      setPull(14);
      window.setTimeout(() => setPull(0), 130);
      onToggle();
    }
  };

  return (
    <button type="button" id="desk-cord" className={`desk-cord${dragging ? ' desk-cord--dragging' : ''}`}
      aria-label={lampLabel(light)} aria-pressed={light === 'evening'}
      style={{ '--pull': `${pull}px` } as React.CSSProperties}
      onPointerDown={(e) => {
        handled.current = false;
        drag.current = { y0: e.clientY, moved: false, pulled: 0 };
        e.currentTarget.setPointerCapture?.(e.pointerId);
        setDragging(true);
      }}
      onPointerMove={(e) => {
        const d = drag.current;
        if (!d) return;
        d.pulled = Math.max(0, Math.min(PULL_MAX, e.clientY - d.y0));
        if (d.pulled > 3) d.moved = true;
        setPull(d.pulled);
      }}
      onPointerUp={end}
      onPointerCancel={() => { drag.current = null; setDragging(false); setPull(0); }}
      onClick={(e) => {
        // Keyboard (Enter/Space) and assistive tech arrive here without a pointer press (detail 0): always switch.
        // A pointer press switched on its own already, unless no click follows it (a touch pull).
        if (e.detail !== 0 && handled.current) { handled.current = false; return; }
        handled.current = false;
        onToggle();
      }}>
      <span className="desk-cord-shade" aria-hidden="true" />
      <span className="desk-cord-glow" data-glow aria-hidden="true" />
      <span className="desk-cord-string" aria-hidden="true" />
      <span className="desk-cord-bead" aria-hidden="true" />
      <span className="desk-cord-label" aria-hidden="true">{light === 'evening' ? 'lamp on' : 'lamp off'}</span>
    </button>
  );
}
