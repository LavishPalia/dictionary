'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import type { Light } from '@/lib/lighting';
import { readDesk, writeDesk } from '@/lib/desk';
import type { BookPage, DictionaryEntry } from '@/lib/types';
import { describePos } from '@/lib/pos';
import { localDate, SECONDS_PER_CARD } from '@/lib/review';
import { Button, Card } from '@/components/ui';
import { StarIcon } from '@/components/ui/icons';
import { ProgressBar, ReviewCalendar } from '@/components/progress/Progress';
import type { CalendarDay, Progress } from '@/lib/progress';
import { DuelCard } from './DuelCard';
import { DeskScene } from './desk/DeskScene';
import { DeskStrip } from './desk/DeskStrip';
import { useWide } from './desk/useWide';
import { GoalNotebook } from './desk/GoalNotebook';
import { GoalChip } from './desk/GoalChip';
import { GoalEditor } from './desk/GoalEditor';
import { DeskBook } from './desk/DeskBook';
import { IntroFilm } from './desk/IntroFilm';
import type { TodayWord } from '@/lib/today-words';

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
  /** Saved words by status, the last 30 days of review, and the longest run of review days. */
  progress: Progress;
  calendar: CalendarDay[];
  bestStreak: number;
  /** First visit: offer the Getting started tour. */
  showWelcome: boolean;
  onTakeTour: () => void;
  onDismissWelcome: () => void;
  /** Whether the study guide has been opened (a card until then, a quiet link after); null until known. */
  guideOpened: boolean | null;
  onOpenGuide: () => void;
  /** Words looked up since midnight, and how many of those are not saved; the line shows only after a lookup today. */
  lookedUpToday: { total: number; unsaved: number };
  /** Opens Saved on the History tab. */
  onOpenHistory: () => void;
  /** The desk lighting applied now (the lamp shows this, not the stored preference). */
  light: Light;
  /** The lamp was switched: pin this light. */
  onSetLight: (light: Light) => void;
  /** Back to Auto (the clock), from the first-switch note. */
  onUseAuto: () => void;
  /** Words saved or reviewed today, in the order they were met; and the daily goal. */
  todaysWords: TodayWord[];
  dailyGoal: number;
  onSetGoal: (goal: number) => void;
}

const NOTE_MS = 6000;

