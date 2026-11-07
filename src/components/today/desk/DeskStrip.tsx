'use client';

import type { ReactNode } from 'react';
import type { Light } from '@/lib/lighting';
import { LampCord } from './LampCord';

// The phone's edge of the desk, under the search row: the lamp's pull cord on the left, the goal chip on the right.
// The band keeps its height from the first paint; its contents arrive once the width is known.
export function DeskStrip({ wide, light, onToggleLamp, goal, editor }: {
  wide: boolean | null;
  light: Light;
  onToggleLamp: () => void;
  goal?: ReactNode;
  /** The goal editor, as a card under the strip while open. */
  editor?: ReactNode;
}) {
  return (
    <>
      <div className="desk-strip" id="desk-strip">
        {wide === false && (
          <>
            <LampCord light={light} onToggle={onToggleLamp} />
            {goal}
          </>
        )}
      </div>
      {wide === false && editor}
    </>
  );
}
