import { NextRequest, NextResponse } from 'next/server';
import { getWordEntry } from '@/lib/book-data';

export async function GET(
  request: NextRequest,
  { params }: { params: { headword: string } }
) {
  // Next.js has already decoded the path segment; decoding again made a literal % throw (a 500).
  const headword = params.headword;
  const result = getWordEntry(headword);

  if (!result.entry) {
    return NextResponse.json({ error: 'Word not found' }, { status: 404 });
  }

  // Page numbers change whenever the book is rebuilt, so this is not immutable.
  return NextResponse.json(result, {
    headers: {
      'Cache-Control': 'public, max-age=300',
    },
  });
}
