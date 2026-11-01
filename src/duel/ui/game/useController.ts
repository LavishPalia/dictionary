import { useSyncExternalStore } from 'react';
import type { GameController } from '../controller/controller';
import type { Snapshot } from '../controller/types';

/** The controller's current snapshot; the screen re-renders only when it publishes a new one. */
export function useSnapshot(ctl: GameController): Snapshot {
  return useSyncExternalStore(ctl.subscribe, ctl.snapshot, ctl.snapshot);
}
