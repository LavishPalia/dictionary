// PLAYTEST ONLY (M2, Task 8): two settings for Professor Quill, picked with ?quill=a|b, so the user can feel
// "1–3 tiles" (the tuned engine) against the product spec's "1–5". Removed once the user decides.
import { BOT } from '../../engine';

export type QuillVariant = 'a' | 'b';

export const QUILL_VARIANTS: Record<QuillVariant, { counts: number[]; wrongChance: number }> = {
  a: { counts: [1, 1, 2, 2, 2, 3], wrongChance: 0.3 },
  b: { counts: [1, 2, 2, 3, 4, 5], wrongChance: 0.3 },
};

/** Runs `fn` with Quill set to a variant, then puts variant a back. */
export function withQuill<T>(v: QuillVariant | undefined, fn: () => T): T {
  if (!v || v === 'a') return fn();
  Object.assign(BOT, { counts: [...QUILL_VARIANTS[v].counts], wrongChance: QUILL_VARIANTS[v].wrongChance });
  try { return fn(); } finally { Object.assign(BOT, { counts: [...QUILL_VARIANTS.a.counts], wrongChance: QUILL_VARIANTS.a.wrongChance }); }
}
