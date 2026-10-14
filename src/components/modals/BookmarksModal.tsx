'use client';

import React from 'react';
import { DictionaryEntry, MarginNote } from '@/lib/types';

interface BookmarksModalProps {
  isOpen: boolean;
  onClose: () => void;
  bookmarkedPages: number[];
  dogEaredPages: number[];
  marginNotes: MarginNote[];
  bookmarkedWords: DictionaryEntry[];
  onSelectPage: (page: number) => void;
  onSelectWord: (headword: string, destPage: number) => void;
  onRemovePageBookmark: (page: number) => void;
  onRemoveDogEar: (page: number) => void;
  onDeleteMarginNote: (noteId: string) => void;
  onRemoveWordBookmark: (headword: string) => void;
}

export const BookmarksModal: React.FC<BookmarksModalProps> = ({
  isOpen,
  onClose,
  bookmarkedPages,
  dogEaredPages,
  marginNotes,
  bookmarkedWords,
  onSelectPage,
  onSelectWord,
  onRemovePageBookmark,
  onRemoveDogEar,
  onDeleteMarginNote,
  onRemoveWordBookmark,
}) => {
  if (!isOpen) return null;

  const totalMarks = bookmarkedPages.length + dogEaredPages.length + marginNotes.length + bookmarkedWords.length;

  return (
    <div
      id="bookmarks-modal-backdrop"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 130,
        background: 'rgba(20, 10, 5, 0.65)',
        backdropFilter: 'blur(3px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        animation: 'fadeIn 0.2s ease',
      }}
      onClick={onClose}
    >
      <div
        id="bookmarks-modal-card"
        onClick={(e) => e.stopPropagation()}
        style={{
          width: '620px',
          maxWidth: '92vw',
          maxHeight: '85vh',
          background: 'linear-gradient(135deg, #efe3c0 0%, #ecdfba 60%, #e2d2aa 100%)',
          borderRadius: '6px',
          border: '2px solid #8a7452',
          boxShadow: '0 24px 60px rgba(0,0,0,0.7), inset 0 0 50px rgba(120,80,30,0.22)',
          boxSizing: 'border-box',
          padding: '30px 34px',
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

        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
          <div>
            <h3
              style={{
                margin: 0,
                fontFamily: '"IM Fell English", serif',
                fontSize: '28px',
                color: '#2a1e14',
                fontWeight: 700,
              }}
            >
              📑 Reading History & Personal Marks
            </h3>
            <span className="guide-word" style={{ fontSize: '12px' }}>
              Your ribbon bookmarks, dog-eared folds, pencil notes & saved words ({totalMarks} total)
            </span>
          </div>

          <button
            id="close-bookmarks-btn"
            onClick={onClose}
            aria-label="Close bookmarks"
            style={{
              background: 'transparent',
              border: 'none',
              fontSize: '22px',
              color: '#8a7452',
              cursor: 'pointer',
              padding: '4px 8px',
              lineHeight: 1,
            }}
          >
            ✕
          </button>
        </div>

        {/* Section 1: Ribbon Bookmarked Spreads */}
        <div style={{ marginBottom: '22px' }}>
          <h4 className="guide-word" style={{ margin: '0 0 8px', fontSize: '13px', color: '#7a2b22' }}>
            🔖 SILK RIBBON SPREADS ({bookmarkedPages.length})
          </h4>

          {bookmarkedPages.length === 0 ? (
            <p style={{ margin: 0, fontStyle: 'italic', fontSize: '14px', color: '#8a7452' }}>
              No ribbon spreads marked. Click the silk ribbon in the spine gutter to bookmark any spread.
            </p>
          ) : (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
              {bookmarkedPages.map((pageNum) => (
                <div
                  key={pageNum}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    background: '#e0cfa0',
                    border: '1px solid #8a7452',
                    borderRadius: '4px',
                    padding: '6px 12px',
                    boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
                  }}
                >
                  <button
                    onClick={() => {
                      onSelectPage(pageNum);
                      onClose();
                    }}
                    style={{
                      background: 'transparent',
                      border: 'none',
                      fontFamily: '"IM Fell English", serif',
                      fontSize: '15px',
                      fontWeight: 700,
                      color: '#2a1e14',
                      cursor: 'pointer',
                      padding: 0,
                    }}
                  >
                    📖 Pages {pageNum % 2 === 0 ? pageNum : pageNum - 1}–{(pageNum % 2 === 0 ? pageNum : pageNum - 1) + 1}
                  </button>

                  <button
                    onClick={() => onRemovePageBookmark(pageNum)}
                    title="Remove spread ribbon"
                    style={{
                      background: 'transparent',
                      border: 'none',
                      color: '#7a2b22',
                      cursor: 'pointer',
                      fontSize: '14px',
                      padding: '0 2px',
                    }}
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Section 2: Dog-Eared Folded Pages */}
        <div style={{ marginBottom: '22px' }}>
          <h4 className="guide-word" style={{ margin: '0 0 8px', fontSize: '13px', color: '#7a2b22' }}>
            📑 DOG-EARED PAGES ({dogEaredPages.length})
          </h4>

          {dogEaredPages.length === 0 ? (
            <p style={{ margin: 0, fontStyle: 'italic', fontSize: '14px', color: '#8a7452' }}>
              No folded pages yet. Click the top-outer corner of any page to dog-ear it!
            </p>
          ) : (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
              {dogEaredPages.map((pNum) => (
                <div
                  key={pNum}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    background: '#e6d8b3',
                    border: '1px solid #9c845b',
                    borderRadius: '4px',
                    padding: '6px 12px',
                    boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
                  }}
                >
                  <button
                    onClick={() => {
                      onSelectPage(pNum);
                      onClose();
                    }}
                    style={{
                      background: 'transparent',
                      border: 'none',
                      fontFamily: '"IM Fell English", serif',
                      fontSize: '15px',
                      fontWeight: 700,
                      color: '#2a1e14',
                      cursor: 'pointer',
                      padding: 0,
                    }}
                  >
                    Folded Page {pNum}
                  </button>

                  <button
                    onClick={() => onRemoveDogEar(pNum)}
                    title="Unfold dog-eared page"
                    style={{
                      background: 'transparent',
                      border: 'none',
                      color: '#7a2b22',
                      cursor: 'pointer',
                      fontSize: '14px',
                      padding: '0 2px',
                    }}
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Section 3: Handwritten Margin Notes */}
        <div style={{ marginBottom: '22px' }}>
          <h4 className="guide-word" style={{ margin: '0 0 8px', fontSize: '13px', color: '#7a2b22' }}>
            ✏️ HANDWRITTEN MARGIN NOTES ({marginNotes.length})
          </h4>

          {marginNotes.length === 0 ? (
            <p style={{ margin: 0, fontStyle: 'italic', fontSize: '14px', color: '#8a7452' }}>
              No margin notes written yet. Click the outer margin on any page to write a pencil annotation.
            </p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {marginNotes.map((note) => {
                const colorHex = note.color === 'blue' ? '#1e4887' : note.color === 'graphite' ? '#383838' : '#781d16';

                return (
                  <div
                    key={note.id}
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      background: '#dfcca2',
                      border: '1px solid #b9a57c',
                      borderRadius: '4px',
                      padding: '8px 14px',
                    }}
                  >
                    <div
                      onClick={() => {
                        onSelectPage(note.page_number);
                        onClose();
                      }}
                      style={{ cursor: 'pointer', flex: 1, display: 'flex', alignItems: 'baseline', gap: '10px' }}
                    >
                      <span className="guide-word" style={{ fontSize: '12px', minWidth: '45px' }}>
                        p. {note.page_number}:
                      </span>
                      <span
                        style={{
                          fontFamily: '"Caveat", cursive',
                          fontSize: '22px',
                          color: colorHex,
                          transform: 'rotate(-1deg)',
                        }}
                      >
                        &ldquo;{note.text}&rdquo;
                      </span>
                    </div>

                    <button
                      onClick={() => onDeleteMarginNote(note.id)}
                      title="Erase note"
                      style={{
                        background: 'transparent',
                        border: 'none',
                        color: '#7a2b22',
                        cursor: 'pointer',
                        fontSize: '15px',
                        padding: '4px',
                      }}
                    >
                      ✕
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Section 4: Saved Words */}
        <div>
          <h4 className="guide-word" style={{ margin: '0 0 8px', fontSize: '13px', color: '#7a2b22' }}>
            ⭐ SAVED VOCABULARY WORDS ({bookmarkedWords.length})
          </h4>

          {bookmarkedWords.length === 0 ? (
            <p style={{ margin: 0, fontStyle: 'italic', fontSize: '14px', color: '#8a7452' }}>
              No words saved yet. Click on any word in the dictionary and click &ldquo;Save Word&rdquo; to add it to your collection.
            </p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {bookmarkedWords.map((item) => (
                <div
                  key={item.normalized}
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    background: '#dfcca2',
                    border: '1px solid #b9a57c',
                    borderRadius: '4px',
                    padding: '8px 14px',
                  }}
                >
                  <div
                    onClick={() => {
                      onSelectWord(item.headword, item.page_number || 1);
                      onClose();
                    }}
                    style={{ cursor: 'pointer', flex: 1 }}
                  >
                    <span style={{ fontFamily: '"IM Fell English", serif', fontWeight: 700, fontSize: '18px', color: '#2a1e14' }}>
                      {item.headword}
                    </span>
                    <span style={{ fontFamily: '"Tiro Devanagari Hindi", serif', marginLeft: '10px', color: '#7a2b22', fontSize: '15px' }}>
                      {item.meaning_hi}
                    </span>
                    <span className="guide-word" style={{ marginLeft: '12px', fontSize: '12px' }}>
                      p. {item.page_number}
                    </span>
                  </div>

                  <button
                    onClick={() => onRemoveWordBookmark(item.headword)}
                    title="Remove from saved words"
                    style={{
                      background: 'transparent',
                      border: 'none',
                      color: '#7a2b22',
                      cursor: 'pointer',
                      fontSize: '16px',
                      padding: '4px',
                    }}
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
