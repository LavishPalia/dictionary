import type { CellId, Puzzle } from '../../engine';
import type { Stage } from '../fx/stage';
import { ClueFace } from './ClueCell';

const SCALE = 2.2;

/** A large copy of a tapped clue cell (both halves of a two-clue cell), over it, kept on screen. */
export function ClueZoom({ p, cell, stage }: { p: Puzzle; cell: CellId; stage: Stage }) {
  const r = stage.rect('clue', cell);
  if (!r) return null;
  const slots = p.slots.filter(s => s.clueCell === cell).sort((a, b) => (a.dir === b.dir ? 0 : a.dir === 'a' ? -1 : 1));
  const big = Math.round(r.width * SCALE);
  const x = Math.max(6, Math.min(innerWidth - big - 6, r.left + r.width / 2 - big / 2));
  const y = Math.max(6, Math.min(innerHeight - big - 6, r.top + r.height / 2 - big / 2));
  return (
    <div className={`duel-zoom duel-cl${slots.length > 1 ? ' two' : ''}`} aria-hidden="true"
      style={{ left: x, top: y, width: big, height: big, ['--cell' as string]: `${big}px` }}>
      {slots.map(s => <div key={s.id} className="duel-clue"><ClueFace slot={s} /></div>)}
    </div>
  );
}
