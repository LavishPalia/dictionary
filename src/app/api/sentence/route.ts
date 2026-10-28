import { NextRequest, NextResponse } from 'next/server';
import { analyseSentence } from '@/lib/book-data';
import { cleanShared } from '@/lib/sentence';

export async function GET(request: NextRequest) {
  const p = new URL(request.url).searchParams;
  const cap = (k: string) => (p.get(k) || '').slice(0, 2000);
  const shared = cleanShared({ text: cap('text'), title: cap('title'), url: cap('url') });
  const body = shared.kind === 'text' ? analyseSentence(shared.text, shared.truncated) : { kind: shared.kind };
  return NextResponse.json(body, { headers: { 'Cache-Control': 'public, max-age=300' } });
}
