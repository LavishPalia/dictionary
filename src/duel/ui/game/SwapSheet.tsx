import { useRef, useState } from 'react';
import type { GameController } from '../controller/controller';
import type { Snapshot } from '../controller/types';
import type { Motion } from '../fx/layer';
import { T } from '../fx/timings';
import { Sheet } from './Sheet';

const POUCH = (
  <svg className="pouch" viewBox="0 0 64 64" aria-hidden="true">
    <path d="M22 14c3 3 17 3 20 0l-3 8c8 5 15 14 15 24 0 9-10 13-22 13S10 55 10 46c0-10 7-19 15-24z" fill="#8a5a32" stroke="#4a2c14" strokeWidth="2" />
    <path d="M24 22c5 2 11 2 16 0" stroke="#e8d3a0" strokeWidth="2.5" fill="none" />
    <path d="M27 12c2-4 8-4 10 0" stroke="#4a2c14" strokeWidth="2" fill="none" />
    <text x="32" y="47" fontFamily="serif" fontSize="13" fill="#f3e0b8" textAnchor="middle">A–Z</text>
  </svg>
);

/** Swap tiles: pick tiles to put back in the bag, then swap and pass (UI-DESIGN §3.3). */
export function SwapSheet({ snap, ctl, motion }: { snap: Snapshot; ctl: GameController; motion: Motion }) {
  const [picked, setPicked] = useState<number[]>([]);
  const [going, setGoing] = useState(false);
  const bag = useRef<HTMLDivElement>(null);
  const rack = snap.state.racks.you;
  const inRack = rack.map((l, i) => (l ? i : -1)).filter(i => i >= 0);
  const max = Math.min(inRack.length, snap.state.bag.length);
  const all = picked.length === max && max > 0;

  const toggle = (i: number) => {
    if (going) return;
    setPicked(p => (p.includes(i) ? p.filter(x => x !== i) : p.length < max ? [...p, i] : p));
  };

  const confirm = async () => {
    if (!picked.length || going) return;
    setGoing(true);
    // The chosen tiles fall into the bag and it wobbles; then Quill's turn (the new tiles pop into the rack).
    const pouch = bag.current?.querySelector('.pouch');
    const pr = pouch?.getBoundingClientRect();
    if (pr && !motion.reduced) {
      const falls = [...(bag.current?.parentElement?.querySelectorAll<HTMLElement>('[data-pick][aria-pressed="true"]') ?? [])].map((t, j) => {
        const r = t.getBoundingClientRect();
        const dx = pr.left + pr.width / 2 - r.left - r.width / 2, dy = pr.top + pr.height / 2 - r.top - r.height / 2;
        return t.animate([{ transform: 'translateY(-10px)' }, { transform: `translate(${dx}px,${dy}px) scale(.25)`, opacity: 0.2 }],
          { duration: T.swapFall, delay: j * T.swapFallStagger, easing: 'cubic-bezier(.5,0,.6,1)', fill: 'forwards' }).finished;
      });
      await Promise.all(falls);
      await pouch!.animate([{ transform: 'none' }, { transform: 'rotate(-8deg) scale(1.06)', offset: 0.25 }, { transform: 'rotate(6deg)', offset: 0.6 }, { transform: 'none' }],
        { duration: 500, easing: 'ease-in-out' }).finished;
    }
    await ctl.swap([...picked].sort((a, b) => a - b));
  };

  return (
    <Sheet onClose={() => ctl.closeSheet()}>
      {(titleId) => (
        <>
          <div className="grab" aria-hidden="true" />
          <button type="button" className="x" aria-label="Close" data-close onClick={() => ctl.closeSheet()}>×</button>
          <h3 id={titleId}>Swap tiles</h3>
          <p className="sub2">Pick the tiles to put back in the bag</p>
          <div ref={bag}>{POUCH}</div>
          <div className="srack">
            {rack.map((l, i) => l && (
              <button type="button" key={i} className="duel-tile" data-pick={i} aria-pressed={picked.includes(i)}
                aria-label={`Tile ${l}`} onClick={() => toggle(i)}>
                <span className="lt">{l}</span>
              </button>
            ))}
          </div>
          {max < inRack.length && <p className="note">Only {max} tile{max === 1 ? '' : 's'} left in the bag</p>}
          <button type="button" className="selall" data-all onClick={() => setPicked(all ? [] : inRack.slice(0, max))}>
            {all ? 'Clear' : 'Select all'}
          </button>
          <button type="button" className="bigbtn pri" data-confirm disabled={!picked.length || going} onClick={() => void confirm()}>
            {picked.length ? `Swap ${picked.length} and pass` : 'Swap and pass'}<small>Professor Quill plays next</small>
          </button>
          <button type="button" className="bigbtn sec" disabled>
            Swap and keep my turn<small>Watch a short video</small><span className="soon">Coming soon</span>
          </button>
        </>
      )}
    </Sheet>
  );
}
