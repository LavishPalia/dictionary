import { useCallback, useMemo } from 'react';
import type { CellId, Puzzle, Slot } from '../../engine';
import type { GameController } from '../controller/controller';
import { hintCells, wordCandidates } from '../controller/selectors';
import type { Snapshot } from '../controller/types';
import type { Stage } from '../fx/stage';
import { Cell, type CellView } from './Cell';
import { ClueCell } from './ClueCell';

/** The 10 × 8 board: letter cells and clue cells, as a grid of rows for screen readers. */
export function Board({ p, snap, ctl, stage, onCell }: { p: Puzzle; snap: Snapshot; ctl: GameController; stage: Stage; onCell: (cell: CellId) => void }) {
  // Clue cell → the answers it clues, across first. Fixed for the puzzle.
  const cluesAt = useMemo(() => {
    const m = new Map<CellId, Slot[]>();
    for (const s of p.slots) m.set(s.clueCell, [...(m.get(s.clueCell) ?? []), s].sort((a, b) => (a.dir === b.dir ? 0 : a.dir === 'a' ? -1 : 1)));
    return m;
  }, [p]);
  const ghostAt = useMemo(() => {
    const m = new Map<CellId, string>();
    for (const id of snap.state.ghosts) for (const c of p.slots.find(s => s.id === id)?.cells ?? []) m.set(c, p.solution[c]);
    return m;
  }, [p, snap.state.ghosts]);
  // Hint glows come on in a 45 ms stagger, in reading order.
  const hinted = useMemo(() => new Map((snap.hintOn ? hintCells(p, snap.state, snap.pending) : []).map((c, i) => [c, i * 45])), [p, snap.hintOn, snap.state, snap.pending]);
  // The answer just revealed fades its ghost letters in, 110 ms apart.
  const freshGhost = useMemo(() => {
    const id = snap.state.ghosts[snap.state.ghosts.length - 1];
    const cells = p.slots.find(s => s.id === id)?.cells.filter(c => !snap.state.filled[c]) ?? [];
    return new Map(cells.map((c, i) => [c, i * 110]));
  }, [p, snap.state.ghosts, snap.state.filled]);
  const lit = useMemo(() => (snap.wordMode ? wordCandidates(p, snap.state) : []), [p, snap.wordMode, snap.state]);
  const tapClue = useCallback((slot: string) => ctl.tapClue(slot), [ctl]);
  const focusCell = useCallback((c: CellId) => ctl.focusCell(c), [ctl]);
  const none: string[] = useMemo(() => [], []);

  // The board is one stop in the tab order: the selected answer's next cell, else the first letter cell.
  const firstLetter = useMemo(() => Math.min(...Object.keys(p.solution).map(Number)), [p]);
  const stop = ctl.selectedCell() ?? firstLetter;

  const view = (c: CellId): CellView => {
    const f = snap.state.filled[c];
    const pend = snap.pending.find(t => t.cell === c);
    return {
      letter: f?.letter ?? null,
      by: f?.by ?? null,
      last: !!f && f.by === 'quill' && snap.lastQuill.includes(c),
      pending: pend ? snap.state.racks.you[pend.rackSlot] : null,
      ghost: ghostAt.get(c) ?? null,
      ghostIn: freshGhost.get(c) ?? null,
      hint: hinted.has(c),
      hintDelay: hinted.get(c) ?? 0,
    };
  };

  const rows = [];
  for (let r = 0; r < p.rows; r++) {
    const cells = [];
    for (let col = 0; col < p.cols; col++) {
      const id = r * p.cols + col;
      if (p.solution[id] !== undefined) {
        cells.push(<Cell key={id} id={id} row={r} col={col} view={view(id)} stop={id === stop} stage={stage} onTap={onCell} onFocusCell={focusCell} />);
      } else {
        const slots = cluesAt.get(id) ?? [];
        const here = slots.some(s => lit.includes(s.id)) ? lit : none;
        cells.push(<ClueCell key={id} id={id} slots={slots} lit={here} stage={stage} onTap={tapClue} />);
      }
    }
    rows.push(<div role="row" key={r} className="duel-row">{cells}</div>);
  }
  return (
    <div className="duel-boardwrap" ref={(el) => stage.register('board', 'wrap', el)}>
      <div role="grid" aria-label="The board" className={`duel-board${snap.wordMode ? ' wordmode' : ''}`}>{rows}</div>
    </div>
  );
}
