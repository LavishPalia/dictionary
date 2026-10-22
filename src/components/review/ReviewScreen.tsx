'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { QuizCard } from '@/lib/book-data';
import { describePos } from '@/lib/pos';
import {
  comesBackLabel, daysUntil, dueWords, nextDue, questionKind, type QuestionKind, type ReviewRecords, SESSION_SIZE,
} from '@/lib/review';
import { speechUnavailableReason, useSpeechVoices } from '@/lib/speech';
import { Button, IconButton } from '@/components/ui';
import { CloseIcon, SpeakerIcon } from '@/components/ui/icons';
import type { SavedWord } from '@/components/saved/SavedScreen';

interface ReviewScreenProps {
  saved: SavedWord[];
  records: ReviewRecords;
  /** Record a first answer for a word (later attempts in the same round do not change its schedule). */
  onAnswer: (normalized: string, correct: boolean) => void;
  onClose: () => void;
  onOpenSaved: () => void;
  /** Starts the Saving and Review tour. */
  onHowItWorks: () => void;
}

interface Option { key: string; text: string; correct: boolean }
interface Question { card: QuizCard; kind: QuestionKind; options: Option[]; retry: boolean }

const LETTERS = ['A', 'B', 'C', 'D'];

function shuffle<T>(items: T[]): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

function buildQuestion(card: QuizCard, kind: QuestionKind, retry: boolean): Question {
  if (kind === 'opposite' && card.opposite) {
    const { answer, distractors } = card.opposite;
    const options = shuffle([
      { key: answer.normalized, text: answer.headword, correct: true },
      ...distractors.map((d) => ({ key: d.normalized, text: d.headword, correct: false })),
    ]);
    return { card, kind, options, retry };
  }
  const answerText = (d: { headword: string; meaning_hi: string }) => (kind === 'meaning' ? d.meaning_hi : d.headword);
  const options = shuffle([
    { key: card.entry.normalized, text: answerText(card.entry), correct: true },
    ...card.distractors.map((d) => ({ key: d.normalized, text: answerText(d), correct: false })),
  ]);
  return { card, kind: kind === 'opposite' ? 'meaning' : kind, options, retry };
}

const PROMPTS: Record<QuestionKind, string> = {
  'meaning': 'What does this mean?',
  'word-from-hindi': 'Which English word means this?',
  'word-from-definition': 'Which word fits this meaning?',
  'opposite': 'Which word means the opposite?',
};

