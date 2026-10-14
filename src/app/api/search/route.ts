import { NextRequest, NextResponse } from 'next/server';
import { searchWords } from '@/lib/book-data';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const q = searchParams.get('q') || '';

  if (!q.trim()) {
    return NextResponse.json({ results: [] });
  }

  const results = searchWords(q, 10);
  return NextResponse.json({ query: q, results });
}
