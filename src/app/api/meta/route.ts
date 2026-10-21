import { NextResponse } from 'next/server';
import { getMeta } from '@/lib/book-data';

export async function GET() {
  return NextResponse.json(getMeta(), {
    headers: { 'Cache-Control': 'public, max-age=60' },
  });
}
