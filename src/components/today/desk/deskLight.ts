// Moves the desk lamp's light, outside React (its flags are data-moving / data-dragging, which React leaves alone): a requestAnimationFrame loop eases the light toward its aim and
// writes SVG attributes and CSS variables straight to the scene, and stops as soon as it settles (the filter
// redraws only while the light moves). Pointer, keyboard and the slow-device check live here too.
import { aimToScene, clampScene, DEFAULT_AIM, lampGeometry, readDesk, sceneToAim, writeDesk, type Aim } from '@/lib/desk';

/** A first drag slower than this per frame switches the device to the CSS light (A). */
export const SLOW_FRAME_MS = 24;
const TAP_PX = 6;
const KEY_STEP = 20, KEY_STEP_BIG = 60;
const EASE = 0.22;
const deg = (rad: number) => (rad * 180) / Math.PI;

export interface DeskLight { destroy(): void }

export function createDeskLight(scene: HTMLElement, opts: {
  /** The scene's current scale (it is drawn at 940 × 400 and scaled to fit). */
  scale: () => number;
  reduced: boolean;
  /** Spotlight (B) in use, and so the first drag is timed. */
  timed: boolean;
  onSlow: () => void;
}): DeskLight {
  const $ = <T extends Element>(sel: string) => scene.querySelector<T>(sel);
  const lamp = $<HTMLButtonElement>('#desk-lamp');
  const handle = $<HTMLElement>('.desk-pool-handle');
  const aim: Aim = clampScene(aimToScene(readDesk().aim ?? DEFAULT_AIM));
  const cur: Aim = { ...aim };
  let raf = 0;

  function draw() {
    const g = lampGeometry(cur);
    $('[data-lamp="arm2"]')?.setAttribute('x2', String(g.px));
    $('[data-lamp="arm2"]')?.setAttribute('y2', String(g.py));
    $('[data-lamp="head"]')?.setAttribute('transform', `translate(${g.px} ${g.py}) rotate(${deg(g.ang)})`);
    if (lamp) { lamp.style.left = `${g.px}px`; lamp.style.top = `${g.py}px`; lamp.style.transform = `rotate(${deg(g.ang)}deg)`; }
    // the beam: from the shade's mouth out to the edges of the pool
    const nx = -Math.sin(g.ang), ny = Math.cos(g.ang);
    const pts = [[g.mx + nx * 32, g.my + ny * 32], [cur.x + nx * g.r * 0.9, cur.y + ny * g.r * 0.55], [cur.x - nx * g.r * 0.9, cur.y - ny * g.r * 0.55], [g.mx - nx * 32, g.my - ny * 32]];
    $('.desk-beam polygon')?.setAttribute('points', pts.map((p) => p.map((v) => v.toFixed(1)).join(',')).join(' '));
    const grad = $('#desk-beam-grad');
    if (grad) { grad.setAttribute('x1', String(g.mx)); grad.setAttribute('y1', String(g.my)); grad.setAttribute('x2', String(cur.x)); grad.setAttribute('y2', String(cur.y)); }
    scene.style.setProperty('--tx', `${cur.x}px`);
    scene.style.setProperty('--ty', `${cur.y}px`);
    scene.style.setProperty('--rx', `${g.r * 1.15}px`);
    scene.style.setProperty('--ry', `${g.r * 0.8}px`);
    const spot = $('#desk-spot');
    if (spot) {
      spot.setAttribute('x', String(g.mx)); spot.setAttribute('y', String(g.my));
      spot.setAttribute('pointsAtX', String(cur.x)); spot.setAttribute('pointsAtY', String(cur.y));
    }
    if (handle) { handle.style.left = `${cur.x}px`; handle.style.top = `${cur.y}px`; }
  }

  // ── the loop, with the first drag's frame times ──
  let dragging = false, frames: number[] = [], last = 0;
  const timing = () => opts.timed && readDesk().light === undefined;
  function tick(t: number) {
    if (dragging && timing()) { if (last) frames.push(t - last); last = t; }
    const k = opts.reduced ? 1 : EASE;
    cur.x += (aim.x - cur.x) * k; cur.y += (aim.y - cur.y) * k;
    if (Math.abs(aim.x - cur.x) < 0.3 && Math.abs(aim.y - cur.y) < 0.3 && !dragging) {
      cur.x = aim.x; cur.y = aim.y; draw();
      raf = 0; delete scene.dataset.moving;
      return;
    }
    draw();
    raf = requestAnimationFrame(tick);
  }
  const go = () => { if (!raf) { scene.dataset.moving = 'true'; raf = requestAnimationFrame(tick); } };
  function setAim(p: Aim, save = true) {
    Object.assign(aim, clampScene(p));
    if (opts.reduced) { cur.x = aim.x; cur.y = aim.y; draw(); } else go();
    if (save) writeDesk({ aim: sceneToAim(aim) });
  }
  const reset = () => setAim(aimToScene(DEFAULT_AIM));

  // ── dragging the pool or the shade ──
  let start: Aim | null = null, moved = false, fromShade = false, swallowClick = false;
  const local = (e: PointerEvent): Aim => {
    const r = scene.getBoundingClientRect(), s = opts.scale();
    return { x: (e.clientX - r.left) / s, y: (e.clientY - r.top) / s };
  };
  const down = (shade: boolean) => (e: PointerEvent) => {
    if (e.button !== 0) return;
    if (!shade) e.preventDefault();
    start = local(e); moved = false; fromShade = shade; dragging = true; frames = []; last = 0;
    (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
  };
  const move = (e: PointerEvent) => {
    if (!start) return;
    const p = local(e);
    if (!moved && Math.hypot(p.x - start.x, p.y - start.y) <= TAP_PX) return;
    if (!moved) { moved = true; scene.dataset.dragging = 'true'; }
    if (fromShade) { // aim along the pull, a little ahead of the pointer
      const g = lampGeometry(cur);
      setAim({ x: p.x + (p.x - g.px) * 0.6, y: p.y + (p.y - g.py) * 0.6 + 40 }, false);
    } else setAim(p, false);
  };
  const up = (e: PointerEvent) => {
    if (!start) return;
    const wasMoved = moved, shade = fromShade;
    start = null; dragging = false; delete scene.dataset.dragging;
    if (wasMoved) {
      writeDesk({ aim: sceneToAim(aim) });
      if (shade) swallowClick = true; // the click that ends a drag must not switch the lamp
      if (timing() && frames.length >= 8) {
        const avg = frames.reduce((a, b) => a + b, 0) / frames.length;
        writeDesk({ light: avg > SLOW_FRAME_MS ? 'A' : 'B' });
        if (avg > SLOW_FRAME_MS) opts.onSlow();
      }
    } else if (!shade && handle) {
      // A tap on the pool is meant for whatever lies under it (the book).
      handle.style.pointerEvents = 'none';
      const under = document.elementFromPoint(e.clientX, e.clientY) as HTMLElement | null;
      handle.style.pointerEvents = '';
      under?.click();
    }
    go();
  };
  const cancel = () => { start = null; dragging = false; delete scene.dataset.dragging; };
  const onLampClick = (e: MouseEvent) => { if (swallowClick) { swallowClick = false; e.stopPropagation(); e.preventDefault(); } };
  const onKey = (e: KeyboardEvent) => {
    const d = e.shiftKey ? KEY_STEP_BIG : KEY_STEP;
    const m = ({ ArrowLeft: [-d, 0], ArrowRight: [d, 0], ArrowUp: [0, -d], ArrowDown: [0, d] } as Record<string, number[]>)[e.key];
    if (m) { e.preventDefault(); setAim({ x: aim.x + m[0], y: aim.y + m[1] }); }
    else if (e.key === 'Home') { e.preventDefault(); reset(); }
  };

  const shadeDown = down(true), poolDown = down(false);
  lamp?.addEventListener('pointerdown', shadeDown);
  handle?.addEventListener('pointerdown', poolDown);
  lamp?.addEventListener('click', onLampClick, true);
  lamp?.addEventListener('keydown', onKey);
  lamp?.addEventListener('dblclick', reset);
  handle?.addEventListener('dblclick', reset);
  window.addEventListener('pointermove', move);
  window.addEventListener('pointerup', up);
  window.addEventListener('pointercancel', cancel);
  draw();

  return {
    destroy() {
      if (raf) cancelAnimationFrame(raf);
      lamp?.removeEventListener('pointerdown', shadeDown);
      handle?.removeEventListener('pointerdown', poolDown);
      lamp?.removeEventListener('click', onLampClick, true);
      lamp?.removeEventListener('keydown', onKey);
      lamp?.removeEventListener('dblclick', reset);
      handle?.removeEventListener('dblclick', reset);
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', cancel);
    },
  };
}
