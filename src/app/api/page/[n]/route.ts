import { NextRequest, NextResponse } from 'next/server';
import { getMeta, getPage } from '@/lib/book-data';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ n: string }> }
) {
  const pageNum = Number((await params).n);
  if (!Number.isInteger(pageNum)) {
    return NextResponse.json({ error: 'Invalid page number' }, { status: 400 });
  }

  const page = getPage(pageNum);
  if (!page) {
    return NextResponse.json({ error: 'Page not found' }, { status: 404 });
  }

  // Versioned requests (?v=<data_version>) are immutable: a rebuilt database gets a new version and new URLs.
  const versioned = request.nextUrl.searchParams.get('v') === getMeta().data_version;
  return NextResponse.json(page, {
    headers: {
      'Cache-Control': versioned ? 'public, max-age=31536000, immutable' : 'no-cache',
    },
  });
}
