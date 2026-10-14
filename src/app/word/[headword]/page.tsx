import { notFound } from 'next/navigation';
import { Metadata } from 'next';
import { getWordEntry, getSpread, getCatalog } from '@/lib/book-data';
import { BookSpread } from '@/components/book/BookSpread';
import { LookupBar } from '@/components/search/LookupBar';

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

  const catalog = getCatalog();
  const leftPageNum = data.pageNumber % 2 === 0 ? data.pageNumber : data.pageNumber - 1;
  const spread = getSpread(leftPageNum);

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
          currentPage={data.pageNumber}
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
        highlightedWord={data.entry.headword}
        activeLetter={data.entry.headword[0].toUpperCase()}
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
