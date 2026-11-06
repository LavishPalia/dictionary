// The Duel's sounds: short files where one has been chosen, decoded once on the first touch, and the prototype's
// synthesised wood knocks and sine chimes (docs/crossword-duel/ui/game.html) for the rest, and whenever a file
// hasn't loaded or can't be decoded.
import type { Sound, SoundName } from '../types';

type Tone = { type?: OscillatorType; vol?: number; at?: number; slide?: number };
export interface SoundFile { src: string; gain?: number }

/** The chosen files (Kenney's CC0 packs). Names carry a version, because they are cached forever. */
export const SOUND_FILES: Partial<Record<SoundName, SoundFile>> = {};

export const soundFileList = (files = SOUND_FILES): string[] => Object.values(files).map(f => f.src);

export function webSound({ files = SOUND_FILES, audioContext, fetchFn = (...a) => fetch(...a) }: {
  files?: Partial<Record<SoundName, SoundFile>>; audioContext?: () => AudioContext | null; fetchFn?: typeof fetch;
} = {}): Sound {
  let ac: AudioContext | null = null;
  const make = audioContext ?? (() => {
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    return AC ? new AC() : null;
  });
  const ctx = (): AudioContext | null => {
    if (!ac) {
      try { ac = make(); } catch { ac = null; }
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
  const rising = (notes: number[], step = 0.07, dur = 0.5) => notes.forEach((f, i) => tone(f, dur, { vol: 0.07, at: i * step }));
  const SND: Record<SoundName, (step: number) => void> = {
    lift: () => knock(0.07, 1600),
    drop: () => knock(0.2, 850),
    chip: (i) => tone(740 * Math.pow(2, i / 12), 0.14, { vol: 0.07 }),
    coin: () => tone(1320, 0.08, { vol: 0.04 }),
    word: () => rising([523, 659, 784, 1047], 0.06, 0.35),
    wrong: () => { tone(140, 0.22, { type: 'square', vol: 0.05, slide: 0.6 }); knock(0.12, 300); },
    bonus: () => { rising([523, 659, 784, 1047, 1319, 1568]); tone(2093, 0.8, { vol: 0.03, at: 0.45 }); },
    rack: () => knock(0.1, 1200),
    think: () => tone(330, 0.12, { vol: 0.03 }),
    thud: () => { tone(90, 0.3, { type: 'triangle', vol: 0.2, slide: 0.6 }); knock(0.2, 260); },
    chime: () => rising([784, 988, 1175], 0.09),
    seal: () => rising([523, 659, 784, 1047, 1319], 0.11, 0.7),
    crown: () => { rising([523, 659, 784, 1047, 1319, 1568], 0.09, 0.6); tone(2093, 1, { vol: 0.03, at: 0.6 }); },
  };

  const chosen = new Map(Object.entries(files) as [SoundName, SoundFile][]);
  const buffers = new Map<string, Promise<AudioBuffer | null>>();
  const decoded = new Map<string, AudioBuffer>();
  const load = (a: AudioContext, src: string) => {
    if (buffers.has(src)) return;
    buffers.set(src, (async () => {
      try {
        const res = await fetchFn(src);
        if (!res.ok) return null;
        const buffer = await a.decodeAudioData(await res.arrayBuffer());
        decoded.set(src, buffer);
        return buffer;
      } catch { return null; } // the synthesised sound stands in
    })());
  };
  const playFile = (a: AudioContext, name: SoundName, step: number): boolean => {
    const file = chosen.get(name), buffer = file && decoded.get(file.src);
    if (!file || !buffer) return false;
    const n = a.createBufferSource(), g = a.createGain();
    n.buffer = buffer;
    if (step) n.playbackRate.value = Math.pow(2, step / 12);
    g.gain.value = file.gain ?? 1;
    n.connect(g).connect(a.destination);
    n.start();
    return true;
  };

  const sound: Sound = {
    enabled: true,
    // Only after unlock(): before the first touch there is no context, and making one would only warn.
    play(name, step = 0) {
      if (!sound.enabled || !ac) return;
      try { if (!playFile(ac, name, step)) SND[name](step); } catch {}
    },
    unlock() {
      const a = ctx();
      if (!a || !sound.enabled) return; // with Sound off, nothing is fetched
      for (const f of chosen.values()) load(a, f.src);
    },
    choose(name, file) {
      if (file) chosen.set(name, file); else chosen.delete(name);
      if (ac && file) load(ac, file.src);
    },
  };
  return sound;
}
