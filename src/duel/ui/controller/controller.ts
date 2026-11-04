// The game controller: the engine state plus the screen's resting state (pending tiles, selection, sheets).
// Plain TypeScript with no DOM, so it is unit-tested in Node. React reads snapshots; the director plays the
// motion. A snapshot changes only at rest: never while a director promise is pending.
import { apply, botTurn, newGame, replay, RULES_ID, type Action, type CellId, type GameEvent, type GameState, type Puzzle, type SlotId } from '../../engine';
import type { Platform } from '../../platform/types';
import { gameKey, readResults, RESULTS_KEY, type DuelResult } from '../../progress';
import { nextEmpty, slotsThrough, wordCandidates } from './selectors';
import type { Director, Pending, SavedGame, Sheet, Snapshot } from './types';

const RESTORE_TOAST = "That game couldn't be restored, so here's a fresh one.";
const HINT_ON_TOAST = 'Hint is on until you end this turn';

const randomSeed = () => crypto.getRandomValues(new Uint32Array(1))[0];
const isTurnEnd = (a: Action) => a.t === 'submit' || a.t === 'pass' || a.t === 'swap';

/** Events up to the refill play before the new state shows; the refill, turn and game over after it. */
function split(events: GameEvent[]): [GameEvent[], GameEvent[]] {
  const i = events.findIndex(e => e.e === 'refill' || e.e === 'turn' || e.e === 'gameOver');
  return i < 0 ? [events, []] : [events.slice(0, i), events.slice(i)];
}

/** The rack slots that got new tiles in your turn: from the bag after a submit, or from a swap. */
function newTiles(events: GameEvent[]): { slots: number[]; how: 'refill' | 'swap' } {
  for (const e of events) {
    if (e.e === 'swapped') return { slots: e.rackSlots, how: 'swap' };
    if (e.e === 'refill' && e.who === 'you') return { slots: e.rackSlots, how: 'refill' };
  }
  return { slots: [], how: 'refill' };
}

/** A hint lasts until the turn ends, so it is on when the log has one after the last turn-ending action. */
function hintIsOn(log: Action[]): boolean {
  for (let i = log.length - 1; i >= 0; i--) {
    if (log[i].t === 'hint') return true;
    if (isTurnEnd(log[i])) return false;
  }
  return false;
}

export class GameController {
  private snap: Snapshot;
  private listeners = new Set<() => void>();
  private startedAt = new Date().toISOString();
  /** The last letter cell tapped, so a second tap flips between across and down. */
  private lastTap: CellId | null = null;
  private readonly key: string;

  private readonly practice: boolean;

  /** `practice`: the date has no daily puzzle, so a finished game wins nothing. */
  constructor(private p: Puzzle, private date: string, private platform: Platform, private director: Director, opts: { seed?: number; practice?: boolean } = {}) {
    this.key = gameKey(date);
    this.practice = opts.practice ?? false;
    const state = this.restore() ?? this.fresh(opts.seed ?? randomSeed());
    this.snap = this.rest(state);
  }

  // ── The store React reads ──
  snapshot = (): Snapshot => this.snap;
  subscribe = (fn: () => void): (() => void) => { this.listeners.add(fn); return () => { this.listeners.delete(fn); }; };

  private publish(patch: Partial<Snapshot>) {
    this.snap = { ...this.snap, ...patch, balance: this.platform.help.balance() };
    for (const fn of this.listeners) fn();
  }

  private rest(state: GameState): Snapshot {
    return {
      state, pending: [], lifted: null, selected: null, zoom: null, lastQuill: state.lastQuill,
      hintOn: hintIsOn(state.log), wordMode: false, sheet: null, busy: false, held: [], balance: this.platform.help.balance(),
    };
  }

