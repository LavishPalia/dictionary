import { NextRequest, NextResponse } from 'next/server';
import { nearSpellings, searchWords } from '@/lib/book-data';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const q = (searchParams.get('q') || '').slice(0, 100);

  if (!q.trim()) {
    return NextResponse.json({ results: [] });
  }

  if (searchParams.get('near') === '1') return NextResponse.json({ query: q, results: nearSpellings(q, 3) });

  const results = searchWords(q, 10);
  return NextResponse.json({ query: q, results });
}
