'use client';

import React, { useState } from 'react';
import { MarginNote } from '@/lib/types';

interface MarginaliaProps {
  pageNumber: number;
  isLeftPage: boolean;
  notes: MarginNote[];
  onAddNote: (pageNumber: number, text: string, color: 'blue' | 'graphite' | 'crimson', topPct: number) => void;
  onDeleteNote: (noteId: string) => void;
}

export const Marginalia: React.FC<MarginaliaProps> = ({
  pageNumber,
  isLeftPage,
  notes,
  onAddNote,
  onDeleteNote,
}) => {
  const [isEditorOpen, setIsEditorOpen] = useState(false);
  const [noteText, setNoteText] = useState('');
  const [selectedColor, setSelectedColor] = useState<'blue' | 'graphite' | 'crimson'>('blue');
  const [clickTopPct, setClickTopPct] = useState<number>(35);

  const handleOpenEditor = (topPct: number = 35) => {
    setClickTopPct(topPct);
    setNoteText('');
    setIsEditorOpen(true);
  };

  const handleSaveNote = () => {
    if (!noteText.trim()) {
      setIsEditorOpen(false);
      return;
    }
    onAddNote(pageNumber, noteText.trim(), selectedColor, clickTopPct);
    setNoteText('');
    setIsEditorOpen(false);
  };

  const getColorHex = (c: 'blue' | 'graphite' | 'crimson') => {
    switch (c) {
      case 'blue': return '#1e4887'; // classic blue pencil
      case 'graphite': return '#383838'; // pencil lead
      case 'crimson': return '#781d16'; // vintage red ink
    }
  };

  return (
    <>
      {/* Existing Margin Notes positioned along the outer edge */}
      {notes.map((note, index) => {
        const rotation = index % 2 === 0 ? '-1.5deg' : '1.5deg';
        const colorHex = getColorHex(note.color);

        return (
          <div
            key={note.id}
            id={`margin-note-${note.id}`}
            title={`Handwritten margin note: "${note.text}"`}
            style={{
              position: 'absolute',
              top: `${note.top_pct || 30 + index * 15}%`,
              left: isLeftPage ? '6px' : 'auto',
              right: isLeftPage ? 'auto' : '6px',
              maxWidth: '68px',
              zIndex: 24,
              fontFamily: 'var(--font-hand)',
              fontSize: '20px',
              lineHeight: 1.1,
              color: colorHex,
              transform: `rotate(${rotation})`,
              cursor: 'pointer',
              userSelect: 'none',
              padding: '2px 4px',
              borderRadius: '3px',
              transition: 'background 0.15s ease',
              display: 'flex',
              flexDirection: 'column',
              alignItems: isLeftPage ? 'flex-start' : 'flex-end',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = 'rgba(239, 227, 192, 0.6)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'transparent';
            }}
          >
            <span style={{ wordBreak: 'break-word', textAlign: isLeftPage ? 'left' : 'right' }}>
              {note.text}
            </span>
            <button
              onClick={(e) => {
                e.stopPropagation();
                onDeleteNote(note.id);
              }}
              title="Erase note"
              aria-label="Erase note"
              style={{
                background: 'transparent',
                border: 'none',
                color: '#8a7452',
                fontSize: '11px',
                cursor: 'pointer',
                padding: '0 2px',
                lineHeight: 1,
                opacity: 0.6,
                marginTop: '1px',
              }}
              onMouseEnter={(e) => (e.currentTarget.style.opacity = '1')}
              onMouseLeave={(e) => (e.currentTarget.style.opacity = '0.6')}
            >
              ✕ erase
            </button>
          </div>
        );
      })}

      {/* Outer Margin Click Trigger to Add Note */}
      <div
        id={`add-note-trigger-p${pageNumber}`}
        onClick={(e) => {
          const rect = e.currentTarget.getBoundingClientRect();
          const relativeY = e.clientY - rect.top;
          const topPct = Math.max(15, Math.min(80, Math.round((relativeY / rect.height) * 100)));
          handleOpenEditor(topPct);
        }}
        title={`Click margin to write a pencil note on Page ${pageNumber}`}
        style={{
          position: 'absolute',
          top: '60px',
          bottom: '50px',
          left: isLeftPage ? 0 : 'auto',
          right: isLeftPage ? 'auto' : 0,
          width: '32px',
          cursor: 'text',
          zIndex: 23,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          opacity: 0,
          transition: 'opacity 0.2s',
        }}
        onMouseEnter={(e) => (e.currentTarget.style.opacity = '0.7')}
        onMouseLeave={(e) => (e.currentTarget.style.opacity = '0')}
      >
        <span
          style={{
            fontFamily: 'var(--font-fell-sc)',
            fontSize: '14px',
            color: '#8a7452',
            userSelect: 'none',
          }}
        >
          ✏️
        </span>
      </div>

      {/* Inline Pencil Note Editor Popup */}
      {isEditorOpen && (
        <div
          id="margin-note-editor"
          onClick={(e) => e.stopPropagation()}
          style={{
            position: 'absolute',
            top: `${clickTopPct}%`,
            left: isLeftPage ? '20px' : 'auto',
            right: isLeftPage ? 'auto' : '20px',
            transform: 'translateY(-50%)',
            width: '210px',
            background: '#efe3c0',
            border: '1px solid #8a7452',
            borderRadius: '4px',
            boxShadow: '0 8px 24px rgba(0,0,0,0.45)',
            padding: '12px',
            zIndex: 110,
            animation: 'fadeIn 0.15s ease',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
            <span style={{ font: '11px var(--font-fell-sc)', color: '#2a1e14', letterSpacing: '0.05em' }}>
              ✏️ Margin Note (p. {pageNumber})
            </span>
            <button
              onClick={() => setIsEditorOpen(false)}
              style={{ background: 'transparent', border: 'none', color: '#8a7452', cursor: 'pointer', fontSize: '13px' }}
            >
              ✕
            </button>
          </div>

          <textarea
            id="margin-note-textarea"
            autoFocus
            rows={2}
            value={noteText}
            onChange={(e) => setNoteText(e.target.value)}
            placeholder="e.g. key, cf. page 94, see also..."
            style={{
              width: '100%',
              boxSizing: 'border-box',
              background: '#f5edd4',
              border: '1px solid #c4b18e',
              borderRadius: '3px',
              padding: '6px 8px',
              fontFamily: 'var(--font-hand)',
              fontSize: '18px',
              color: getColorHex(selectedColor),
              resize: 'none',
              outline: 'none',
              marginBottom: '8px',
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleSaveNote();
              } else if (e.key === 'Escape') {
                setIsEditorOpen(false);
              }
            }}
          />

          {/* Color Selector */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', gap: '6px' }}>
              <button
                type="button"
                id="pencil-color-blue"
                onClick={() => setSelectedColor('blue')}
                title="Blue Pencil (classic reference)"
                style={{
                  width: '18px',
                  height: '18px',
                  borderRadius: '50%',
                  background: '#1e4887',
                  border: selectedColor === 'blue' ? '2px solid #2a1e14' : '1px solid #b9a57c',
                  cursor: 'pointer',
                  padding: 0,
                }}
              />
              <button
                type="button"
                onClick={() => setSelectedColor('graphite')}
                title="Graphite Pencil"
                style={{
                  width: '18px',
                  height: '18px',
                  borderRadius: '50%',
                  background: '#383838',
                  border: selectedColor === 'graphite' ? '2px solid #2a1e14' : '1px solid #b9a57c',
                  cursor: 'pointer',
                  padding: 0,
                }}
              />
              <button
                type="button"
                onClick={() => setSelectedColor('crimson')}
                title="Crimson Ink"
                style={{
                  width: '18px',
                  height: '18px',
                  borderRadius: '50%',
                  background: '#781d16',
                  border: selectedColor === 'crimson' ? '2px solid #2a1e14' : '1px solid #b9a57c',
                  cursor: 'pointer',
                  padding: 0,
                }}
              />
            </div>

            <button
              onClick={handleSaveNote}
              id="save-margin-note-btn"
              style={{
                background: '#efe3c0',
                border: '1px solid #8a7452',
                borderRadius: '3px',
                padding: '2px 8px',
                font: '11px var(--font-fell-sc)',
                color: '#2a1e14',
                cursor: 'pointer',
              }}
            >
              Write Note
            </button>
          </div>
        </div>
      )}
    </>
  );
};
