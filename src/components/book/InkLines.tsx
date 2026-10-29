'use client';

import React from 'react';

// While the next page is still on its way (a slow connection), faint ink lines write themselves across the page,
// like type being set: the reader sees the tap was heard instead of a page that seems to ignore them.
// The lines keep the book's layout (two columns a page) and each row is the shape of an entry: a headword stroke,
// then its definition lines.
const ENTRIES: [number, number[]][] = [[42, [96, 70]], [34, [92, 98, 44]], [48, [94, 60]], [30, [98, 76]], [40, [90, 54]], [36, [96, 66]]];

export function InkLines({ page, pages = 1, columns = 1 }: { page: number; pages?: number; columns?: number }) {
  return (
    <div className={`ink-lines ink-lines--${pages}`} id="page-loading" role="status" aria-live="polite">
      <span className="ui-visually-hidden">Loading page {page}…</span>
      {Array.from({ length: pages }, (_, p) => (
        <div className="ink-lines-page" key={p} aria-hidden="true">
          {Array.from({ length: columns }, (_, c) => {
            const col = p * columns + c;
            let n = 0;
            return (
              <div className="ink-lines-col" key={c}>
                {ENTRIES.map((_, r) => {
                  const [head, lines] = ENTRIES[(r + col * 2) % ENTRIES.length];
                  const delay = () => ({ animationDelay: `${col * 120 + (n++) * 60}ms` });
                  return (
                    <div className="ink-lines-entry" key={r}>
                      <i className="ink-lines-head" style={{ width: `${head}%`, ...delay() }} />
                      {lines.map((w, j) => <i key={j} style={{ width: `${w}%`, ...delay() }} />)}
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}
