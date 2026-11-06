// Input that moves tiles: drag (finger or mouse), tap-to-place and keys. Drag never touches React: a
// floating clone follows the pointer in a rAF loop, and only the drop calls the controller.
import type { CellId } from '../../engine';
import type { Platform } from '../../platform/types';
import type { GameController } from '../controller/controller';
import { arcFrames, centerOf, type FxLayer, type Motion } from './layer';
import { mark } from './perf';
import type { Stage } from './stage';
import { EASE, T } from './timings';

const THRESHOLD = 6, SMOOTH = 0.55, TILT_MAX = 10, TOUCH_LIFT = 30;
const nextFrames = () => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
const cellRect = (r: DOMRect) => new DOMRect(r.left + 2, r.top, r.width - 4, r.height - 4);

interface Drag {
  pid: number;
  /** Where the tile came from: a rack slot, or a cell when it was pending. */
  rackSlot: number;
  fromCell: CellId | null;
  el: HTMLElement;
  letter: string;
  start: { x: number; y: number };
  rect: DOMRect;
  grab: { dx: number; dy: number };
  touch: boolean;
  moved: boolean;
  ghost: HTMLElement | null;
  x: number; y: number; tx: number; ty: number; vx: number; tilt: number; scale: number;
  target: CellId | null;
  raf: number;
}

export class Input {
  private d: Drag | null = null;
  private off: (() => void)[] = [];
  /** Keys run one after another, so a letter is planned only after the one before it has landed. */
  private keys: Promise<unknown> = Promise.resolve();

  constructor(private root: HTMLElement, private stage: Stage, private layer: FxLayer, private ctl: GameController,
    private motion: Motion, private platform: Platform) {
    const on = <K extends keyof HTMLElementEventMap>(t: EventTarget, type: K | string, fn: (e: never) => void, opts?: AddEventListenerOptions) => {
      t.addEventListener(type, fn as EventListener, opts);
      this.off.push(() => t.removeEventListener(type, fn as EventListener, opts));
    };
    on(root, 'pointerdown', (e: PointerEvent) => this.down(e));
    on(root, 'pointermove', (e: PointerEvent) => this.move(e));
    on(root, 'pointerup', (e: PointerEvent) => void this.up(e));
    on(root, 'pointercancel', (e: PointerEvent) => void this.up(e, true));
    on(window, 'resize', () => this.cancel());
    on(window, 'orientationchange', () => this.cancel());
    on(document, 'keydown', (e: KeyboardEvent) => this.key(e));
  }

  detach() { this.cancel(); for (const f of this.off) f(); this.off = []; }

  // ── Drag ──
  private down(e: PointerEvent) {
    if (this.d || e.button > 0 || this.ctl.snapshot().busy) return;
    const el = (e.target as HTMLElement).closest<HTMLElement>('.duel-slot .duel-tile, .duel-tile.pend');
    if (!el) return;
    const snap = this.ctl.snapshot();
    const cellEl = el.closest<HTMLElement>('[data-cell]');
    const fromCell = cellEl ? Number(cellEl.dataset.cell) : null;
    const rackSlot = fromCell !== null
      ? snap.pending.find(t => t.cell === fromCell)?.rackSlot ?? -1
      : Number(el.closest<HTMLElement>('[data-rack]')?.dataset.rack ?? -1);
    const letter = snap.state.racks.you[rackSlot];
    if (rackSlot < 0 || !letter) return;
    const rect = el.getBoundingClientRect();
    const c = centerOf(rect);
    this.d = {
      pid: e.pointerId, rackSlot, fromCell, el, letter, rect, start: { x: e.clientX, y: e.clientY },
      grab: { dx: c.x - e.clientX, dy: c.y - e.clientY }, touch: e.pointerType !== 'mouse', moved: false, ghost: null,
      x: c.x, y: c.y, tx: c.x, ty: c.y, vx: 0, tilt: 0, scale: 1, target: null, raf: 0,
    };
  }

