import { NextRequest, NextResponse } from 'next/server';
import { getMeta, locateWords } from '@/lib/book-data';

// GET /api/locate?w=calm&w=heal → { data_version, pages: { calm: 9, heal: 21 } }: where words are in the current book.
export async function GET(request: NextRequest) {
  const words = new URL(request.url).searchParams.getAll('w');
  return NextResponse.json({ data_version: getMeta().data_version, pages: locateWords(words) }, {
    headers: { 'Cache-Control': 'no-store' },
  });
}
