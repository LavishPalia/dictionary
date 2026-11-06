// The effects layer: one fixed, click-through element outside the React tree. Flying tiles, chips,
// streaks, seals, confetti, cards and toasts live here, are animated with Web Animations (transform and
// opacity only), and are removed when done.
import { CONFETTI, EASE, T, type Pace } from './timings';

export interface Pt { x: number; y: number }
export interface Motion { reduced: boolean; tier: 'normal' | 'lite'; pacing?: Pace }

export const centerOf = (r: DOMRect): Pt => ({ x: r.left + r.width / 2, y: r.top + r.height / 2 });

/** Keyframes along a curved path from a to b (a quadratic arc lifted `lift` px above both ends). */
export function arcFrames(a: Pt, b: Pt, lift: number,
  { s0 = 1, s1 = 1, r0 = 0, r1 = 0, o0 = 1, o1 = 1 } = {}, n = 18): Keyframe[] {
  const cx = (a.x + b.x) / 2, cy = Math.min(a.y, b.y) - lift;
  const f: Keyframe[] = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n, u = 1 - t;
    const x = u * u * a.x + 2 * u * t * cx + t * t * b.x, y = u * u * a.y + 2 * u * t * cy + t * t * b.y;
    f.push({ transform: `translate3d(${x}px,${y}px,0) rotate(${r0 + (r1 - r0) * t}deg) scale(${s0 + (s1 - s0) * t})`, opacity: o0 + (o1 - o0) * t });
  }
  return f;
}

const at = (p: Pt, extra = '') => `translate3d(${p.x}px,${p.y}px,0) ${extra}`;

export class FxLayer {
  readonly root: HTMLElement;
  /** Screen readers hear toasts here; the layer itself is hidden from them. */
  private live: HTMLElement;

  constructor(public motion: Motion) {
    this.root = document.createElement('div');
    this.root.className = 'duel-fx';
    this.root.setAttribute('aria-hidden', 'true');
    this.live = document.createElement('div');
    this.live.className = 'duel-sr';
    this.live.setAttribute('aria-live', 'polite');
    document.body.append(this.root, this.live);
  }

  destroy() { this.root.remove(); this.live.remove(); }

  /** A duration as the current motion setting allows (reduced: 120 ms at most). */
  dur(ms: number) { return this.motion.reduced ? Math.min(ms, T.reducedMax) : ms; }

  wait(ms: number) { return new Promise<void>(r => setTimeout(r, ms)); }

  anim(el: Element, frames: Keyframe[], opts: KeyframeAnimationOptions & { duration: number }): Promise<void> {
    const a = el.animate(frames, { fill: 'forwards', ...opts, duration: this.dur(opts.duration) });
    return a.finished.then(() => undefined, () => undefined);
  }

  add(cls: string, text = ''): HTMLElement {
    const d = document.createElement('div');
    d.className = cls;
    if (text) d.textContent = text;
    this.root.appendChild(d);
    return d;
  }

  /** A wooden tile the size of `r`, placed over it. */
  tile(letter: string, r: DOMRect, cls = ''): HTMLElement {
    const d = this.add(`duel-tile fx-tile ${cls}`);
    d.style.width = `${r.width}px`;
    d.style.height = `${r.height}px`;
    d.style.setProperty('--fs', `${Math.round(r.height * 0.56)}px`);
    const lt = document.createElement('span');
    lt.className = 'lt';
    lt.textContent = letter;
    d.appendChild(lt);
    d.style.transform = at({ x: r.left, y: r.top });
    return d;
  }

