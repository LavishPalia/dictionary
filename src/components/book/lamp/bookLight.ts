// Moves the Book page's light, outside React (as deskLight.ts does for Today): the shared light loop eases the pool
// toward its target, and `draw` writes the spotlight's attributes (#book-spot), the pool's CSS variables on the frame
// (#book-spread-container on desktop, #mobile-page on a phone), the darkness's centre on the desk and, on desktop, the
// drawn lamp's head. It writes only what changed, so the filter redraws only while the light moves. On desktop the
// lamp's shade is also handled here, as Today's is in deskLight.ts: a click switches, a drag or the arrow keys aim.
import { BOOK_DEFAULT_AIM, BOOK_REACH, bookElbow, bookLampFits, fitBookReach, lampGeometry, PHONE_POOL, readDesk, shadeReachBox, writeDesk, type Aim, type LampReach, type Rect } from '@/lib/desk';
import { createLightLoop, EASE_GLIDE, SLOW_FRAME_MS } from '@/components/desk/lightLoop';
import { ELBOW, headScale } from '@/components/desk/LampArt';

/** The tuned light, in one place (the browser test reads it too). Frame units: spread units on desktop, px on a phone. */
export const BOOK_LIGHT = {
  /** Light B: the spotlight on paper grain. Tuned on pages 400–401 and 2440 (from the spec's 16 / 30 / 1.6): a tighter
   *  beam (28), so the pool sits on the left page's first entries and fades over the lower third and across the gutter,
   *  and a cone wide enough (30°) that its edge falls where the light has already faded (no hard rim). */
  b: { baseFrequency: 1.3, surfaceScale: 0.7, diffuseConstant: 1.55, color: '#ffd596', z: 230, specularExponent: 28, coneAngle: 30 },
  /** Where the light comes from on a phone: an imaginary lamp up and to the left of the page. On desktop it is the drawn
   *  lamp's mouth (lampGeometry(aim, BOOK_REACH)), which moves as the lamp is aimed. */
  source: { phone: { x: -40, y: -170 } },
  /** Light A's pool: its radii, and its centre's offset from the aim (B's brightest paper lies up-left of the aim on
   *  desktop, where the lamp is nearer, and below it on a phone, where the lamp is overhead). Frame units. The darkness
   *  on the desk around it is sized as multiples of the frame. */
  pool: { desktop: { rx: 380, ry: 290, dx: -50, dy: -10 }, phone: { rx: 260, ry: 300, dx: 0, dy: 60 } },
  dark: { rx: 1.0, ry: 1.25 },
} as const;

/** A click that moves less than this (screen px) switches the lamp; more is a drag. */
const TAP_PX = 6;
/** How long the phone's first glide is timed (ms): about the glide's length, with 8 frames at the least. */
const GLIDE_TIMING_MS = 700;
/** The arrow keys aim the light this far (spread units), or the big step with Shift. */
const KEY_STEP = 20, KEY_STEP_BIG = 60;
/** The book's leather cover shows this far around the spread (spread units): it is part of the book, so the lamp keeps off it. */
const COVER = 14;
/** The clearance the lamp keeps from the book, the header and the arrow (screen px): this much where there is room, else the smaller. */
const MARGINS_PX = [8, 4];
const deg = (rad: number) => (rad * 180) / Math.PI;

/**
 * Where an entry's first line is on the live page(s), as fractions of the frame, or null when it isn't there. Reads the
 * DOM only: the centre of the headword (which opens the entry's first line) inside `frame`, skipping the aria-hidden
 * copies (the base layer at rest, page-turn leaves). `scale` is the frame's on-screen scale (1 on a phone).
 */
export function entryAim(frame: HTMLElement, headword: string, scale: number): Aim | null {
  const w = frame.offsetWidth, h = frame.offsetHeight;
  if (!w || !h) return null;
  const want = headword.trim();
  for (const el of frame.querySelectorAll('.entry-headword')) {
    if (el.textContent?.trim() !== want || el.closest('[aria-hidden="true"]')) continue;
    const r = el.getClientRects()[0], f = frame.getBoundingClientRect();
    if (!r || !r.width || !r.height) continue;
    const k = scale || 1;
    return { x: (r.left + r.width / 2 - f.left) / k / w, y: (r.top + r.height / 2 - f.top) / k / h };
  }
  return null;
}

