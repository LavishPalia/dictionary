import type { Puzzle, SlotId } from '../../engine';
import type { GameController } from '../controller/controller';
import { ClueFace } from './ClueCell';
import { Sheet } from './Sheet';

/** "Reveal this word?" with a large copy of the clue (UI-DESIGN §3.3, Word reveal step 2). */
export function WordConfirm({ p, slot, ctl }: { p: Puzzle; slot: SlotId; ctl: GameController }) {
  const s = p.slots.find(x => x.id === slot);
  if (!s) return null;
  const cancel = () => { ctl.closeSheet(); ctl.exitWordMode(); };
  return (
    <Sheet kind="confirm" onClose={cancel}>
      {(titleId) => (
        <>
          <div className="bigclue duel-cl" aria-hidden="true"><div className="duel-clue"><ClueFace slot={s} /></div></div>
          <h4 id={titleId}>Reveal this word?</h4>
          <p className="full">{s.clue.full} · {s.cells.length} letters</p>
          <p>Its letters appear faintly. You still place the tiles to score them.</p>
          <div className="row">
            <button type="button" className="no" onClick={cancel}>Cancel</button>
            <button type="button" className="ok" data-ok onClick={() => void ctl.reveal(slot)}>Reveal · 1 Word</button>
          </div>
        </>
      )}
    </Sheet>
  );
}
