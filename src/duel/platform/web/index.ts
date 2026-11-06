// The Duel running inside Panna on the web.
import { readSettings, SETTINGS_KEY } from '../../settings';
import type { Platform } from '../types';
import { webHaptics } from './haptics';
import { istToday } from '../../progress';
import { webHelp } from './help';
import { webNet } from './net';
import { webOffline } from './offline';
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
  const puzzles = webPuzzles();
  return {
    net: webNet(storage),
    storage,
    sound,
    haptics,
    puzzles,
    prepareOffline: webOffline(storage, puzzles),
    help: webHelp(storage, () => istToday(new Date())),
    panna: webPanna(storage),
    reducedMotion: () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches,
    exitHref: '/',
  };
}
