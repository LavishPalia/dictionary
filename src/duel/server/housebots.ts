// The house bots: marked characters that keep the board alive while there are few players (product spec §6.5).
// Computed, never stored: a bot's points follow from its name, the week and the time, so there are no fake rows or
// jobs to run. `base` is a week's points, set so a player with one game a day (a median game scores about 90) lands mid-table.
import { weekEnds } from './week';

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

const BOTS: { name: string; base: number }[] = [
  { name: 'Professor Quill', base: 1500 },
  { name: 'Miss Marginalia', base: 1150 },
  { name: 'Old Owl Ink', base: 900 },
  { name: 'Madam Lexicon', base: 720 },
  { name: 'Uncle Almanac', base: 540 },
  { name: 'Little Bookworm', base: 400 },
  { name: 'Sir Semicolon', base: 270 },
  { name: 'Dame Dogear', base: 150 },
];

export const BOT_NAMES = BOTS.map(b => b.name);

function fnv1a(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 0x01000193);
  return h >>> 0;
}

/** 0–1, the same for the same text. */
const dice = (text: string) => fnv1a(text) / 0x100000000;

/** The share of a bot's week done by `elapsed` (0–1): seven seeded daily steps, so it never falls and it ends at 1. */
function share(name: string, week: string, elapsed: number): number {
  const steps = Array.from({ length: 7 }, (_, d) => 0.4 + dice(`${name}|${week}|${d}`));
  const total = steps.reduce((a, b) => a + b, 0);
  let done = 0;
  for (let d = 0; d < 7; d++) {
    const part = Math.min(1, Math.max(0, elapsed * 7 - d));
    done += steps[d] * part;
  }
  return done / total;
}

export function botsFor(week: string, now: Date): { name: string; points: number }[] {
  const elapsed = Math.min(1, Math.max(0, 1 - (weekEnds(week).getTime() - now.getTime()) / WEEK_MS));
  return BOTS.map(({ name, base }) => {
    const final = base * (0.8 + 0.4 * dice(`${name}|${week}`));
    return { name, points: Math.floor(final * share(name, week, elapsed)) };
  });
}
