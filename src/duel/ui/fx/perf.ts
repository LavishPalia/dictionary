// Phase marks for the perf gate (scripts/duel/perf-phone.mjs). Off unless the page has ?perf=1.
export type Phase = 'drag' | 'submit' | 'quill' | 'refill';

let on = false;
export function setPerf(enabled: boolean) { on = enabled; }

export function mark(phase: Phase, edge: 'start' | 'end') {
  if (on) performance.mark(`duel:${phase}:${edge}`);
}
