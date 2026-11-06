// What the end screen says (UI-DESIGN §3.4). Practice games have no star to earn.

export function endCopy(o: { you: number; quill: number; practice: boolean; isToday: boolean; starred?: boolean }): { kind: 'win' | 'loss' | 'tie'; title: string; line: string } {
  const star = o.isToday ? 'today’s' : 'this day’s';
  // A replay of a day already won has nothing left to earn, and nothing to lose.
  if (o.starred && o.you <= o.quill) {
    return o.you === o.quill ? { kind: 'tie', title: 'A dead heat', line: `${o.you} all. Your star is safe.` }
      : { kind: 'loss', title: 'So close', line: `Professor Quill wins by ${o.quill - o.you}. Your star is safe.` };
  }
  if (o.you > o.quill) return { kind: 'win', title: 'You win!', line: 'Professor Quill tips his hat.' };
  if (o.you === o.quill) return { kind: 'tie', title: 'A dead heat', line: o.practice ? `${o.you} all.` : `${o.you} all. Replay to break the tie and win the star.` };
  const by = `Professor Quill wins by ${o.quill - o.you}.`;
  return { kind: 'loss', title: 'So close', line: o.practice ? by : `${by} Replay to earn ${star} star.` };
}
