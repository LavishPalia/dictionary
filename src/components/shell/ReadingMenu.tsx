'use client';

import { useState } from 'react';
import { Button, Segmented, Sheet, Switch } from '@/components/ui';
import { ChevronIcon, CompassIcon } from '@/components/ui/icons';

export type PageTurnSpeed = 'slow' | 'realistic' | 'brisk' | 'instant';

interface ReadingMenuProps {
  open: boolean;
  onClose: () => void;
  evening: boolean;
  onEveningChange: (evening: boolean) => void;
  speed: PageTurnSpeed;
  reducedMotion: boolean;
  onSpeedChange: (speed: PageTurnSpeed) => void;
  soundsOn: boolean;
  onSoundsChange: (on: boolean) => void;
  currentPage: number;
  totalPages: number;
  busy: boolean;
  onGoToPage: (page: number) => void;
  onRandomPage: () => void;
  bookOpen: boolean;
  onToggleBook: () => void;
  onOpenCredits: () => void;
  onBackup: () => void;
  onRestore: () => void;
  onOpenTours: () => void;
  /** Tours not seen yet (0: all seen). */
  toursUnseen: number;
  /** e.g. "Last backup 3 days ago". */
  backupLabel: string;
}

// Everything that used to crowd the top of the screen: reading preferences and the less frequent actions.
export function ReadingMenu(props: ReadingMenuProps) {
  const { open, onClose, currentPage, totalPages, busy } = props;
  const [goTo, setGoTo] = useState('');

  // Actions that move the book close the menu first, so the reader sees the page turn.
  const thenClose = (action: () => void) => () => { onClose(); action(); };

  const submitGoTo = (event: React.FormEvent) => {
    event.preventDefault();
    const n = parseInt(goTo, 10);
    setGoTo('');
    if (!Number.isInteger(n)) return;
    onClose();
    props.onGoToPage(n);
  };

  return (
    <Sheet open={open} onClose={onClose} title="Reading settings" id="reading-menu" returnFocusTo={() => document.getElementById('menu-btn')}>
      {/* First, so anyone opening the menu finds the tours. */}
      <button type="button" className="menu-row menu-link menu-tours" id="guided-tours-btn" onClick={thenClose(props.onOpenTours)}>
        <span className="menu-tours-icon" aria-hidden="true"><CompassIcon /></span>
        <span className="menu-tours-text">
          <span className="menu-title">Guided tours</span>
          <span className="menu-sub menu-sub--block" id="guided-tours-sub">
            {props.toursUnseen ? `Learn your way around Panna · ${props.toursUnseen} not seen yet` : 'Learn your way around Panna'}
          </span>
        </span>
        <ChevronIcon />
      </button>
      <div className="menu-row">
        <div>
          <div className="menu-title">Desk lighting</div>
          <div className="menu-sub">Evening is easier on the eyes at night</div>
        </div>
        <Segmented label="Desk lighting" value={props.evening ? 'evening' : 'day'} onChange={(v) => props.onEveningChange(v === 'evening')}
          options={[{ value: 'day', label: 'Day' }, { value: 'evening', label: 'Evening' }]} />
      </div>
      <div className="menu-row">
        <div>
          <div className="menu-title">Page-turn speed</div>
          <div className="menu-sub">
            {props.reducedMotion ? 'Your device asks for less motion, so pages turn instantly' : 'How long one page takes to turn'}
          </div>
        </div>
        <Segmented label="Page-turn speed" value={props.speed} onChange={props.onSpeedChange}
          options={[{ value: 'slow', label: 'Slow' }, { value: 'realistic', label: 'Normal' }, { value: 'brisk', label: 'Fast' }, { value: 'instant', label: 'Instant' }]} />
      </div>
      <label className="menu-row" htmlFor="sounds-switch">
        <div>
          <div className="menu-title">Page sounds</div>
          <div className="menu-sub">Paper rustle when turning</div>
        </div>
        <Switch id="sounds-switch" checked={props.soundsOn} onChange={props.onSoundsChange} label="Page sounds" />
      </label>
      <form className="menu-row" id="goto-page-form" onSubmit={submitGoTo}>
        <label className="menu-title" htmlFor="goto-page-input">Go to page</label>
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
          <input
            id="goto-page-input"
            className="ui-input"
            type="number"
            inputMode="numeric"
            min={1}
            max={totalPages}
            value={goTo}
            onChange={(e) => setGoTo(e.target.value)}
            placeholder={String(currentPage)}
            aria-describedby="goto-page-total"
            style={{ width: 88, height: 40, borderRadius: 'var(--radius-md)', textAlign: 'center' }}
          />
          <span id="goto-page-total" className="menu-sub">of {totalPages.toLocaleString('en-IN')}</span>
          <Button size="small" type="submit" disabled={busy}>Go</Button>
        </div>
      </form>
      <button type="button" className="menu-row menu-link" id="explore-btn" disabled={busy} onClick={thenClose(props.onRandomPage)}>
        <span className="menu-title">Open a random page</span><ChevronIcon />
      </button>
      <button type="button" className="menu-row menu-link" id="cover-toggle-btn" onClick={thenClose(props.onToggleBook)}>
        <span className="menu-title">{props.bookOpen ? 'Close the book' : 'Open the book'}</span><ChevronIcon />
      </button>
      <button type="button" className="menu-row menu-link" id="backup-btn" onClick={thenClose(props.onBackup)}>
        <span>
          <span className="menu-title">Back up my words</span>
          <span className="menu-sub menu-sub--block" id="backup-label">{props.backupLabel}</span>
        </span>
        <ChevronIcon />
      </button>
      <button type="button" className="menu-row menu-link" id="restore-btn" onClick={thenClose(props.onRestore)}>
        <span className="menu-title">Restore from a backup</span><ChevronIcon />
      </button>
      <button type="button" className="menu-row menu-link" id="open-credits-btn" onClick={thenClose(props.onOpenCredits)}>
        <span className="menu-title">Sources &amp; credits</span><ChevronIcon />
      </button>
    </Sheet>
  );
}
