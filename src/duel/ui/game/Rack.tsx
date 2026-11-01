import type { GameController } from '../controller/controller';
import type { Snapshot } from '../controller/types';
import type { Stage } from '../fx/stage';

/** Your five tiles. A placed tile leaves a gap, so a returned tile goes back to its own place. */
export function Rack({ snap, ctl, stage }: { snap: Snapshot; ctl: GameController; stage: Stage }) {
  const out = new Set(snap.pending.map(t => t.rackSlot));
  return (
    <div className="duel-rackbar" ref={(el) => stage.register('rack', 'bar', el)}>
      <div className="duel-rack" role="group" aria-label="Your tiles">
        {snap.state.racks.you.map((l, i) => (
          <div key={i} className="duel-slot" data-rack={i} ref={(el) => stage.register('rack', i, el)}>
            {l !== null && !out.has(i) && (
              <button type="button" className={`duel-tile${snap.lifted === i ? ' picked' : ''}`} aria-pressed={snap.lifted === i}
                aria-label={`Tile ${l}`} onClick={() => ctl.lift(i)}>
                <span className="lt">{l}</span>
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
