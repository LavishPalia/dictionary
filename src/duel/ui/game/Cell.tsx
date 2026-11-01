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
  /** The ghost fades in now (the answer was just revealed), after this many ms. */
  ghostIn: number | null;
  hint: boolean;
  /** Hint glows appear in a stagger: this cell's delay in ms. */
  hintDelay: number;
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
export const Cell = memo(function Cell({ id, row, col, view, stop, stage, onTap, onFocusCell }: {
  id: CellId; row: number; col: number; view: CellView; stop: boolean; stage: Stage;
  onTap: (cell: CellId) => void; onFocusCell: (cell: CellId) => void;
}) {
  const cls = ['duel-cell', 'duel-l', view.by ? `by-${view.by}` : '', view.last ? 'last' : '', view.hint ? 'hint' : ''].filter(Boolean).join(' ');
  return (
    <div role="gridcell" tabIndex={stop ? 0 : -1} onFocus={() => onFocusCell(id)} className={cls} data-cell={id} aria-label={label(row, col, view)}
      style={view.hint ? ({ '--hd': `${view.hintDelay}ms` } as React.CSSProperties) : undefined}
      ref={(el) => stage.register('cell', id, el)} onClick={() => onTap(id)}>
      {view.letter && <span className="lt">{view.letter}</span>}
      {!view.letter && view.ghost && !view.pending && (
        <span className={`lt gl${view.ghostIn !== null ? ' in' : ''}`} style={view.ghostIn !== null ? ({ '--gd': `${view.ghostIn}ms` } as React.CSSProperties) : undefined}>{view.ghost}</span>
      )}
      {view.pending && <div className="duel-tile pend"><span className="lt">{view.pending}</span></div>}
    </div>
  );
}, (a, b) => a.id === b.id && a.stage === b.stage && a.onTap === b.onTap && a.stop === b.stop && a.onFocusCell === b.onFocusCell
  && a.view.letter === b.view.letter && a.view.by === b.view.by && a.view.last === b.view.last
  && a.view.pending === b.view.pending && a.view.ghost === b.view.ghost && a.view.ghostIn === b.view.ghostIn
  && a.view.hint === b.view.hint && a.view.hintDelay === b.view.hintDelay);
