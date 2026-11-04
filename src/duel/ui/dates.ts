// Dates as the Duel's screens say them, and how they move between screens.

export const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

/** "Thursday, 5 November" */
export function longDate(date: string): string {
  const d = new Date(`${date}T00:00:00Z`);
  return `${DAYS[d.getUTCDay()]}, ${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`;
}

/** "5 November" */
export const dayMonth = (date: string) => `${Number(date.slice(8))} ${MONTHS[Number(date.slice(5, 7)) - 1]}`;

/** "October", from YYYY-MM or a date. */
export const monthName = (date: string) => MONTHS[Number(date.slice(5, 7)) - 1];

/** The month before or after a YYYY-MM. */
export function addMonths(month: string, n: number): string {
  const [y, m] = month.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1 + n, 1)).toISOString().slice(0, 7);
}

/** Moves to another Duel screen without leaving the page. */
export type Nav = (path: string) => void;
