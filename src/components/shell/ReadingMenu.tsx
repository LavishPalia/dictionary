'use client';

import { Segmented, Sheet, Switch } from '@/components/ui';
import { BookIcon, ChevronIcon, CompassIcon, DiceIcon } from '@/components/ui/icons';
import type { Lighting } from '@/lib/lighting';
import type { Bookplate } from '@/lib/bookplate';
import { MiniPlate } from '@/components/bookplate/Bookplate';

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
  /** Usage counts (src/lib/analytics.ts): on, and whether the browser's Do Not Track / GPC keeps it off. */
  usageCounts: boolean;
  usageCountsBlocked: boolean;
  onUsageCountsChange: (on: boolean) => void;
  /** The reader's bookplate, or null before one is written. */
  bookplate: Bookplate | null;
  onOpenBookplate: () => void;
}

// Everything that used to crowd the top of the screen: reading preferences and the less frequent actions.
export function ReadingMenu(props: ReadingMenuProps) {
  const { open, onClose, busy } = props;

  // Actions that move the book close the menu first, so the reader sees the page turn.
  const thenClose = (action: () => void) => () => { onClose(); action(); };

  return (
    <Sheet open={open} onClose={onClose} labelledBy="reading-menu-title" id="reading-menu" returnFocusTo={() => document.getElementById('menu-btn')}>
      {/* The title shares its line with the bookplate, so the whole menu still fits on a phone screen. */}
      <div className="menu-head">
        <h2 id="reading-menu-title" className="ui-sheet-title">Reading settings</h2>
        <button type="button" className="menu-plate-chip" id="bookplate-btn" onClick={thenClose(props.onOpenBookplate)}
          aria-label={props.bookplate
            ? `Your bookplate: ${props.bookplate.name}, ${props.bookplate.share && props.usageCounts ? 'shared' : 'not shared'}`
            : 'Your bookplate: write your name in the book'}>
          <MiniPlate plate={props.bookplate} />
          <span className="menu-plate-chip-name" id="bookplate-sub" aria-hidden="true">{props.bookplate ? props.bookplate.name : 'Your bookplate'}</span>
          <ChevronIcon />
        </button>
      </div>
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
      <label className="menu-row" htmlFor="usage-counts-switch">
        <div>
          <div className="menu-title">Usage counts</div>
          <div className="menu-sub" id="usage-counts-sub">
            {props.usageCountsBlocked ? 'Off: your browser asks sites not to track it' : 'Anonymous counts of visits, never which words'}
          </div>
        </div>
        <Switch id="usage-counts-switch" checked={props.usageCounts} onChange={props.onUsageCountsChange} label="Usage counts"
          disabled={props.usageCountsBlocked} describedBy="usage-counts-sub" />
      </label>
      <button type="button" className="menu-foot" id="open-credits-btn" onClick={thenClose(props.onOpenCredits)}>
        Sources &amp; credits ›
      </button>
    </Sheet>
  );
}
