// Hourly limits, counted in the database so they hold across server instances. A row lives about an hour.
import { query } from './db';

export async function overLimit(key: string, perHour: number): Promise<boolean> {
  const [row] = await query<{ n: number }>(`select count(*)::int as n from rate_events where key = $1 and at > now() - interval '1 hour'`, [key]);
  return row.n >= perHour;
}

export async function noteEvent(key: string) {
  await query(`delete from rate_events where key = $1 and at <= now() - interval '1 hour'`, [key]);
  await query(`insert into rate_events (key) values ($1)`, [key]);
}

/** Now and then, the rows no key came back for. */
export async function sweepEvents() {
  await query(`delete from rate_events where at <= now() - interval '1 hour'`);
}