// One review round: up to 20 due words, one calm card at a time, no timer. A word answered wrongly comes back
// once at the end of the round so the reader leaves having got it right.
export function ReviewScreen({ saved, records, onAnswer, onClose, onOpenSaved, onHowItWorks }: ReviewScreenProps) {
  // The round is fixed when the screen opens; answering moves words out of "due" but not out of this round.
  const [round] = useState(() => {
    const now = Date.now();
    const keys = saved.map((w) => w.normalized);
    return { due: dueWords(keys, records, now), keys };
  });
  const [practice, setPractice] = useState<string[] | null>(null);
  const roundWords = practice ?? round.due;
  const [queue, setQueue] = useState<Question[] | null>(null);
  const [index, setIndex] = useState(0);
  const [chosen, setChosen] = useState<string | null>(null);
  const [firstTry, setFirstTry] = useState<Record<string, boolean>>({});
  const [error, setError] = useState(false);
  const [attempt, setAttempt] = useState(0); // bumped by "Try again" to refetch the same round
  const nextRef = useRef<HTMLButtonElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const speech = useSpeechVoices();

  // Load cards (with wrong options) for the round from the server.
  useEffect(() => {
    if (!roundWords.length) { setQueue([]); return; }
    let live = true;
    setQueue(null);
    setError(false);
    fetch(`/api/quiz?${roundWords.map((w) => `w=${encodeURIComponent(w)}`).join('&')}`)
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error(String(res.status)))))
      .then((data: { cards: QuizCard[] }) => {
        if (!live) return;
        setQueue(data.cards.filter((c) => c.distractors.length > 0)
          .map((card, i) => buildQuestion(card, questionKind(records[card.entry.normalized], i + card.entry.normalized.length, !!card.opposite), false)));
        setIndex(0);
        setChosen(null);
        setFirstTry({});
      })
      .catch(() => { if (live) setError(true); });
    return () => { live = false; };
  // records are read once per round on purpose: answers update them while the round runs.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roundWords, attempt]);

  useEffect(() => { headingRef.current?.focus(); }, []);

  const question = queue?.[index];
  const answered = chosen !== null;

  const choose = useCallback((option: Option) => {
    if (!question || answered) return;
    setChosen(option.key);
    const key = question.card.entry.normalized;
    if (!question.retry) {
      setFirstTry((prev) => ({ ...prev, [key]: option.correct }));
      if (!practice) onAnswer(key, option.correct);
    }
    // Wrong: the same word comes back once at the end of the round, with its options reshuffled.
    if (!option.correct && !question.retry) {
      setQueue((prev) => prev && [...prev, buildQuestion(question.card, 'meaning', true)]);
    }
  }, [question, answered, practice, onAnswer]);

  const next = useCallback(() => {
    setChosen(null);
    setIndex((i) => i + 1);
  }, []);

  useEffect(() => { if (answered) nextRef.current?.focus(); }, [answered]);

  // Keys 1–4 or A–D answer; Enter moves on.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey || document.querySelector('[role="dialog"]')) return;
      const target = e.target as HTMLElement | null;
      if (target && (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName))) return;
      if (!question) return;
      const n = '1234'.indexOf(e.key) >= 0 ? '1234'.indexOf(e.key) : 'abcd'.indexOf(e.key.toLowerCase());
      if (!answered && n >= 0 && e.key.length === 1 && question.options[n]) { e.preventDefault(); choose(question.options[n]); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [question, answered, choose]);

  const speak = (text: string) => {
    if (speechUnavailableReason(speech, 'en') || !window.speechSynthesis) return;
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    if (speech.voices.en) u.voice = speech.voices.en;
    u.lang = speech.voices.en?.lang ?? 'en-IN';
    u.rate = 0.9;
    window.speechSynthesis.speak(u);
  };

  const firstRoundSize = useMemo(() => (queue ? queue.filter((q) => !q.retry).length : 0), [queue]);
  const done = queue !== null && index >= queue.length;
  const header = (
    <div className="review-top">
      <IconButton id="close-review-btn" aria-label="Close review" onClick={onClose}><CloseIcon /></IconButton>
      <h1 className="review-title" tabIndex={-1} ref={headingRef} id="review-title">
        {practice ? 'Practice' : 'Review'}{queue && question ? ` · ${Math.min(index + 1, queue.length)} of ${queue.length}` : ''}
      </h1>
      <span className="review-top-spacer" />
    </div>
  );

  const howLink = <button type="button" className="lookup-link tour-howlink" id="review-how-btn" onClick={onHowItWorks}>How Review works ›</button>;

  // ── Nothing due ─────────────────────────────────────────────
  if (!practice && round.due.length === 0) {
    const next = nextDue(round.keys, records, Date.now());
    return (
      <section className="review" id="review-screen" aria-labelledby="review-title">
        {header}
        <div className="ui-card review-card review-empty">
          {saved.length === 0 ? (
            <>
              <p className="review-big">Nothing to review yet</p>
              <p className="review-muted">Words you save come here. Open any word and tap <b>Save word</b>, and Panna will quiz you on it at just the right times.</p>
            </>
          ) : (
            <>
              <p className="review-big">All caught up</p>
              <p className="review-muted">
                {next ? <>Your next review is <b>{comesBackLabel(daysUntil({ box: 0, due_at: next.at, right: 0, wrong: 0 }, Date.now()))}</b> ({next.count} word{next.count === 1 ? '' : 's'}).</> : 'Nothing is scheduled.'}
              </p>
              <Button id="practice-btn" onClick={() => setPractice(shuffle(round.keys).slice(0, SESSION_SIZE))}>Practise anyway</Button>
              <p className="review-note">Practice doesn’t change when words come back.</p>
            </>
          )}
          {howLink}
        </div>
        <Button variant="desk" full onClick={saved.length ? onOpenSaved : onClose}>{saved.length ? 'See saved words' : 'Done'}</Button>
      </section>
    );
  }

  return (
    <section className="review" id="review-screen" aria-labelledby="review-title">
      {header}
      {queue && !done && (
        <div className="review-progress" role="progressbar" aria-label="Round progress" aria-valuemin={0} aria-valuemax={queue.length} aria-valuenow={index}>
          <i style={{ width: `${(100 * index) / Math.max(1, queue.length)}%` }} />
        </div>
      )}

      {error && (
        <div className="ui-card review-card review-empty">
          <p className="review-big">Couldn’t load the questions</p>
          <p className="review-muted">Check your connection and try again.</p>
          <Button onClick={() => setAttempt((n) => n + 1)}>Try again</Button>
        </div>
      )}

      {!error && queue === null && <div className="ui-card review-card review-loading" aria-busy="true">Preparing your words…</div>}

      {question && !done && (() => {
        const { entry } = question.card;
        const pos = describePos(entry.pos);
        const pickedCorrect = question.options.find((o) => o.key === chosen)?.correct;
        const days = !practice && !question.retry && records[entry.normalized] ? daysUntil(records[entry.normalized], Date.now()) : null;
        return (
          <div className="ui-card review-card" key={`${entry.normalized}-${index}`}>
            <div className="ui-label review-prompt">{question.retry ? 'One more try' : PROMPTS[question.kind]}</div>
            {(question.kind === 'meaning' || question.kind === 'opposite') && (
              <>
                <p className="review-word">{entry.headword}</p>
                <div className="review-meta">
                  {entry.pronunciation_deva && <span className="ui-pron" lang="hi">{entry.pronunciation_deva}</span>}
                  {pos.label && <span className="ui-pos">{pos.label}</span>}
                  <IconButton surface="paper" aria-label={`Say ${entry.headword} aloud`} onClick={() => speak(entry.headword)}
                    disabled={!!speechUnavailableReason(speech, 'en')} title={speechUnavailableReason(speech, 'en') ?? undefined}>
                    <SpeakerIcon />
                  </IconButton>
                </div>
              </>
            )}
            {question.kind === 'word-from-hindi' && <p className="review-hi-prompt" lang="hi">{entry.meaning_hi}</p>}
            {question.kind === 'word-from-definition' && <p className="review-def-prompt">“{entry.definition_en}”</p>}

            <div className="review-options" role="group" aria-label="Choose an answer">
              {question.options.map((o, i) => {
                const state = !answered ? '' : o.correct ? 'right' : o.key === chosen ? 'wrong' : 'dim';
                return (
                  <button key={o.key} type="button" className={`review-option ${state && `review-option--${state}`}`}
                    lang={question.kind === 'meaning' ? 'hi' : undefined}
                    disabled={answered} aria-disabled={answered} onClick={() => choose(o)}
                    aria-label={answered ? `${o.text}${o.correct ? ' (right answer)' : o.key === chosen ? ' (your answer)' : ''}` : undefined}>
                    <span className="review-key" aria-hidden="true">{state === 'right' ? '✓' : state === 'wrong' ? '✗' : LETTERS[i]}</span>
                    <span>{o.text}</span>
                  </button>
                );
              })}
            </div>

            <div role="status" aria-live="polite">
              {answered && (
                <div className={`review-feedback review-feedback--${pickedCorrect ? 'right' : 'wrong'}`}>
                  <p className="review-feedback-main">
                    {question.kind === 'opposite' && question.card.opposite ? (() => {
                      const { answer } = question.card.opposite;
                      return <>{pickedCorrect ? 'Right!' : 'Not quite.'} The opposite of <b>{entry.headword}</b> (<span lang="hi" className="ui-hi">{entry.meaning_hi}</span>)
                        is <b>{answer.headword}</b> (<span lang="hi" className="ui-hi">{answer.meaning_hi}</span>).</>;
                    })()
                    : pickedCorrect
                      ? <>Right! <b>{entry.headword}</b>: {entry.definition_en}</>
                      : <>Not quite. <b>{entry.headword}</b> means <span lang="hi" className="ui-hi">{entry.meaning_hi}</span>: {entry.definition_en}</>}
                  </p>
                  <p className="review-feedback-when">
                    {practice ? 'Practice round: its schedule is unchanged.'
                      : question.retry ? 'Got it now. It still comes back tomorrow.'
                      : pickedCorrect ? <>Comes back <b>{comesBackLabel(days ?? 1)}</b>.</>
                      : <>You’ll see it again at the end of this round, then <b>tomorrow</b>.</>}
                  </p>
                </div>
              )}
            </div>
          </div>
        );
      })()}

      {question && !done && answered && (
        <Button ref={nextRef} id="review-next-btn" variant="primary" full onClick={next}>
          {index + 1 < (queue?.length ?? 0) ? 'Next word ›' : 'Finish ›'}
        </Button>
      )}

      {done && queue && (
        <div className="ui-card review-card review-empty" id="review-done">
          <p className="review-big">{practice ? 'Practice done' : 'Round complete'}</p>
          <p className="review-muted">
            You got <b>{Object.values(firstTry).filter(Boolean).length} of {firstRoundSize}</b> right first time.
          </p>
          {Object.entries(firstTry).some(([, ok]) => !ok) && (
            <p className="review-muted">To practise again: {Object.entries(firstTry).filter(([, ok]) => !ok)
              .map(([k]) => queue.find((q) => q.card.entry.normalized === k)?.card.entry.headword).join(', ')}.</p>
          )}
          {!practice && (() => {
            const next = nextDue(round.keys, records, Date.now());
            return next ? <p className="review-muted">Next review: <b>{comesBackLabel(daysUntil({ box: 0, due_at: next.at, right: 0, wrong: 0 }, Date.now()))}</b> ({next.count} word{next.count === 1 ? '' : 's'}).</p> : null;
          })()}
          <Button variant="primary" onClick={onClose} id="review-finish-btn">Done</Button>
          {howLink}
        </div>
      )}
    </section>
  );
}