  // ── Saving ──
  private restore(): GameState | null {
    const { storage } = this.platform;
    if (!storage.has(this.key)) return null;
    const saved = storage.get<SavedGame>(this.key);
    try {
      // A save from other rules (or Quill tuned differently) would replay to a different board: start afresh instead.
      if (!saved || typeof saved !== 'object' || saved.puzzleId !== this.p.id || saved.puzzleVersion !== this.p.version
        || saved.rules !== RULES_ID || !Number.isInteger(saved.seed) || !Array.isArray(saved.log)) throw new Error('not a save');
      const state = replay(this.p, saved.seed, saved.log);
      this.startedAt = typeof saved.startedAt === 'string' ? saved.startedAt : this.startedAt;
      return state;
    } catch {
      this.director.toast(RESTORE_TOAST);
      return null;
    }
  }

  private fresh(seed: number): GameState {
    this.platform.help.resetForNewGame();
    this.startedAt = new Date().toISOString();
    const state = newGame(this.p, seed);
    this.save(state);
    return state;
  }

  /** `end` is the state after Quill's reply, when it differs from the one whose log is saved. */
  private save(state: GameState, end: GameState = state) {
    const saved: SavedGame = {
      puzzleId: this.p.id, puzzleVersion: this.p.version, rules: RULES_ID, seed: state.seed, log: state.log, startedAt: this.startedAt,
      score: { ...end.scores }, over: end.over,
    };
    this.platform.storage.set(this.key, saved);
  }

  /** A finished daily game joins the results once, as it ends (a reload or Play again adds nothing). */
  private record(end: GameState) {
    if (this.practice) return;
    const { storage } = this.platform;
    const result: DuelResult = {
      date: this.date, puzzle: `${this.p.id}.v${this.p.version}`, you: end.scores.you, quill: end.scores.quill, at: new Date().toISOString(),
    };
    storage.set(RESULTS_KEY, [...readResults(storage.get(RESULTS_KEY)), result]);
  }

  /** Play again: a new deal of the same puzzle. */
  newGame() {
    if (this.snap.busy) return;
    this.lastTap = null;
    this.snap = this.rest(this.fresh(randomSeed()));
    this.publish({});
  }

  // ── Placing tiles ──
  private get locked() { return this.snap.busy || this.snap.state.over; }
  private pendingAt(cell: CellId) { return this.snap.pending.find(t => t.cell === cell); }

  canPlace(cell: CellId): boolean {
    return !this.locked && this.p.solution[cell] !== undefined && !this.snap.state.filled[cell] && !this.pendingAt(cell);
  }

  private inHand(rackSlot: number): boolean {
    return this.snap.state.racks.you[rackSlot] != null && !this.snap.pending.some(t => t.rackSlot === rackSlot);
  }

  lift(rackSlot: number | null): boolean {
    if (this.locked || (rackSlot !== null && !this.inHand(rackSlot))) return false;
    this.publish({ lifted: rackSlot === this.snap.lifted ? null : rackSlot });
    return true;
  }

  place(rackSlot: number, cell: CellId): boolean {
    if (!this.canPlace(cell) || !this.inHand(rackSlot)) return false;
    this.publish({ pending: [...this.snap.pending, { cell, rackSlot }], lifted: null });
    return true;
  }

  move(from: CellId, to: CellId): boolean {
    const t = this.pendingAt(from);
    if (!t || !this.canPlace(to)) return false;
    this.publish({ pending: this.snap.pending.map(x => (x === t ? { ...x, cell: to } : x)) });
    return true;
  }

  takeBack(cell: CellId): boolean {
    if (this.locked || !this.pendingAt(cell)) return false;
    this.publish({ pending: this.snap.pending.filter(t => t.cell !== cell), lifted: null });
    return true;
  }

  takeBackAll() {
    if (this.locked || !this.snap.pending.length) return;
    this.publish({ pending: [], lifted: null });
  }

  // ── Taps and keys ──
  select(slot: SlotId | null) { this.publish({ selected: slot }); }

