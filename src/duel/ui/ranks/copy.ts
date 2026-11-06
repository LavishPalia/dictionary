// The words around the leaderboard, pure so they can be tested without a screen.

const NAME_ERRORS: Record<string, string> = {
  short: 'At least 3 letters, please.',
  long: 'At most 20 letters, please.',
  chars: 'Use English letters, numbers and spaces.',
  blocked: 'That name isn’t allowed. Try another, or roll the die.',
  taken: 'Someone already has that name.',
  too_many: 'That’s a lot of changes. Try again in a while.',
  offline: 'You’re offline. Try again when you’re connected.',
};

export const nameErrorText = (code: string) => NAME_ERRORS[code] ?? NAME_ERRORS.offline;

export function ordinal(n: number): string {
  const tens = n % 100, ones = n % 10;
  if (tens >= 11 && tens <= 13) return `${n}th`;
  return `${n}${ones === 1 ? 'st' : ones === 2 ? 'nd' : ones === 3 ? 'rd' : 'th'}`;
}

/** "1 d 06 h 12 m" until the week ends. */
export function countdown(endsAt: string, now: Date): string {
  const minutes = Math.max(0, Math.floor((Date.parse(endsAt) - now.getTime()) / 60_000));
  const d = Math.floor(minutes / 1440), h = Math.floor(minutes / 60) % 24, m = minutes % 60;
  const pad = (x: number) => String(x).padStart(2, '0');
  return d > 0 ? `${d} d ${pad(h)} h ${pad(m)} m` : `${pad(h)} h ${pad(m)} m`;
}

export const pointsWord = (n: number) => `${n.toLocaleString('en-IN')} ${n === 1 ? 'point' : 'points'}`;

/** "▲ 3 places today" when you have climbed since the day began. */
export function climbedToday(dayRank: number | null, rank: number | null): string | null {
  if (dayRank === null || rank === null || rank >= dayRank) return null;
  const n = dayRank - rank;
  return `▲ ${n} ${n === 1 ? 'place' : 'places'} today`;
}

export function initials(name: string): string {
  return name.split(' ').filter(Boolean).map(w => w[0]).join('').slice(0, 2).toUpperCase();
}
