// Browser text-to-speech voice selection. Devices differ a lot: many desktops have no Hindi voice, and some
// browsers load their voice list late (voiceschanged), so the choice is re-made whenever the list changes.
import { useEffect, useState } from 'react';

export type SpeechLang = 'en' | 'hi';

/** Preferred voice languages, best first. Indian English first: it is what Panna's readers hear around them. */
const PREFERENCE: Record<SpeechLang, string[]> = {
  en: ['en-in', 'en-gb', 'en-us', 'en'],
  hi: ['hi-in', 'hi'],
};

const tag = (v: SpeechSynthesisVoice) => v.lang.replace('_', '-').toLowerCase();

export function pickVoice(voices: SpeechSynthesisVoice[], lang: SpeechLang): SpeechSynthesisVoice | null {
  for (const pref of PREFERENCE[lang]) {
    const match = pref.includes('-')
      ? voices.find((v) => tag(v) === pref)
      : voices.find((v) => tag(v) === pref || tag(v).startsWith(`${pref}-`));
    if (match) return match;
  }
  return null;
}

export interface VoiceState {
  /** speechSynthesis exists in this browser. */
  supported: boolean;
  /** The browser has reported its voice list (it may arrive after first render). */
  ready: boolean;
  voices: Record<SpeechLang, SpeechSynthesisVoice | null>;
}

export function useSpeechVoices(): VoiceState {
  const [state, setState] = useState<VoiceState>({ supported: true, ready: false, voices: { en: null, hi: null } });

  useEffect(() => {
    const synth = typeof window !== 'undefined' ? window.speechSynthesis : undefined;
    if (!synth) {
      setState({ supported: false, ready: true, voices: { en: null, hi: null } });
      return;
    }
    const load = () => {
      const voices = synth.getVoices();
      setState({
        supported: true,
        ready: voices.length > 0,
        voices: { en: pickVoice(voices, 'en'), hi: pickVoice(voices, 'hi') },
      });
    };
    load();
    synth.addEventListener('voiceschanged', load);
    return () => synth.removeEventListener('voiceschanged', load);
  }, []);

  return state;
}

/**
 * Why a language cannot be spoken, or null if it can. While the voice list is still loading nothing is
 * reported missing, so a button is never disabled just because the browser was slow.
 */
export function speechUnavailableReason(state: VoiceState, lang: SpeechLang): string | null {
  if (!state.supported) return 'This browser cannot speak words aloud';
  if (state.ready && !state.voices[lang]) {
    return lang === 'hi' ? 'No Hindi voice on this device' : 'No English voice on this device';
  }
  return null;
}
