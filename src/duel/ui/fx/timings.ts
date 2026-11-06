// Every duration in the game, in ms. Values from UI-DESIGN §0/§4 and the prototype the user tuned
// ("the pace is good"): refine within them, never slow the turn down.
export const T = {
  submitPause: 240, judgeHold: 650, judgeHoldReduced: 300,
  chipPop: 150, chipStagger: 50, chipFly: 560, chipMerge: 130,
  wrongHome: 380, afterChips: 200,
  // a finished word's green box, and the Empty hand card (their badges fly like a tile's)
  boxIn: 180, boxOut: 200, emptyIn: 480, emptyHold: 1100,
  refillStagger: 90, refillSpring: 420,
  thinkMin: 1100, thinkMax: 1500, thinkReduced: 400, quillFly: 430, quillAfterLand: 300, quillFade: 220,
  turnGlow: 350, remarkIn: 260, remarkHold: 1300,
  hintStagger: 45, hintPulse: 1800, wordStagger: 30, ghostStagger: 110,
  swapFall: 380, swapFallStagger: 70, swapPop: 460, swapPopStagger: 90,
  drop: 150, settle: 220, invalidBack: 260, tapArc: 300, takeBack: 260, hoverRing: 180,
  toast: 1600,
  reducedMax: 120,
} as const;

/**
 * How fast the scoring of your turn plays. `pace` scales all of it, and each word after the first is `ramp` times
 * quicker again, so a turn finishing many words doesn't keep the player waiting.
 */
export interface Pace { pace: number; ramp: number }
export const SCORING: Pace = { pace: 0.5, ramp: 0.7 };
/** How much a duration shrinks for the Nth word, from 0 (the tiles play as word 0). Never so quick it can't be read. */
export const scoringScale = (word: number, s: Pace = SCORING) => Math.max(0.35, s.pace * Math.pow(s.ramp, word));

/** How long a score takes to count from one number to another. */
export const countDur = (delta: number) => Math.min(700, 260 + Math.abs(delta) * 60);

export const CONFETTI = { normal: 46, lite: 18 };

export const EASE = {
  spring: 'cubic-bezier(.2,.9,.3,1.25)',
  out: 'cubic-bezier(.2,.8,.2,1)',
  stamp: 'cubic-bezier(.3,1.5,.5,1)',
  chip: 'cubic-bezier(.45,0,.25,1)',
  home: 'cubic-bezier(.3,.7,.3,1)',
  drop: 'cubic-bezier(.2,.9,.3,1.15)',
};
