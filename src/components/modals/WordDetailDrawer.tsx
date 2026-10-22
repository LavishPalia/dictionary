'use client';

import React, { useEffect, useState } from 'react';
import { DictionaryEntry } from '@/lib/types';
import { SpeechLang, speechUnavailableReason, useSpeechVoices } from '@/lib/speech';

interface WordDetailDrawerProps {
  entry: DictionaryEntry | null;
  pageNumber: number;
  isOpen: boolean;
  onClose: () => void;
  onSelectWord: (headword: string, destPage?: number) => void;
  isBookmarked: boolean;
  onToggleBookmark: (entry: DictionaryEntry) => void;
}

export const WordDetailDrawer: React.FC<WordDetailDrawerProps> = ({
  entry,
  pageNumber,
  isOpen,
  onClose,
  onSelectWord,
  isBookmarked,
  onToggleBookmark,
}) => {
  const [isPlayingAudio, setIsPlayingAudio] = useState(false);
  const speech = useSpeechVoices();

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen || !entry) return null;

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

    setIsPlayingAudio(true);
    utterance.onend = () => setIsPlayingAudio(false);
    utterance.onerror = () => setIsPlayingAudio(false);

    window.speechSynthesis.speak(utterance);
  };

  return (
    <div
      id="word-drawer-backdrop"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 120,
        background: 'rgba(20, 10, 5, 0.55)',
        backdropFilter: 'blur(3px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        animation: 'fadeIn 0.2s ease',
      }}
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: '540px',
          maxWidth: '92vw',
          maxHeight: '85vh',
          background: 'linear-gradient(135deg, #efe3c0 0%, #ecdfba 50%, #e2d2aa 100%)',
          borderRadius: '6px',
          border: '2px solid #8a7452',
          boxShadow: '0 24px 60px rgba(0,0,0,0.7), inset 0 0 50px rgba(120,80,30,0.22)',
          boxSizing: 'border-box',
          padding: '32px 36px',
          display: 'flex',
          flexDirection: 'column',
          position: 'relative',
          overflowY: 'auto',
          animation: 'scaleUp 0.25s cubic-bezier(0.16, 1, 0.3, 1)',
        }}
      >
        {/* Ornate Gold Double Border */}
        <div
          style={{
            position: 'absolute',
            inset: '10px',
            border: '1px double #c9a24a',
            pointerEvents: 'none',
            borderRadius: '4px',
            opacity: 0.7,
          }}
        />

        {/* Header row: Close button & Page badge */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
          <span
            className="guide-word"
            style={{
              fontSize: '12px',
              background: 'rgba(120,80,30,0.12)',
              padding: '3px 10px',
              borderRadius: '12px',
              border: '1px solid #b9a57c',
            }}
          >
            Entry on Page {pageNumber}
          </span>

          <button
            id="close-word-drawer"
            onClick={onClose}
            aria-label="Close word details"
            style={{
              background: 'transparent',
              border: 'none',
              fontSize: '20px',
              color: '#8a7452',
              cursor: 'pointer',
              padding: '4px 8px',
              lineHeight: 1,
              transition: 'color 0.15s',
            }}
            onMouseEnter={(e) => (e.currentTarget.style.color = '#2a1e14')}
            onMouseLeave={(e) => (e.currentTarget.style.color = '#8a7452')}
          >
            ✕
          </button>
        </div>

        {/* Headword & Phonetics */}
        <div style={{ borderBottom: '1px solid #b9a57c', paddingBottom: '16px', marginBottom: '20px' }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: '14px', flexWrap: 'wrap' }}>
            <h2
              style={{
                margin: 0,
                fontFamily: 'var(--font-fell)',
                fontSize: '38px',
                fontWeight: 700,
                color: '#2a1e14',
                letterSpacing: '-0.01em',
              }}
            >
              {entry.headword}
            </h2>
            <span
              style={{
                fontFamily: 'var(--font-deva)',
                fontSize: '22px',
                color: '#7a2b22',
                fontWeight: 500,
              }}
            >
              {entry.pronunciation_deva}
            </span>
            <span
              style={{
                fontFamily: 'var(--font-fell)',
                fontStyle: 'italic',
                fontSize: '18px',
                color: '#6e5532',
              }}
            >
              {entry.pos}
            </span>
          </div>

          {/* Audio & Action Buttons */}
          <div style={{ display: 'flex', gap: '10px', marginTop: '14px', flexWrap: 'wrap' }}>
            <button
              id="speak-en-btn"
              onClick={() => playSpeech('en')}
              disabled={isPlayingAudio || !!unavailable.en}
              title={unavailable.en ?? 'Pronounce English word'}
              aria-label={unavailable.en ? `Pronounce English word (${unavailable.en})` : 'Pronounce English word'}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                padding: '6px 14px',
                background: '#efe3c0',
                border: '1px solid #8a7452',
                borderRadius: '4px',
                color: '#2a1e14',
                font: '13px var(--font-fell-sc)',
                cursor: unavailable.en ? 'not-allowed' : 'pointer',
                opacity: unavailable.en ? 0.5 : 1,
                boxShadow: '0 2px 4px rgba(0,0,0,0.15)',
                transition: 'all 0.15s ease',
              }}
              onMouseEnter={(e) => (e.currentTarget.style.background = '#dfcca2')}
              onMouseLeave={(e) => (e.currentTarget.style.background = '#efe3c0')}
            >
              🔊 English Pronunciation
            </button>

            <button
              id="speak-hi-btn"
              onClick={() => playSpeech('hi')}
              disabled={isPlayingAudio || !!unavailable.hi}
              title={unavailable.hi ?? 'Pronounce Hindi definition'}
              aria-label={unavailable.hi ? `Pronounce Hindi definition (${unavailable.hi})` : 'Pronounce Hindi definition'}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                padding: '6px 14px',
                background: '#efe3c0',
                border: '1px solid #8a7452',
                borderRadius: '4px',
                color: '#7a2b22',
                font: '13px var(--font-fell-sc)',
                cursor: unavailable.hi ? 'not-allowed' : 'pointer',
                opacity: unavailable.hi ? 0.5 : 1,
                boxShadow: '0 2px 4px rgba(0,0,0,0.15)',
                transition: 'all 0.15s ease',
              }}
              onMouseEnter={(e) => (e.currentTarget.style.background = '#dfcca2')}
              onMouseLeave={(e) => (e.currentTarget.style.background = '#efe3c0')}
            >
              🎙️ Hindi Meaning
            </button>

            <button
              id="save-word-btn"
              onClick={() => onToggleBookmark(entry)}
              title={isBookmarked ? 'Remove from bookmarks' : 'Add to saved bookmarks'}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                padding: '6px 14px',
                background: isBookmarked ? '#7a2b22' : '#efe3c0',
                border: `1px solid ${isBookmarked ? '#5b1f19' : '#8a7452'}`,
                borderRadius: '4px',
                color: isBookmarked ? '#f1e4c4' : '#2a1e14',
                font: '13px var(--font-fell-sc)',
                cursor: 'pointer',
                boxShadow: '0 2px 4px rgba(0,0,0,0.15)',
                transition: 'all 0.15s ease',
              }}
            >
              {isBookmarked ? '★ Bookmarked' : '☆ Save Word'}
            </button>
          </div>
        </div>

        {/* Content Body: English Definition & Hindi Nuances */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
          <div>
            <h4
              className="guide-word"
              style={{ margin: '0 0 6px', fontSize: '12px', color: '#8a7452' }}
            >
              ENGLISH DEFINITION
            </h4>
            <p
              style={{
                margin: 0,
                fontFamily: 'var(--font-fell)',
                fontSize: '18px',
                lineHeight: 1.5,
                color: '#2a1e14',
              }}
            >
              {entry.definition_en}
            </p>
          </div>

          <div>
            <h4
              className="guide-word"
              style={{ margin: '0 0 6px', fontSize: '12px', color: '#8a7452' }}
            >
              HINDI MEANING & TRANSLATION
            </h4>
            <p
              style={{
                margin: 0,
                fontFamily: 'var(--font-deva)',
                fontSize: '20px',
                lineHeight: 1.5,
                color: '#7a2b22',
                fontWeight: 500,
              }}
            >
              {entry.meaning_hi}
            </p>
          </div>

          <div
            style={{
              background: 'rgba(120,80,30,0.08)',
              padding: '12px 16px',
              borderRadius: '4px',
              borderLeft: '3px solid #c9a24a',
              marginTop: '6px',
            }}
          >
            <p
              style={{
                margin: 0,
                fontFamily: 'var(--font-fell)',
                fontStyle: 'italic',
                fontSize: '14px',
                color: '#4a3a2c',
              }}
            >
              Authentic pocket dictionary typography. Cross-reference related headwords directly by clicking any entry on the open page.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
