// The coached first game and the later one-time tips (UI-DESIGN §3.6 as changed by §0: there is no clue bar).
// The Hindi lines are in the owner's native Hindi check list.

export const GUIDE_KEY = 'panna_duel_guide';

export interface CoachStep { k: string; target: string; en: string; hi: string }

export const COACH: CoachStep[] = [
  { k: 'Your tiles', target: '.duel-rack', en: 'These are your letter tiles. Drag one onto a square on the board.', hi: 'टाइल को बोर्ड के किसी खाने पर खींचें।' },
  { k: 'The clues', target: '.duel-clue', en: 'Each clue points to its answer. Tap a clue to read it in full.', hi: 'तीर बताता है कि उत्तर कहाँ से शुरू होता है।' },
  { k: 'Submit', target: '[data-act="submit"]', en: 'Place as many tiles as you like, then press Submit. Right tiles score +1. Wrong ones cost 1 and come back.', hi: 'तैयार होने पर Submit दबाएँ।' },
  { k: 'The duel', target: '.duel-score', en: 'Then it’s Professor Quill’s turn. Finish words for big bonuses. The higher score when the board is full wins.', hi: 'अब प्रोफ़ेसर क्विल की बारी।' },
];

export type TipId = 'hint' | 'word' | 'swap' | 'calendar';

export const LATER: Record<TipId, { en: string; hi: string }> = {
  hint: { en: 'Stuck? Hint lights every square where your tiles belong.', hi: 'हिंट बताता है कि आपकी टाइलें कहाँ जाएँगी।' },
  word: { en: 'Try Word: pick a clue and see its answer in faint letters.', hi: 'वर्ड से किसी सुराग का उत्तर हल्के अक्षरों में दिखता है।' },
  swap: { en: 'Swap trades your tiles with the bag. Swap and pass is free.', hi: 'स्वैप से आप अपनी टाइलें बदल सकते हैं।' },
  calendar: { en: 'Lost days stay open. Tap any day on the calendar to play it.', hi: 'कैलेंडर से किसी भी दिन का खेल खेलें।' },
};

export interface GuideState { coach: boolean; tips: TipId[] }

export function readGuide(raw: unknown): GuideState {
  const g = raw as Partial<GuideState> | null;
  const known = (t: unknown): t is TipId => typeof t === 'string' && t in LATER;
  return { coach: g?.coach === true, tips: Array.isArray(g?.tips) ? g.tips.filter(known) : [] };
}

/** The next tip that has become useful and hasn't been shown. */
export function nextTip(seen: Set<string>, ev: { wrongOrPass: number; dryTurns: number; passes: number; finished: number }): TipId | null {
  if (!seen.has('hint') && ev.wrongOrPass >= 1) return 'hint';
  if (!seen.has('word') && ev.dryTurns >= 2) return 'word';
  if (!seen.has('swap') && ev.passes >= 2) return 'swap';
  if (!seen.has('calendar') && ev.finished >= 1) return 'calendar';
  return null;
}
