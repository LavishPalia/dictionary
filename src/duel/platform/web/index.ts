// The Duel running inside Panna on the web.
import type { Platform } from '../types';
import { webHaptics } from './haptics';
import { stubHelp } from './help';
import { webPuzzles } from './puzzles';
import { webSound } from './sound';
import { webStorage } from './storage';

export function webPlatform(): Platform {
  const storage = webStorage();
  return {
    storage,
    sound: webSound(),
    haptics: webHaptics(),
    puzzles: webPuzzles(),
    help: stubHelp(storage),
    reducedMotion: () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches,
    exitHref: '/',
  };
}
