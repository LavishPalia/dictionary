// The Duel's data shapes. Everything here is plain JSON, so puzzles and games can be
// saved, sent to the server and replayed as they are.

/** r * cols + c on the full board, clue border included. */
export type CellId = number;
/** dir:row:col of the slot's first letter cell, e.g. "a:1:1". */
export type SlotId = string;

export interface Clue {
  kind: 'def' | 'rel' | 'gap' | 'pic' | 'picmath' | 'abbr';
  text?: string;
  img?: string;
  math?: string;
  /** The whole clue in words, for the zoom and for screen readers. */
  full: string;
}

/** The exact sense the clue was written from (shown on the end screen). */
export interface Sense { en: string; hi: string; entryId?: number }

export interface Slot {
  id: SlotId;
  dir: 'a' | 'd';
  cells: CellId[];
  answer: string;
  clueCell: CellId;
  clue: Clue;
  sense: Sense;
}

export interface Puzzle {
  id: string;
  version: number;
  rows: number;
  cols: number;
  /** Letter cells only, 'A'–'Z'. */
  solution: Record<CellId, string>;
  clueCells: CellId[];
  given: CellId[];
  slots: Slot[];
}
