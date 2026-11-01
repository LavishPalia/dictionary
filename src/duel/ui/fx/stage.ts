// Where things are on screen. Components register their elements; rects are measured once per layout
// (mount, resize, rotation, font load) and cached, so motion and drag never measure inside a loop.
import type { CellId } from '../../engine';

export type StageKind = 'cell' | 'clue' | 'rack' | 'score' | 'pill' | 'owl' | 'bag' | 'board';

export class Stage {
  private els = new Map<string, HTMLElement>();
  private rects = new Map<string, DOMRect>();
  private cellIds: CellId[] = [];
  private dirty = true;

  private key(kind: StageKind, id: number | string) { return `${kind}:${id}`; }

  register(kind: StageKind, id: number | string, el: HTMLElement | null) {
    const k = this.key(kind, id);
    if (el) this.els.set(k, el); else this.els.delete(k);
    this.dirty = true;
  }

  el(kind: StageKind, id: number | string): HTMLElement | undefined { return this.els.get(this.key(kind, id)); }

  /** Measures every registered element. Called on layout changes only. */
  measure() {
    this.rects.clear();
    this.cellIds = [];
    for (const [k, el] of this.els) {
      this.rects.set(k, el.getBoundingClientRect());
      if (k.startsWith('cell:')) this.cellIds.push(Number(k.slice(5)));
    }
    this.dirty = false;
  }

  /** Marks the cache stale; the next read measures again. */
  invalidate() { this.dirty = true; }

  rect(kind: StageKind, id: number | string): DOMRect | undefined {
    if (this.dirty) this.measure();
    return this.rects.get(this.key(kind, id));
  }

  /** The letter cell under a viewport point, from the cached rects. */
  cellAt(x: number, y: number): CellId | null {
    if (this.dirty) this.measure();
    for (const id of this.cellIds) {
      const r = this.rects.get(`cell:${id}`)!;
      if (x >= r.left && x < r.right && y >= r.top && y < r.bottom) return id;
    }
    return null;
  }

  /** True over the rack (with a little slack above and below). */
  overRack(x: number, y: number): boolean {
    const r = this.rect('rack', 'bar');
    return !!r && x >= r.left && x <= r.right && y >= r.top - 10 && y <= r.bottom + 10;
  }
}
