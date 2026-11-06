// A temporary screen for tuning: try scoring speeds on a real board and compare sounds, on the real phone. Reached
// only by typing /play/lab. It goes away once the choices are baked in.
import { useEffect, useMemo, useRef, useState } from 'react';
import type { Puzzle } from '../../engine';
import type { Platform, SoundName } from '../../platform/types';
import type { GameController } from '../controller/controller';
import type { Snapshot } from '../controller/types';
import type { Nav } from '../dates';
import { WebDirector } from '../fx/director';
import { FxLayer, type Motion } from '../fx/layer';
import { Stage } from '../fx/stage';
import { Board } from '../game/Board';
import { ScoreBar } from '../game/ScoreBar';
import { istToday } from '../router';
import { BackBar } from '../settings/BackBar';
import { labTurn } from './lab-turn';

const SPEEDS = [1, 0.8, 0.65, 0.5];
const RAMPS: [string, number][] = [['same', 1], ['quicker', 0.85], ['much quicker', 0.7]];
const TURNS: [string, number, boolean][] = [['1 word', 1, false], ['3 words', 3, false], ['5 words + Empty hand', 5, true]];
const SOUNDS: [SoundName, string][] = [['lift', 'Pick up a tile'], ['drop', 'Tile lands'], ['word', 'Right tile or finished word'], ['wrong', 'Wrong tile'],
  ['bonus', 'Empty hand'], ['rack', 'New tile'], ['think', 'Quill thinks'], ['thud', 'End screen: seal stamps'], ['chime', 'End screen: a win'],
  ['seal', 'Month seal'], ['crown', 'First place: the crown']];
export const LAB_KEY = 'panna_duel_lab';
type Picks = Partial<Record<SoundName, number>>;

/** Applies the lab's sound picks, so a real game at the chosen speed has them too. */
export function applyLabSounds(platform: Platform) {
  const picks = platform.storage.get<Picks>(LAB_KEY) ?? {};
  for (const [name, n] of Object.entries(picks)) if (n) platform.sound.choose(name as SoundName, { src: `/duel/sounds/lab/${name}-${n}.mp3` });
}

