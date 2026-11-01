import { memo } from 'react';
import type { CellId } from '../../engine';
import type { Stage } from '../fx/stage';

export interface CellView {
  /** The settled letter, or null when empty. */
  letter: string | null;
  by: 'given' | 'you' | 'quill' | null;
  /** Quill's last move: a blue letter until you next Submit. */
  last: boolean;
  /** A tile placed here, not yet submitted. */
  pending: string | null;
  /** A faint letter from a Word reveal. */
  ghost: string | null;
  hint: boolean;
}

function label(row: number, col: number, v: CellView): string {
  const at = `Row ${row + 1}, column ${col + 1}`;
  if (v.pending) return `${at}, ${v.pending}, placed, not submitted`;
  if (v.letter) {
    const who = v.by === 'given' ? 'given' : v.by === 'you' ? 'yours' : v.last ? "Professor Quill's last move" : "Professor Quill's";
    return `${at}, ${v.letter}, ${who}`;
  }
  return `${at}, empty${v.ghost ? `, faint ${v.ghost}` : ''}${v.hint ? ', a hint glows here' : ''}`;
}

/** One letter cell. Memoised: it re-renders only when what it shows changes. */
export const Cell = memo(function Cell({ id, row, col, view, stage, onTap }: {
  id: CellId; row: number; col: number; view: CellView; stage: Stage; onTap: (cell: CellId) => void;
}) {
  const cls = ['duel-cell', 'duel-l', view.by ? `by-${view.by}` : '', view.last ? 'last' : '', view.hint ? 'hint' : ''].filter(Boolean).join(' ');
  return (
    <div role="gridcell" tabIndex={-1} className={cls} data-cell={id} aria-label={label(row, col, view)}
      ref={(el) => stage.register('cell', id, el)} onClick={() => onTap(id)}>
      {view.letter && <span className="lt">{view.letter}</span>}
      {!view.letter && view.ghost && !view.pending && <span className="lt gl">{view.ghost}</span>}
      {view.pending && <div className="duel-tile pend"><span className="lt">{view.pending}</span></div>}
    </div>
  );
}, (a, b) => a.id === b.id && a.stage === b.stage && a.onTap === b.onTap
  && a.view.letter === b.view.letter && a.view.by === b.view.by && a.view.last === b.view.last
  && a.view.pending === b.view.pending && a.view.ghost === b.view.ghost && a.view.hint === b.view.hint);
