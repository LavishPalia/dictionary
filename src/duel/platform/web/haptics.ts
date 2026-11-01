// Android vibration. iOS Safari has none, so there these do nothing.
import type { Haptics } from '../types';

export function webHaptics(): Haptics {
  const buzz = (p: number | number[]) => { if (h.enabled) { try { navigator.vibrate?.(p); } catch {} } };
  const h: Haptics = {
    enabled: true,
    tick: () => buzz(8),
    drop: () => buzz(12),
    wrong: () => buzz([25, 30, 25]),
    celebrate: () => buzz([20, 40, 20, 40, 40]),
  };
  return h;
}
