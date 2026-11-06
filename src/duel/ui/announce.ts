// What a screen reader hears: a turn in one sentence, since the motion can't be seen, and the name of each screen.
import type { GameEvent, Puzzle, Who } from '../engine';
import { dayMonth } from './dates';
import type { Route } from './router';

const count = (n: number, one: string) => `${n} ${one}`;

/** One turn in words, with the scores after it. */
export function turnSummary(p: Puzzle, who: Who, events: GameEvent[], before: Record<Who, number>): string {
  const scores = { ...before };
  for (const ev of events) if (ev.e === 'score') scores[ev.who] = ev.to;
  const tally = `You ${scores.you}, Professor Quill ${scores.quill}.`;
  const judged = events.find(e => e.e === 'judged');
  if (who === 'quill') {
    const placed = events.find(e => e.e === 'botPlaced');
    const letters = placed?.e === 'botPlaced' ? placed.tiles.map(t => t.letter).join(', ') : '';
    return letters ? `Professor Quill played ${letters}. ${tally}` : `Professor Quill passed. ${tally}`;
  }
  if (!judged || judged.e !== 'judged') return `You passed. ${tally}`;
  const right = judged.tiles.filter(t => t.ok).length, wrong = judged.tiles.length - right;
  const words = events.flatMap(e => (e.e === 'word' ? [`Finished ${p.slots.find(s => s.id === e.slot)?.answer ?? 'a word'}, plus ${e.points}.`] : []));
  const empty = events.some(e => e.e === 'emptyHand') ? ['Empty hand, plus 5.'] : [];
  return [[count(right, 'right'), ...(wrong ? [count(wrong, 'wrong')] : [])].join(', ') + '.', ...empty, ...words, tally].join(' ');
}

/** The page title of a Duel screen. */
export function screenTitle(route: Route): string {
  if ('date' in route) return `${dayMonth(route.date)} · Panna Duel`;
  if ('redirect' in route) return 'Panna Duel';
  const names: Partial<Record<typeof route.screen, string>> = { settings: 'Settings', how: 'How to play', ranks: 'Ranks' };
  const name = names[route.screen];
  return name ? `${name} · Panna Duel` : 'Panna Duel';
}
