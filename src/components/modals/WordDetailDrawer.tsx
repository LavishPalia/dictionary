'use client';

import React, { useEffect, useState } from 'react';
import { DictionaryEntry, RelatedWord } from '@/lib/types';
import { describePos } from '@/lib/pos';
import { flyToSaved } from '@/lib/motion';
import { SpeechLang, speechUnavailableReason, useSpeechVoices } from '@/lib/speech';
import { Button, Chip, IconButton, Sheet } from '@/components/ui';
import { CloseIcon, SpeakerIcon, StarIcon } from '@/components/ui/icons';
import { ReportForm } from './ReportForm';
import { REPORTS_ENABLED } from '@/lib/report';

interface WordDetailDrawerProps {
  entry: DictionaryEntry | null;
  pageNumber: number;
  isOpen: boolean;
  onClose: () => void;
  onSelectWord: (headword: string, destPage?: number) => void;
  /** Show a similar or opposite word in this sheet. */
  onOpenRelated: (word: RelatedWord) => void;
  /** Starts the word card tour on this word. */
  onTourCard: () => void;
  isBookmarked: boolean;
  onToggleBookmark: (entry: DictionaryEntry) => void;
  /** For saved words: when the word next comes up in Review. */
  reviewNote?: string | null;
  /** The book build being read, sent with a problem report. */
  dataVersion: string;
}

// The word sheet: a bottom sheet on phones, a side panel beside the book on desktop. Hindi is the largest
// thing after the word itself. Example sentences and similar/opposite words appear only for entries that have them.
export const WordDetailDrawer: React.FC<WordDetailDrawerProps> = ({
  entry,
  pageNumber,
  isOpen,
  onClose,
  onSelectWord,
  onOpenRelated,
  onTourCard,
  isBookmarked,
  onToggleBookmark,
  reviewNote,
  dataVersion,
}) => {
  const [speaking, setSpeaking] = useState<SpeechLang | null>(null);
  const speech = useSpeechVoices();
  // The ink stamp plays only when the reader saves, not when reopening a word saved earlier.
  const [justSaved, setJustSaved] = useState(false);
  useEffect(() => setJustSaved(false), [entry?.normalized, isOpen]);
  // "Report a problem" shows its form in place of the card's body (a second sheet on top would fight this one for
  // Escape and focus); a new word or closing the card goes back to the word.
  const [reporting, setReporting] = useState(false);
  useEffect(() => setReporting(false), [entry?.normalized, isOpen]);
  const backFromReport = () => {
    setReporting(false);
    requestAnimationFrame(() => document.getElementById('report-btn')?.focus());
  };

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
  const related = ([['similar', 'Similar'], ['opposite', 'Opposite']] as const)
    .map(([kind, label]) => ({ kind, label, words: entry[kind] ?? [] }))
    .filter((r) => r.words.length > 0);
  const speakButton = (lang: SpeechLang, label: React.ReactNode, what: string) => (
    <Button
      id={`speak-${lang}-btn`}
      size="small"
      onClick={() => playSpeech(lang)}
      disabled={speaking !== null || !!unavailable[lang]}
      title={unavailable[lang] ?? `Say the ${what} aloud`}
      // The name starts with the button's own word (English / हिंदी), as voice control expects.
      aria-label={`${lang === 'hi' ? 'हिंदी' : 'English'}: say the ${what} aloud${unavailable[lang] ? ` (${unavailable[lang]})` : ''}`}
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

      {reporting ? <ReportForm entry={entry} dataVersion={dataVersion} onBack={backFromReport} /> : (<>
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

      {related.length > 0 && (
        <>
          <hr className="ui-divider" />
          <div id="word-related">
            {related.map(({ kind, label, words }) => (
              <div key={kind} className="word-related">
                <div className="ui-label" id={`word-${kind}-label`}>{label}</div>
                <ul className="word-related-list" id={`word-${kind}`} aria-labelledby={`word-${kind}-label`}>
                  {words.map((w) => (
                    <li key={w.headword}>
                      <Chip onClick={() => onOpenRelated(w)} title={`Open “${w.headword}”`}>{w.headword}</Chip>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
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
        <span className="word-foot-links">
          {REPORTS_ENABLED && (
            <button type="button" className="lookup-link tour-howlink" id="report-btn" onClick={() => setReporting(true)}>Report a problem</button>
          )}
          <button type="button" className="lookup-link tour-howlink" id="word-tour-btn" onClick={onTourCard}>Tour this card ›</button>
        </span>
        <button type="button" className="lookup-link word-goto" id="see-on-page-btn"
          onClick={() => { onClose(); onSelectWord(entry.headword, pageNumber); }}>
          See on page {pageNumber.toLocaleString('en-IN')} ›
        </button>
      </div>
      </>)}
    </Sheet>
  );
};