export function Lab({ platform, nav, back }: { platform: Platform; nav: Nav; back: () => void }) {
  const [p, setP] = useState<Puzzle | null>(null);
  const [speed, setSpeed] = useState(0.65), [ramp, setRamp] = useState(0.85), [turn, setTurn] = useState(1);
  const [run, setRun] = useState(0), [busy, setBusy] = useState(false), [took, setTook] = useState<number | null>(null);
  const [picks, setPicks] = useState<Picks>(() => platform.storage.get<Picks>(LAB_KEY) ?? {});
  const stage = useMemo(() => new Stage(), []);
  const motion = useRef<Motion>({ reduced: platform.reducedMotion(), tier: 'normal' });
  const layer = useMemo(() => new FxLayer(motion.current), []);
  useEffect(() => () => layer.destroy(), [layer]);
  useEffect(() => {
    let live = true;
    void platform.puzzles.forDate(istToday(new Date())).then(({ puzzle }) => { if (live) setP(puzzle); });
    return () => { live = false; };
  }, [platform]);
  const [, words, empty] = TURNS[turn];
  const made = useMemo(() => (p ? labTurn(p, words, empty) : null), [p, words, empty]);
  const snap: Snapshot | null = made && { state: made.state, pending: [], lifted: null, selected: null, zoom: null, lastQuill: [], hintOn: false, wordMode: false, sheet: null, busy, held: [], balance: { hint: 0, word: 0 }, rewards: null };
  const ctl = useMemo(() => ({ selectedCell: () => null, tapClue() {}, focusCell() {} }) as unknown as GameController, []);

  const play = async () => {
    if (!p || !made || !snap || busy) return;
    setBusy(true);
    setTook(null);
    setRun(n => n + 1); // a fresh board and score
    await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
    stage.measure();
    const m: Motion = { ...motion.current, pacing: { pace: speed, ramp } };
    const director = new WebDirector(p, stage, layer, platform, m);
    layer.motion = m;
    const t0 = performance.now();
    await director.resolve(made.events, 'you', snap);
    setTook((performance.now() - t0) / 1000);
    await new Promise(r => setTimeout(r, 400));
    await director.afterPublish();
    setBusy(false);
  };

  const pick = (name: SoundName, n: number) => {
    const next = { ...picks, [name]: n };
    setPicks(next);
    platform.storage.set(LAB_KEY, next);
    platform.sound.unlock();
    platform.sound.choose(name, n ? { src: `/duel/sounds/lab/${name}-${n}.mp3` } : null);
    setTimeout(() => platform.sound.play(name), n ? 150 : 0); // a moment for a first decode
  };
  const rampName = RAMPS.find(([, v]) => v === ramp)?.[0];
  const soundLine = SOUNDS.map(([name]) => `${name} ${picks[name] ? picks[name] : 'built-in'}`).join(', ');

  return (
    <div className="duel-page duel-guide duel-lab" id="duel-lab">
      <BackBar title="Speed and sound lab" back={back} />
      <p className="lab-note">Try things, play a real game, then tell Claude this line:</p>
      <p className="lab-choice" id="lab-choice">Speed {Math.round(speed * 100)} %, each next word {rampName}. Sounds: {soundLine}.</p>

      <h2 className="set-label">Scoring speed</h2>
      <div className="lab-row" role="group" aria-label="Speed">
        {SPEEDS.map(s => <button type="button" key={s} data-speed={s} aria-pressed={s === speed} onClick={() => setSpeed(s)}>{s === 1 ? '100 % (today)' : `${Math.round(s * 100)} %`}</button>)}
      </div>
      <h2 className="set-label">Each next word</h2>
      <div className="lab-row" role="group" aria-label="Each next word">
        {RAMPS.map(([name, v]) => <button type="button" key={v} data-ramp={v} aria-pressed={v === ramp} onClick={() => setRamp(v)}>{name}</button>)}
      </div>
      <h2 className="set-label">A turn that finishes</h2>
      <div className="lab-row" role="group" aria-label="The turn">
        {TURNS.map(([name], i) => <button type="button" key={name} data-turn={i} aria-pressed={i === turn} onClick={() => setTurn(i)}>{name}</button>)}
      </div>
      <button type="button" className="bigbtn pri" id="lab-play" disabled={busy || !p} onClick={() => void play()}>{busy ? 'Playing…' : 'Play this turn'}</button>
      <p className="lab-took" id="lab-took" role="status">{took !== null ? `This turn took ${took.toFixed(1)} s` : ' '}</p>

      {p && snap && (
        <div className="duel-game lab-board" key={run} style={{ '--cell': `${Math.min(42, Math.floor((Math.min(innerWidth, 560) - 16) / p.cols))}px` } as React.CSSProperties}>
          <ScoreBar snap={snap} stage={stage} />
          <Board p={p} snap={snap} ctl={ctl} stage={stage} onCell={() => {}} />
        </div>
      )}
      <button type="button" className="bigbtn" id="lab-real" onClick={() => nav(`/play/game/${istToday(new Date())}?pace=${speed}&ramp=${ramp}`)}>Play a real game at this speed</button>

      <h2 className="set-label">Sounds</h2>
      <div className="page-card set-list">
        {SOUNDS.map(([name, label]) => (
          <div className="set-row lab-sound" key={name}>
            <span><b>{label}</b></span>
            <span className="lab-row" role="group" aria-label={label}>
              {[0, 1, 2, 3].map(n => <button type="button" key={n} data-sound={`${name}-${n}`} aria-pressed={(picks[name] ?? 0) === n} onClick={() => pick(name, n)}>{n === 0 ? 'Built-in' : n}</button>)}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
