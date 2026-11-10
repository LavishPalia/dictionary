// The lamp's light loop, outside React: a requestAnimationFrame loop eases a point (the light's aim) toward its
// target, calls `draw` each frame, and stops as soon as it settles. Today's desk and the Book page both use it;
// what `draw` writes, and which element shows the "moving" flag, is theirs.
import type { Aim } from '@/lib/desk';

/** A first drag slower than this per frame switches the device to the CSS light (A). */
export const SLOW_FRAME_MS = 24;
/** Following the pointer, and gliding to a place the reader chose or the page picked. */
export const EASE_DRAG = 0.22, EASE_GLIDE = 0.12;
const MIN_FRAMES = 8;

export interface LightLoop {
  /** Where the light is going, and where it is now (both are updated in place). */
  readonly aim: Aim;
  readonly cur: Aim;
  /** Aim at `p`, easing at `ease` per frame. While held, only the target is recorded. */
  setAim(p: Aim, ease?: number): void;
  /** Put the light at `p` at once and draw. */
  jump(p: Aim): void;
  /** While on, nothing draws; when it goes off the light moves to the latest target. */
  hold(on: boolean): void;
  /** Keep the loop running and record frame times, until `stopTiming`. */
  startTiming(): void;
  /** The average ms per frame since `startTiming`, or null with fewer than 8 frames. */
  stopTiming(): number | null;
  destroy(): void;
}

export function createLightLoop(opts: { reduced: boolean; draw(cur: Aim): void; onMoving(moving: boolean): void }): LightLoop {
  const aim: Aim = { x: 0, y: 0 }, cur: Aim = { x: 0, y: 0 };
  let raf = 0, ease = EASE_DRAG, held = false, timing = false, frames: number[] = [], last = 0;

  function tick(t: number) {
    if (timing) { if (last) frames.push(t - last); last = t; }
    const k = opts.reduced ? 1 : ease;
    cur.x += (aim.x - cur.x) * k; cur.y += (aim.y - cur.y) * k;
    if (Math.abs(aim.x - cur.x) < 0.3 && Math.abs(aim.y - cur.y) < 0.3 && !timing) {
      cur.x = aim.x; cur.y = aim.y; opts.draw(cur);
      raf = 0; opts.onMoving(false);
      return;
    }
    opts.draw(cur);
    raf = requestAnimationFrame(tick);
  }
  const go = () => { if (!raf) { opts.onMoving(true); raf = requestAnimationFrame(tick); } };
  const stop = () => { if (raf) { cancelAnimationFrame(raf); raf = 0; opts.onMoving(false); } };

  return {
    aim, cur,
    setAim(p, e = EASE_DRAG) {
      aim.x = p.x; aim.y = p.y; ease = e;
      if (held) return;
      if (opts.reduced) { cur.x = aim.x; cur.y = aim.y; opts.draw(cur); } else go();
    },
    jump(p) {
      stop();
      aim.x = cur.x = p.x; aim.y = cur.y = p.y;
      if (!held) opts.draw(cur);
    },
    hold(on) {
      held = on;
      if (on) { stop(); return; }
      if (opts.reduced) { cur.x = aim.x; cur.y = aim.y; opts.draw(cur); } else go();
    },
    startTiming() { timing = true; frames = []; last = 0; },
    stopTiming() {
      timing = false;
      const f = frames; frames = []; last = 0;
      return f.length >= MIN_FRAMES ? f.reduce((a, b) => a + b, 0) / f.length : null;
    },
    destroy() { if (raf) cancelAnimationFrame(raf); raf = 0; },
  };
}
