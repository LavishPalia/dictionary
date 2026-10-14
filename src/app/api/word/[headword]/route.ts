import { NextRequest, NextResponse } from 'next/server';
import { getWordEntry } from '@/lib/book-data';

export async function GET(
  request: NextRequest,
  { params }: { params: { headword: string } }
) {
  const headword = decodeURIComponent(params.headword);
  const result = getWordEntry(headword);

  if (!result.entry) {
    return NextResponse.json({ error: 'Word not found' }, { status: 404 });
  }

  return NextResponse.json(result, {
    headers: {
      'Cache-Control': 'public, max-age=31536000, immutable',
    },
  });
}
