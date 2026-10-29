// Voice search: the browser's own speech recognition (Google on Android Chrome, Apple on Safari), so it needs a
// connection. Panna listens for one short utterance and then decides what was heard: one English word may open its
// card (decided by the caller against the book); anything else goes into the search box.

export type VoiceLang = 'en' | 'hi';
export type VoiceError = 'offline' | 'blocked' | 'unavailable' | 'nothing';

// The small part of SpeechRecognition Panna uses, declared here rather than relying on lib.dom's speech types.
export interface SpeechRecognitionLike {
  lang: string;
  maxAlternatives: number;
  interimResults: boolean;
  continuous: boolean;
  onresult: ((event: { resultIndex?: number; results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
  start(): void;
  abort(): void;
}

type RecognitionCtor = new () => SpeechRecognitionLike;

const STORAGE_KEY = 'panna-voice-lang';
const LOCALES: Record<VoiceLang, string> = { en: 'en-IN', hi: 'hi-IN' };
const ONE_WORD = /^[A-Za-z]+(?:['’-][A-Za-z]+)*$/;

/** window.__pannaRecognition (a test fake constructor) ?? SpeechRecognition ?? webkitSpeechRecognition ?? null */
export function recognitionCtor(): RecognitionCtor | null {
  if (typeof window === 'undefined') return null;
  const w = window as unknown as Record<string, RecognitionCtor | null | undefined>;
  return w.__pannaRecognition ?? w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

function errorFor(code: string): VoiceError {
  if (code === 'not-allowed') return 'blocked';
  if (code === 'network') return 'offline';
  if (code === 'no-speech' || code === 'aborted') return 'nothing';
  // 'service-not-allowed', 'audio-capture', 'language-not-supported' and anything a browser adds later.
  return 'unavailable';
}

/** Listens once. Exactly one of onResult / onError is called, unless cancel() comes first (then neither is). */
export function listen(lang: VoiceLang, handlers: { onResult: (transcripts: string[]) => void; onError: (e: VoiceError) => void }): () => void {
  const Ctor = recognitionCtor();
  let done = false;
  const finish = (report: () => void) => { if (!done) { done = true; report(); } };
  if (!Ctor) {
    queueMicrotask(() => finish(() => handlers.onError('unavailable')));
    return () => { done = true; };
  }

  const recognition = new Ctor();
  recognition.lang = LOCALES[lang];
  recognition.maxAlternatives = 5;
  recognition.interimResults = false;
  recognition.continuous = false;
  recognition.onresult = (event) => {
    const result = event.results[event.results.length - 1];
    const transcripts: string[] = [];
    for (let i = 0; result && i < result.length; i++) {
      const text = result[i]?.transcript?.trim();
      if (text) transcripts.push(text);
    }
    finish(() => (transcripts.length ? handlers.onResult(transcripts) : handlers.onError('nothing')));
  };
  recognition.onerror = (event) => finish(() => handlers.onError(errorFor(event.error)));
  // Stopped by itself after a pause without hearing anything.
  recognition.onend = () => finish(() => handlers.onError('nothing'));
  try {
    recognition.start();
  } catch {
    finish(() => handlers.onError('unavailable'));
  }
  return () => {
    if (done) return;
    done = true;
    try { recognition.abort(); } catch {}
  };
}

export function loadVoiceLang(): VoiceLang {
  try { return localStorage.getItem(STORAGE_KEY) === 'hi' ? 'hi' : 'en'; } catch { return 'en'; }
}

export function saveVoiceLang(lang: VoiceLang): void {
  try { localStorage.setItem(STORAGE_KEY, lang); } catch {}
}

/** 'en' and the first transcript is one word → { kind: 'word', word, alternates: the other single-word transcripts,
 * distinct, case-insensitive, excluding word }; otherwise { kind: 'text', text: first transcript }. Hindi is always text. */
export function decideHeard(transcripts: string[], lang: VoiceLang):
  { kind: 'word'; word: string; alternates: string[] } | { kind: 'text'; text: string } {
  const [raw = ''] = transcripts;
  // Recognisers may end a lone word with a full stop or a question mark ("Obfuscate."): one is dropped.
  const [first = '', ...rest] = transcripts.map((t) => t.replace(/\s*[.,!?]\s*$/, '').trim());
  if (lang !== 'en' || !ONE_WORD.test(first)) return { kind: 'text', text: raw };
  const seen = new Set([first.toLowerCase()]);
  const alternates: string[] = [];
  for (const t of rest) {
    if (!ONE_WORD.test(t) || seen.has(t.toLowerCase())) continue;
    seen.add(t.toLowerCase());
    alternates.push(t);
  }
  return { kind: 'word', word: first, alternates };
}
