import { notFound } from 'next/navigation';
import { Metadata } from 'next';
import { getWordEntry } from '@/lib/book-data';
import DictionaryApp from '@/components/DictionaryApp';

interface WordPageProps {
  params: {
    headword: string;
  };
}

export async function generateMetadata({ params }: WordPageProps): Promise<Metadata> {
  const headword = decodeURIComponent(params.headword);
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

export default function WordPage({ params }: WordPageProps) {
  const headword = decodeURIComponent(params.headword);
  const data = getWordEntry(headword);

  if (!data.entry || !data.pageNumber) {
    notFound();
  }

  return <DictionaryApp initialPage={data.pageNumber} initialWord={data.entry.headword} />;
}
