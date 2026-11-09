'use client';

import { useCallback, useEffect, useRef, useState, type RefObject } from 'react';
import type { Light } from '@/lib/lighting';
import { readDesk, writeDesk } from '@/lib/desk';

const NOTE_MS = 6000;

export interface LampSwitch {
  /** Pins the opposite of the light applied now; the first switch on a device also shows the note. */
  toggle(): void;
  /** The live-region text for the last switch. */
  said: string;
  /** Say something else in the same live region (Today's book announces its closing here). */
  say(text: string): void;
  /** The light the note speaks of, while the note shows. */
  note: Light | null;
  hideNote(): void;
  /** The note waits while it is pointed at or has focus: hold stops its timer, release starts it again. */
  holdNote(): void;
  releaseNote(): void;
  noteRef: RefObject<HTMLDivElement | null>;
}

// What switching the lamp does, for Today and the Book page: pin the opposite light, say so for screen readers, and
// explain once per device (the `noted` flag) that it stays that way until Auto is chosen.
export function useLampSwitch({ light, onSetLight }: { light: Light; onSetLight: (light: Light) => void }): LampSwitch {
  const [said, setSaid] = useState('');
  const [note, setNote] = useState<Light | null>(null);
  const noteTimer = useRef<number | null>(null);
  const noteRef = useRef<HTMLDivElement>(null);
  const clearTimer = () => { if (noteTimer.current !== null) window.clearTimeout(noteTimer.current); noteTimer.current = null; };
  const hideNote = useCallback(() => { clearTimer(); setNote(null); }, []);
  useEffect(() => hideNote, [hideNote]);
  const releaseNote = useCallback(() => {
    clearTimer();
    const tick = () => {
      // Still pointed at, or holding focus: wait another round (focus events alone aren't reliable).
      const el = noteRef.current;
      if (el && (el.matches(':hover') || el.contains(document.activeElement))) { noteTimer.current = window.setTimeout(tick, 1000); return; }
      noteTimer.current = null;
      setNote(null);
    };
    noteTimer.current = window.setTimeout(tick, NOTE_MS);
  }, []);
  const holdNote = useCallback(clearTimer, []);
  const toggle = useCallback(() => {
    const next: Light = light === 'evening' ? 'day' : 'evening';
    onSetLight(next);
    setSaid(next === 'evening' ? 'Lamp on: Evening lighting.' : 'Lamp off: Day lighting.');
    if (!readDesk().noted) {
      writeDesk({ noted: true });
      setNote(next);
      releaseNote();
    }
  }, [light, onSetLight, releaseNote]);
  return { toggle, said, say: setSaid, note, hideNote, holdNote, releaseNote, noteRef };
}
