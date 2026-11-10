'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { Button, Card, Sheet } from '@/components/ui';
import {
  cleanName, DEFAULT_EMBLEM, EMBLEMS, greetingFor, isDevanagari, limitName, NAME_MAX, nameLength,
  type Bookplate, type Emblem,
} from '@/lib/bookplate';
import { EMBLEM_NAMES, EmblemMark } from './emblems';

const PICKS: Emblem[] = [...EMBLEMS, 'initial'];

/** A drawn ex-libris plate. The name line is either text or, in the sheet, the field the reader writes on. */
function Plate({ name, emblem, children }: { name: string; emblem: Emblem; children: React.ReactNode }) {
  return (
    <div className="bp-plate">
      {(['tl', 'tr', 'bl', 'br'] as const).map((c) => (
        <svg key={c} className={`bp-corner bp-corner--${c}`} viewBox="0 0 14 14" aria-hidden="true" focusable="false">
          <path d="M1 13V5a4 4 0 0 1 4-4h8M4 13V7a3 3 0 0 1 3-3h6" fill="none" stroke="currentColor" strokeWidth="1.2" />
          <circle cx="4.5" cy="4.5" r="1.4" fill="currentColor" />
        </svg>
      ))}
      <span className="bp-exlibris" aria-hidden="true">Ex libris</span>
      <span className="bp-medallion"><EmblemMark emblem={emblem} name={name} /></span>
      <span className="bp-belongs">This book belongs to</span>
      <div className="bp-name-line">{children}</div>
    </div>
  );
}

interface SheetProps {
  open: boolean;
  plate: Bookplate | null;
  /** Usage counts is on (and the browser doesn't ask not to be tracked): only then can the name be shared. */
  canShare: boolean;
  onSave: (plate: Bookplate) => void;
  onRemove: () => void;
  onClose: () => void;
  /** Where focus goes when the sheet closes (the offer's button, or the ⋯ button). */
  returnFocusTo?: () => HTMLElement | null;
}

/** Writing the plate: the name straight onto it, an emblem, and the share tick (unticked until the reader ticks it). */
export function BookplateSheet({ open, plate, canShare, onSave, onRemove, onClose, returnFocusTo }: SheetProps) {
  const [name, setName] = useState('');
  const [emblem, setEmblem] = useState<Emblem>(DEFAULT_EMBLEM);
  const [share, setShare] = useState(false);
  useEffect(() => {
    if (!open) return;
    setName(plate?.name ?? '');
    setEmblem(plate?.emblem ?? DEFAULT_EMBLEM);
    setShare(Boolean(plate?.share));
  }, [open, plate]);

  const clean = cleanName(name);
  const length = nameLength(name);
  const shareOn = canShare && share;
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!clean) return;
    onSave({ name: clean, emblem, share: shareOn });
  };

  return (
    <Sheet open={open} onClose={onClose} title="Your bookplate" id="bookplate-sheet" className="bp-sheet" returnFocusTo={returnFocusTo}>
      <form onSubmit={submit} noValidate>
        <Plate name={name} emblem={emblem}>
          <label htmlFor="bookplate-name" className="ui-visually-hidden">Your name</label>
          <input id="bookplate-name" className={`bp-name-input${isDevanagari(name) ? ' bp-name--deva' : ''}`} value={name}
            onChange={(event) => setName(limitName(event.target.value))} autoComplete="name" spellCheck={false}
            placeholder="Write your name here" aria-describedby="bookplate-count" />
        </Plate>
        <p className={`bp-count${length >= NAME_MAX - 3 ? ' bp-count--near' : ''}`} id="bookplate-count">
          {length >= 20 ? `${length} of ${NAME_MAX} letters` : ''}
        </p>

        <fieldset className="bp-emblems">
          <legend className="ui-label">Emblem</legend>
          <div className="bp-emblem-grid">
            {PICKS.map((k) => (
              <label key={k} className="bp-emblem" title={EMBLEM_NAMES[k].en}>
                <input type="radio" name="bookplate-emblem" id={`bookplate-emblem-${k}`} value={k} checked={emblem === k}
                  onChange={() => setEmblem(k)} aria-label={EMBLEM_NAMES[k].en} />
                <EmblemMark emblem={k} name={name || 'A'} />
              </label>
            ))}
          </div>
          <p className="bp-emblem-name" aria-hidden="true">
            {EMBLEM_NAMES[emblem].en} · <span lang="hi">{EMBLEM_NAMES[emblem].hi}</span>
          </p>
        </fieldset>

        <label className={`bp-share${canShare ? '' : ' bp-share--off'}`} htmlFor="bookplate-share">
          <input type="checkbox" id="bookplate-share" checked={shareOn} disabled={!canShare}
            onChange={(event) => setShare(event.target.checked)} aria-describedby="bookplate-share-sub" />
          <span className="bp-share-title">Share my name with Panna’s makers</span>
          <span className="bp-share-sub" id="bookplate-share-sub">
            {!canShare
              ? 'Usage counts is off, so nothing is sent. Turn it on in ⋯ → Usage counts to share.'
              : 'So they know who reads the book. Only the name, never your words. Untick any time.'}
          </span>
        </label>

        <div className="bp-actions">
          <Button type="submit" variant="primary" id="bookplate-save" disabled={!clean}>Save</Button>
          <Button id="bookplate-cancel" onClick={onClose}>Cancel</Button>
          {plate && <button type="button" className="bp-remove" id="bookplate-remove" onClick={onRemove}>Remove bookplate</button>}
        </div>
      </form>
    </Sheet>
  );
}

