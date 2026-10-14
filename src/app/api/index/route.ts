import { NextResponse } from 'next/server';
import { getThumbIndex } from '@/lib/book-data';

export async function GET() {
  const index = getThumbIndex();
  return NextResponse.json({
    thumb_index: index,
  }, {
    headers: {
      'Cache-Control': 'public, max-age=31536000, immutable',
    },
  });
}
