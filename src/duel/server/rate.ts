// Hourly limits, counted in the database so they hold across server instances. A row lives about an hour.
import { query } from './db';

export async function overLimit(key: string, perHour: number): Promise<boolean> {
  const [row] = await query<{ n: number }>(`select count(*)::int as n from rate_events where key = $1 and at > now() - interval '1 hour'`, [key]);
  return row.n >= perHour;
}

/** Spent rows go whoever's they were, so no hash of an address outlives its hour by more than the next event. */
export async function noteEvent(key: string) {
  await query(`delete from rate_events where at <= now() - interval '1 hour'`);
  await query(`insert into rate_events (key) values ($1)`, [key]);
}
