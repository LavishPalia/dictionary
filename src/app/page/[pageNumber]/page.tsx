import { notFound } from 'next/navigation';
import { Metadata } from 'next';
import { getMeta, getPage, getSpreadPages, spreadLeft } from '@/lib/book-data';
import DictionaryApp from '@/components/DictionaryApp';

interface PageRouteProps {
  params: {
    pageNumber: string;
  };
}

export async function generateMetadata({ params }: PageRouteProps): Promise<Metadata> {
  const pageNum = Number(params.pageNumber);

  if (!Number.isInteger(pageNum) || !getPage(pageNum)) {
    return {
      title: 'Page Not Found — पन्ना (Panna)',
    };
  }

  const leftPageNum = spreadLeft(pageNum);
  const pages = getSpreadPages(pageNum);
  const guide = `${pages[0].guide_left} to ${pages[pages.length - 1].guide_right}`;
  const label = pages.length === 2 ? `Pages ${leftPageNum}–${leftPageNum + 1}` : `Page ${pages[0].page_number}`;

  return {
    title: `${label} (${guide}) — पन्ना (Panna)`,
    description: `Read vintage dictionary ${label.toLowerCase()} with English and Hindi meanings.`,
  };
}

export default function DirectPageRoute({ params }: PageRouteProps) {
  const pageNum = Number(params.pageNumber);
  if (!Number.isInteger(pageNum) || !getPage(pageNum)) {
    notFound();
  }

  return <DictionaryApp initialMeta={getMeta()} initialPages={getSpreadPages(pageNum)} initialPage={pageNum} />;
}
