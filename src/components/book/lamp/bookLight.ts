// Moves the Book page's light, outside React (as deskLight.ts does for Today): the shared light loop eases the pool
// toward its target, and `draw` writes the spotlight's attributes (#book-spot), the pool's CSS variables on the frame
// (#book-spread-container on desktop, #mobile-page on a phone) and the darkness's centre on the desk. It writes only
// what changed, so the filter redraws only while the light moves.
import { BOOK_DEFAULT_AIM, PHONE_POOL, readDesk, type Aim } from '@/lib/desk';
import { createLightLoop, EASE_GLIDE } from '@/components/desk/lightLoop';

/** The tuned light, in one place (the browser test reads it too). Frame units: spread units on desktop, px on a phone. */
export const BOOK_LIGHT = {
  /** Light B: the spotlight on paper grain. Tuned on pages 400–401 and 2440 (from the spec's 16 / 30 / 1.6): a tighter
   *  beam (28), so the pool sits on the left page's first entries and fades over the lower third and across the gutter,
   *  and a cone wide enough (30°) that its edge falls where the light has already faded (no hard rim). */
  b: { baseFrequency: 1.3, surfaceScale: 0.7, diffuseConstant: 1.55, color: '#ffd596', z: 230, specularExponent: 28, coneAngle: 30 },
  /** Where the light comes from: the lamp's mouth, up and to the left of the frame (Task 3 wires the desktop one to the drawn lamp). */
  source: { desktop: { x: -110, y: -60 }, phone: { x: -40, y: -170 } },
  /** Light A's pool: its radii, and its centre's offset from the aim (B's brightest paper lies up-left of the aim on
   *  desktop, where the lamp is nearer, and below it on a phone, where the lamp is overhead). Frame units. The darkness
   *  on the desk around it is sized as multiples of the frame. */
  pool: { desktop: { rx: 380, ry: 290, dx: -50, dy: -10 }, phone: { rx: 260, ry: 300, dx: 0, dy: 60 } },
  dark: { rx: 1.0, ry: 1.25 },
} as const;

export interface BookLight {
  /** Glide to a point (fractions of the frame), or back to the resting aim with null. */
  glideTo(target: Aim | null): void;
  /** While on, nothing is drawn (a page turn); when it goes off the light goes to its latest target. */
  hold(on: boolean): void;
  /** Re-measure (the frame's size or place changed) and redraw what changed. */
  refresh(): void;
  destroy(): void;
}

export function createBookLight(opts: {
  frame: HTMLElement;
  /** The frame's size in frame units (1120 × 640 on desktop; the page's px on a phone, re-measured by refresh). */
  size: { w: number; h: number };
  desk: HTMLElement;
  phone: boolean;
  reduced: boolean;
  /** Spotlight (B) in use, so the first glide may be timed (Task 5). */
  timed: boolean;
  onSlow(): void;
}): BookLight {
  const { frame, desk, phone } = opts;
  const size = { ...opts.size };
  const src = phone ? BOOK_LIGHT.source.phone : BOOK_LIGHT.source.desktop;
  const pool = phone ? BOOK_LIGHT.pool.phone : BOOK_LIGHT.pool.desktop;
  let target: Aim | null = null; // null = at rest
  let held = false;
  const written = new Map<string, string>();
  const put = (key: string, value: string, write: () => void) => { if (written.get(key) !== value) { written.set(key, value); write(); } };

  const restAim = (): Aim => {
    const a = phone ? PHONE_POOL : (readDesk().bookAim ?? BOOK_DEFAULT_AIM);
    return { x: a.x * size.w, y: a.y * size.h };
  };
  const toFrame = (a: Aim): Aim => ({ x: Math.max(0, Math.min(1, a.x)) * size.w, y: Math.max(0, Math.min(1, a.y)) * size.h });

  function draw(cur: Aim) {
    const spot = document.getElementById('book-spot');
    if (spot && spot.isConnected) {
      const set = (n: string, v: number) => put(`spot.${n}`, v.toFixed(1), () => spot.setAttribute(n, v.toFixed(1)));
      set('x', src.x); set('y', src.y); set('pointsAtX', cur.x); set('pointsAtY', cur.y);
    }
    const css = (el: HTMLElement, tag: string, n: string, v: string) => put(`${tag}.${n}`, v, () => el.style.setProperty(n, v));
    css(frame, 'frame', '--pool-x', `${(cur.x + pool.dx).toFixed(1)}px`);
    css(frame, 'frame', '--pool-y', `${(cur.y + pool.dy).toFixed(1)}px`);
    css(frame, 'frame', '--pool-rx', `${pool.rx}px`);
    css(frame, 'frame', '--pool-ry', `${pool.ry}px`);
    // The darkness is centred on the pool, in the desk's own px (the frame may be scaled).
    const f = frame.getBoundingClientRect(), d = desk.getBoundingClientRect();
    const k = f.width / size.w || 1;
    css(desk, 'desk', '--dark-x', `${(f.left - d.left + cur.x * k).toFixed(0)}px`);
    css(desk, 'desk', '--dark-y', `${(f.top - d.top + cur.y * k).toFixed(0)}px`);
    css(desk, 'desk', '--dark-rx', `${(f.width * BOOK_LIGHT.dark.rx).toFixed(0)}px`);
    css(desk, 'desk', '--dark-ry', `${(f.height * BOOK_LIGHT.dark.ry).toFixed(0)}px`);
  }

  const loop = createLightLoop({
    reduced: opts.reduced, draw,
    onMoving: (moving) => { if (moving) frame.dataset.lightMoving = 'true'; else delete frame.dataset.lightMoving; },
  });
  loop.jump(restAim());

  return {
    glideTo(t) {
      target = t;
      loop.setAim(t ? toFrame(t) : restAim(), EASE_GLIDE);
    },
    hold(on) { held = on; loop.hold(on); },
    refresh() {
      if (phone) { size.w = frame.offsetWidth || size.w; size.h = frame.offsetHeight || size.h; }
      const want = target ? toFrame(target) : restAim();
      if (Math.abs(want.x - loop.aim.x) > 0.05 || Math.abs(want.y - loop.aim.y) > 0.05) loop.jump(want);
      else if (!held) draw(loop.cur);
    },
    destroy() { loop.destroy(); delete frame.dataset.lightMoving; },
  };
}
