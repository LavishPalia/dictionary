import { notFound } from 'next/navigation';
import { Metadata } from 'next';
import { getPage, getSpread } from '@/lib/book-data';
import DictionaryApp from '@/components/DictionaryApp';

interface PageRouteProps {
  params: {
    pageNumber: string;
  };
}

export async function generateMetadata({ params }: PageRouteProps): Promise<Metadata> {
  const pageNum = parseInt(params.pageNumber, 10);

  if (!Number.isInteger(pageNum) || !getPage(pageNum)) {
    return {
      title: 'Page Not Found — पन्ना (Panna)',
    };
  }

  const leftPageNum = pageNum % 2 === 0 ? pageNum : pageNum - 1;
  const spread = getSpread(leftPageNum);

  const guide = (spread.left && spread.right)
    ? `${spread.left.guide_left} to ${spread.right.guide_right}`
    : (spread.right?.guide_left
        ? `${spread.right.guide_left} to ${spread.right.guide_right}`
        : (spread.left?.guide_left || 'Dictionary Pages'));

  return {
    title: `Pages ${leftPageNum}–${leftPageNum + 1} (${guide}) — पन्ना (Panna)`,
    description: `Read vintage dictionary pages ${leftPageNum} and ${leftPageNum + 1} with English and Hindi meanings.`,
  };
}

export default function DirectPageRoute({ params }: PageRouteProps) {
  const pageNum = parseInt(params.pageNumber, 10);
  if (!Number.isInteger(pageNum) || !getPage(pageNum)) {
    notFound();
  }

  return <DictionaryApp initialPage={pageNum} />;
}
