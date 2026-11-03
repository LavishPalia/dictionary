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
  /** Browsers only start audio after a user activation: called on every pointerdown, pointerup and key press (cheap, idempotent). */
  unlock(): void;
  enabled: boolean;
}

export interface Haptics { tick(): void; drop(): void; wrong(): void; celebrate(): void; enabled: boolean }

export interface PuzzleSource { forDate(date: string): Promise<Puzzle> }

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
