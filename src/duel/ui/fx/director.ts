// The web director: turns the engine's events into the motion of UI-DESIGN §0/§4. It runs between
// snapshots. On React's own elements it only runs Web Animations and sets data-fx-* attributes, both
// cleared before it hands back; everything else happens on clones in the effects layer.
import type { CellId, GameEvent, Puzzle, SlotId, Who } from '../../engine';
import type { Platform } from '../../platform/types';
import type { Director, Snapshot } from '../controller/types';
import { arcFrames, centerOf, type FxLayer, type Motion, type Pt } from './layer';
import { mark } from './perf';
import type { Stage } from './stage';
import { FrameMonitor, shouldStepDown } from './tier';
import { countDur, EASE, T } from './timings';

type Judged = Extract<GameEvent, { e: 'judged' }>;
type BotPlaced = Extract<GameEvent, { e: 'botPlaced' }>;

const REMARKS = ['A wise pause. Over to me.', 'Biding your time? Very well.', 'A breather. My move, then.'];
const OWL_SVG = '<svg width="30" height="30" viewBox="0 0 26 26"><ellipse cx="13" cy="15" rx="8" ry="8.5" fill="#c9d6e8"/><path d="M6 8 L9 11 M20 8 L17 11" stroke="#c9d6e8" stroke-width="2" stroke-linecap="round"/><circle cx="10" cy="13" r="3" fill="#1e3a63"/><circle cx="16" cy="13" r="3" fill="#1e3a63"/><circle cx="10.6" cy="12.4" r="1" fill="#fff"/><circle cx="16.6" cy="12.4" r="1" fill="#fff"/><path d="M12 16 L13 18 L14 16Z" fill="#c9a24a"/></svg>';

const inset = (r: DOMRect, by: number) => new DOMRect(r.left + by, r.top + by - 2, r.width - 2 * by, r.height - 2 * by);
const topLeft = (r: DOMRect): Pt => ({ x: r.left, y: r.top });

export class WebDirector implements Director {
  /** Clones standing in for a final position (a settled letter, a returned tile), removed once React shows it. */
  private leftovers: HTMLElement[] = [];
  private hidden: Element[] = [];
  private monitor = new FrameMonitor();

  constructor(private p: Puzzle, private stage: Stage, private layer: FxLayer, private platform: Platform,
    private motion: Motion, private trace?: string[]) {}

  private note(s: string) { this.trace?.push(s); }
  private wait(ms: number) { return this.layer.wait(ms); }

  toast(text: string) { this.layer.toast(text); }

  // ── Before the new snapshot ──
  async resolve(events: GameEvent[], who: Who, before: Snapshot) {
    const phase = who === 'you' ? 'submit' : 'quill';
    mark(phase, 'start');
    this.monitor.start();
    try {
      if (who === 'you') await this.resolveYou(events, before);
      else await this.resolveQuill(events);
    } finally {
      const frames = this.monitor.stop();
      if (this.motion.tier === 'normal' && shouldStepDown(frames)) this.motion.tier = 'lite';
      mark(phase, 'end');
    }
  }

  private async resolveYou(events: GameEvent[], before: Snapshot) {
    const passed = events.find(e => e.e === 'passed');
    if (passed) {
      for (const e of events) this.note(`you:${e.e}`);
      if (passed.e === 'passed' && passed.streak === 1) await this.remark(REMARKS[Math.floor(Math.random() * REMARKS.length)]);
      return;
    }
    await this.wait(this.layer.dur(T.submitPause));
    for (const ev of events) {
      switch (ev.e) {
        case 'emptyHand': this.note('you:emptyHand'); await this.emptyHand(); break;
        case 'judged': this.note('you:judged'); await this.judge(ev, before); break;
        case 'word': this.note(`you:word:${ev.points}`); await this.word(ev.slot, ev.points); break;
        case 'score': await this.count(ev.who, ev.to); break;
        default: this.note(`you:${ev.e}`);
      }
    }
  }

