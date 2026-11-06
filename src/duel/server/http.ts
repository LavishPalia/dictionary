// What every Duel endpoint shares: JSON replies, size-limited bodies and a clean answer when the database is away.
import { DbUnavailable } from './db';

export function json(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...headers } });
}

/** The parsed body; a bad one becomes the reply to send. */
export async function readJson(req: Request, maxBytes: number): Promise<{ body: unknown } | { reply: Response }> {
  const text = await req.text();
  if (Buffer.byteLength(text) > maxBytes) return { reply: json({ error: 'too_large' }, 413) };
  try { return { body: JSON.parse(text) }; } catch { return { reply: json({ error: 'bad_request' }, 400) }; }
}

export async function guard(fn: () => Promise<Response>): Promise<Response> {
  try {
    return await fn();
  } catch (e) {
    if (e instanceof DbUnavailable) return json({ error: 'unavailable' }, 503);
    console.error('Duel API error:', e instanceof Error ? e.message : 'unknown');
    return json({ error: 'server_error' }, 500);
  }
}
