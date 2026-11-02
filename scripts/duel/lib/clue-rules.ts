// Text rules every Duel clue obeys, shared by the checker and the clue bank.

/** Why this clue text gives its answer away or breaks a wording rule; null if it's fine. Answers are a–z only. */
export function textProblem(answer: string, text: string): string | null {
  const a = answer.toLowerCase(), t = text.toLowerCase();
  if (/\bbriefly\b|\bfor short\b/i.test(text)) return 'says "briefly" or "for short"';
  // Long answers can't hide inside the clue at all (TOUR in "Tourist trip"); short ones only as a whole word ("N" in "North" is fine).
  if (a.length >= 3 ? t.includes(a) : new RegExp(`(^|[^a-z])${a}([^a-z]|$)`).test(t)) return `contains the answer ${answer.toUpperCase()}`;
  return null;
}
