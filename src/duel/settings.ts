// The Duel's own settings on the device (UI-DESIGN §3.6). Anything unreadable means the default: both on.

export const SETTINGS_KEY = 'panna_duel_settings';
export interface DuelSettings { sound: boolean; vibration: boolean }

export function readSettings(raw: unknown): DuelSettings {
  const s = raw as Partial<DuelSettings> | null;
  return { sound: s?.sound !== false, vibration: s?.vibration !== false };
}
