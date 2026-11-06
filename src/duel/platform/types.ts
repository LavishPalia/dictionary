// What the Duel needs from the place it runs in (Panna on the web now, a native shell later).
// The UI reaches storage, sound, haptics, puzzles and help only through these ports.
import type { Puzzle } from '../engine';
import type { Board, CachedWeek, DuelPlayer, Me, OutboxGame, WeekPick } from '../net-rules';

export interface Storage {
  /** The parsed value, or null when it's missing or not valid JSON. */
  get<T>(key: string): T | null;
  /** True when something is stored under the key, even something unreadable. */
  has(key: string): boolean;
  set(key: string, v: unknown): void;
  remove(key: string): void;
}

export type SoundName = 'lift' | 'drop' | 'chip' | 'coin' | 'word' | 'wrong' | 'bonus' | 'rack' | 'think' | 'thud' | 'chime' | 'seal' | 'crown';
export interface Sound {
  /** `step` raises a chip's note by that many semitones. */
  play(name: SoundName, step?: number): void;
  /** Browsers only start audio after a user activation: called on every pointerup and key press (cheap, idempotent). */
  unlock(): void;
  /** For the lab: which file a sound uses, or null for the synthesised one. */
  choose(name: SoundName, file: { src: string; gain?: number } | null): void;
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
  earn(gain: { hint: number; word: number }): void;
}

export type SaveResult = 'saved' | 'unknown' | 'offline' | 'full';

/** Panna's word pages and review deck. */
export interface PannaBridge {
  wordHref(word: string): string;
  isSaved(word: string): boolean;
  /** Adds it to the review deck, or says why not. */
  save(word: string): Promise<SaveResult>;
  remove(word: string): void;
}

/** The leaderboard's server. Nothing here throws: being offline is an ordinary answer. */
export interface DuelNet {
  /** Queues a finished game (saved before anything is sent) and tries to send it. */
  enqueue(game: OutboxGame): void;
  /** Sends what's queued. A game stays queued until the server has answered for it. */
  flush(): Promise<void>;
  player(): DuelPlayer | null;
  /** The last known total and rank for the current week. */
  week(): CachedWeek | null;
  unsent(): OutboxGame[];
  /** `unsaved`: the device is too full to keep it, so it lasts only while this page is open. */
  statusOf(puzzle: string, seed: number): 'sent' | 'waiting' | 'unsaved' | 'rejected';
  /** The week the server counted this game for, if it answered during this visit. */
  creditOf(puzzle: string, seed: number): string | null;
  /** The copy on this device, to show at once. */
  lastBoard(week: WeekPick): Board | null;
  /** `stale`: this is the last copy, because the server couldn't be reached. */
  board(week: WeekPick): Promise<{ data: Board | null; stale: boolean }>;
  me(week: WeekPick): Promise<Me | null>;
  rename(name: string): Promise<{ ok: true } | { ok: false; error: string }>;
  /** Remembers what the Ranks screen showed, so the next visit can glide from there. */
  markSeen(rank: number | null, points: number): void;
  subscribe(fn: () => void): () => void;
}

export interface Platform {
  net: DuelNet;
  storage: Storage;
  sound: Sound;
  haptics: Haptics;
  puzzles: PuzzleSource;
  help: HelpWallet;
  panna: PannaBridge;
  reducedMotion(): boolean;
  /** Saves what a game needs to start with no connection. Never rejects; does nothing where it can't. */
  prepareOffline(today: string): Promise<void>;
  /** Where the back arrow goes. */
  exitHref: string;
}
