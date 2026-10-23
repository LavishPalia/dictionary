import { NextRequest, NextResponse } from 'next/server';
import { getQuizCards } from '@/lib/book-data';

// GET /api/quiz?w=camel&w=ceremony → review cards (up to 20) with three wrong options each.
export async function GET(request: NextRequest) {
  const words = new URL(request.url).searchParams.getAll('w').map((w) => w.trim()).filter(Boolean);
  if (!words.length) return NextResponse.json({ cards: [] });
  // Wrong options are shuffled per request, so responses must not be cached.
  return NextResponse.json({ cards: getQuizCards(words) }, { headers: { 'Cache-Control': 'no-store' } });
}
