// The Duel's sound adapter with a stand-in AudioContext: files where chosen, the synthesised sound otherwise.
import { webSound } from '../src/duel/platform/web/sound';

let failures = 0, total = 0;
function check(label: string, ok: boolean, detail?: unknown) {
  total++;
  if (ok) console.log(`✓ ${label}`);
  else { failures++; console.error(`✗ ${label}${detail !== undefined ? ` — ${JSON.stringify(detail)}` : ''}`); }
}

function fakeContext(decode: (b: ArrayBuffer) => Promise<unknown> = async () => ({ duration: 0.2 })) {
  const log = { oscillators: 0, buffersPlayed: [] as { buffer: unknown; rate: number; gain: number }[], decoded: 0 };
  const param = () => ({ value: 1, setValueAtTime() {}, linearRampToValueAtTime() {}, exponentialRampToValueAtTime() {} });
  const node = (extra = {}) => ({ connect(n: unknown) { return n; }, ...extra });
  const context = {
    state: 'running', currentTime: 0, sampleRate: 8000, destination: {},
    resume: async () => {},
    createOscillator: () => { log.oscillators++; return node({ type: '', frequency: param(), start() {}, stop() {} }); },
    createGain: () => node({ gain: param() }),
    createBiquadFilter: () => node({ type: '', frequency: param(), Q: param() }),
    createBuffer: () => ({ getChannelData: () => new Float32Array(10) }),
    createBufferSource: () => {
      const gain = { value: 1 };
      const n = node({ buffer: null as unknown, playbackRate: { value: 1 }, start() { log.buffersPlayed.push({ buffer: n.buffer, rate: n.playbackRate.value, gain: gain.value }); } }) as { buffer: unknown; playbackRate: { value: number }; start(): void };
      return n;
    },
    decodeAudioData: async (b: ArrayBuffer) => { log.decoded++; return decode(b); },
  };
  return { context: context as unknown as AudioContext, log };
}

const settle = () => new Promise(r => setTimeout(r, 5));
const ok = (async () => new Response(new ArrayBuffer(8))) as unknown as typeof fetch;

{
  const { context, log } = fakeContext();
  let fetched = 0;
  const s = webSound({ files: { drop: { src: '/d.mp3' }, chip: { src: '/c.mp3' } }, audioContext: () => context, fetchFn: ((...a: Parameters<typeof fetch>) => { fetched++; return ok(...a); }) as typeof fetch });
  s.play('drop');
  check('nothing plays before the first touch', log.oscillators === 0 && log.buffersPlayed.length === 0);
  s.unlock();
  s.play('drop');
  check('until a file has decoded, the synthesised sound plays', log.oscillators > 0 && !log.buffersPlayed.some(b => (b.buffer as { duration?: number }).duration));
  await settle();
  s.unlock();
  check('each file is fetched and decoded once, however many touches', fetched === 2 && log.decoded === 2, { fetched, decoded: log.decoded });
  const before = log.oscillators;
  s.play('drop');
  check('after decoding, the file plays and the synth does not', log.oscillators === before && (log.buffersPlayed.at(-1)?.buffer as { duration: number }).duration === 0.2);
  s.play('chip', 12);
  check('a chip rises by its step: 12 semitones is double speed', log.buffersPlayed.at(-1)?.rate === 2, log.buffersPlayed.at(-1));
  s.play('rack');
  check('a sound with no file stays synthesised', log.oscillators > before);
  s.enabled = false;
  const count = log.buffersPlayed.length, osc = log.oscillators;
  s.play('drop'); s.play('rack');
  check('with Sound off, nothing plays', log.buffersPlayed.length === count && log.oscillators === osc);
}
{
  const { context, log } = fakeContext();
  const s = webSound({ files: { drop: { src: '/d.mp3' } }, audioContext: () => context, fetchFn: (async () => { throw new TypeError('offline'); }) as unknown as typeof fetch });
  s.unlock();
  await settle();
  s.play('drop');
  check('a failed fetch falls back to the synth, and nothing throws', log.oscillators > 0);
}
{
  const { context, log } = fakeContext(async () => { throw new Error('bad file'); });
  const s = webSound({ files: { drop: { src: '/d.mp3' } }, audioContext: () => context, fetchFn: ok });
  s.unlock();
  await settle();
  s.play('drop');
  check('a file that can\'t be decoded falls back to the synth, and nothing throws', log.oscillators > 0 && log.decoded === 1);
}
{
  const { context } = fakeContext();
  let fetched = 0;
  const s = webSound({ files: { drop: { src: '/d.mp3' } }, audioContext: () => context, fetchFn: ((...a: Parameters<typeof fetch>) => { fetched++; return ok(...a); }) as typeof fetch });
  s.enabled = false;
  s.unlock();
  await settle();
  check('with Sound off, no file is fetched', fetched === 0);
  s.enabled = true;
  s.unlock();
  await settle();
  check('turning Sound on fetches them on the next touch', fetched === 1);
}
{
  const { context, log } = fakeContext();
  const s = webSound({ files: {}, audioContext: () => context, fetchFn: ok });
  s.unlock();
  for (const name of ['thud', 'chime', 'seal', 'crown'] as const) {
    const before = log.oscillators;
    s.play(name);
    check(`${name} has a synthesised sound`, log.oscillators > before);
  }
}

if (failures) { console.error(`\n${failures} failed`); process.exit(1); }
console.log(`\nDuel sound: ${total}/${total} checks passed.`);
