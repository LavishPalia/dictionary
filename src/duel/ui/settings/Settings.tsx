import { useState } from 'react';
import type { Platform } from '../../platform/types';
import { readSettings, SETTINGS_KEY, type DuelSettings } from '../../settings';
import type { Nav } from '../dates';
import { BackBar } from './BackBar';

/** Game settings (UI-DESIGN §3.6). No leaderboard name until M5, and no board style (the user dropped Ivory, 5 Nov). */
export function Settings({ platform, nav, back }: { platform: Platform; nav: Nav; back: () => void }) {
  const [settings, setSettings] = useState(() => readSettings(platform.storage.get(SETTINGS_KEY)));
  const change = (patch: Partial<DuelSettings>) => {
    const next = { ...settings, ...patch };
    setSettings(next);
    platform.storage.set(SETTINGS_KEY, next);
    platform.sound.enabled = next.sound;
    platform.haptics.enabled = next.vibration;
  };
  const go = (path: string) => (e: React.MouseEvent) => { e.preventDefault(); nav(path); };
  return (
    <div className="duel-page duel-guide" id="duel-settings">
      <BackBar title="Settings" back={back} />
      <h2 className="set-label">Play</h2>
      <div className="page-card set-list">
        <label className="set-row">
          <span><b>Sound</b><small>Taps, chimes and the wax seal</small></span>
          <input type="checkbox" role="switch" id="set-sound" checked={settings.sound} onChange={(e) => change({ sound: e.target.checked })} />
        </label>
        <label className="set-row">
          <span><b>Vibration</b><small>A light buzz as tiles land</small></span>
          <input type="checkbox" role="switch" id="set-vibration" checked={settings.vibration} onChange={(e) => change({ vibration: e.target.checked })} />
        </label>
        <div className="set-row">
          <span><b>Motion</b><small>Follows your phone’s reduced-motion setting</small></span>
        </div>
      </div>
      <h2 className="set-label">Help</h2>
      <div className="page-card set-list">
        <a className="set-row" href="/play/how" onClick={go('/play/how')}>
          <span><b>How to play</b><small>Rules, scoring and the help tools</small></span><i aria-hidden="true">›</i>
        </a>
        <a className="set-row" href="/play/game/today?guide=1" onClick={go('/play/game/today?guide=1')}>
          <span><b>Replay the first-game guide</b><small>The tips from your first duel</small></span><i aria-hidden="true">›</i>
        </a>
        <div className="set-row">
          <span><b>Picture credits</b><small>Clue pictures: Twemoji, <a href="https://creativecommons.org/licenses/by/4.0/" rel="noopener noreferrer" target="_blank">CC BY 4.0</a></small></span>
        </div>
      </div>
      <p className="set-note">Your games, streak and hints are kept on this device. Clearing the browser’s data starts you afresh.</p>
    </div>
  );
}
