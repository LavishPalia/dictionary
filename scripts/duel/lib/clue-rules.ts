// Text rules every Duel clue obeys, shared by the checker and the clue bank.
import { readFileSync } from 'node:fs';

let banned: Set<string> | undefined;
/** Words no clue may contain: Panna's blocklist plus data/duel/clue-words-blocked.txt. */
function bannedWords(): Set<string> {
  const read = (f: string) => readFileSync(f, 'utf8').split(/\r?\n/).map(s => s.trim().toLowerCase()).filter(s => s && !s.startsWith('#'));
  return (banned ??= new Set([...read('data/sources/blocklist.txt'), ...read('data/duel/clue-words-blocked.txt')]));
}

/** Why this clue text gives its answer away or breaks a wording rule; null if it's fine. Answers are a–z only. */
export function textProblem(answer: string, text: string): string | null {
  const a = answer.toLowerCase(), t = text.toLowerCase();
  if (/\bbriefly\b|\bfor short\b/i.test(text)) return 'says "briefly" or "for short"';
  // Long answers can't hide inside the clue at all (TOUR in "Tourist trip"); short ones only as a whole word ("N" in "North" is fine).
  if (a.length >= 3 ? t.includes(a) : new RegExp(`(^|[^a-z])${a}([^a-z]|$)`).test(t)) return `contains the answer ${answer.toUpperCase()}`;
  const word = t.split(/[^a-z]+/).find(w => bannedWords().has(w));
  if (word) return `uses the word "${word}", unfit for a family game`;
  return null;
}
