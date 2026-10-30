'use client';

import { Segmented, Sheet, Switch } from '@/components/ui';
import { BookIcon, ChevronIcon, CompassIcon, DiceIcon } from '@/components/ui/icons';
import type { Lighting } from '@/lib/lighting';

export type PageTurnSpeed = 'slow' | 'realistic' | 'brisk' | 'instant';

interface ReadingMenuProps {
  open: boolean;
  onClose: () => void;
  lighting: Lighting;
  onLightingChange: (lighting: Lighting) => void;
  speed: PageTurnSpeed;
  reducedMotion: boolean;
  onSpeedChange: (speed: PageTurnSpeed) => void;
  soundsOn: boolean;
  onSoundsChange: (on: boolean) => void;
  busy: boolean;
  onRandomPage: () => void;
  bookOpen: boolean;
  onToggleBook: () => void;
  onOpenCredits: () => void;
  onBackup: () => void;
  onRestore: () => void;
  onOpenTours: () => void;
  onOpenGuide: () => void;
  /** Tours not seen yet (0: all seen). */
  toursUnseen: number;
  /** Saving the whole book for offline use (shown only where the service worker runs). */
  offline: { available: boolean; status: string; saving: boolean; onSave: () => void };
  /** Install as an app: a browser prompt to show, or instructions for iOS. */
  onInstall: (() => void) | null;
  installHint: 'ios' | null;
  /** The iPhone Shortcut's link; empty means no row. */
  iosShortcut: string;
  /** e.g. "Last backup 3 days ago". */
  backupLabel: string;
}

// Everything that used to crowd the top of the screen: reading preferences and the less frequent actions.
export function ReadingMenu(props: ReadingMenuProps) {
  const { open, onClose, busy } = props;

  // Actions that move the book close the menu first, so the reader sees the page turn.
  const thenClose = (action: () => void) => () => { onClose(); action(); };

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
      <button type="button" className="menu-row menu-link" id="learn-btn" onClick={thenClose(props.onOpenGuide)}>
        <span className="menu-title">How to learn with Panna</span><ChevronIcon />
      </button>
      <div className="menu-row">
        <div>
          <div className="menu-title">Desk lighting</div>
          <div className="menu-sub">Auto: dim 7 pm–6 am</div>
        </div>
        <Segmented label="Desk lighting" value={props.lighting} onChange={props.onLightingChange}
          options={[{ value: 'auto', label: 'Auto', id: 'lighting-auto' }, { value: 'day', label: 'Day', id: 'lighting-day' }, { value: 'evening', label: 'Evening', id: 'lighting-evening' }]} />
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
      {/* The two book actions share a row. */}
      <div className="menu-row menu-pair">
        <button type="button" className="menu-tile" id="explore-btn" disabled={busy} onClick={thenClose(props.onRandomPage)}>
          <DiceIcon /><span className="menu-title">Random page</span>
        </button>
        <button type="button" className="menu-tile" id="cover-toggle-btn" onClick={thenClose(props.onToggleBook)}>
          <BookIcon /><span className="menu-title">{props.bookOpen ? 'Close the book' : 'Open the book'}</span>
        </button>
      </div>
      {props.offline.available && (
        // Stays open while saving, so the progress can be watched.
        <button type="button" className="menu-row menu-link" id="offline-save-btn" onClick={props.offline.onSave}
          disabled={props.offline.saving} aria-describedby="offline-status">
          <span>
            <span className="menu-title">Save the book for offline</span>
            <span className="menu-sub menu-sub--block" id="offline-status" aria-live="polite">{props.offline.status}</span>
          </span>
          <ChevronIcon />
        </button>
      )}
      {props.onInstall ? (
        <button type="button" className="menu-row menu-link" id="install-btn" onClick={thenClose(props.onInstall)}>
          <span>
            <span className="menu-title">Install Panna</span>
            <span className="menu-sub menu-sub--block">Open it from your home screen or desktop, like an app</span>
          </span>
          <ChevronIcon />
        </button>
      ) : props.installHint === 'ios' ? (
        // tabIndex -1: the study guide's "Install Panna" button opens the menu here.
        <div className="menu-row" id="install-hint" tabIndex={-1}>
          <span>
            <span className="menu-title">Install Panna</span>
            <span className="menu-sub menu-sub--block">In Safari, tap Share, then “Add to Home Screen”</span>
          </span>
        </div>
      ) : null}
      {props.iosShortcut && (
        <a className="menu-row menu-link" id="ios-shortcut-row" href={props.iosShortcut}>
          <span>
            <span className="menu-title">Look up from any app</span>
            <span className="menu-sub menu-sub--block">Add a Shortcut to look up words from WhatsApp, Safari or Siri.</span>
          </span>
          <ChevronIcon />
        </a>
      )}
      {/* Back up, with Restore beside it. */}
      <div className="menu-row menu-backup">
        <button type="button" className="menu-link" id="backup-btn" onClick={thenClose(props.onBackup)}>
          <span>
            <span className="menu-title">Back up my words</span>
            <span className="menu-sub menu-sub--block" id="backup-label">{props.backupLabel}</span>
          </span>
        </button>
        <button type="button" className="menu-pill" id="restore-btn" aria-label="Restore from a backup" onClick={thenClose(props.onRestore)}>
          Restore
        </button>
      </div>
      <button type="button" className="menu-foot" id="open-credits-btn" onClick={thenClose(props.onOpenCredits)}>
        Sources &amp; credits ›
      </button>
    </Sheet>
  );
}
