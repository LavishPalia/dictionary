import { NextRequest, NextResponse } from 'next/server';
import { getMeta, getPage } from '@/lib/book-data';
import { CHUNK_PAGES } from '@/lib/offline';
import type { BookPage } from '@/lib/types';

// CHUNK_PAGES pages in one response, for saving the whole book offline in ~30 requests instead of one per page.
// Only the current build is served (?v=<data_version>), so a save that spans a deploy fails instead of mixing builds.
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ n: string }> }
) {
  const meta = getMeta();
  if (request.nextUrl.searchParams.get('v') !== meta.data_version) {
    return NextResponse.json({ error: 'The book has been updated', data_version: meta.data_version }, { status: 409 });
  }
  const chunk = Number((await params).n);
  const first = (chunk - 1) * CHUNK_PAGES + 1;
  if (!Number.isInteger(chunk) || chunk < 1 || first > meta.total_pages) {
    return NextResponse.json({ error: 'Chunk not found' }, { status: 404 });
  }

  const pages: BookPage[] = [];
  for (let n = first; n < first + CHUNK_PAGES && n <= meta.total_pages; n++) {
    const page = getPage(n);
    if (page) pages.push(page);
  }
  return NextResponse.json({ pages }, { headers: { 'Cache-Control': 'public, max-age=31536000, immutable' } });
}
