// What the Duel needs from the place it runs in (Panna on the web now, a native shell later).
// The UI reaches storage, sound, haptics, puzzles and help only through these ports.
import type { Puzzle } from '../engine';

export interface Storage {
  /** The parsed value, or null when it's missing or not valid JSON. */
  get<T>(key: string): T | null;
  /** True when something is stored under the key, even something unreadable. */
  has(key: string): boolean;
  set(key: string, v: unknown): void;
  remove(key: string): void;
}

export type SoundName = 'lift' | 'drop' | 'chip' | 'coin' | 'word' | 'wrong' | 'bonus' | 'rack' | 'think';
export interface Sound {
  /** `step` raises a chip's note by that many semitones. */
  play(name: SoundName, step?: number): void;
  /** Browsers only start audio after a touch: called on the first pointerdown. */
  unlock(): void;
  enabled: boolean;
}

export interface Haptics { tick(): void; drop(): void; wrong(): void; celebrate(): void; enabled: boolean }

/** public/duel/schedule.json, as scripts/duel/build-copy.ts writes it: date → puzzle key → hashed file name. */
export interface ClientSchedule { dates: Record<string, string>; files: Record<string, string> }

/** A date's puzzle; `practice` when the date has no scheduled puzzle and the practice puzzle stands in. */
export interface DatedPuzzle { puzzle: Puzzle; practice: boolean }

export interface PuzzleSource {
  schedule(): Promise<ClientSchedule>;
  /** Rejects when the schedule or the puzzle can't be loaded; never swaps in the practice puzzle for a failure. */
  forDate(date: string): Promise<DatedPuzzle>;
}

export interface HelpWallet {
  balance(): { hint: number; word: number };
  /** Takes one; false when the balance is 0. */
  spend(kind: 'hint' | 'word'): boolean;
  resetForNewGame(): void;
}

export interface Platform {
  storage: Storage;
  sound: Sound;
  haptics: Haptics;
  puzzles: PuzzleSource;
  help: HelpWallet;
  reducedMotion(): boolean;
  /** Where the back arrow goes. */
  exitHref: string;
}
