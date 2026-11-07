'use client';

import type { ReactNode } from 'react';
import type { BookPage, DictionaryEntry } from '@/lib/types';

const PER_PAGE = 4;

function MiniPage({ entries, foot }: { entries: DictionaryEntry[]; foot?: string }) {
  const shown = entries.slice(0, PER_PAGE);
  return (
    <>
      {shown.length > 0 && (
        <div className="desk-mini-guide"><span>{shown[0].headword}</span><span>{shown[shown.length - 1].headword}</span></div>
      )}
      {shown.map((e) => (
        <p className="desk-mini-entry" key={e.id ?? e.normalized}>
          <b>{e.headword}</b> {e.meaning_hi && <span lang="hi">{e.meaning_hi}</span>} {e.definition_en && <>— {e.definition_en}</>}
        </p>
      ))}
      {foot && <div className="desk-page-foot">{foot}</div>}
    </>
  );
}

// The open book on the desk. For a returning reader it is a miniature of the page they left off on (real text, from
// the page Today already loads) and opens that page; on a first visit it is the welcome card, with the film on the
// right. While the page loads, or offline, it shows blank ruled pages and the tag still works.
export function DeskBook({ page, pageNumber, started, welcome, film, onOpen }: {
  page: BookPage | null;
  pageNumber: number;
  /** A last page is known (Continue reading) rather than a first start on page 1. */
  started: boolean;
  /** First visit: the welcome (left page) and the film (right page) stand in for the miniature. */
  welcome?: ReactNode;
  film?: ReactNode;
  onOpen: () => void;
}) {
  const number = pageNumber.toLocaleString('en-IN');
  const words = page ? ` · ${page.first_headword} – ${page.last_headword}` : '';
  const label = started
    ? `Continue reading: page ${pageNumber}${page ? `, ${page.first_headword} to ${page.last_headword}` : ''}`
    : `Start reading: page ${pageNumber}`;
  const tag = started ? `Page ${number}${words} · Open book ›` : `Start reading · Page ${number} ›`;
  const blank = !page && !welcome;

  return (
    <div className="desk-book">
      <div className="desk-book-half desk-book-half--left">
        <div className="desk-book-cloth" />
        <div className="desk-book-edge" />
        <div className={`desk-page${blank ? ' desk-page--blank' : ''}`}>
          {welcome ?? (page && <MiniPage entries={page.column1} foot={number} />)}
        </div>
      </div>
      <div className="desk-book-half desk-book-half--right">
        <div className="desk-book-cloth" />
        <div className="desk-book-edge" />
        <div className={`desk-page${blank ? ' desk-page--blank' : ''}`}>
          {welcome ? film : page && <MiniPage entries={page.column2} />}
        </div>
      </div>
      <div className="desk-book-shade" aria-hidden="true" />
      {!welcome && (
        <>
          <button type="button" className="desk-book-open" id="today-continue-btn" aria-label={label} onClick={onOpen} />
          <span className="desk-book-tag" id="desk-book-tag" aria-hidden="true">{tag}</span>
        </>
      )}
    </div>
  );
}