  /** All tiles judged at once: rings and ±1 badges, a hold, then the badges fly together and wrong tiles go home. */
  private async judge(ev: Judged, before: Snapshot) {
    const { sound, haptics } = this.platform;
    const clones = ev.tiles.map(t => {
      const cellEl = this.stage.el('cell', t.cell);
      const pend = cellEl?.querySelector('.duel-tile.pend');
      if (pend) { pend.setAttribute('data-fx-hidden', ''); this.hidden.push(pend); }
      const r = inset(this.stage.rect('cell', t.cell)!, 2);
      const clone = this.layer.tile(t.letter, r, t.ok ? 'ok' : 'bad');
      const badge = document.createElement('span');
      badge.className = `mark ${t.ok ? 'up' : 'down'}`;
      badge.textContent = t.ok ? '+1' : '−1';
      clone.appendChild(badge);
      if (!t.ok && !this.motion.reduced) {
        const b = topLeft(r);
        void this.layer.anim(clone, [0, -5, 5, -4, 3, 0].map((dx, i) => ({ transform: `translate3d(${b.x + dx}px,${b.y}px,0) rotate(${[0, -4, 4, -2, 0, 0][i]}deg)` })),
          { duration: 380, easing: 'ease-in-out', fill: 'none' });
      }
      return { t, r, clone, badge };
    });
    if (ev.tiles.some(t => t.ok)) sound.play('word');
    if (ev.tiles.some(t => !t.ok)) { sound.play('wrong'); haptics.wrong(); } else haptics.drop();
    await this.wait(this.motion.reduced ? T.judgeHoldReduced : T.judgeHold);

    const score = centerOf(this.stage.rect('score', 'you')!);
    const flights = clones.map(({ t, r, badge }, i) => {
      badge.remove();
      return this.layer.chip({ x: r.right, y: r.top }, score, t.ok ? 1 : -1, t.ok ? 'ok' : 'neg', { delay: i * T.chipStagger });
    });
    const homes = clones.filter(c => !c.t.ok).map(({ t, r, clone }) => {
      const slot = this.stage.rect('rack', t.rackSlot);
      if (!slot) return Promise.resolve();
      clone.classList.remove('bad');
      const frames = this.motion.reduced
        ? [{ transform: `translate3d(${r.left}px,${r.top}px,0)`, opacity: 1 }, { transform: `translate3d(${slot.left}px,${slot.top}px,0) scale(${slot.width / r.width})`, opacity: 1 }]
        : arcFrames(topLeft(r), topLeft(slot), 50, { s1: slot.width / r.width });
      return this.layer.anim(clone, frames, { duration: T.wrongHome, easing: EASE.home });
    });
    await Promise.all([...flights, ...homes]);
    for (const c of clones) this.leftovers.push(c.clone);
    await this.wait(this.layer.dur(T.afterChips));
  }

  /** A finished word: a gold glow across it, a wax seal "+N" stamps on, then flies to your score. */
  private async word(slotId: SlotId, points: number) {
    const slot = this.p.slots.find(s => s.id === slotId);
    if (!slot) return;
    const rects = slot.cells.map(c => this.stage.rect('cell', c)!).filter(Boolean);
    rects.forEach((r, i) => {
      const g = this.layer.add('glow');
      g.style.width = `${r.width}px`; g.style.height = `${r.height}px`;
      g.style.transform = `translate3d(${r.left}px,${r.top}px,0)`;
      void this.layer.anim(g, [{ opacity: 0 }, { opacity: 1, offset: 0.25 }, { opacity: 0 }], { duration: T.wordGlow, delay: i * T.wordGlowStagger, easing: 'ease-out' })
        .then(() => g.remove());
    });
    this.platform.sound.play('word');
    this.platform.haptics.drop();
    const a = centerOf(rects[Math.floor((rects.length - 1) / 2)]), b = centerOf(rects[Math.ceil((rects.length - 1) / 2)]);
    const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    const seal = this.layer.add('seal', `+${points}`);
    await this.layer.anim(seal, [{ transform: `translate3d(${mid.x}px,${mid.y}px,0) scale(2.4) rotate(-18deg)`, opacity: 0 },
      { transform: `translate3d(${mid.x}px,${mid.y}px,0) scale(1) rotate(-6deg)`, opacity: 1 }],
      { duration: T.sealStamp, delay: this.motion.reduced ? 0 : rects.length * 40, easing: EASE.stamp });
    await this.wait(this.layer.dur(T.sealHold));
    seal.remove();
    await this.layer.chip(mid, centerOf(this.stage.rect('score', 'you')!), points, 'gold', { big: true });
  }

