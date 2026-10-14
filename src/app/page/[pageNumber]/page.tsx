import { notFound } from 'next/navigation';
import { Metadata } from 'next';
import { getSpread } from '@/lib/book-data';
import DictionaryApp from '@/components/DictionaryApp';

interface PageRouteProps {
  params: {
    pageNumber: string;
  };
}

export async function generateMetadata({ params }: PageRouteProps): Promise<Metadata> {
  const pageNum = parseInt(params.pageNumber, 10);
  const leftPageNum = pageNum % 2 === 0 ? pageNum : pageNum - 1;
  const spread = getSpread(leftPageNum);

  if (!spread.left && !spread.right) {
    return {
      title: 'Page Not Found — पन्ना (Panna)',
    };
  }

  const guide = spread.left
    ? `${spread.left.guide_left} to ${spread.right?.guide_right || spread.left.guide_right}`
    : 'Dictionary Pages';

  return {
    title: `Pages ${leftPageNum}–${leftPageNum + 1} (${guide}) — पन्ना (Panna)`,
    description: `Read vintage dictionary pages ${leftPageNum} and ${leftPageNum + 1} with English and Hindi meanings.`,
  };
}

export default function DirectPageRoute({ params }: PageRouteProps) {
  const pageNum = parseInt(params.pageNumber, 10);
  if (isNaN(pageNum)) {
    notFound();
  }

  return <DictionaryApp initialPage={pageNum} />;
}
