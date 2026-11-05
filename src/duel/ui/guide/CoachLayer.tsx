import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { COACH, LATER, type TipId } from './tips';

type Box = { left: number; top: number; width: number; height: number };
const PAD = 6;

/** The coached first game (UI-DESIGN §3.6): four spotlight tips over the real board, with the game out of reach. */
export function CoachLayer({ onDone }: { onDone: () => void }) {
  const [step, setStep] = useState(0);
  const [box, setBox] = useState<Box | null>(null);
  const next = useRef<HTMLButtonElement>(null);
  const titleId = useId();
  const s = COACH[step], last = step === COACH.length - 1;

  useLayoutEffect(() => {
    const measure = () => {
      const r = document.querySelector(s.target)?.getBoundingClientRect();
      if (r) setBox({ left: r.left - PAD, top: r.top - PAD, width: r.width + 2 * PAD, height: r.height + 2 * PAD });
    };
    measure();
    // The board and rack take their size just after they mount.
    const f = requestAnimationFrame(measure);
    addEventListener('resize', measure);
    return () => { cancelAnimationFrame(f); removeEventListener('resize', measure); };
  }, [s.target]);
  useEffect(() => { next.current?.focus(); }, [step]);

  const lower = box ? box.top + box.height / 2 > innerHeight / 2 : false;
  return (
    <div id="duel-coach" className="coach" role="dialog" aria-modal="true" aria-labelledby={titleId}
      onKeyDown={(e) => { e.stopPropagation(); if (e.key === 'Escape') onDone(); }}>
      {box && <div className="coach-spot" style={box} aria-hidden="true" />}
      {box && step === 0 && <div className="coach-hand" style={{ left: box.left + box.width * 0.2, top: box.top + 12 }} aria-hidden="true" />}
      <div className="coach-tipbox" style={box ? (lower ? { bottom: innerHeight - box.top + 12 } : { top: box.top + box.height + 12 }) : undefined}>
        <div className="coach-k" id={titleId}>{s.k}</div>
        <p className="coach-en">{s.en}</p>
        <p className="coach-hi" lang="hi">{s.hi}</p>
        <div className="coach-row">
          <div className="coach-dots" aria-hidden="true">{COACH.map((c, i) => <i key={c.k} className={i === step ? 'on' : ''} />)}</div>
          <button type="button" data-coach="skip" onClick={onDone}>Skip</button>
          <button type="button" ref={next} className="next" data-coach="next" onClick={() => { if (last) onDone(); else setStep(step + 1); }}>{last ? 'Let’s play' : 'Next'}</button>
        </div>
      </div>
    </div>
  );
}

/** A later one-time tip: it asks for nothing and leaves the game playable. */
export function LaterTip({ id, onDismiss }: { id: TipId; onDismiss: () => void }) {
  return (
    <div className="coach-tip" role="status">
      <div>
        <p className="coach-en">{LATER[id].en}</p>
        <p className="coach-hi" lang="hi">{LATER[id].hi}</p>
      </div>
      <button type="button" onClick={onDismiss}>Got it</button>
    </div>
  );
}
