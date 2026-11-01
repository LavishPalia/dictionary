// The prototype's synthesised sounds (docs/crossword-duel/ui/game.html): wood knocks and soft sine chimes.
// No files to load and no decode delay. A sound can become a sample later without changing callers.
import type { Sound, SoundName } from '../types';

type Tone = { type?: OscillatorType; vol?: number; at?: number; slide?: number };

export function webSound(): Sound {
  let ac: AudioContext | null = null;
  const ctx = (): AudioContext | null => {
    if (!ac) {
      try {
        const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
        ac = AC ? new AC() : null;
      } catch { ac = null; }
    }
    if (ac && ac.state === 'suspended') void ac.resume();
    return ac;
  };
  const tone = (f: number, dur: number, { type = 'sine', vol = 0.12, at = 0, slide = 0 }: Tone = {}) => {
    const a = ctx(); if (!a) return;
    const t = a.currentTime + at;
    const o = a.createOscillator(), g = a.createGain();
    o.type = type; o.frequency.setValueAtTime(f, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(f * slide, t + dur);
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vol, t + 0.008); g.gain.exponentialRampToValueAtTime(0.0005, t + dur);
    o.connect(g).connect(a.destination); o.start(t); o.stop(t + dur + 0.02);
  };
  const knock = (vol = 0.18, f = 900) => {
    const a = ctx(); if (!a) return;
    const t = a.currentTime, len = 0.05;
    const buf = a.createBuffer(1, Math.floor(a.sampleRate * len), a.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / d.length, 4);
    const n = a.createBufferSource(); n.buffer = buf;
    const bp = a.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = f; bp.Q.value = 2.5;
    const g = a.createGain(); g.gain.value = vol;
    n.connect(bp).connect(g).connect(a.destination); n.start(t);
    tone(f / 5, 0.07, { type: 'triangle', vol: vol * 0.5 });
  };
  const SND: Record<SoundName, (step: number) => void> = {
    lift: () => knock(0.07, 1600),
    drop: () => knock(0.2, 850),
    chip: (i) => tone(740 * Math.pow(2, i / 12), 0.14, { vol: 0.07 }),
    coin: () => tone(1320, 0.08, { vol: 0.04 }),
    word: () => [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.35, { vol: 0.07, at: i * 0.06 })),
    wrong: () => { tone(140, 0.22, { type: 'square', vol: 0.05, slide: 0.6 }); knock(0.12, 300); },
    bonus: () => { [523, 659, 784, 1047, 1319, 1568].forEach((f, i) => tone(f, 0.5, { vol: 0.07, at: i * 0.07 })); tone(2093, 0.8, { vol: 0.03, at: 0.45 }); },
    rack: () => knock(0.1, 1200),
    think: () => tone(330, 0.12, { vol: 0.03 }),
  };
  const sound: Sound = {
    enabled: true,
    // Only after unlock(): before the first touch there is no context, and making one would only warn.
    play(name, step = 0) { if (sound.enabled && ac) { try { SND[name](step); } catch {} } },
    unlock() { ctx(); },
  };
  return sound;
}
