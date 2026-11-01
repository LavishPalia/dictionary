import type { GameController } from '../controller/controller';
import type { Snapshot } from '../controller/types';

/** A plain stand-in for the end screens (M4). */
export function GameOver({ snap, ctl }: { snap: Snapshot; ctl: GameController }) {
  const { you, quill } = snap.state.scores;
  const title = you > quill ? `You win ${you} to ${quill}` : you < quill ? `You lose ${you} to ${quill}` : `You tie ${you} to ${quill}`;
  return (
    <div className="duel-over" role="dialog" aria-modal="false" aria-labelledby="duel-over-title">
      <h2 id="duel-over-title">{title}</h2>
      <button type="button" className="bigbtn pri" onClick={() => ctl.newGame()}>Play again</button>
    </div>
  );
}
