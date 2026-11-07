'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import type { Light } from '@/lib/lighting';
import { aimToScene, DEFAULT_AIM, lampGeometry, readDesk, SCENE_W, type Aim } from '@/lib/desk';
import { DeskLampArt, lampLabel, shadeHitStyle } from './DeskLamp';

interface DeskSceneProps {
  /** null until the screen width is known; the box keeps its size either way, and fills in once wide. */
  wide: boolean | null;
  light: Light;
  onToggleLamp: () => void;
  book?: ReactNode;
  notebook?: ReactNode;
}

/** The light's pool, as the CSS variables both light versions read. */
export function poolVars(target: Aim): Record<string, string> {
  const g = lampGeometry(target);
  return { '--tx': `${target.x}px`, '--ty': `${target.y}px`, '--rx': `${g.r * 1.15}px`, '--ry': `${g.r * 0.8}px` };
}

// The desk at the top of Today on wide screens: the lamp on the left, the open book in the middle, the goal
// notebook on the right, and a pen. Drawn at 940 × 400 and scaled down to fit narrower windows. The box reserves
// its height from the first paint (aspect-ratio in CSS); the contents arrive once the width is known.
export function DeskScene({ wide, light, onToggleLamp, book, notebook }: DeskSceneProps) {
  const boxRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  const [aim, setAim] = useState<Aim>(aimToScene(DEFAULT_AIM));

  useEffect(() => { setAim(aimToScene(readDesk().aim ?? DEFAULT_AIM)); }, []);
  // The switch's little click when the light changes (not on the first render).
  const [click, setClick] = useState(false);
  const lastLight = useRef(light);
  useEffect(() => {
    if (lastLight.current === light) return;
    lastLight.current = light;
    setClick(true);
    const t = window.setTimeout(() => setClick(false), 200);
    return () => window.clearTimeout(t);
  }, [light]);
  useEffect(() => {
    const box = boxRef.current;
    if (!box || !wide) return;
    const fit = () => setScale(Math.min(1, box.clientWidth / SCENE_W));
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(box);
    return () => ro.disconnect();
  }, [wide]);

  return (
    <div className="desk-scene-box" ref={boxRef} id="desk-scene">
      {wide && (
        <div className={`desk-scene${click ? ' desk-scene--click' : ''}`} style={{ transform: `scale(${scale})`, ...poolVars(aim) } as React.CSSProperties}>
          <div className="desk-daylight" aria-hidden="true" />
          <div className="desk-pen" aria-hidden="true" />
          {book}
          {notebook}
          <div className="desk-dark" aria-hidden="true" />
          <div className="desk-warm" aria-hidden="true" />
          <DeskLampArt target={aim} />
          {/* The lamp's base switches it too; the button below is the one keyboards and screen readers use. */}
          <div className="desk-lamp-base" aria-hidden="true" onClick={onToggleLamp} />
          <button type="button" id="desk-lamp" className="desk-lamp-hit" style={shadeHitStyle(aim)}
            aria-label={lampLabel(light)} aria-pressed={light === 'evening'} onClick={onToggleLamp} />
        </div>
      )}
    </div>
  );
}