export interface BookLight {
  /** Glide to a point (fractions of the frame), or back to the resting aim with null. */
  glideTo(target: Aim | null): void;
  /** While on, nothing is drawn (a page turn); when it goes off the light goes to its latest target. */
  hold(on: boolean): void;
  /** Re-measure (the frame's size, place or scale changed), check that the lamp still fits, and redraw what changed. */
  refresh(): void;
  destroy(): void;
}

/** The drawn lamp on desktop: its shade's button, its art, and the spread's scale now. */
export interface BookLampParts { button: HTMLButtonElement; art: SVGSVGElement; scale(): number }

export function createBookLight(opts: {
  frame: HTMLElement;
  /** The frame's size in frame units (1120 × 640 on desktop; the page's px on a phone, re-measured by refresh). */
  size: { w: number; h: number };
  desk: HTMLElement;
  phone: boolean;
  reduced: boolean;
  /** Spotlight (B) in use, so the first drag (or glide, Task 5) may be timed. */
  timed: boolean;
  onSlow(): void;
  /** The drawn lamp (desktop only). Without it the light can't be aimed and rests where it was last aimed. */
  lamp?: BookLampParts;
}): BookLight {
  const { frame, desk, phone } = opts;
  const lamp = phone ? undefined : opts.lamp;
  const size = { ...opts.size };
  const pool = phone ? BOOK_LIGHT.pool.phone : BOOK_LIGHT.pool.desktop;
  let target: Aim | null = null; // null = at rest
  let held = false, glideTimer = 0;
  const written = new Map<string, string>();
  const put = (key: string, value: string, write: () => void) => { if (written.get(key) !== value) { written.set(key, value); write(); } };

  const restAim = (): Aim => {
    const a = phone ? PHONE_POOL : (readDesk().bookAim ?? BOOK_DEFAULT_AIM);
    return { x: a.x * size.w, y: a.y * size.h };
  };
  const toFrame = (a: Aim): Aim => ({ x: Math.max(0, Math.min(1, a.x)) * size.w, y: Math.max(0, Math.min(1, a.y)) * size.h });
  const clampFrame = (p: Aim): Aim => ({ x: Math.max(0, Math.min(size.w, p.x)), y: Math.max(0, Math.min(size.h, p.y)) });
  const toStored = (p: Aim): Aim => ({ x: Math.round((p.x / size.w) * 1000) / 1000, y: Math.round((p.y / size.h) * 1000) / 1000 });

  /** The drawn lamp's reach, fitted to the gutter by fit() (its place, the head's size and how far it may turn). */
  let reach: LampReach = BOOK_REACH;

  function draw(cur: Aim) {
    // The light comes from the lamp's mouth: the drawn lamp's on desktop (it turns toward the aim), a fixed one on a phone.
    const g = phone ? null : lampGeometry(cur, reach);
    const src = g ? { x: g.mx, y: g.my } : BOOK_LIGHT.source.phone;
    const spot = document.getElementById('book-spot');
    if (spot && spot.isConnected) {
      const set = (n: string, v: number) => put(`spot.${n}`, v.toFixed(1), () => spot.setAttribute(n, v.toFixed(1)));
      set('x', src.x); set('y', src.y); set('pointsAtX', cur.x); set('pointsAtY', cur.y);
    }
    if (g && lamp) {
      const at = (n: number) => n.toFixed(2);
      const arm = lamp.art.querySelector('[data-lamp="arm2"]'), head = lamp.art.querySelector('[data-lamp="head"]');
      put('arm.x2', at(g.px), () => arm?.setAttribute('x2', at(g.px)));
      put('arm.y2', at(g.py), () => arm?.setAttribute('y2', at(g.py)));
      const turn = `translate(${at(g.px)} ${at(g.py)}) rotate(${at(deg(g.ang))})`, scaled = turn + headScale(reach);
      put('head', scaled, () => head?.setAttribute('transform', scaled));
      const b = lamp.button.style;
      put('hit', turn, () => { b.left = `${at(g.px)}px`; b.top = `${at(g.py)}px`; b.transform = `rotate(${at(deg(g.ang))}deg)`; });
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

  // ── Fitting the lamp to the desk: the free space beside the book (from the window's left edge to the book's cover, under
  // the header, above the left page-turn arrow) sets where the hinge goes, how big the head is and how far it may turn
  // (fitBookReach). Where even the smallest head doesn't fit, the lamp is hidden: the ⋯ menu still switches the light, and
  // the pool stays at its resting aim. Run on creation and on every refresh (resize, scale change). ──
  let fitKey = '';
  function applyReach() {
    if (!lamp) return;
    const s = reach.scale ?? 1, el = bookElbow(reach);
    const arm = lamp.art.querySelector('[data-lamp="arm2"]'), lower = lamp.art.querySelector('[data-lamp="lower"]');
    arm?.setAttribute('x1', el.x.toFixed(2)); arm?.setAttribute('y1', el.y.toFixed(2)); arm?.setAttribute('stroke-width', (7 * s).toFixed(2));
    lower?.setAttribute('transform', `translate(${(el.x - ELBOW.x).toFixed(2)} ${(el.y - ELBOW.y).toFixed(2)})`);
    lamp.button.style.setProperty('--lamp-s', String(s));
    lamp.button.style.setProperty('--lamp-q', String(reach.squash ?? 1));
  }
  function fit() {
    if (!lamp) return;
    const f = frame.getBoundingClientRect(), k = f.width / size.w || 1;
    const R = (el: Element | null) => (el ? el.getBoundingClientRect() : null);
    const arrow = R(frame.querySelector('button[aria-label="Previous spread"]')), header = R(document.querySelector('.app-header')), count = R(document.getElementById('page-number-btn'));
    const root = document.documentElement, sx = window.scrollX, sy = window.scrollY;
    // In spread units: the page's left edge, the cover, the header's bottom, the arrow's top (all from viewport px).
    const u = (x: number) => (x - f.left) / k, v = (y: number) => (y - f.top) / k;
    const free: Rect = {
      left: u(-sx), right: -COVER,
      top: v(header ? header.bottom : -sy),
      bottom: v(Math.min(arrow ? arrow.top : Infinity, count ? count.top : Infinity, root.scrollHeight - sy)),
    };
    const key = [free.left, free.top, free.bottom, k].map((n) => n.toFixed(2)).join(' ');
    if (key === fitKey) return;
    fitKey = key;
    const found = fitBookReach(free, MARGINS_PX.map((m) => m / k), size.w, size.h);
    let fits = false;
    if (found) {
      // Check the result against what it must never cover, in page px (as a guard; fitBookReach placed it clear of them).
      const box = shadeReachBox(size.w, size.h, found.reach);
      const pg = (r: DOMRect): Rect => ({ left: r.left + sx, top: r.top + sy, right: r.right + sx, bottom: r.bottom + sy });
      const c = COVER * k;
      const avoid: Rect[] = [{ left: f.left + sx - c, top: f.top + sy - c, right: f.right + sx + c, bottom: f.bottom + sy + c },
        ...[arrow, header, count].filter((r): r is DOMRect => Boolean(r)).map(pg)];
      fits = bookLampFits({ left: f.left + sx + box.left * k, top: f.top + sy + box.top * k, right: f.left + sx + box.right * k, bottom: f.top + sy + box.bottom * k },
        avoid, { w: root.clientWidth, h: Math.max(root.scrollHeight, window.innerHeight) });
      if (fits) { reach = found.reach; applyReach(); }
    }
    lamp.art.toggleAttribute('hidden', !fits);
    lamp.button.toggleAttribute('hidden', !fits);
  }

  // ── The shade: a click switches (React's onClick), a drag aims the light where the pointer is over the spread ──
  let start: { x: number; y: number } | null = null, moved = false, swallowClick = false;
  const timing = () => opts.timed && readDesk().light === undefined;
  const local = (e: PointerEvent): Aim => {
    const r = frame.getBoundingClientRect(), s = lamp?.scale() || 1;
    return { x: (e.clientX - r.left) / s, y: (e.clientY - r.top) / s };
  };
  function aimAt(p: Aim, save: boolean) {
    target = null; // the reader's aim replaces any glide
    loop.setAim(toFrame(toStored(clampFrame(p)))); // what is stored, so the light doesn't jump when it is read back
    if (save) writeDesk({ bookAim: toStored(loop.aim) });
  }
  const down = (e: PointerEvent) => {
    if (e.button !== 0) return;
    start = { x: e.clientX, y: e.clientY }; moved = false;
    if (timing()) loop.startTiming();
    swallowClick = false; // a touch drag is followed by no click, so a flag left from one must not eat this press
    (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
  };
  const move = (e: PointerEvent) => {
    if (!start) return;
    if (!moved && Math.hypot(e.clientX - start.x, e.clientY - start.y) <= TAP_PX) return;
    if (!moved) { moved = true; lamp?.button.setAttribute('data-dragging', 'true'); }
    aimAt(local(e), false);
  };
  const up = () => {
    if (!start) return;
    const wasMoved = moved;
    start = null; lamp?.button.removeAttribute('data-dragging');
    const avg = loop.stopTiming();
    if (!wasMoved) return;
    writeDesk({ bookAim: toStored(loop.aim) });
    // The click that ends a mouse drag must not switch the lamp (it comes in this same input event).
    swallowClick = true;
    window.setTimeout(() => { swallowClick = false; }, 0);
    if (timing() && avg !== null) {
      writeDesk({ light: avg > SLOW_FRAME_MS ? 'A' : 'B' });
      if (avg > SLOW_FRAME_MS) opts.onSlow();
    }
  };
  const cancel = () => { start = null; loop.stopTiming(); lamp?.button.removeAttribute('data-dragging'); };
  const onClick = (e: MouseEvent) => { if (swallowClick) { swallowClick = false; e.stopPropagation(); e.preventDefault(); } };
  const onKey = (e: KeyboardEvent) => {
    const d = e.shiftKey ? KEY_STEP_BIG : KEY_STEP;
    const m = ({ ArrowLeft: [-d, 0], ArrowRight: [d, 0], ArrowUp: [0, -d], ArrowDown: [0, d] } as Record<string, number[]>)[e.key];
    if (m) { e.preventDefault(); aimAt({ x: loop.aim.x + m[0], y: loop.aim.y + m[1] }, true); }
    else if (e.key === 'Home') { e.preventDefault(); aimAt(toFrame(BOOK_DEFAULT_AIM), true); }
  };
  if (lamp) {
    lamp.button.addEventListener('pointerdown', down);
    lamp.button.addEventListener('click', onClick, true);
    lamp.button.addEventListener('keydown', onKey);
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', cancel);
  }

  fit(); // first, so the first drawing is of the fitted lamp
  loop.jump(restAim());

  return {
    glideTo(t) {
      if (start) return; // the reader is dragging the shade: the aim is theirs
      target = t;
      loop.setAim(t ? toFrame(t) : restAim(), EASE_GLIDE);
      // A phone has no drag to time, so the first glide is its slow-device check (and a desktop reader who opens a word before
      // ever dragging the shade is checked here too): while the flag isn't set and B is in use.
      if (timing() && !held && !opts.reduced && !glideTimer) {
        loop.startTiming();
        glideTimer = window.setTimeout(() => {
          glideTimer = 0;
          const avg = loop.stopTiming();
          if (avg === null || !timing()) return;
          writeDesk({ light: avg > SLOW_FRAME_MS ? 'A' : 'B' });
          if (avg > SLOW_FRAME_MS) opts.onSlow();
        }, GLIDE_TIMING_MS);
      }
    },
    hold(on) { held = on; loop.hold(on); },
    refresh() {
      fit();
      if (phone) { size.w = frame.offsetWidth || size.w; size.h = frame.offsetHeight || size.h; }
      if (start) { if (!held) draw(loop.cur); return; } // mid-drag: the aim is the pointer's, not yet stored
      const want = target ? toFrame(target) : restAim();
      if (Math.abs(want.x - loop.aim.x) > 0.05 || Math.abs(want.y - loop.aim.y) > 0.05) loop.jump(want);
      else if (!held) draw(loop.cur);
    },
    destroy() {
      window.clearTimeout(glideTimer); loop.stopTiming();
      loop.destroy(); delete frame.dataset.lightMoving;
      if (lamp) {
        lamp.button.removeEventListener('pointerdown', down);
        lamp.button.removeEventListener('click', onClick, true);
        lamp.button.removeEventListener('keydown', onKey);
        lamp.button.removeAttribute('data-dragging');
        window.removeEventListener('pointermove', move);
        window.removeEventListener('pointerup', up);
        window.removeEventListener('pointercancel', cancel);
      }
    },
  };
}
