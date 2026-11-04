import { useState } from 'react';
import { dayMonth } from '../dates';
import { Sheet } from '../game/Sheet';

/**
 * A calendar day with something to decide (UI-DESIGN §3.1, §3.2): a game under way offers Continue, Restart and
 * Cancel, with Restart asking once more; a won day offers Play again.
 */
export function DaySheet({ date, playing, best, onChoose, onClose }: {
  date: string; playing: boolean; best: { you: number; quill: number } | null;
  onChoose: (how: 'continue' | 'fresh') => void; onClose: () => void;
}) {
  const [sure, setSure] = useState(false);
  return (
    <Sheet onClose={onClose}>
      {(titleId) => (
        <>
          <div className="grab" aria-hidden="true" />
          <h3 id={titleId}>{playing ? 'You have a game in progress' : dayMonth(date)}</h3>
          {best && <p className="sub2">Won ★ · your best was {best.you} to {best.quill}</p>}
          {playing
            ? (
              <>
                <button type="button" className="bigbtn pri" data-day="continue" onClick={() => onChoose('continue')}>Continue game</button>
                <button type="button" className="bigbtn" data-day="restart" onClick={() => { if (sure) onChoose('fresh'); else setSure(true); }}>Restart</button>
                {sure && <p className="note" role="status">This game’s progress will be lost. Tap again to restart.</p>}
              </>
            )
            : <button type="button" className="bigbtn pri" data-day="again" onClick={() => onChoose('fresh')}>Play again</button>}
          <button type="button" className="bigbtn" data-day="cancel" onClick={onClose}>Cancel</button>
        </>
      )}
    </Sheet>
  );
}
