'use client';

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { decideHeard, listen, loadVoiceLang, recognitionCtor, saveVoiceLang, type VoiceError, type VoiceLang } from '@/lib/voice';
import { MicIcon } from '@/components/ui/icons';
import { Button, Segmented, Sheet } from '@/components/ui';

interface VoiceSearchProps {
  online: boolean;
  /** Opened by the "Speak a word" shortcut: the overlay shows a big mic to tap (browsers need a tap before listening). */
  ready?: boolean;
  onReadyDone?: () => void;
  onHeardText: (text: string) => void;
  onHeardWord: (word: string, alternates: string[]) => void;
}

// 'closed', waiting for a tap ('ready'), listening, or showing why it can't listen.
type Phase = 'closed' | 'ready' | 'listening' | Exclude<VoiceError, 'nothing'>;

const LANGS: Array<{ value: VoiceLang; label: React.ReactNode }> = [
  { value: 'en', label: 'English' },
  { value: 'hi', label: <span lang="hi">हिंदी</span> },
];

function Message({ phase }: { phase: Exclude<Phase, 'closed' | 'ready' | 'listening'> }) {
  if (phase === 'blocked') return <p className="voice-message">{"Microphone is blocked. Allow it for this site in your browser's settings."}</p>;
  if (phase === 'unavailable') return <p className="voice-message">{"Voice isn't available here"}</p>;
  return (
    <>
      <p className="voice-message">Voice needs a connection</p>
      <p className="voice-message-hi" lang="hi">आवाज़ के लिए इंटरनेट चाहिए</p>
    </>
  );
}

// The mic button in the search box and its listening overlay. Hidden where the browser has no speech recognition.
export function VoiceSearch({ online, ready, onReadyDone, onHeardText, onHeardWord }: VoiceSearchProps) {
  // null until checked after mount: the server can't know, and guessing would mismatch on hydration.
  const [supported, setSupported] = useState<boolean | null>(null);
  const [lang, setLang] = useState<VoiceLang>('en');
  const [phase, setPhase] = useState<Phase>('closed');
  const micRef = useRef<HTMLButtonElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const heard = useRef({ onHeardText, onHeardWord });
  heard.current = { onHeardText, onHeardWord };

  useEffect(() => {
    setSupported(Boolean(recognitionCtor()));
    setLang(loadVoiceLang());
  }, []);

  useEffect(() => {
    if (!ready || supported === null) return;
    onReadyDone?.();
    if (supported) setPhase(online ? 'ready' : 'offline');
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, supported]);

  // One utterance per listening phase; changing the language (or closing) cancels it, and a new one starts.
  useEffect(() => {
    if (phase !== 'listening') return;
    return listen(lang, {
      onResult: (transcripts) => {
        setPhase('closed');
        const result = decideHeard(transcripts, lang);
        if (result.kind === 'word') heard.current.onHeardWord(result.word, result.alternates);
        else heard.current.onHeardText(result.text);
      },
      // Nothing heard: back to the search box without a word.
      onError: (error) => setPhase(error === 'nothing' ? 'closed' : error),
    });
  }, [phase, lang]);

  const showsError = phase === 'blocked' || phase === 'unavailable' || phase === 'offline';
  useEffect(() => { if (showsError) closeRef.current?.focus(); }, [showsError]);

  if (!supported) return null;

  const close = () => setPhase('closed');
  const chooseLang = (next: VoiceLang) => { setLang(next); saveVoiceLang(next); };

  return (
    <>
      <button ref={micRef} id="voice-btn" type="button" className="lookup-mic" aria-label="Search by voice" aria-haspopup="dialog"
        onClick={() => setPhase(online ? 'listening' : 'offline')}>
        <MicIcon />
      </button>
      {phase !== 'closed' && createPortal(
        <Sheet open onClose={close} ariaLabel="Voice search" className="voice-sheet" returnFocusTo={() => micRef.current}>
          {showsError ? (
            <div className="voice-body">
              <div role="alert"><Message phase={phase} /></div>
              <Button ref={closeRef} className="voice-close" onClick={close}>Close</Button>
            </div>
          ) : (
            <div className="voice-body">
              <h2 className="voice-title">Say a word</h2>
              <p className="voice-title-hi" lang="hi">कोई शब्द बोलिए</p>
              {phase === 'ready' ? (
                <button type="button" className="voice-orb voice-orb--ready" aria-label="Start listening" onClick={() => setPhase('listening')}>
                  <span className="voice-ring" aria-hidden="true" /><MicIcon />
                </button>
              ) : (
                <div className="voice-orb voice-orb--listening" aria-hidden="true"><span className="voice-ring" /><MicIcon /></div>
              )}
              <p className="ui-visually-hidden" role="status">{phase === 'listening' ? 'Listening' : ''}</p>
              <Segmented label="Listening language" options={LANGS} value={lang} onChange={chooseLang} />
              <Button className="voice-cancel" onClick={close}>Cancel</Button>
            </div>
          )}
        </Sheet>,
        document.body,
      )}
    </>
  );
}