  private move(e: PointerEvent) {
    const d = this.d;
    if (!d || e.pointerId !== d.pid) return;
    if (!d.moved && Math.hypot(e.clientX - d.start.x, e.clientY - d.start.y) < THRESHOLD) return;
    if (!d.moved) this.begin(d);
    const nx = e.clientX + d.grab.dx * 0.4, ny = e.clientY + d.grab.dy * 0.4 - (d.touch ? TOUCH_LIFT : 0);
    d.vx = d.vx * 0.6 + (nx - d.tx) * 0.4;
    d.tx = nx; d.ty = ny;
  }

  private begin(d: Drag) {
    d.moved = true;
    mark('drag', 'start');
    try { this.root.setPointerCapture(d.pid); } catch { /* the pointer may already be gone */ }
    if (this.ctl.snapshot().lifted !== null) this.ctl.lift(null);
    d.ghost = this.layer.tile(d.letter, d.rect, 'lifted');
    d.ghost.style.transformOrigin = '50% 50%';
    d.el.setAttribute('data-fx-hidden', '');
    this.platform.haptics.tick();
    const loop = () => {
      if (this.d !== d || !d.ghost) return;
      d.x += (d.tx - d.x) * SMOOTH;
      d.y += (d.ty - d.y) * SMOOTH;
      d.tilt += (Math.max(-TILT_MAX, Math.min(TILT_MAX, d.vx * 1.2)) - d.tilt) * 0.25;
      const over = this.stage.cellAt(d.tx, d.ty);
      const valid = over !== null && (over === d.fromCell || this.ctl.canPlace(over)) ? over : null;
      const cr = over !== null ? this.stage.rect('cell', over) : undefined;
      const want = cr ? (cr.width * 1.18) / d.rect.width : 1.12;
      d.scale += (want - d.scale) * 0.22;
      d.ghost.style.transform = `translate3d(${d.x - d.rect.width / 2}px,${d.y - d.rect.height / 2}px,0) rotate(${d.tilt}deg) scale(${d.scale})`;
      if (valid !== d.target) {
        if (d.target !== null) this.stage.el('cell', d.target)?.removeAttribute('data-fx-target');
        if (valid !== null && valid !== d.fromCell) this.stage.el('cell', valid)?.setAttribute('data-fx-target', '');
        d.target = valid;
      }
      d.raf = requestAnimationFrame(loop);
    };
    d.raf = requestAnimationFrame(loop);
  }

  private async up(e: PointerEvent, cancelled = false) {
    const d = this.d;
    if (!d || e.pointerId !== d.pid) return;
    this.d = null;
    if (!d.moved) return; // a tap: the click handlers take it
    // The click after a drag would land on the root: swallow it.
    const swallow = (ev: Event) => { ev.stopPropagation(); ev.preventDefault(); };
    this.root.addEventListener('click', swallow, { capture: true, once: true });
    setTimeout(() => this.root.removeEventListener('click', swallow, { capture: true }), 0);
    await this.drop(d, cancelled);
  }

  /** Ends a drag in progress (resize, rotation): the tile goes home. */
  private cancel() {
    const d = this.d;
    if (!d) return;
    this.d = null;
    this.stage.invalidate();
    if (d.moved) void this.drop(d, true);
  }

