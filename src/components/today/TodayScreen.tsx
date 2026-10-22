'use client';

import React, { useEffect, useState } from 'react';
import type { BookPage, DictionaryEntry } from '@/lib/types';
import { describePos } from '@/lib/pos';
import { localDate } from '@/lib/review';
import { Button, Card } from '@/components/ui';
import { StarIcon } from '@/components/ui/icons';

interface TodayScreenProps {
  dueCount: number;
  savedWords: number;
  /** "tomorrow (4 words)" when nothing is due today, else null. */
  nextReview: string | null;
  streak: number;
  lastPage: number | null;
  loadPage: (page: number) => Promise<BookPage | null>;
  isSaved: (normalized: string) => boolean;
  onStartReview: () => void;
  onContinueReading: (page: number) => void;
  onOpenWord: (entry: DictionaryEntry) => void;
  onToggleSave: (entry: DictionaryEntry) => void;
}

const SECONDS_PER_CARD = 20;

// The first screen: today's review, where you left off in the book, and a word of the day.
export function TodayScreen(props: TodayScreenProps) {
  const { dueCount, savedWords, lastPage, loadPage } = props;
  const [word, setWord] = useState<DictionaryEntry | null>(null);
  const [lastLabel, setLastLabel] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    fetch(`/api/today?date=${localDate(Date.now())}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => { if (live && data?.word) setWord(data.word); })
      .catch(() => {});
    return () => { live = false; };
  }, []);

  const page = lastPage ?? 1;
  useEffect(() => {
    let live = true;
    loadPage(page).then((p) => { if (live && p) setLastLabel(`${p.first_headword} – ${p.last_headword}`); });
    return () => { live = false; };
  }, [page, loadPage]);

  const minutes = Math.max(1, Math.round((dueCount * SECONDS_PER_CARD) / 60));
  const pos = word ? describePos(word.pos) : null;
  const saved = word ? props.isSaved(word.normalized) : false;

  return (
    <section className="today" id="today-screen" aria-labelledby="today-title">
      <h1 id="today-title" className="ui-visually-hidden">Today</h1>
      <p className="today-hint">Hindi works too: try typing <span lang="hi" className="today-hint-hi">छोड़ना</span> or <span className="today-hint-latin">chhodna</span> in the search box.</p>

      <Card className="today-card" id="today-review">
        <div className="today-card-head">
          <span className="ui-label">Today’s review</span>
          {props.streak >= 2 && <span className="ui-label today-streak">{props.streak} days in a row</span>}
        </div>
        {dueCount > 0 ? (
          <>
            <p className="today-big">{dueCount} word{dueCount === 1 ? ' is' : 's are'} due</p>
            <p className="today-muted">About {minutes} minute{minutes === 1 ? '' : 's'} · from words you saved</p>
            <Button variant="primary" full id="today-start-review" onClick={props.onStartReview}>Start review</Button>
          </>
        ) : savedWords > 0 ? (
          <>
            <p className="today-big">All caught up</p>
            <p className="today-muted">{props.nextReview ? <>Next review {props.nextReview}.</> : 'Nothing is scheduled.'}</p>
          </>
        ) : (
          <>
            <p className="today-big">Nothing to review yet</p>
            <p className="today-muted">Save words while you read, and Panna will quiz you on them at the right times.</p>
          </>
        )}
      </Card>

      <Card className="today-card" id="today-continue">
        <span className="ui-label">{lastPage ? 'Continue reading' : 'Start reading'}</span>
        <div className="today-row">
          <div>
            <p className="today-mid">Page {page.toLocaleString('en-IN')}</p>
            <p className="today-muted today-tight">{lastLabel ?? ' '}</p>
          </div>
          <Button id="today-continue-btn" onClick={() => props.onContinueReading(page)}>Open book ›</Button>
        </div>
      </Card>

      {word && (
        <Card className="today-card" id="today-word">
          <span className="ui-label">Word of the day</span>
          <div className="today-word-row">
            <span className="today-word">{word.headword}</span>
            {word.pronunciation_deva && <span className="ui-pron" lang="hi">{word.pronunciation_deva}</span>}
            {pos?.label && <span className="ui-pos">{pos.label}</span>}
          </div>
          <p className="today-hi" lang="hi">{word.meaning_hi}</p>
          <p className="today-def">{word.definition_en}</p>
          <div className="today-actions">
            <Button size="small" id="today-word-open" onClick={() => props.onOpenWord(word)}>Open</Button>
            <Button size="small" id="today-word-save" variant={saved ? 'primary' : 'paper'} aria-pressed={saved} onClick={() => props.onToggleSave(word)}>
              <StarIcon />{saved ? 'Saved' : 'Save word'}
            </Button>
          </div>
        </Card>
      )}
    </section>
  );
}