// The first screen: today's review, where you left off in the book, and a word of the day.
export function TodayScreen(props: TodayScreenProps) {
  const { dueCount, savedWords, lastPage, loadPage } = props;
  const [word, setWord] = useState<DictionaryEntry | null>(null);
  // The page left off on (or page 1): the Continue card's label, and the desk book's miniature.
  const [pageData, setPageData] = useState<BookPage | null>(null);

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
    loadPage(page).then((p) => { if (live && p) setPageData(p); });
    return () => { live = false; };
  }, [page, loadPage]);

  // The lamp. A switch pins the opposite of the light applied now; the first one on a device explains that.
  const wide = useWide();
  const [said, setSaid] = useState('');
  const [note, setNote] = useState<Light | null>(null);
  const noteTimer = useRef<number | null>(null);
  const hideNote = useCallback(() => {
    if (noteTimer.current !== null) window.clearTimeout(noteTimer.current);
    noteTimer.current = null;
    setNote(null);
  }, []);
  useEffect(() => hideNote, [hideNote]);
  // The note waits while it is pointed at or has focus (it holds a button), then goes after NOTE_MS.
  const startNoteTimer = useCallback(() => {
    if (noteTimer.current !== null) window.clearTimeout(noteTimer.current);
    noteTimer.current = window.setTimeout(() => { noteTimer.current = null; setNote(null); }, NOTE_MS);
  }, []);
  const holdNote = () => { if (noteTimer.current !== null) window.clearTimeout(noteTimer.current); noteTimer.current = null; };
  const { light, onSetLight } = props;
  const toggleLamp = useCallback(() => {
    const next: Light = light === 'evening' ? 'day' : 'evening';
    onSetLight(next);
    setSaid(next === 'evening' ? 'Lamp on: Evening lighting.' : 'Lamp off: Day lighting.');
    if (!readDesk().noted) {
      writeDesk({ noted: true });
      setNote(next);
      if (noteTimer.current !== null) window.clearTimeout(noteTimer.current);
      startNoteTimer();
    }
  }, [light, onSetLight, startNoteTimer]);

  // The goal editor: open in the notebook (desk) or as a card under the strip (phone).
  const [editing, setEditing] = useState(false);
  const chip = useRef<HTMLButtonElement>(null);
  const closePhoneEditor = () => { setEditing(false); window.setTimeout(() => chip.current?.focus(), 0); };
  const goalCount = props.todaysWords.length;

  // On a phone the film grows to the card's width once played (and stays so: the "lifted page").
  const [filmLifted, setFilmLifted] = useState(false);
  const liftFilm = useCallback((playing: boolean) => { if (playing) setFilmLifted(true); }, []);
  // First visit: the welcome. On the desk it is the book's left page; elsewhere a card.
  const welcomeBody = (
    <>
      <span className="ui-label">New here?</span>
      <p className="today-big" id="today-welcome-title">Take the one-minute tour</p>
      <p className="tour-hi" lang="hi">नए हैं? एक मिनट का टूर देखें।</p>
      <p className="today-muted">Find words, save them, and remember them. Any time later: ⋯ → Guided tours.</p>
      <div className="today-actions">
        <Button variant="primary" id="today-take-tour" onClick={props.onTakeTour}>Take the tour</Button>
        <Button id="today-not-now" onClick={props.onDismissWelcome}>Not now</Button>
      </div>
    </>
  );

  const minutes = Math.max(1, Math.round((dueCount * SECONDS_PER_CARD) / 60));
  const lastLabel = pageData?.page_number === page ? `${pageData.first_headword} – ${pageData.last_headword}` : null;
  const pos = word ? describePos(word.pos) : null;
  const saved = word ? props.isSaved(word.normalized) : false;

  return (
    <section className="today" id="today-screen" aria-labelledby="today-title">
      <h1 id="today-title" className="ui-visually-hidden">Today</h1>
      <p className="today-hint">Hindi works too: try typing <span lang="hi" className="today-hint-hi">छोड़ना</span> or <span className="today-hint-latin">chhodna</span> in the search box.</p>

      <DeskScene wide={wide} light={light} onToggleLamp={toggleLamp}
        book={<DeskBook page={pageData?.page_number === page ? pageData : null} pageNumber={page} started={lastPage !== null}
          onOpen={() => props.onContinueReading(page)} onAnnounce={setSaid}
          welcome={props.showWelcome ? <div className="desk-welcome" id="today-welcome" role="group" aria-labelledby="today-welcome-title">{welcomeBody}</div> : undefined}
          film={props.showWelcome ? <IntroFilm /> : undefined} />}
        notebook={<GoalNotebook words={props.todaysWords} goal={props.dailyGoal} editing={editing}
          onEdit={() => setEditing(true)} onClose={() => setEditing(false)} onSave={props.onSetGoal} />} />
      <DeskStrip wide={wide} light={light} onToggleLamp={toggleLamp}
        goal={<GoalChip ref={chip} count={goalCount} goal={props.dailyGoal} open={editing} onToggle={() => (editing ? closePhoneEditor() : setEditing(true))} />}
        editor={editing && (
          <Card className="desk-goal-card">
            <GoalEditor id="desk-goal-editor" goal={props.dailyGoal} onCancel={closePhoneEditor}
              onSave={(g) => { props.onSetGoal(g); closePhoneEditor(); }} />
          </Card>
        )} />
      <p className="ui-visually-hidden" id="desk-live" aria-live="polite">{said}</p>
      {note && (
        <div className="desk-note" id="desk-note" onMouseEnter={holdNote} onMouseLeave={startNoteTimer} onFocus={holdNote}
          onBlur={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node | null)) startNoteTimer(); }}>
          <span>{note === 'evening' ? 'Lamp on.' : 'Lamp off.'} It stays this way until you switch it, or choose Auto to follow the clock again.</span>
          <button type="button" id="desk-note-auto" onClick={() => {
            hideNote(); props.onUseAuto();
            document.getElementById(wide ? 'desk-lamp' : 'desk-cord')?.focus(); // the note goes; focus goes back to the lamp
          }}>Use Auto</button>
        </div>
      )}

      {props.showWelcome && wide === false && (
        <Card className={`today-card today-welcome${filmLifted ? ' today-welcome--lifted' : ''}`} id="today-welcome" aria-labelledby="today-welcome-title">
          <div className="today-welcome-row">
            <div className="today-welcome-text">{welcomeBody}</div>
            <IntroFilm onPlayingChange={liftFilm} />
          </div>
        </Card>
      )}

      <DuelCard />

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

      {wide !== true && (
      <Card className="today-card today-continue-card" id="today-continue">
        <span className="ui-label">{lastPage ? 'Continue reading' : 'Start reading'}</span>
        <div className="today-row">
          <div>
            <p className="today-mid">Page {page.toLocaleString('en-IN')}</p>
            <p className="today-muted today-tight">{lastLabel ?? ' '}</p>
          </div>
          <Button id="today-continue-btn" onClick={() => props.onContinueReading(page)}>Open book ›</Button>
        </div>
      </Card>
      )}

      {props.lookedUpToday.total > 0 && (
        // On the desk, like the study guide's link.
        <button type="button" className="lookup-link tour-howlink tour-howlink--desk today-lookups" id="today-lookups" onClick={props.onOpenHistory}>
          {`${props.lookedUpToday.total} word${props.lookedUpToday.total === 1 ? '' : 's'} looked up today${props.lookedUpToday.unsaved > 0 ? ` · ${props.lookedUpToday.unsaved} not saved` : ''} ›`}
        </button>
      )}

      {props.progress.total > 0 && (
        <Card className="today-card" id="today-progress" aria-labelledby="today-progress-title">
          <div className="today-card-head">
            <span className="ui-label" id="today-progress-title">Your progress</span>
            {props.bestStreak >= 2 && <span className="ui-label">Best streak: {props.bestStreak} days</span>}
          </div>
          <ProgressBar progress={props.progress} />
          <ReviewCalendar days={props.calendar} />
        </Card>
      )}

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

      {props.guideOpened === null ? null : props.guideOpened ? (
        // On the desk, like Saved's link: the plain link colour is too dark there.
        <button type="button" className="lookup-link tour-howlink tour-howlink--desk today-learn-link" id="today-learn-link" onClick={props.onOpenGuide}>How to learn with Panna ›</button>
      ) : (
        <Card className="today-card today-learn" id="today-learn">
          <button type="button" className="today-learn-btn" onClick={props.onOpenGuide}>
            <span className="today-mid">How to learn with Panna ›</span>
            <span className="today-muted today-tight">A 15-minute routine that makes words stick.</span>
          </button>
        </Card>
      )}
    </section>
  );
}
