'use client';

import React, { useEffect, useState } from 'react';
import { DictionaryEntry } from '@/lib/types';
import { describePos } from '@/lib/pos';
import { flyToSaved } from '@/lib/motion';
import { SentenceAnalysis, cleanShared, tokenize } from '@/lib/sentence';
import { Button, IconButton, Sheet } from '@/components/ui';
import { CloseIcon, SearchIcon, StarIcon } from '@/components/ui/icons';
import { exampleParts } from '@/components/modals/WordDetailDrawer';

interface SentenceSheetProps {
  open: boolean;
  /** The shared text as it came (at most 2,000 characters). It shows cleaned (cleanShared: links gone, at most 40
   *  words, single line breaks kept); /api/sentence cleans it the same way and says whether it was cut. */
  text: string | null;
  onClose: () => void;
  isSaved: (entry: DictionaryEntry) => boolean;
  onToggleSave: (entry: DictionaryEntry) => void;
  /** Close this sheet and open the word sheet on the entry. */
  onOpenCard: (entry: DictionaryEntry) => void;
  /** No book words at all: close this sheet and put the word in the search box. */
  onSearch: (word: string) => void;
}

// What /api/sentence answered: an analysis, a shared text that turned out to be no text, or no answer at all.
type Loaded = { kind: 'analysis'; analysis: SentenceAnalysis } | { kind: 'none' } | { kind: 'failed' };

// Share to Panna, for a shared sentence: the sentence on a paper card with every book word tappable, and the
// meaning of the chosen word underneath (the rarest is chosen first). All entries come in the one response, so
// tapping another word needs no fetch.
export function SentenceSheet({ open, text, onClose, isSaved, onToggleSave, onOpenCard, onSearch }: SentenceSheetProps) {
  const [loaded, setLoaded] = useState<{ text: string; result: Loaded } | null>(null);
  const [chosen, setChosen] = useState<number | null>(null);
  const [justSaved, setJustSaved] = useState(false);

  useEffect(() => {
    if (!open || !text) return;
    const controller = new AbortController();
    setLoaded(null);
    setChosen(null);
    fetch(`/api/sentence?text=${encodeURIComponent(text)}`, { signal: controller.signal })
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error(String(res.status)))))
      .then((body: SentenceAnalysis | { kind: 'link' | 'empty' }) => {
        if ('tokens' in body) {
          setLoaded({ text, result: { kind: 'analysis', analysis: body } });
          setChosen(body.picked);
        } else setLoaded({ text, result: { kind: 'none' } });
      })
      .catch(() => { if (!controller.signal.aborted) setLoaded({ text, result: { kind: 'failed' } }); });
    return () => controller.abort();
  }, [open, text]);

  const result = loaded && loaded.text === text ? loaded.result : null;
  const analysis = result?.kind === 'analysis' ? result.analysis : null;
  const headwordAt = (i: number | null) => (analysis && i !== null ? analysis.tokens[i]?.headword : undefined);
  const chosenHeadword = headwordAt(chosen);
  const entry = analysis && chosenHeadword ? analysis.entries[chosenHeadword] ?? null : null;
  useEffect(() => setJustSaved(false), [entry?.normalized]);
  const anyBookWord = Boolean(analysis?.tokens.some((t) => t.headword && analysis.entries[t.headword]));
  const shared = text ? cleanShared({ text }) : null;
  const shownText = shared?.kind === 'text' ? shared.text : '';
  const firstWord = tokenize(shownText).find((t) => t.key)?.text ?? shownText;
  const saved = entry ? isSaved(entry) : false;
  const pos = entry ? describePos(entry.pos) : null;

  return (
    <Sheet open={open && !!text} onClose={onClose} title="Words in this sentence" id="sentence-sheet" className="sentence-sheet" variant="side">
      <IconButton id="close-sentence-sheet" className="sentence-close" surface="paper" aria-label="Close the sentence" onClick={onClose}>
        <CloseIcon />
      </IconButton>

      <p className="sentence-card" aria-busy={result ? undefined : true}>
        {analysis ? analysis.tokens.map((t, i) => (t.headword && analysis.entries[t.headword] ? (
          <button
            key={i}
            type="button"
            className={['sentence-word', t.uncommon && 'sentence-word--uncommon', i === chosen && 'sentence-word--on'].filter(Boolean).join(' ')}
            aria-pressed={i === chosen}
            onClick={() => setChosen(i)}
          >
            {t.text}
          </button>
        ) : <span key={i}>{t.text}</span>)) : shownText}
        {(analysis ? analysis.truncated : shared?.kind === 'text' && shared.truncated) && <span>…</span>}
      </p>

      {(analysis?.offline || result?.kind === 'failed') && (
        <p className="sentence-note" id="sentence-offline-note">Connect for the full sentence view</p>
      )}

      {result && result.kind !== 'failed' && !anyBookWord && (
        <div className="sentence-none">
          <p className="sentence-note">None of these words are in Panna yet.</p>
          <Button id="sentence-search-btn" onClick={() => onSearch(firstWord)}>
            <SearchIcon />Search
          </Button>
        </div>
      )}

      {entry && pos && (
        <div className="sentence-entry" id="sentence-entry">
          <div aria-live="polite">
            <h3 id="sentence-entry-title" className="sentence-entry-title">{entry.headword}</h3>
            {pos.label && <span className="ui-tag word-pos" title={entry.pos}>{pos.label}{pos.hint && ` · ${pos.hint}`}</span>}
          </div>
          <p className="word-hi" lang="hi">{entry.meaning_hi}</p>
          <p className="word-def">{entry.definition_en}</p>
          {entry.example && (
            <div className="word-example">
              <p className="word-example-en">{exampleParts(entry.example)}</p>
              <p className="word-example-hi" lang="hi">{entry.example.hi}</p>
              {entry.reviewed === 1 && <p className="word-provenance word-example-note">Example machine-written · not yet checked</p>}
            </div>
          )}
          <div className="word-actions">
            <Button
              id="sentence-save-btn"
              variant={saved ? 'primary' : 'paper'}
              aria-pressed={saved}
              className={saved && justSaved ? 'motion-stamp' : undefined}
              onClick={(event) => {
                if (!saved) { setJustSaved(true); flyToSaved(event.currentTarget); }
                onToggleSave(entry);
              }}
              style={{ flex: 1 }}
            >
              <StarIcon />{saved ? 'Saved' : 'Save word'}
            </Button>
          </div>
          <div className="word-foot">
            <span className="word-provenance">{entry.reviewed === 0 ? 'Machine-written · not yet checked by a reviewer' : ''}</span>
            <button type="button" className="lookup-link word-goto" id="sentence-open-card" onClick={() => onOpenCard(entry)}>
              Open the full card <span aria-hidden="true">›</span>
            </button>
          </div>
        </div>
      )}
    </Sheet>
  );
}
