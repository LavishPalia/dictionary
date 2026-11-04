// The controller's shapes: what is saved on the device, what React renders, and what plays the motion.
import type { Action, CellId, GameEvent, GameState, SlotId, Who } from '../../engine';

/** A game in progress on the device. The state is rebuilt from it with replay() on Continue. */
export interface SavedGame {
  puzzleId: string; puzzleVersion: number;
  /** The engine's RULES_ID when the game started; a save from other rules starts afresh. */
  rules: string;
  seed: number; log: Action[]; startedAt: string;
  /** The scores and end after Quill's reply, for Panna's Today card (which doesn't replay the game). */
  score?: { you: number; quill: number }; over?: boolean;
}

export type Sheet = null | { k: 'swap' } | { k: 'help'; want: 'hint' | 'word' } | { k: 'reveal'; slot: SlotId };

export interface Pending { cell: CellId; rackSlot: number }

/** Everything the game screen renders. It changes only at rest, never while motion plays. */
export interface Snapshot {
  /** The settled state on screen (during a sequence, the state from before it). */
  state: GameState;
  /** Tiles placed on the board, not yet submitted. */
  pending: Pending[];
  /** The rack slot lifted for tap-to-place. */
  lifted: number | null;
  /** The answer keys type into. Internal only: it is never highlighted (UI-DESIGN §0). */
  selected: SlotId | null;
  /** The clue cell shown at 2.2×. */
  zoom: CellId | null;
  /** Quill's last move, in blue letters; cleared the moment you press Submit. */
  lastQuill: CellId[];
  hintOn: boolean;
  wordMode: boolean;
  sheet: Sheet;
  /** Input is locked: a sequence is playing. */
  busy: boolean;
  /** Rack slots whose new tiles are not shown yet: they arrive after Quill's turn. */
  held: number[];
  balance: { hint: number; word: number };
}

/** Plays the engine's events as motion. The web one animates; the null one resolves at once. */
export interface Director {
  /** Motion while the old snapshot is still on screen (judging, chips, seals, Quill's tiles). */
  resolve(events: GameEvent[], who: Who, before: Snapshot): Promise<void>;
  /** Motion after the new snapshot is committed (the refill, the turn glow). */
  arrive(events: GameEvent[], who: Who, after: Snapshot): Promise<void>;
  toast(text: string): void;
  /** Your new tiles arrive in these rack slots (after Quill's turn): dropped in from the bag, or popped up after a swap. */
  deal?(rackSlots: number[], how: 'refill' | 'swap'): Promise<void>;
  /** Ghost letters are fading into these cells (already on screen): resolves when they have. */
  ghosts?(cells: CellId[]): Promise<void>;
}