  tapCell(cell: CellId): boolean {
    if (this.locked) return false;
    if (this.snap.zoom !== null) this.publish({ zoom: null });
    if (this.snap.lifted !== null && this.canPlace(cell)) return this.place(this.snap.lifted, cell);
    if (this.pendingAt(cell)) return this.takeBack(cell);
    const through = slotsThrough(this.p, cell);
    if (!through.length) return false;
    const i = through.findIndex(sl => sl.id === this.snap.selected);
    const next = this.lastTap === cell && i >= 0 ? through[(i + 1) % through.length] : through[0];
    this.lastTap = cell;
    this.publish({ selected: next.id });
    return true;
  }

  tapClue(slot: SlotId) {
    if (this.locked) return;
    const sl = this.p.slots.find(x => x.id === slot);
    if (!sl) return;
    if (this.snap.wordMode) {
      if (wordCandidates(this.p, this.snap.state).includes(slot)) this.publish({ sheet: { k: 'reveal', slot } });
      return;
    }
    this.publish({ zoom: this.snap.zoom === sl.clueCell ? null : sl.clueCell, selected: slot });
  }

  /** Any tap away from the clues closes the zoom (UI-DESIGN §0: it stays until the next tap). */
  closeZoom() { if (this.snap.zoom !== null) this.publish({ zoom: null }); }

  tapOutside() {
    if (this.snap.zoom !== null || this.snap.wordMode) this.publish({ zoom: null, wordMode: false });
  }

  /** Where a typed letter would go: the first rack tile with it, into the selected answer's next empty cell. */
  planType(letter: string): { rackSlot: number; cell: CellId } | null {
    if (this.locked || !this.snap.selected) return null;
    const l = letter.toUpperCase();
    const rackSlot = this.snap.state.racks.you.findIndex((x, i) => x === l && this.inHand(i));
    const cell = nextEmpty(this.p, this.snap.state, this.snap.pending, this.snap.selected);
    return rackSlot >= 0 && cell !== null ? { rackSlot, cell } : null;
  }

  typeLetter(letter: string): boolean {
    const plan = this.planType(letter);
    return plan !== null && this.place(plan.rackSlot, plan.cell);
  }

  /** The selected answer's next empty cell (or its first cell): where keys go, and the board's tab stop. */
  selectedCell(): CellId | null {
    const sl = this.p.slots.find(x => x.id === this.snap.selected);
    if (!sl) return null;
    return nextEmpty(this.p, this.snap.state, this.snap.pending, sl.id) ?? sl.cells[0];
  }

  /** A letter cell got keyboard focus: select an answer through it, unless the selected one already is. */
  focusCell(cell: CellId) {
    const through = slotsThrough(this.p, cell);
    if (through.length && !through.some(sl => sl.id === this.snap.selected)) this.publish({ selected: through[0].id });
  }

  /**
   * Tab / Shift+Tab: the next or previous answer that still has an empty cell. Returns false (and changes
   * nothing) past the last or first one, so Tab can leave the board instead of trapping the keyboard.
   */
  selectNext(dir: 1 | -1): boolean {
    if (this.locked) return false;
    const open = this.p.slots.filter(sl => sl.cells.some(c => !this.snap.state.filled[c]));
    const i = open.findIndex(sl => sl.id === this.snap.selected);
    const next = i < 0 ? (dir > 0 ? open[0] : open[open.length - 1]) : open[i + dir];
    if (!next) return false;
    this.publish({ selected: next.id });
    return true;
  }

  backspace(): boolean {
    const sl = this.p.slots.find(x => x.id === this.snap.selected);
    if (!sl) return false;
    const last = [...sl.cells].reverse().find(c => this.pendingAt(c));
    return last !== undefined && this.takeBack(last);
  }

  // ── Sheets and modes ──
  openSheet(sheet: Sheet) { if (!this.locked) this.publish({ sheet }); }
  closeSheet() { this.publish({ sheet: null }); }

  enterWordMode() {
    if (this.locked) return;
    if (this.platform.help.balance().word <= 0) { this.publish({ sheet: { k: 'help', want: 'word' }, wordMode: false }); return; }
    this.publish({ wordMode: true, zoom: null });
  }

