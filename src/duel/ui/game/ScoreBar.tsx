import { useLayoutEffect, useRef } from 'react';
import type { Who } from '../../engine';
import type { Snapshot } from '../controller/types';
import type { Stage } from '../fx/stage';

const QUILL_ICON = (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#f4e6c5" strokeWidth="1.6" strokeLinecap="round" aria-hidden="true">
    <path d="M19 3c-6 2-10 7-12 14l-1 4 3-2c3-6 7-10 10-16z" /><path d="M7 17l3 1" />
  </svg>
);
export const OWL_ICON = (
  <svg width="26" height="26" viewBox="0 0 26 26" aria-hidden="true">
    <ellipse cx="13" cy="15" rx="8" ry="8.5" fill="#c9d6e8" />
    <path d="M6 8 L9 11 M20 8 L17 11" stroke="#c9d6e8" strokeWidth="2" strokeLinecap="round" />
    <circle cx="10" cy="13" r="3" fill="#1e3a63" /><circle cx="16" cy="13" r="3" fill="#1e3a63" />
    <circle cx="10.6" cy="12.4" r="1" fill="#fff" /><circle cx="16.6" cy="12.4" r="1" fill="#fff" />
    <path d="M12 16 L13 18 L14 16Z" fill="#c9a24a" />
  </svg>
);

/**
 * The score number. React sets its text only from the snapshot (in a layout effect) and renders no
 * children into it, so the director can count it up imperatively during a sequence.
 */
function Points({ who, value, stage }: { who: Who; value: number; stage: Stage }) {
  const ref = useRef<HTMLSpanElement>(null);
  useLayoutEffect(() => { if (ref.current) ref.current.textContent = String(value); }, [value]);
  return <span className="pts" data-score={who} ref={(el) => { ref.current = el; stage.register('score', who, el); }} />;
}

/** You vs Professor Quill. The glowing pill shows whose turn it is (there is no status line, §0). */
export function ScoreBar({ snap, stage }: { snap: Snapshot; stage: Stage }) {
  const { state } = snap;
  const on = (who: Who) => !state.over && state.turn === who;
  return (
    <div className="duel-score" aria-label={`You ${state.scores.you}, Professor Quill ${state.scores.quill}`}>
      <div className={`pl you${on('you') ? ' on' : ''}`} ref={(el) => stage.register('pill', 'you', el)}>
        <div className="av you">{QUILL_ICON}</div>
        <div><div className="nm">You</div><Points who="you" value={state.scores.you} stage={stage} /></div>
      </div>
      <div className="vs" aria-hidden="true">vs</div>
      <div className={`pl bot${on('quill') ? ' on' : ''}`} ref={(el) => stage.register('pill', 'quill', el)}>
        <div className="av owl" ref={(el) => stage.register('owl', 'quill', el)}>{OWL_ICON}</div>
        <div><div className="nm">Professor Quill</div><Points who="quill" value={state.scores.quill} stage={stage} /></div>
      </div>
    </div>
  );
}
