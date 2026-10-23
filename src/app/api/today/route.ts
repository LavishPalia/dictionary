import { NextRequest, NextResponse } from 'next/server';
import { getWordOfDay } from '@/lib/book-data';

// GET /api/today?date=2026-10-22 → { word }: the word of the day for the reader's local date.
export async function GET(request: NextRequest) {
  const date = new URL(request.url).searchParams.get('date') ?? '';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return NextResponse.json({ error: 'date must be YYYY-MM-DD' }, { status: 400 });
  return NextResponse.json({ word: getWordOfDay(date) }, { headers: { 'Cache-Control': 'public, max-age=3600' } });
}
