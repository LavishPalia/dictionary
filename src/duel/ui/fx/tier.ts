// Quality tiers: "normal" is the prototype as built; "lite" cuts confetti, drops streak glow and
// blur-to-sharp. Chosen from the device at start, and stepped down mid-game if frames run slow.
// Never shown to the player.
import type { Tier } from '../flags';

export function pickTier(nav: { hardwareConcurrency?: number; deviceMemory?: number }): Tier {
  if (nav.hardwareConcurrency !== undefined && nav.hardwareConcurrency <= 4) return 'lite';
  if (nav.deviceMemory !== undefined && nav.deviceMemory <= 3) return 'lite';
  return 'normal';
}

/** More than 8 % of frames over 20 ms, across at least 2 s of animation. */
export function shouldStepDown(deltas: number[]): boolean {
  const total = deltas.reduce((a, b) => a + b, 0);
  if (total < 2000) return false;
  return deltas.filter(d => d > 20).length / deltas.length > 0.08;
}

/** Records frame-to-frame times while an animation sequence plays. */
export class FrameMonitor {
  private deltas: number[] = [];
  private raf = 0;
  private last = 0;

  start() {
    this.deltas = [];
    this.last = 0;
    const step = (now: number) => {
      if (this.last) this.deltas.push(now - this.last);
      this.last = now;
      this.raf = requestAnimationFrame(step);
    };
    this.raf = requestAnimationFrame(step);
  }

  stop(): number[] {
    cancelAnimationFrame(this.raf);
    return this.deltas;
  }
}