  private async drop(d: Drag, cancelled: boolean) {
    cancelAnimationFrame(d.raf);
    if (d.target !== null) this.stage.el('cell', d.target)?.removeAttribute('data-fx-target');
    const g = d.ghost!;
    const fromTL = `translate3d(${d.x - d.rect.width / 2}px,${d.y - d.rect.height / 2}px,0) rotate(${d.tilt}deg) scale(${d.scale})`;
    // The ghost scales about its centre: this transform lays it exactly over `r`.
    const onto = (r: DOMRect) => `translate3d(${r.left + r.width / 2 - d.rect.width / 2}px,${r.top + r.height / 2 - d.rect.height / 2}px,0) scale(${r.width / d.rect.width})`;
    const target = cancelled ? null : d.target;

    if (target !== null && target !== d.fromCell) {
      const r = cellRect(this.stage.rect('cell', target)!);
      await this.layer.anim(g, [{ transform: fromTL }, { transform: onto(r) }], { duration: T.drop, easing: EASE.drop });
      const ok = d.fromCell !== null ? this.ctl.move(d.fromCell, target) : this.ctl.place(d.rackSlot, target);
      if (ok) {
        this.platform.sound.play('drop');
        this.platform.haptics.drop();
        await nextFrames();
        g.remove();
        d.el.removeAttribute('data-fx-hidden');
        const pend = this.stage.el('cell', target)?.querySelector('.duel-tile.pend');
        if (pend && !this.motion.reduced) {
          pend.animate([{ transform: 'translateY(-2px) scale(1.12)' }, { transform: 'translateY(-1px) scale(.96)', offset: 0.6 }, { transform: 'translateY(-2px) scale(1)' }],
            { duration: T.settle, easing: EASE.spring });
        }
        mark('drag', 'end');
        return;
      }
    } else if (!cancelled && d.fromCell !== null && this.stage.overRack(d.tx, d.ty)) {
      const slot = this.stage.rect('rack', d.rackSlot)!;
      // Taken back before the flight, so an Enter meanwhile can't submit it (the rack slot is masked until it lands).
      if (this.ctl.takeBack(d.fromCell)) {
        await this.homeFlight(g, d.rackSlot, [{ transform: fromTL }, { transform: onto(slot) }]);
      } else {
        // Refused: the turn was submitted during the drag, and the director now owns the tile's visibility.
        g.remove();
        if (!this.ctl.snapshot().busy) d.el.removeAttribute('data-fx-hidden');
      }
      mark('drag', 'end');
      return;
    }
    // Anything else slides back to where it came from.
    const back = d.fromCell !== null ? cellRect(this.stage.rect('cell', d.fromCell)!) : this.stage.rect('rack', d.rackSlot)!;
    await this.layer.anim(g, [{ transform: fromTL }, { transform: onto(back) }],
      { duration: T.invalidBack, easing: 'cubic-bezier(.3,.8,.3,1.1)' });
    g.remove();
    d.el.removeAttribute('data-fx-hidden');
    mark('drag', 'end');
  }

  // ── Tap-to-place and keys: the tile flies along a short arc, then lands ──
  async flyPlace(rackSlot: number, cell: CellId): Promise<boolean> {
    if (!this.ctl.canPlace(cell)) return false;
    const src = this.stage.el('rack', rackSlot)?.querySelector<HTMLElement>('.duel-tile');
    const letter = this.ctl.snapshot().state.racks.you[rackSlot];
    if (!src || !letter) return this.ctl.place(rackSlot, cell);
    const from = src.getBoundingClientRect();
    const to = cellRect(this.stage.rect('cell', cell)!);
    const g = this.layer.tile(letter, from, 'lifted');
    src.setAttribute('data-fx-hidden', '');
    const frames = this.motion.reduced
      ? [{ transform: `translate3d(${to.left}px,${to.top}px,0) scale(${to.width / from.width})` }]
      : arcFrames({ x: from.left, y: from.top }, { x: to.left, y: to.top }, 50, { s0: 1.12, s1: to.width / from.width });
    await this.layer.anim(g, frames, { duration: T.tapArc, easing: 'cubic-bezier(.3,.7,.25,1.08)' });
    const ok = this.ctl.place(rackSlot, cell);
    if (ok) { this.platform.sound.play('drop'); this.platform.haptics.drop(); }
    await nextFrames();
    g.remove();
    src.removeAttribute('data-fx-hidden');
    return ok;
  }

