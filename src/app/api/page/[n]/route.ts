import { NextRequest, NextResponse } from 'next/server';
import { getPage } from '@/lib/book-data';

export async function GET(
  request: NextRequest,
  { params }: { params: { n: string } }
) {
  const pageNum = parseInt(params.n, 10);
  if (isNaN(pageNum)) {
    return NextResponse.json({ error: 'Invalid page number' }, { status: 400 });
  }

  const page = getPage(pageNum);
  if (!page) {
    return NextResponse.json({ error: 'Page not found' }, { status: 404 });
  }

  return NextResponse.json(page, {
    headers: {
      'Cache-Control': 'public, max-age=31536000, immutable',
    },
  });
}