  /**
   * A chip ("+1", "−1", "+5") that pops, flies straight to `to` with a glowing streak behind it, and merges in.
   * kind: ok = green (every point you win: tiles, words, Empty hand), neg = red.
   */
  async chip(from: Pt, to: Pt, n: number, kind: 'ok' | 'neg', { big = false, delay = 0, scale = 1 } = {}) {
    const chip = this.add(`chip ${kind}${big ? ' big' : ''}`, `${n > 0 ? '+' : '−'}${Math.abs(n)}`);
    const dx = to.x - from.x, dy = to.y - from.y, dist = Math.hypot(dx, dy), ang = Math.atan2(dy, dx) * 180 / Math.PI;
    let rot = ang + 90;
    if (rot > 180) rot -= 360;
    if (rot > 90) rot -= 180;
    if (rot < -90) rot += 180;
    chip.style.transform = at(from, 'scale(.5)');
    chip.style.opacity = '0';
    await this.anim(chip, [{ transform: at(from, 'scale(.5)'), opacity: 0.5 }, { transform: at(from, `rotate(${rot}deg) scale(1.1)`), opacity: 1 }],
      { duration: T.chipPop * scale, delay, easing: 'ease-out' });
    let trail: HTMLElement | null = null;
    if (!this.motion.reduced) {
      trail = this.add(`trail ${kind}${this.motion.tier === 'lite' ? ' lite' : ''}`);
      trail.style.width = `${dist}px`;
      void this.anim(trail, [{ transform: at(from, `rotate(${ang}deg) scaleX(0)`) }, { transform: at(from, `rotate(${ang}deg) scaleX(1)`) }],
        { duration: T.chipFly * scale, easing: EASE.chip });
    }
    await this.anim(chip, [{ transform: at(from, `rotate(${rot}deg) scale(1.1)`) }, { transform: at(to, `rotate(${rot}deg) scale(.85)`) }],
      { duration: T.chipFly * scale, easing: EASE.chip });
    if (trail) { const t = trail; void this.anim(t, [{ opacity: 1 }, { opacity: 0 }], { duration: 320, easing: 'ease-out' }).then(() => t.remove()); }
    await this.anim(chip, [{ transform: at(to, `rotate(${rot}deg) scale(.85)`), opacity: 1 }, { transform: at(to, 'scale(.15)'), opacity: 0 }],
      { duration: T.chipMerge * scale, easing: 'ease-in' });
    chip.remove();
  }

  /** Paper confetti bursting from a point, with gravity. None with reduced motion. */
  confetti(c: Pt) {
    if (this.motion.reduced) return;
    const cols = ['#f3e8c9', '#c9a24a', '#7a2b22', '#1e4887', '#e8d3a0', '#3d5a2a'];
    const count = CONFETTI[this.motion.tier];
    for (let i = 0; i < count; i++) {
      const p = this.add(`confetto${i % 3 === 0 ? ' round' : ''}`);
      p.style.background = cols[i % cols.length];
      const ang = -Math.PI / 2 + (Math.random() - 0.5) * 2.6, sp = 120 + Math.random() * 170;
      const dx = Math.cos(ang) * sp, dy = Math.sin(ang) * sp, rot = (Math.random() - 0.5) * 900;
      const fr: Keyframe[] = [];
      for (let k = 0; k <= 10; k++) {
        const t = k / 10;
        fr.push({ transform: `translate3d(${c.x + dx * t * 1.1 + Math.sin(t * 9 + i) * 10}px,${c.y + dy * t + 380 * t * t}px,0) rotate(${rot * t}deg) rotateX(${t * 720}deg)`, opacity: t > 0.75 ? (1 - t) * 4 : 1 });
      }
      void this.anim(p, fr, { duration: 1300 + Math.random() * 500, easing: 'linear' }).then(() => p.remove());
    }
  }

  /** A parchment card in the middle of the screen. */
  card(cls: string, build: (el: HTMLElement) => void): HTMLElement {
    const c = this.add(`fx-card ${cls}`);
    build(c);
    return c;
  }

  toast(text: string) {
    const t = this.add('fx-toast', text);
    this.live.textContent = text;
    void this.anim(t, [{ opacity: 0, transform: 'translate(-50%, 60%)' }, { opacity: 1, transform: 'translate(-50%, 0)' }], { duration: 250, easing: EASE.out });
    setTimeout(() => { void this.anim(t, [{ opacity: 1 }, { opacity: 0 }], { duration: 200 }).then(() => t.remove()); }, T.toast);
  }
}