  /**
   * Take back: the pending tile arcs home to its own rack slot, then lands with a small bump (UI-DESIGN §4).
   * It is taken back at once, so Enter, Backspace or a second tap during the flight see it in the rack.
   */
  async flyHome(cell: CellId): Promise<boolean> {
    const snap = this.ctl.snapshot();
    const t = snap.pending.find(x => x.cell === cell);
    const src = this.stage.el('cell', cell)?.querySelector<HTMLElement>('.duel-tile.pend');
    const slot = t && this.stage.rect('rack', t.rackSlot);
    const letter = t && snap.state.racks.you[t.rackSlot];
    if (snap.busy || !t || !src || !slot || !letter) return this.ctl.tapCell(cell);
    const from = src.getBoundingClientRect();
    const g = this.layer.tile(letter, from, 'lifted');
    if (!this.ctl.takeBack(cell)) { g.remove(); return false; }
    const frames = this.motion.reduced
      ? [{ transform: `translate3d(${slot.left}px,${slot.top}px,0) scale(${slot.width / from.width})` }]
      : arcFrames({ x: from.left, y: from.top }, { x: slot.left, y: slot.top }, 40, { s0: 1.06, s1: slot.width / from.width });
    await this.homeFlight(g, t.rackSlot, frames);
    return true;
  }

  /** Flies a clone into a rack slot whose tile is already back (masked until the clone lands), then bumps it. */
  private async homeFlight(g: HTMLElement, rackSlot: number, frames: Keyframe[]) {
    const slotEl = this.stage.el('rack', rackSlot);
    slotEl?.setAttribute('data-fx-homing', '');
    await this.layer.anim(g, frames, { duration: T.takeBack, easing: EASE.home });
    this.platform.sound.play('drop');
    slotEl?.removeAttribute('data-fx-homing');
    await nextFrames();
    g.remove();
    const home = slotEl?.querySelector('.duel-tile');
    if (home && !this.motion.reduced) home.animate([{ transform: 'scale(1.08)' }, { transform: 'scale(.97)', offset: 0.6 }, { transform: 'scale(1)' }], { duration: T.settle, easing: EASE.spring });
  }

  /** A tap on a letter cell: place the lifted tile with a flight, send a pending tile home, or let the controller handle it. */
  tapCell(cell: CellId) {
    const snap = this.ctl.snapshot();
    if (snap.lifted !== null && this.ctl.canPlace(cell)) { this.ctl.closeZoom(); void this.flyPlace(snap.lifted, cell); }
    else if (snap.lifted === null && !snap.busy && snap.pending.some(t => t.cell === cell)) { this.ctl.closeZoom(); void this.flyHome(cell); }
    else this.ctl.tapCell(cell);
  }

  // ── Keyboard (desktop) ──
  private key(e: KeyboardEvent) {
    this.platform.sound.unlock(); // a key press counts as a user activation: keyboard players get sound too
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const snap = this.ctl.snapshot();
    if (snap.busy || snap.sheet || snap.state.over || document.getElementById('duel-coach')) return;
    const active = document.activeElement as HTMLElement | null;
    if (active && /^(INPUT|TEXTAREA|SELECT)$/.test(active.tagName)) return;
    const onBoard = !!active?.closest('.duel-board');
    // A screen's heading holds focus when it opens: nothing is really focused yet.
    const nowhere = !active || active === document.body || active.matches('h1[tabindex="-1"]');
    const queue = (fn: () => unknown) => { this.keys = this.keys.then(fn, fn); };
    if (/^[a-z]$/i.test(e.key)) {
      if (!snap.selected) return;
      e.preventDefault();
      queue(() => { const plan = this.ctl.planType(e.key); return plan && this.flyPlace(plan.rackSlot, plan.cell); });
    } else if (e.key === 'Backspace') {
      e.preventDefault();
      queue(() => this.ctl.backspace());
    } else if (e.key === 'Enter' && (onBoard || nowhere || active?.closest('.duel-cluelist'))) {
      e.preventDefault();
      queue(() => { void this.ctl.submit(); });
    } else if (e.key === 'Tab' && (onBoard || (nowhere || active?.closest('.duel-cluelist')) && document.querySelector('.duel-cluelist'))) {
      // On the board (or the desktop's clue list), Tab moves between answers; past the last (or first) one it leaves as usual.
      if (!this.ctl.selectNext(e.shiftKey ? -1 : 1)) return;
      e.preventDefault();
      // Focus moves now, not on the next frame: a late focus could pull it back after a later Tab left the board.
      const cell = this.ctl.selectedCell();
      if (cell !== null) this.stage.el('cell', cell)?.focus();
    } else if (e.key === 'Escape') {
      this.ctl.tapOutside();
    }
  }
}
