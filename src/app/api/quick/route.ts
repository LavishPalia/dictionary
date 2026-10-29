import { NextRequest } from 'next/server';
import { quickText } from '@/lib/quick';

export async function GET(request: NextRequest) {
  const q = (new URL(request.url).searchParams.get('q') || '').slice(0, 2000);
  return new Response(quickText(q), {
    headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'public, max-age=86400' },
  });
}