  /** Empty hand: a card drops in with confetti and a fanfare, holds, then "+5" flies to your score. */
  private async emptyHand() {
    const card = this.layer.card('empty', (el) => {
      el.innerHTML = '<div class="k">Empty hand</div><div class="big">+5</div><div class="s">Every tile played in one turn</div>';
    });
    this.platform.sound.play('bonus');
    this.platform.haptics.celebrate();
    void this.layer.anim(card, [{ transform: 'translate(-50%, -60px) scale(.6) rotate(-4deg)', opacity: 0 },
      { transform: 'translate(-50%, 6px) scale(1.04) rotate(1deg)', opacity: 1, offset: 0.6 }, { transform: 'translate(-50%, 0)', opacity: 1 }],
      { duration: T.emptyIn, easing: EASE.out });
    const c = card.getBoundingClientRect();
    this.layer.confetti(centerOf(c));
    await this.wait(this.motion.reduced ? 300 : T.emptyHold);
    void this.layer.anim(card, [{ opacity: 1 }, { opacity: 0, transform: 'translate(-50%, 10px) scale(.9)' }], { duration: 220 }).then(() => card.remove());
    await this.layer.chip(centerOf(c), centerOf(this.stage.rect('score', 'you')!), 5, 'gold', { big: true });
  }

  /** Counts a score to its new total (never below 0: the engine's `to` already is). */
  private count(who: Who, to: number): Promise<void> {
    const el = this.stage.el('score', who);
    if (!el) return Promise.resolve();
    const from = Number(el.textContent) || 0;
    this.note(`score:${who}:${to}`);
    if (from === to) return Promise.resolve();
    if (!this.motion.reduced) {
      el.animate([{ transform: 'none' }, { transform: `scale(${to > from ? 1.3 : 0.86})`, offset: 0.4 }, { transform: 'none' }], { duration: 320, easing: EASE.stamp });
    }
    const dur = this.layer.dur(countDur(to - from)), t0 = performance.now();
    let shown = from;
    return new Promise(res => {
      const step = (now: number) => {
        const t = Math.min(1, (now - t0) / dur), e = 1 - Math.pow(1 - t, 3);
        const v = Math.round(from + (to - from) * e);
        if (v !== shown) { shown = v; el.textContent = String(v); this.note(`score:${who}:${v}`); }
        if (t < 1) requestAnimationFrame(step); else res();
      };
      requestAnimationFrame(step);
    });
  }

  /** Quill thinks, his tiles fly in one by one, then only his score moves (§0). */
  private async resolveQuill(events: GameEvent[]) {
    const pill = this.stage.el('pill', 'quill');
    pill?.setAttribute('data-fx-thinking', '');
    this.platform.sound.play('think');
    await this.wait(this.motion.reduced ? T.thinkReduced : T.thinkMin + Math.random() * (T.thinkMax - T.thinkMin));
    pill?.removeAttribute('data-fx-thinking');

    const clones = new Map<CellId, HTMLElement>();
    const fades: Promise<void>[] = [];
    let last: number | null = null;
    for (const ev of events) {
      switch (ev.e) {
        case 'botPlaced': this.note('quill:botPlaced'); await this.botLand(ev, clones); break;
        case 'judged':
          this.note('quill:judged');
          for (const t of ev.tiles) {
            const c = clones.get(t.cell);
            if (!c) continue;
            if (t.ok) this.leftovers.push(c);
            else fades.push(this.layer.anim(c, [{ opacity: 1 }, { opacity: 0 }], { duration: T.quillFade }).then(() => c.remove()));
          }
          break;
        case 'score': last = ev.to; break;
        case 'passed': this.note('quill:passed'); this.layer.toast('Professor Quill has no tiles left and passes.'); break;
        default: break; // no chips, seals or glow for Quill
      }
    }
    // Wrong tiles finish fading before the turn ends, so nothing is left on screen at rest.
    await Promise.all([...fades, last !== null ? this.count('quill', last) : Promise.resolve()]);
  }

