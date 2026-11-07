'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import type { Light } from '@/lib/lighting';
import { useReducedMotion } from '@/lib/motion';
import { aimToScene, clampScene, DEFAULT_AIM, lampGeometry, readDesk, SCENE_W, type Aim, type LightVersion } from '@/lib/desk';
import { DeskLampArt, lampLabel, shadeHitStyle } from './DeskLamp';
import { createDeskLight } from './deskLight';

interface DeskSceneProps {
  /** null until the screen width is known; the box keeps its size either way, and fills in once wide. */
  wide: boolean | null;
  light: Light;
  onToggleLamp: () => void;
  book?: ReactNode;
  notebook?: ReactNode;
}

/** The light's pool, as the CSS variables both light versions read. */
function poolVars(target: Aim): Record<string, string> {
  const g = lampGeometry(target);
  return { '--tx': `${target.x}px`, '--ty': `${target.y}px`, '--rx': `${g.r * 1.15}px`, '--ry': `${g.r * 0.8}px` };
}

/** The spotlight on paper grain (light B). The owner's tuned values; deskLight moves #desk-spot. */
function SpotlightB({ at }: { at: Aim }) {
  const g = lampGeometry(at);
  return (
    <svg className="desk-light-b" id="desk-light-b" width="940" height="400" viewBox="0 0 940 400" aria-hidden="true" focusable="false">
      <filter id="desk-spot-filter" filterUnits="userSpaceOnUse" x="0" y="0" width="940" height="400" colorInterpolationFilters="sRGB">
        <feTurbulence type="fractalNoise" baseFrequency="1.3" numOctaves={2} seed={7} result="grain" />
        <feColorMatrix in="grain" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 .55 .45" result="bump" />
        <feDiffuseLighting in="bump" surfaceScale={0.7} diffuseConstant={1.4} lightingColor="#ffdcaa" result="lit">
          <feSpotLight id="desk-spot" x={g.mx} y={g.my} z={230} pointsAtX={at.x} pointsAtY={at.y} pointsAtZ={0} specularExponent={16} limitingConeAngle={42} />
        </feDiffuseLighting>
        <feComposite id="desk-amb" in="lit" in2="SourceGraphic" operator="arithmetic" k1={0} k2={1} k3={0} k4={0.45} />
      </filter>
      <rect width="940" height="400" fill="#fff" filter="url(#desk-spot-filter)" />
    </svg>
  );
}

// The desk at the top of Today on wide screens: the lamp on the left, the open book in the middle, the goal
// notebook on the right, and a pen. Drawn at 940 × 400 and scaled down to fit narrower windows. The box reserves
// its height from the first paint (aspect-ratio in CSS); the contents arrive once the width is known.
// Layers, bottom to top: wood, window light, pen; the lamp's darkness (B or A) and beam, which stay under the book and
// notebook so their text keeps its contrast; book; notebook; the warm pool (soft-light, which only brightens); lamp.
export function DeskScene({ wide, light, onToggleLamp, book, notebook }: DeskSceneProps) {
  const boxRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<HTMLDivElement>(null);
  const reduced = useReducedMotion();
  const [scale, setScale] = useState(1);
  const scaleRef = useRef(1);
  scaleRef.current = scale;
  const [aim, setAim] = useState<Aim>(aimToScene(DEFAULT_AIM));
  const [version, setVersion] = useState<LightVersion>('A');

  useEffect(() => { setAim(clampScene(aimToScene(readDesk().aim ?? DEFAULT_AIM))); }, []);
  // B unless motion is reduced, the browser lacks SVG lighting filters, or this device was found too slow for it.
  useEffect(() => {
    const supported = typeof window !== 'undefined' && 'SVGFESpotLightElement' in window;
    setVersion(!reduced && supported && readDesk().light !== 'A' ? 'B' : 'A');
  }, [reduced]);
  useEffect(() => {
    const scene = sceneRef.current;
    if (!wide || !scene) return;
    const ctl = createDeskLight(scene, { scale: () => scaleRef.current, reduced, timed: version === 'B', onSlow: () => setVersion('A') });
    return () => ctl.destroy();
  }, [wide, reduced, version]);

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
        <div ref={sceneRef} className={`desk-scene desk-scene--${version.toLowerCase()}${click ? ' desk-scene--click' : ''}`}
          style={{ transform: `scale(${scale})`, ...poolVars(aim) } as React.CSSProperties}>
          <div className="desk-pen" aria-hidden="true" />
          <div className="desk-daylight" aria-hidden="true" />
          {version === 'B' ? <SpotlightB at={aim} /> : <div className="desk-dark" aria-hidden="true" />}
          <svg className="desk-beam" width="940" height="400" viewBox="0 0 940 400" aria-hidden="true" focusable="false">
            <defs>
              <linearGradient id="desk-beam-grad" gradientUnits="userSpaceOnUse">
                <stop offset="0" stopColor="#ffd896" stopOpacity=".6" /><stop offset=".7" stopColor="#ffc070" stopOpacity="0" />
              </linearGradient>
            </defs>
            <polygon fill="url(#desk-beam-grad)" />
          </svg>
          {book}
          {notebook}
          <div className="desk-warm" aria-hidden="true" />
          <DeskLampArt target={aim} />
          {/* The lamp's base switches it too; the button below is the one keyboards and screen readers use. */}
          <div className="desk-lamp-base" aria-hidden="true" onClick={onToggleLamp} />
          <div className="desk-pool-handle" aria-hidden="true" style={{ left: aim.x, top: aim.y }} />
          <button type="button" id="desk-lamp" className="desk-lamp-hit" style={shadeHitStyle(aim)} aria-describedby="desk-lamp-hint"
            aria-label={lampLabel(light)} aria-pressed={light === 'evening'} onClick={onToggleLamp} />
          <span className="ui-visually-hidden" id="desk-lamp-hint">Drag the light or the shade to aim it. Arrow keys aim the light; Home puts it back.</span>
          <span className="desk-lamp-tip" aria-hidden="true">Tap to switch · drag to aim</span>
        </div>
      )}
    </div>
  );
}
