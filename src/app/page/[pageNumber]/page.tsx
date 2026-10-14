import { notFound } from 'next/navigation';
import { Metadata } from 'next';
import { getSpread, getCatalog } from '@/lib/book-data';
import { BookSpread } from '@/components/book/BookSpread';
import { LookupBar } from '@/components/search/LookupBar';

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

  const catalog = getCatalog();
  const leftPageNum = pageNum % 2 === 0 ? pageNum : pageNum - 1;
  const spread = getSpread(leftPageNum);

  if (!spread.left && !spread.right) {
    notFound();
  }

  const activeLetter = spread.left?.first_headword?.[0]?.toUpperCase() || 'A';

  return (
    <main
      style={{
        minHeight: '100vh',
        width: '100vw',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        padding: '24px 16px 40px',
        position: 'relative',
        boxSizing: 'border-box',
      }}
    >
      <header
        style={{
          width: '100%',
          display: 'flex',
          justifyContent: 'center',
          marginBottom: '28px',
          zIndex: 40,
        }}
      >
        <LookupBar
          currentPage={pageNum}
          onSelectWord={(word, page) => {
            window.location.href = `/word/${encodeURIComponent(word)}`;
          }}
          onPageChange={(page) => {
            window.location.href = `/page/${page}`;
          }}
        />
      </header>

      <BookSpread
        leftPage={spread.left}
        rightPage={spread.right}
        activeLetter={activeLetter}
        thumbMap={catalog.thumb_index}
        onSelectWord={(word) => {
          window.location.href = `/word/${encodeURIComponent(word)}`;
        }}
        onSelectLetter={(letter, page) => {
          window.location.href = `/page/${page}`;
        }}
        onPrevPage={() => {
          window.location.href = `/page/${Math.max(1, leftPageNum - 2)}`;
        }}
        onNextPage={() => {
          window.location.href = `/page/${Math.min(catalog.total_pages, leftPageNum + 2)}`;
        }}
      />
    </main>
  );
}
