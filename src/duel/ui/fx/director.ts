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
import { countDur, EASE, scoringScale, T } from './timings';

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
  /** Board cells tinted green or red while their box shows (round 3). */
  private tinted: Element[] = [];
  private monitor = new FrameMonitor();
  /** Drop-in animations on the new rack tiles, held (fill) until React shows the tiles, then cancelled. */
  private dealt: Animation[] = [];
  /** Your score as shown while points land one by one (the engine's floor at 0 applies at every step). */
  private shown = 0;
  /** How quickly the scoring plays right now: it speeds up word by word (timings.ts). */
  private scale = 1;

  constructor(private p: Puzzle, private stage: Stage, private layer: FxLayer, private platform: Platform,
    private motion: Motion, private trace?: string[]) {}

  private note(s: string) { this.trace?.push(s); }
  private wait(ms: number) { return this.layer.wait(ms); }
  /** A scoring duration at the current speed. */
  private sc(ms: number) { return this.layer.dur(ms * this.scale); }

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
    let words = 0;
    this.scale = scoringScale(0, this.motion.pacing);
    await this.wait(this.sc(T.submitPause));
    this.shown = before.state.scores.you;
    for (const ev of events) {
      if (ev.e === 'word') this.scale = scoringScale(words++, this.motion.pacing);
      switch (ev.e) {
        case 'emptyHand': this.note('you:emptyHand'); await this.emptyHand(); break;
        case 'judged': this.note('you:judged'); await this.judge(ev); break;
        case 'word': this.note(`you:word:${ev.points}`); await this.word(ev.slot, ev.points); break;
        case 'score': await this.count(ev.who, ev.to); break;
        default: this.note(`you:${ev.e}`);
      }
    }
  }

  /** Tints the board cells green (or red) while a box shows over them; `null` puts them back. */
  private tint(cells: CellId[], how: 'ok' | 'bad' | null) {
    for (const c of cells) {
      const el = this.stage.el('cell', c);
      if (!el) continue;
      if (how) { el.setAttribute('data-fx-tint', how); this.tinted.push(el); } else el.removeAttribute('data-fx-tint');
    }
  }

  /**
   * All tiles judged at once: a green (or red) box and a ±1 badge on its top-right corner, the letter square
   * tinted to match. After a hold the badges fly to your score one by one, right ones first; each adds as it
   * lands, and its tile is done: the tint goes, a right one becomes a plain board letter, a wrong one goes
   * home to the rack.
   */
  private async judge(ev: Judged) {
    const { sound, haptics } = this.platform;
    const tiles = [...ev.tiles.filter(t => t.ok), ...ev.tiles.filter(t => !t.ok)];
    const clones = tiles.map(t => {
      const cellEl = this.stage.el('cell', t.cell);
      const pend = cellEl?.querySelector('.duel-tile.pend');
      if (pend) { pend.setAttribute('data-fx-hidden', ''); this.hidden.push(pend); }
      const r = inset(this.stage.rect('cell', t.cell)!, 2);
      const clone = this.layer.tile(t.letter, r, t.ok ? 'ok' : 'bad');
      const badge = this.badge(clone, t.ok ? 1 : -1);
      this.tint([t.cell], t.ok ? 'ok' : 'bad');
      if (!t.ok && !this.motion.reduced) {
        const b = topLeft(r);
        void this.layer.anim(clone, [0, -5, 5, -4, 3, 0].map((dx, i) => ({ transform: `translate3d(${b.x + dx}px,${b.y}px,0) rotate(${[0, -4, 4, -2, 0, 0][i]}deg)` })),
          { duration: 380, easing: 'ease-in-out', fill: 'none' });
      }
      return { t, r, clone, badge };
    });
    if (ev.tiles.some(t => t.ok)) sound.play('word');
    if (ev.tiles.some(t => !t.ok)) { sound.play('wrong'); haptics.wrong(); } else haptics.drop();
    await this.wait(this.motion.reduced ? T.judgeHoldReduced : T.judgeHold * this.scale);

    const score = centerOf(this.stage.rect('score', 'you')!);
    await Promise.all(clones.map(async ({ t, r, clone, badge }, i) => {
      await this.flyBadge(badge, { x: r.right, y: r.top }, score, t.ok ? 1 : -1, i * T.chipStagger);
      this.tint([t.cell], null);
      if (t.ok) { this.settled(clone, t.cell, t.letter); return; }
      const slot = this.stage.rect('rack', t.rackSlot);
      clone.classList.remove('bad');
      if (!slot) { clone.remove(); return; }
      const frames = this.motion.reduced
        ? [{ transform: `translate3d(${r.left}px,${r.top}px,0)`, opacity: 1 }, { transform: `translate3d(${slot.left}px,${slot.top}px,0) scale(${slot.width / r.width})`, opacity: 1 }]
        : arcFrames(topLeft(r), topLeft(slot), 50, { s1: slot.width / r.width });
      await this.layer.anim(clone, frames, { duration: T.wrongHome * this.scale, easing: EASE.home });
      this.leftovers.push(clone);
    }));
    await this.wait(this.sc(T.afterChips));
  }

  /** A "+N" or "−N" badge on the top-right corner of a box (a tile, a word, the Empty hand card). */
  private badge(on: HTMLElement, n: number): HTMLElement {
    const b = document.createElement('span');
    b.className = `mark ${n > 0 ? 'up' : 'down'}`;
    b.textContent = `${n > 0 ? '+' : '−'}${Math.abs(n)}`;
    on.appendChild(b);
    return b;
  }

  /** The badge leaves its box and flies to your score, which moves by `n` the moment it lands. */
  private async flyBadge(badge: HTMLElement, from: Pt, to: Pt, n: number, delay = 0) {
    if (delay) await this.wait(this.sc(delay));
    badge.remove();
    await this.layer.chip(from, to, n, n > 0 ? 'ok' : 'neg', { scale: this.scale });
    this.shown = Math.max(0, this.shown + n);
    this.show('you', this.shown);
  }

  /** A right tile is done: its box goes, and it looks like the settled letter React will draw there. */
  private settled(clone: HTMLElement, cell: CellId, letter: string) {
    clone.remove();
    const r = this.stage.rect('cell', cell);
    if (!r) return;
    const d = this.layer.add('fx-settled');
    d.style.width = `${r.width}px`;
    d.style.height = `${r.height}px`;
    d.style.transform = `translate3d(${r.left}px,${r.top}px,0)`;
    const lt = document.createElement('span');
    lt.className = 'lt';
    lt.style.fontSize = `${Math.round(r.height * 0.56)}px`;
    lt.textContent = letter;
    d.appendChild(lt);
    this.leftovers.push(d);
  }

  /**
   * A finished word: one green box around it with "+N" on its top-right corner and its letter squares tinted
   * green. The "+N" flies to your score, the tint goes as it lands, then the box goes.
   */
  private async word(slotId: SlotId, points: number) {
    const slot = this.p.slots.find(s => s.id === slotId);
    if (!slot) return;
    const rects = slot.cells.map(c => this.stage.rect('cell', c)).filter((r): r is DOMRect => Boolean(r));
    if (!rects.length) return;
    const left = Math.min(...rects.map(r => r.left)), top = Math.min(...rects.map(r => r.top));
    const right = Math.max(...rects.map(r => r.right)), bottom = Math.max(...rects.map(r => r.bottom));
    const box = this.layer.add('wordbox');
    box.style.width = `${right - left}px`;
    box.style.height = `${bottom - top}px`;
    box.style.transform = `translate3d(${left}px,${top}px,0)`;
    const badge = this.badge(box, points);
    this.platform.sound.play('word');
    this.platform.haptics.drop();
    this.tint(slot.cells, 'ok');
    await this.layer.anim(box, [{ opacity: 0 }, { opacity: 1 }], { duration: T.boxIn * this.scale, easing: 'ease-out' });
    await this.wait(this.motion.reduced ? T.judgeHoldReduced : T.judgeHold * this.scale);
    await this.flyBadge(badge, { x: right, y: top }, centerOf(this.stage.rect('score', 'you')!), points);
    this.tint(slot.cells, null);
    await this.layer.anim(box, [{ opacity: 1 }, { opacity: 0 }], { duration: T.boxOut * this.scale });
    box.remove();
    await this.wait(this.sc(T.afterChips));
  }

  /** Empty hand: 🎉 and "+5" on a clear background, with confetti; then the "+5" flies to your score like any other badge. */
  private async emptyHand() {
    const card = this.layer.card('empty', (el) => {
      el.innerHTML = '<div class="emo">🎉</div><div class="k">Empty hand</div><div class="s">All 5 tiles played</div>';
    });
    const badge = this.badge(card, 5);
    this.platform.sound.play('bonus');
    this.platform.haptics.celebrate();
    void this.layer.anim(card, [{ transform: 'translate(-50%, -40px) scale(.6)', opacity: 0 },
      { transform: 'translate(-50%, 4px) scale(1.04)', opacity: 1, offset: 0.6 }, { transform: 'translate(-50%, 0)', opacity: 1 }],
      { duration: T.emptyIn, easing: EASE.out });
    const c = card.getBoundingClientRect();
    this.layer.confetti(centerOf(c));
    await this.wait(this.motion.reduced ? 300 : T.emptyHold * this.scale);
    const b = badge.getBoundingClientRect();
    await this.flyBadge(badge, centerOf(b), centerOf(this.stage.rect('score', 'you')!), 5);
    await this.layer.anim(card, [{ opacity: 1 }, { opacity: 0, transform: 'translate(-50%, 10px) scale(.9)' }], { duration: T.boxOut * this.scale });
    card.remove();
  }

  /** Shows a score at once with a small pulse (one badge landing). */
  private show(who: Who, v: number) {
    const el = this.stage.el('score', who);
    if (!el || el.textContent === String(v)) return;
    const up = v > (Number(el.textContent) || 0);
    el.textContent = String(v);
    this.note(`score:${who}:${v}`);
    if (!this.motion.reduced) el.animate([{ transform: 'none' }, { transform: `scale(${up ? 1.3 : 0.86})`, offset: 0.4 }, { transform: 'none' }], { duration: 320, easing: EASE.stamp });
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
    for (const ev of events) this.note(`${who}:${ev.e}`);
  }

  /**
   * Your new tiles, after Quill's turn: they drop into the rack gaps (a refill) or pop up (a swap).
   * React has them on screen but held invisible; these animations end visible and hold there until
   * React shows the tiles, then afterPublish() cancels them.
   */
  async deal(rackSlots: number[], how: 'refill' | 'swap') {
    mark('refill', 'start');
    const swap = how === 'swap';
    const stagger = swap ? T.swapPopStagger : T.refillStagger, dur = swap ? T.swapPop : T.refillSpring;
    const frames: Keyframe[] = this.motion.reduced ? [{ opacity: 0 }, { opacity: 1 }]
      : swap ? [{ transform: 'translateY(40px) scale(.25)', opacity: 0 }, { transform: 'translateY(-18px) scale(1.08)', opacity: 1, offset: 0.7 }, { transform: 'none', opacity: 1 }]
        : [{ transform: 'translateY(-46px) scale(.7)', opacity: 0 }, { opacity: 1, offset: 0.6 }, { transform: 'none', opacity: 1 }];
    await Promise.all(rackSlots.map((i, k) => {
      const tile = this.stage.el('rack', i)?.querySelector('.duel-tile');
      if (!tile) return Promise.resolve();
      setTimeout(() => this.platform.sound.play('rack'), k * stagger + (swap ? 300 : 180));
      const a = tile.animate(frames, { duration: this.layer.dur(dur), delay: this.motion.reduced ? 0 : k * stagger, easing: swap ? 'cubic-bezier(.2,.8,.3,1)' : EASE.spring, fill: 'both' });
      this.dealt.push(a);
      return a.finished.then(() => undefined, () => undefined);
    }));
    mark('refill', 'end');
  }

  /** Ghost letters are already fading in (CSS, 110 ms apart): wait for them. */
  ghosts(cells: CellId[]): Promise<void> {
    return this.wait(this.motion.reduced ? T.reducedMax : (cells.length - 1) * T.ghostStagger + 600);
  }

  /** Waits until React has committed the new snapshot, then drops the stand-in clones. */
  async afterPublish() {
    await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
    for (const el of this.leftovers) el.remove();
    for (const el of this.hidden) el.removeAttribute('data-fx-hidden');
    for (const el of this.tinted) el.removeAttribute('data-fx-tint');
    for (const a of this.dealt) a.cancel();
    this.dealt = [];
    this.leftovers = [];
    this.hidden = [];
    this.tinted = [];
  }
}
