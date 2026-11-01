import { memo } from 'react';
import type { CellId, Slot, SlotId } from '../../engine';
import type { Stage } from '../fx/stage';

const picSrc = (img: string) => `/duel/pics/${img}.svg`;

/** What one clue shows: words, or a picture with optional letter maths, plus the edge arrow. */
export function ClueFace({ slot }: { slot: Slot }) {
  const { clue } = slot;
  return (
    <>
      {clue.img
        ? <><img src={picSrc(clue.img)} alt="" draggable={false} />{clue.math && <span className="x">{clue.math}</span>}</>
        : <span className="t">{clue.text ?? clue.full}</span>}
      <i className={slot.dir === 'a' ? 'ar-r' : 'ar-d'} aria-hidden="true" />
    </>
  );
}

const clueLabel = (s: Slot) => `Clue, ${s.dir === 'a' ? 'across' : 'down'}: ${s.clue.full}, ${s.cells.length} letters`;

/** A clue cell: one clue, two (split top/bottom), or none (an ornament). */
export const ClueCell = memo(function ClueCell({ id, slots, lit, stage, onTap }: {
  id: CellId; slots: Slot[]; lit: SlotId[]; stage: Stage; onTap: (slot: SlotId) => void;
}) {
  const WORD_STAGGER = 30;
  if (!slots.length) {
    return <div role="gridcell" className="duel-cell duel-cl orn" data-cell={id} aria-label="Blank">{id === 0 ? '' : <span aria-hidden="true">❦</span>}</div>;
  }
  const half = (s: Slot) => (
    <button type="button" key={s.id} tabIndex={-1} className={`duel-clue${lit.includes(s.id) ? ' cand' : ''}`} data-slot={s.id} aria-label={clueLabel(s)}
      style={lit.includes(s.id) ? ({ '--cd': `${lit.indexOf(s.id) * WORD_STAGGER}ms` } as React.CSSProperties) : undefined}
      onClick={(e) => { e.stopPropagation(); onTap(s.id); }}>
      <ClueFace slot={s} />
    </button>
  );
  return (
    <div role="gridcell" className={`duel-cell duel-cl${slots.length > 1 ? ' two' : ''}`} data-cell={id} ref={(el) => stage.register('clue', id, el)}>
      {slots.map(half)}
    </div>
  );
}, (a, b) => a.id === b.id && a.slots === b.slots && a.stage === b.stage && a.onTap === b.onTap && a.lit.join() === b.lit.join());