  exitWordMode() { if (this.snap.wordMode) this.publish({ wordMode: false }); }

  // ── Help ──
  async hint() {
    if (this.locked) return;
    if (this.snap.hintOn) { this.director.toast(HINT_ON_TOAST); return; }
    if (!this.platform.help.spend('hint')) { this.publish({ sheet: { k: 'help', want: 'hint' } }); return; }
    const { state } = apply(this.p, this.snap.state, { t: 'hint' });
    this.save(state);
    this.publish({ state, hintOn: true });
  }

  async reveal(slot: SlotId) {
    if (this.locked || !wordCandidates(this.p, this.snap.state).includes(slot)) return;
    if (!this.platform.help.spend('word')) { this.publish({ sheet: { k: 'help', want: 'word' }, wordMode: false }); return; }
    const { state, events } = apply(this.p, this.snap.state, { t: 'reveal', slot });
    this.save(state);
    this.publish({ state, busy: true, sheet: null, wordMode: false, selected: slot });
    const ghosts = events.find(e => e.e === 'ghosts');
    if (ghosts && ghosts.e === 'ghosts') await this.director.ghosts?.(ghosts.cells);
    this.publish({ busy: false });
  }

  // ── Ending a turn ──
  async submit() {
    if (this.locked) return;
    if (!this.snap.pending.length) return this.pass();
    return this.turn({ t: 'submit', place: this.snap.pending.map(t => ({ ...t })) });
  }

  async pass() { if (!this.locked) return this.turn({ t: 'pass' }); }

  async swap(rackSlots: number[]) {
    if (this.locked) return;
    this.takeBackAll();
    this.publish({ sheet: null });
    return this.turn({ t: 'swap', rackSlots });
  }

  /**
   * Your action, then Quill's reply. Both states are worked out and the game is saved before any motion,
   * so closing the tab mid-sequence can neither lose the move nor undo it.
   */
  private async turn(a: Action) {
    let you: { state: GameState; events: GameEvent[] };
    try { you = apply(this.p, this.snap.state, a); } catch { this.director.toast('That move isn’t allowed.'); return; }
    // Quill's reply: one turn, or several in a row once your rack is empty (a player with no tiles gets no turn).
    const quill: { state: GameState; events: GameEvent[] }[] = [];
    for (let s = you.state; !s.over && s.turn === 'quill'; s = quill[quill.length - 1].state) quill.push(botTurn(this.p, s));
    const end = quill[quill.length - 1] ?? you;
    this.save(you.state, end.state);
    if (end.state.over && !this.snap.state.over) this.record(end.state);

    this.lastTap = null;
    this.publish({ busy: true, lastQuill: [], lifted: null, zoom: null, wordMode: false, sheet: null });
    // Your new tiles (a refill, or a swap's) stay out of sight until Quill has moved, so the rack
    // never shows tiles you can't play yet.
    const dealt = newTiles(you.events);
    try {
      const [youNow, youAfter] = split(you.events);
      await this.director.resolve(youNow, 'you', this.snap);
      this.publish({ state: you.state, pending: [], hintOn: false, held: dealt.slots });
      await this.director.arrive(youAfter, 'you', this.snap);

      for (const q of quill) {
        const [qNow, qAfter] = split(q.events);
        await this.director.resolve(qNow, 'quill', this.snap);
        this.publish({ state: q.state, lastQuill: q.state.lastQuill });
        await this.director.arrive(qAfter, 'quill', this.snap);
      }
      if (dealt.slots.length && !end.state.over) {
        await this.director.deal?.(dealt.slots, dealt.how);
        this.publish({ held: [] });
        await this.director.arrive([], 'you', this.snap);
      }
    } catch {
      // A failed animation must never lock the game: the result below is already saved.
    } finally {
      this.publish({ state: end.state, pending: [], hintOn: false, lastQuill: quill.length ? end.state.lastQuill : [], busy: false, held: [] });
    }
  }
}
