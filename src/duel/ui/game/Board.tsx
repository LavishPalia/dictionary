import { useCallback, useMemo } from 'react';
import type { CellId, Puzzle, Slot } from '../../engine';
import type { GameController } from '../controller/controller';
import { hintCells, wordCandidates } from '../controller/selectors';
import type { Snapshot } from '../controller/types';
import type { Stage } from '../fx/stage';
import { Cell, type CellView } from './Cell';
import { ClueCell } from './ClueCell';

/** The 10 × 8 board: letter cells and clue cells, as a grid of rows for screen readers. */
export function Board({ p, snap, ctl, stage }: { p: Puzzle; snap: Snapshot; ctl: GameController; stage: Stage }) {
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
  const hinted = useMemo(() => new Set(snap.hintOn ? hintCells(p, snap.state, snap.pending) : []), [p, snap.hintOn, snap.state, snap.pending]);
  const lit = useMemo(() => (snap.wordMode ? wordCandidates(p, snap.state) : []), [p, snap.wordMode, snap.state]);
  const tapCell = useCallback((c: CellId) => { ctl.tapCell(c); }, [ctl]);
  const tapClue = useCallback((slot: string) => ctl.tapClue(slot), [ctl]);
  const none: string[] = useMemo(() => [], []);

  const view = (c: CellId): CellView => {
    const f = snap.state.filled[c];
    const pend = snap.pending.find(t => t.cell === c);
    return {
      letter: f?.letter ?? null,
      by: f?.by ?? null,
      last: !!f && f.by === 'quill' && snap.lastQuill.includes(c),
      pending: pend ? snap.state.racks.you[pend.rackSlot] : null,
      ghost: ghostAt.get(c) ?? null,
      hint: hinted.has(c),
    };
  };

  const rows = [];
  for (let r = 0; r < p.rows; r++) {
    const cells = [];
    for (let col = 0; col < p.cols; col++) {
      const id = r * p.cols + col;
      if (p.solution[id] !== undefined) {
        cells.push(<Cell key={id} id={id} row={r} col={col} view={view(id)} stage={stage} onTap={tapCell} />);
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
