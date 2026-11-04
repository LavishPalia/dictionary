// The Duel running inside Panna on the web.
import { readSettings, SETTINGS_KEY } from '../../settings';
import type { Platform } from '../types';
import { webHaptics } from './haptics';
import { istToday } from '../../progress';
import { webHelp } from './help';
import { webPanna } from './panna';
import { webPuzzles } from './puzzles';
import { webSound } from './sound';
import { webStorage } from './storage';

export function webPlatform(): Platform {
  const storage = webStorage();
  const settings = readSettings(storage.get(SETTINGS_KEY));
  const sound = webSound(), haptics = webHaptics();
  sound.enabled = settings.sound;
  haptics.enabled = settings.vibration;
  return {
    storage,
    sound,
    haptics,
    puzzles: webPuzzles(),
    help: webHelp(storage, () => istToday(new Date())),
    panna: webPanna(storage),
    reducedMotion: () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches,
    exitHref: '/',
  };
}