/** Today's one-time offer, after the first saved word. */
export function BookplateOffer({ onWrite, onNotNow }: { onWrite: () => void; onNotNow: () => void }) {
  return (
    <Card className="today-card bp-offer" id="today-bookplate" aria-labelledby="today-bookplate-title">
      <div className="bp-offer-text">
        <span className="ui-label">Your bookplate</span>
        <p className="today-big" id="today-bookplate-title">Make this book yours</p>
        <p className="tour-hi" lang="hi">इस किताब को अपना बनाइए: इसमें अपना नाम लिखिए।</p>
        <p className="today-muted">Write your name on a bookplate inside the cover. Later: ⋯ → Your bookplate.</p>
      </div>
      <svg className="bp-offer-plate" viewBox="0 0 64 82" aria-hidden="true" focusable="false">
        <rect x="3" y="3" width="58" height="76" className="bp-offer-paper" strokeWidth="2" />
        <rect x="7" y="7" width="50" height="68" fill="none" stroke="currentColor" strokeOpacity=".5" />
        <circle cx="32" cy="28" r="11" fill="none" stroke="currentColor" strokeWidth="1.4" />
        <EmblemMark emblem="lotus" name="" at={{ x: 22, y: 18, size: 20 }} />
        <line x1="15" y1="56" x2="49" y2="56" className="bp-offer-line" />
      </svg>
      <div className="today-actions bp-offer-actions">
        <Button variant="primary" id="bookplate-write" onClick={onWrite}>Write my name</Button>
        <Button id="bookplate-not-now" onClick={onNotNow}>Not now</Button>
      </div>
    </Card>
  );
}

/** "Good evening, Riya", with the emblem, on the desk above Today's cards. */
export function BookplateGreeting({ plate, hour }: { plate: Bookplate; hour: number }) {
  return (
    <p className="bp-greeting" id="today-greeting">
      <span className="bp-seal"><EmblemMark emblem={plate.emblem} name={plate.name} /></span>
      <span>{greetingFor(hour)}, <span className={`bp-hand${isDevanagari(plate.name) ? ' bp-name--deva' : ''}`}>{plate.name}</span></span>
    </p>
  );
}

/** The plate in miniature, for the ⋯ menu row (dashed and empty before there is one). */
export function MiniPlate({ plate }: { plate: Bookplate | null }) {
  return (
    <span className={`bp-mini${plate ? '' : ' bp-mini--empty'}`} aria-hidden="true">
      {plate ? <EmblemMark emblem={plate.emblem} name={plate.name} /> : '+'}
    </span>
  );
}
