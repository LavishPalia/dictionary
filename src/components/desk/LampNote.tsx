'use client';

import type { LampSwitch } from './useLampSwitch';

// The note after a device's first lamp switch: the lamp stays as switched until Auto is chosen. `returnFocusTo` is
// the id of the lamp control that gets focus back when the note goes.
export function LampNote({ sw, onUseAuto, returnFocusTo, id }: { sw: LampSwitch; onUseAuto: () => void; returnFocusTo: string; id: string }) {
  if (!sw.note) return null;
  return (
    <div className="desk-note" id={id} ref={sw.noteRef} onMouseEnter={sw.holdNote} onMouseLeave={sw.releaseNote} onFocus={sw.holdNote}
      onBlur={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node | null)) sw.releaseNote(); }}>
      <span>{sw.note === 'evening' ? 'Lamp on.' : 'Lamp off.'} It stays this way until you switch it, or choose Auto to follow the clock again.</span>
      <button type="button" id={`${id}-auto`} onClick={() => {
        sw.hideNote(); onUseAuto();
        // The note goes; focus goes back to the lamp. Where the lamp is hidden (or inert) the focus doesn't take: the Book page's
        // page count is the next control in its place.
        const to = document.getElementById(returnFocusTo);
        to?.focus();
        if (document.activeElement !== to) document.getElementById('page-number-btn')?.focus();
      }}>Use Auto</button>
    </div>
  );
}
