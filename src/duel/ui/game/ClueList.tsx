import type { Puzzle, Slot } from '../../engine';
import type { GameController } from '../controller/controller';
import type { Snapshot } from '../controller/types';

function Group({ title, slots, snap, ctl }: { title: string; slots: Slot[]; snap: Snapshot; ctl: GameController }) {
  return (
    <div>
      <h2>{title}</h2>
      <ul>
        {slots.map((s) => {
          const done = s.cells.every(c => snap.state.filled[c]);
          return (
            <li key={s.id}>
              <button type="button" data-clue={s.id} disabled={done} aria-current={snap.selected === s.id} className={`${done ? 'done' : ''}${snap.selected === s.id ? ' cur' : ''}`}
                onClick={() => ctl.selectClue(s.id)}>{s.clue.full}<span> · {s.cells.length}</span></button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/** The Across and Down lists on the desktop book's right page (UI-DESIGN §3.7): finished clues struck through. */
export function ClueList({ p, snap, ctl }: { p: Puzzle; snap: Snapshot; ctl: GameController }) {
  return (
    <div className="duel-cluelist">
      <Group title="Across" slots={p.slots.filter(s => s.dir === 'a')} snap={snap} ctl={ctl} />
      <Group title="Down" slots={p.slots.filter(s => s.dir === 'd')} snap={snap} ctl={ctl} />
    </div>
  );
}
