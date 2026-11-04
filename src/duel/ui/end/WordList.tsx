import { useMemo, useState } from 'react';
import type { Puzzle, Slot } from '../../engine';
import type { PannaBridge } from '../../platform/types';
import { wordReview, type WordReason } from '../controller/selectors';
import type { GameState } from '../../engine';

const SHOWN = 6;
const TAG: Record<WordReason, string> = { revealed: 'revealed', wrong: '1 wrong tile', quill: 'Quill’s word' };

function Row({ slot, reason, panna, saved, onToggle }: { slot: Slot; reason?: WordReason; panna: PannaBridge; saved: boolean; onToggle: () => void }) {
  return (
    <li className="wl-row" data-word={slot.answer}>
      <button type="button" className={`wl-star${saved ? ' on' : ''}`} aria-pressed={saved} aria-label={`Save ${slot.answer} to your review deck`} onClick={onToggle}>{saved ? '★' : '☆'}</button>
      <a className="wl-body" href={panna.wordHref(slot.answer)}>
        <span className="wl-head">
          <b>{slot.answer}</b>
          {reason && <span className={`wl-tag ${reason}`}>{TAG[reason]}</span>}
        </span>
        <span className="wl-hi" lang="hi">{slot.sense.hi}</span>
        <span className="wl-en">{slot.sense.en}</span>
      </a>
    </li>
  );
}

/** Words in this puzzle: the ones worth another look first, each with the sense its clue was written from (§6). */
export function WordList({ p, state, panna, say }: { p: Puzzle; state: GameState; panna: PannaBridge; say: (text: string) => void }) {
  const review = useMemo(() => wordReview(p, state), [p, state]);
  const [showAll, setShowAll] = useState(false);
  const [, setVersion] = useState(0);
  const all = [...review.worth.map(w => w.slot), ...review.rest];
  const rest = showAll ? review.rest : review.rest.slice(0, SHOWN);

  const toggle = async (word: string) => {
    if (panna.isSaved(word)) { panna.remove(word); say('Removed from review'); }
    else if (await panna.save(word)) say('Saved to your review deck');
    else say(`Couldn’t save ${word}. Check your connection.`);
    setVersion(n => n + 1);
  };
  const addAll = async () => {
    const results = await Promise.all(all.filter(s => !panna.isSaved(s.answer)).map(s => panna.save(s.answer)));
    say(results.every(Boolean) ? 'Saved to your review deck' : 'Some words couldn’t be saved. Check your connection.');
    setVersion(n => n + 1);
  };

  const row = (slot: Slot, reason?: WordReason) => (
    <Row key={slot.id} slot={slot} reason={reason} panna={panna} saved={panna.isSaved(slot.answer)} onToggle={() => { void toggle(slot.answer); }} />
  );
  return (
    <section className="page-card wl" aria-labelledby="wl-title">
      <div className="wl-top">
        <div>
          <h2 id="wl-title">Words in this puzzle</h2>
          <p>{all.length} words · tap one to open its page</p>
        </div>
        <button type="button" className="wl-addall" onClick={() => { void addAll(); }}>☆ Add all</button>
      </div>
      {review.worth.length > 0 && (
        <>
          <h3>Worth another look</h3>
          <ul>{review.worth.map(w => row(w.slot, w.reason))}</ul>
        </>
      )}
      {review.rest.length > 0 && (
        <>
          <h3>The rest</h3>
          <ul>{rest.map(s => row(s))}</ul>
          {!showAll && review.rest.length > SHOWN && (
            <button type="button" className="wl-more" onClick={() => setShowAll(true)}>Show all {review.rest.length} ›</button>
          )}
        </>
      )}
    </section>
  );
}