  private async botLand(ev: BotPlaced, clones: Map<CellId, HTMLElement>) {
    const owl = this.stage.rect('owl', 'quill');
    for (const t of ev.tiles) {
      const r = inset(this.stage.rect('cell', t.cell)!, 2);
      const clone = this.layer.tile(t.letter, r, 'bot');
      clones.set(t.cell, clone);
      const from = owl ? { x: owl.left + owl.width / 2 - r.width / 2, y: owl.top + owl.height / 2 - r.height / 2 } : topLeft(r);
      const frames = this.motion.reduced
        ? [{ transform: `translate3d(${r.left}px,${r.top}px,0)`, opacity: 0 }, { transform: `translate3d(${r.left}px,${r.top}px,0)`, opacity: 1 }]
        : arcFrames(from, topLeft(r), 70, { s0: 0.35, s1: 1, r0: -14, r1: 0, o0: 0, o1: 1 });
      await this.layer.anim(clone, frames, { duration: T.quillFly, easing: 'cubic-bezier(.3,.6,.3,1)' });
      this.platform.sound.play('drop');
      if (!this.motion.reduced) {
        await this.layer.anim(clone, [{ transform: `translate3d(${r.left}px,${r.top}px,0) scale(1.12)` }, { transform: `translate3d(${r.left}px,${r.top}px,0) scale(.96)`, offset: 0.6 },
          { transform: `translate3d(${r.left}px,${r.top}px,0)` }], { duration: T.settle, easing: EASE.spring });
      }
    }
    await this.wait(this.layer.dur(T.quillAfterLand));
  }

  private async remark(text: string) {
    const card = this.layer.card('remark', (el) => {
      el.innerHTML = `<div class="owlrow"><div class="av owl">${OWL_SVG}</div><div><div class="k">Professor Quill</div><div class="s"></div></div></div>`;
      el.querySelector('.s')!.textContent = `“${text}”`;
    });
    await this.layer.anim(card, [{ opacity: 0, transform: 'translate(-50%, 14px) scale(.96)' }, { opacity: 1, transform: 'translate(-50%, 0)' }], { duration: T.remarkIn, easing: EASE.out });
    await this.wait(this.motion.reduced ? 600 : T.remarkHold);
    await this.layer.anim(card, [{ opacity: 1 }, { opacity: 0 }], { duration: 200 });
    card.remove();
  }

  // ── After the new snapshot ──
  async arrive(events: GameEvent[], who: Who) {
    await this.afterPublish();
    for (const ev of events) {
      this.note(`${who}:${ev.e}`);
      if (ev.e === 'refill' && ev.who === 'you' && ev.rackSlots.length) await this.refill(ev.rackSlots);
    }
  }

  /** New tiles drop into the rack gaps one by one. */
  private async refill(slots: number[]) {
    mark('refill', 'start');
    const drops = slots.map((i, k) => {
      const tile = this.stage.el('rack', i)?.querySelector('.duel-tile');
      if (!tile) return Promise.resolve();
      setTimeout(() => this.platform.sound.play('rack'), k * T.refillStagger + 180);
      const frames = this.motion.reduced
        ? [{ opacity: 0 }, { opacity: 1 }]
        : [{ transform: 'translateY(-46px) scale(.7)', opacity: 0 }, { opacity: 1, offset: 0.6 }, { transform: 'none', opacity: 1 }];
      return this.layer.anim(tile, frames, { duration: T.refillSpring, delay: this.motion.reduced ? 0 : k * T.refillStagger, easing: EASE.spring, fill: 'backwards' });
    });
    await Promise.all(drops);
    mark('refill', 'end');
  }

  /** Waits until React has committed the new snapshot, then drops the stand-in clones. */
  async afterPublish() {
    await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
    for (const el of this.leftovers) el.remove();
    for (const el of this.hidden) el.removeAttribute('data-fx-hidden');
    this.leftovers = [];
    this.hidden = [];
  }
}
