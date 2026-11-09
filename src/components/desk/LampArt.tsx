'use client';

import type { Light } from '@/lib/lighting';
import { lampGeometry, TODAY_REACH, type Aim, type LampReach } from '@/lib/desk';

/** The lamp's accessible name, which states what it does now. */
export const lampLabel = (light: Light) => (light === 'evening' ? 'Desk lamp, on: Evening lighting' : 'Desk lamp, off: Day lighting');

const deg = (rad: number) => (rad * 180) / Math.PI;
/** Where arm 1 meets arm 2. */
export const ELBOW = { x: 76, y: 182 };

// The drawn brass desk lamp (shared by Today and the Book page), in scene units (940 × 400 on Today). Its head is placed for `target` here; while the light
// moves, the scene's light controller rewrites the same attributes directly (data-lamp="…" marks them). The SVG's size follows
// its viewBox. `elbow` moves the base and the lower arm with it (the Book page puts them off the top-left of the screen).
export function LampArt({ target, reach = TODAY_REACH, idPrefix, viewBox = '0 0 940 400', elbow = ELBOW, className = 'desk-lamp-art', style, hidden }: {
  target: Aim; reach?: LampReach; idPrefix: string; viewBox?: string; elbow?: Aim; className?: string; style?: React.CSSProperties; hidden?: boolean;
}) {
  const g = lampGeometry(target, reach);
  const [, , vw, vh] = viewBox.trim().split(/[\s,]+/);
  const dx = elbow.x - ELBOW.x, dy = elbow.y - ELBOW.y;
  const id = (name: string) => `${idPrefix}-${name}`;
  const url = (name: string) => `url(#${idPrefix}-${name})`;
  return (
    <svg className={className} viewBox={viewBox} width={vw} height={vh} style={style} {...(hidden ? { hidden: true } as React.SVGProps<SVGSVGElement> : {})} aria-hidden="true" focusable="false">
      <defs>
        <linearGradient id={id('brass')} x1="0" x2="1">
          <stop offset="0" stopColor="#5e4318" /><stop offset=".38" stopColor="#e6c677" /><stop offset=".55" stopColor="#b8923e" /><stop offset="1" stopColor="#4e3812" />
        </linearGradient>
        <linearGradient id={id('brass-v')} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#f3d98f" /><stop offset=".45" stopColor="#b8923e" /><stop offset="1" stopColor="#4a3310" />
        </linearGradient>
        <linearGradient id={id('brass-under')} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#6e5020" /><stop offset="1" stopColor="#2c1d07" />
        </linearGradient>
        <linearGradient id={id('shade')} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#4a8a5e" /><stop offset=".4" stopColor="#245236" /><stop offset="1" stopColor="#0d2216" />
        </linearGradient>
        <radialGradient id={id('bulb')}>
          <stop offset="0" stopColor="#fffbe8" /><stop offset=".35" stopColor="#ffe6a8" /><stop offset="1" stopColor="#ffb84a" stopOpacity="0" />
        </radialGradient>
        <radialGradient id={id('cast')}>
          <stop offset="0" stopColor="#000" stopOpacity=".55" /><stop offset="1" stopColor="#000" stopOpacity="0" />
        </radialGradient>
      </defs>
      {dx || dy ? <g transform={`translate(${dx} ${dy})`}><LowerLamp url={url} /></g> : <LowerLamp url={url} />}
      {/* arm 2, out to the shade's hinge */}
      <line data-lamp="arm2" x1={elbow.x} y1={elbow.y} x2={g.px} y2={g.py} stroke={url('brass')} strokeWidth="7" strokeLinecap="round" />
      <g data-lamp="head" transform={`translate(${g.px} ${g.py}) rotate(${deg(g.ang)})`}>
        <g className="desk-lamp-nudge">
          {/* the shade, drawn pointing along +x */}
          <path d="M-6 -15 Q4 -24 22 -26 L66 -38 Q74 0 66 38 L22 26 Q4 24 -6 15 Z" fill={url('shade')} stroke="#0a1a10" strokeWidth="1.2" />
          <path d="M22 -26 L66 -38" stroke="rgba(255,255,255,.3)" strokeWidth="2" />
          <path d="M4 -19 Q14 -24 24 -25" stroke="rgba(255,255,255,.18)" strokeWidth="1.5" fill="none" />
          <ellipse cx="66" cy="0" rx="7" ry="38" fill="#0a1a10" />
          <ellipse className="desk-lamp-inner" cx="64" cy="0" rx="5" ry="33" fill="#ffd98e" />
          <path d="M66 -38 Q74 0 66 38" stroke="#d8b562" strokeWidth="3" fill="none" />
          <ellipse className="desk-lamp-glow" cx="66" cy="0" rx="7" ry="30" fill={url('bulb')} />
          {/* the hinge where the shade meets the arm */}
          <circle r="7.5" fill={url('brass-v')} />
          <circle r="2.5" fill="#3a2808" />
        </g>
      </g>
    </svg>
  );
}

/** The base and arm 1, up to the elbow. */
function LowerLamp({ url }: { url: (name: string) => string }) {
  return (
    <>
      {/* the soft shadow the heavy base casts on the desk */}
      <ellipse cx="108" cy="384" rx="86" ry="15" fill={url('cast')} />
      {/* base: a weighted dome with a darker underside and a lit top */}
      <ellipse cx="100" cy="378" rx="58" ry="10" fill={url('brass-under')} />
      <path d="M42 377 Q44 352 100 348 Q156 352 158 377 Q100 386 42 377 Z" fill={url('brass-v')} />
      <path d="M58 360 Q80 352 104 351" stroke="rgba(255,244,210,.55)" strokeWidth="2.5" fill="none" strokeLinecap="round" />
      <rect x="93" y="322" width="14" height="32" rx="3" fill={url('brass')} />
      <circle cx="100" cy="324" r="8" fill={url('brass-v')} />
      <circle cx="100" cy="324" r="2.5" fill="#3a2808" />
      {/* arm 1, with its hinge at the elbow */}
      <line x1="100" y1="324" x2={ELBOW.x} y2={ELBOW.y} stroke={url('brass')} strokeWidth="8" strokeLinecap="round" />
      <line x1="98" y1="318" x2={ELBOW.x - 1.5} y2={ELBOW.y + 6} stroke="rgba(255,240,200,.35)" strokeWidth="1.6" strokeLinecap="round" />
      <circle cx={ELBOW.x} cy={ELBOW.y} r="9" fill={url('brass-v')} />
      <circle cx={ELBOW.x} cy={ELBOW.y} r="3" fill="#3a2808" />
    </>
  );
}

/** Where the shade's button sits for `target` (scene units), as inline style. */
export function shadeHitStyle(target: Aim, reach: LampReach = TODAY_REACH): React.CSSProperties {
  const g = lampGeometry(target, reach);
  return { left: g.px, top: g.py, transform: `rotate(${deg(g.ang)}deg)` };
}
