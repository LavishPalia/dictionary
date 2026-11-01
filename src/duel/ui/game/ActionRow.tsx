import type { GameController } from '../controller/controller';
import type { Snapshot } from '../controller/types';

const ICONS = {
  swap: <path d="M4 8h13l-3-3M20 16H7l3 3" />,
  word: <path d="M3 6.5c3-1.5 6-1.5 9 0v12c-3-1.5-6-1.5-9 0zM21 6.5c-3-1.5-6-1.5-9 0v12c3-1.5 6-1.5 9 0z" />,
  hint: <><path d="M12 3c2.5 3 4 5 4 8a4 4 0 0 1-8 0c0-3 1.5-5 4-8z" /><path d="M9.5 18h5M10.5 21h3" /></>,
};
const Icon = ({ k }: { k: keyof typeof ICONS }) => (
  <div className="ic" aria-hidden="true">
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">{ICONS[k]}</svg>
  </div>
);

/** A count badge; at 0 a green + that opens the top-up sheet. */
const Badge = ({ n }: { n: number }) => (n > 0 ? <span className="n" aria-hidden="true">{n}</span> : <span className="n plus" aria-hidden="true">+</span>);

/** Swap · Pass/Submit ✓ · Word · Hint. The row dims while a sequence plays. */
export function ActionRow({ snap, ctl }: { snap: Snapshot; ctl: GameController }) {
  const has = snap.pending.length > 0;
  const bagEmpty = snap.state.bag.length === 0;
  const { hint, word } = snap.balance;
  return (
    <div className={`duel-actions${snap.busy ? ' locked' : ''}`}>
      <button type="button" className="ab" data-act="swap" disabled={bagEmpty}
        aria-label={bagEmpty ? 'Swap: the bag is empty' : 'Swap'} onClick={() => { ctl.takeBackAll(); ctl.openSheet({ k: 'swap' }); }}>
        <Icon k="swap" />Swap
      </button>
      <button type="button" className={`sub${has ? '' : ' pass'}`} data-act="submit" onClick={() => void ctl.submit()}>
        <span className="lbl" key={has ? 's' : 'p'}>{has ? 'Submit ✓' : 'Pass'}</span>
      </button>
      <button type="button" className={`ab${snap.wordMode ? ' on' : ''}`} data-act="word"
        onClick={() => (snap.wordMode ? ctl.exitWordMode() : ctl.enterWordMode())}>
        <Icon k="word" /><Badge n={word} />Word<span className="duel-sr">, {word} left</span>
      </button>
      <button type="button" className={`ab${snap.hintOn ? ' on' : ''}`} data-act="hint" onClick={() => void ctl.hint()}>
        <Icon k="hint" /><Badge n={hint} />{snap.hintOn && <span className="tag" aria-hidden="true">On</span>}Hint
        <span className="duel-sr">{snap.hintOn ? ', on' : `, ${hint} left`}</span>
      </button>
    </div>
  );
}
