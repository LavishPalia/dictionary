import { notFound, permanentRedirect } from 'next/navigation';
import { Metadata } from 'next';
import { getMeta, getSpreadPages, getWordEntry } from '@/lib/book-data';
import DictionaryApp from '@/components/DictionaryApp';

interface WordPageProps {
  params: Promise<{ headword: string }>;
}

// A stray % in the address (/word/100%) must show "not found", not crash.
function safeDecode(value: string): string {
  try { return decodeURIComponent(value); } catch { return value; }
}

export async function generateMetadata({ params }: WordPageProps): Promise<Metadata> {
  const headword = safeDecode((await params).headword);
  const data = getWordEntry(headword);

  if (!data.entry) {
    return {
      title: 'Word Not Found — पन्ना (Panna)',
    };
  }

  return {
    title: `${data.entry.headword} (${data.entry.pronunciation_deva}) — पन्ना (Panna) Dictionary`,
    description: `${data.entry.headword}: ${data.entry.pos} ${data.entry.definition_en} Hindi: ${data.entry.meaning_hi}. Located on Page ${data.pageNumber}.`,
  };
}

export default async function WordPage({ params }: WordPageProps) {
  const headword = safeDecode((await params).headword);
  const data = getWordEntry(headword);

  if (!data.entry || !data.pageNumber) {
    notFound();
  }
  if (data.redirectedFrom) {
    permanentRedirect(`/word/${encodeURIComponent(data.entry.headword)}`);
  }

  return (
    <DictionaryApp
      initialMeta={getMeta()}
      initialPages={getSpreadPages(data.pageNumber)}
      initialPage={data.pageNumber}
      initialEntry={data.entry}
    />
  );
}
