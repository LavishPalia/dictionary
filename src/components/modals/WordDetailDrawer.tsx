'use client';

import React, { useEffect, useState } from 'react';
import { DictionaryEntry } from '@/lib/types';
import { describePos } from '@/lib/pos';
import { flyToSaved } from '@/lib/motion';
import { SpeechLang, speechUnavailableReason, useSpeechVoices } from '@/lib/speech';
import { Button, IconButton, Sheet } from '@/components/ui';
import { CloseIcon, SpeakerIcon, StarIcon } from '@/components/ui/icons';

interface WordDetailDrawerProps {
  entry: DictionaryEntry | null;
  pageNumber: number;
  isOpen: boolean;
  onClose: () => void;
  onSelectWord: (headword: string, destPage?: number) => void;
  isBookmarked: boolean;
  onToggleBookmark: (entry: DictionaryEntry) => void;
  /** For saved words: when the word next comes up in Review. */
  reviewNote?: string | null;
}

// The word sheet: a bottom sheet on phones, a side panel beside the book on desktop. Hindi is the largest
// thing after the word itself. Example sentences and similar/opposite words appear only for entries that have them.
export const WordDetailDrawer: React.FC<WordDetailDrawerProps> = ({
  entry,
  pageNumber,
  isOpen,
  onClose,
  onSelectWord,
  isBookmarked,
  onToggleBookmark,
  reviewNote,
}) => {
  const [speaking, setSpeaking] = useState<SpeechLang | null>(null);
  const speech = useSpeechVoices();
  // The ink stamp plays only when the reader saves, not when reopening a word saved earlier.
  const [justSaved, setJustSaved] = useState(false);
  useEffect(() => setJustSaved(false), [entry?.normalized, isOpen]);

  if (!entry) return null;

  const unavailable: Record<SpeechLang, string | null> = {
    en: speechUnavailableReason(speech, 'en'),
    hi: speechUnavailableReason(speech, 'hi'),
  };

  const playSpeech = (lang: SpeechLang) => {
    if (typeof window === 'undefined' || !window.speechSynthesis || unavailable[lang]) return;

    window.speechSynthesis.cancel();
    const text = lang === 'en' ? entry.headword : entry.meaning_hi;
    const utterance = new SpeechSynthesisUtterance(text);
    const voice = speech.voices[lang];
    if (voice) utterance.voice = voice;
    utterance.lang = voice?.lang ?? (lang === 'en' ? 'en-IN' : 'hi-IN');
    utterance.rate = 0.9;

    setSpeaking(lang);
    utterance.onend = () => setSpeaking(null);
    utterance.onerror = () => setSpeaking(null);

    window.speechSynthesis.speak(utterance);
  };

  const pos = describePos(entry.pos);
  const examples = entry.examples?.filter(Boolean) ?? [];
  const speakButton = (lang: SpeechLang, label: React.ReactNode, what: string) => (
    <Button
      id={`speak-${lang}-btn`}
      size="small"
      onClick={() => playSpeech(lang)}
      disabled={speaking !== null || !!unavailable[lang]}
      title={unavailable[lang] ?? `Say the ${what} aloud`}
      aria-label={unavailable[lang] ? `Say the ${what} aloud (${unavailable[lang]})` : `Say the ${what} aloud`}
    >
      <SpeakerIcon />{label}
    </Button>
  );

  return (
    <Sheet open={isOpen} onClose={onClose} labelledBy="word-sheet-title" id="word-sheet" scrimId="word-drawer-backdrop" variant="side">
      <div className="word-head">
        <div>
          <div className="word-title-row">
            <h2 id="word-sheet-title" className="word-title">{entry.headword}</h2>
            {entry.pronunciation_deva && (
              <span className="word-pron" lang="hi" title="How it sounds, in Devanagari">{entry.pronunciation_deva}</span>
            )}
          </div>
          {pos.label && (
            <span className="ui-tag word-pos" title={entry.pos}>{pos.label}{pos.hint && ` · ${pos.hint}`}</span>
          )}
        </div>
        <IconButton id="close-word-drawer" surface="paper" aria-label="Close word details" onClick={onClose}>
          <CloseIcon />
        </IconButton>
      </div>

      <p className="word-hi" lang="hi">{entry.meaning_hi}</p>
      <p className="word-def">{entry.definition_en}</p>

      <div className="word-actions">
        {speakButton('en', 'English', 'English word')}
        {speakButton('hi', <span lang="hi">हिंदी</span>, 'Hindi meaning')}
      </div>

      {examples.length > 0 && (
        <>
          <hr className="ui-divider" />
          <div className="ui-label">Example</div>
          {examples.map((example) => <p key={example} className="word-example">{example}</p>)}
        </>
      )}

      <hr className="ui-divider" />
      <div className="word-actions">
        <Button
          id="save-word-btn"
          variant={isBookmarked ? 'primary' : 'paper'}
          aria-pressed={isBookmarked}
          className={isBookmarked && justSaved ? 'motion-stamp' : undefined}
          onClick={(event) => {
            if (!isBookmarked) { setJustSaved(true); flyToSaved(event.currentTarget); }
            onToggleBookmark(entry);
          }}
          style={{ flex: 1 }}
        >
          <StarIcon />{isBookmarked ? 'Saved' : 'Save word'}
        </Button>
      </div>

      {reviewNote && <p className="word-review-note" id="word-review-note">{reviewNote}</p>}

      <div className="word-foot">
        <span className="word-provenance">
          {entry.reviewed === 0 ? 'Machine-written · not yet checked by a reviewer' : ''}
        </span>
        <button type="button" className="lookup-link word-goto" id="see-on-page-btn"
          onClick={() => { onClose(); onSelectWord(entry.headword, pageNumber); }}>
          See on page {pageNumber.toLocaleString('en-IN')} ›
        </button>
      </div>
    </Sheet>
  );
};
