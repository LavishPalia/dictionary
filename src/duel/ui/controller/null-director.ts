// A director with no motion: every sequence ends at once. Node tests use it to see what was asked.
import type { GameEvent, Who } from '../../engine';
import type { Director } from './types';

export class NullDirector implements Director {
  calls: { fn: 'resolve' | 'arrive'; who: Who; kinds: string[] }[] = [];
  toasts: string[] = [];
  async resolve(events: GameEvent[], who: Who) { this.calls.push({ fn: 'resolve', who, kinds: events.map(e => e.e) }); }
  async arrive(events: GameEvent[], who: Who) { this.calls.push({ fn: 'arrive', who, kinds: events.map(e => e.e) }); }
  toast(text: string) { this.toasts.push(text); }
}
