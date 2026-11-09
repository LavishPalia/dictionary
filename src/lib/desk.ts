// The desk scene on Today: what one device remembers about it (where the lamp is aimed, which light it draws,
// whether the first-switch note was shown), and the lamp's geometry. Kept in its own key, outside the backup:
// it is about this screen and this device, not the reader's words.

/** The scene is drawn in these units and scaled to fit. */
export const SCENE_W = 940, SCENE_H = 400;

/** 'B' = the SVG spotlight on paper grain; 'A' = the CSS gradient fallback. */
export type LightVersion = 'A' | 'B';
export interface Aim { x: number; y: number }
export interface DeskState {
  /** Where the light points, as fractions of the scene (0–1). */
  aim?: Aim;
  /** Where the light points on the Book page, as fractions of the page's lamp area (0–1). */
  bookAim?: Aim;
  /** Set to 'A' once this device proved too slow for B. */
  light?: LightVersion;
  /** The one-time note after the first lamp switch has been shown. */
  noted?: boolean;
}

const KEY = 'panna_desk';
/** The middle of the open book. */
export const DEFAULT_AIM: Aim = { x: 0.53, y: 0.5 };
/** Where the Book page's light rests, and its pool on a phone. */
export const BOOK_DEFAULT_AIM: Aim = { x: 0.25, y: 0.28 };
export const PHONE_POOL: Aim = { x: 0.45, y: 0.23 };

const fraction = (v: unknown) => typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= 1;

/** Keeps only the valid parts of a stored value. */
export function parseDesk(raw: unknown): DeskState {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const r = raw as Record<string, unknown>;
  const out: DeskState = {};
  const aim = r.aim as Record<string, unknown> | undefined;
  if (aim && typeof aim === 'object' && fraction(aim.x) && fraction(aim.y)) out.aim = { x: aim.x as number, y: aim.y as number };
  const bookAim = r.bookAim as Record<string, unknown> | undefined;
  if (bookAim && typeof bookAim === 'object' && fraction(bookAim.x) && fraction(bookAim.y)) out.bookAim = { x: bookAim.x as number, y: bookAim.y as number };
  if (r.light === 'A' || r.light === 'B') out.light = r.light;
  if (r.noted === true) out.noted = true;
  return out;
}

export function readDesk(): DeskState {
  try { return parseDesk(JSON.parse(localStorage.getItem(KEY) ?? 'null')); } catch { return {}; }
}

export function writeDesk(patch: Partial<DeskState>): DeskState {
  const next = parseDesk({ ...readDesk(), ...patch });
  try { localStorage.setItem(KEY, JSON.stringify(next)); } catch {}
  return next;
}

/** Scene units from a stored aim, and back (clamped to the scene's usable area). */
export const aimToScene = (a: Aim): Aim => ({ x: a.x * SCENE_W, y: a.y * SCENE_H });
export function clampScene(p: Aim): Aim {
  return { x: Math.max(20, Math.min(SCENE_W - 20, p.x)), y: Math.max(40, Math.min(SCENE_H - 12, p.y)) };
}
export const sceneToAim = (p: Aim): Aim => ({ x: Math.round((p.x / SCENE_W) * 1000) / 1000, y: Math.round((p.y / SCENE_H) * 1000) / 1000 });

export interface LampGeometry {
  /** The shade's pivot (where arm 2 ends). */
  px: number; py: number;
  /** The shade's angle (radians, 0 = pointing right). */
  ang: number;
  /** The middle of the shade's mouth, where the light starts. */
  mx: number; my: number;
  /** The pool's radius. */
  r: number;
}

/** How far a lamp's pivot may travel, and how it leans toward the target (all in scene units). */
export interface LampReach {
  x: [number, number]; y: [number, number];
  /** The pivot when the target is at `origin`. */
  rest: Aim; origin: Aim;
  lean: number; leanY: number;
}

/** Today's lamp: the pivot stays within x 130-205 and y 45-100, so the shade (74 units long) never covers the book's text (its cloth starts at x 288). */
export const TODAY_REACH: LampReach = { x: [130, 205], y: [45, 100], rest: { x: 175, y: 72 }, origin: { x: 430, y: 200 }, lean: 0.12, leanY: 0.08 };

/** Where the lamp's head goes for a target point in scene units: the pivot leans a little toward the target, like a real arm, within `reach`. */
export function lampGeometry(t: Aim, reach: LampReach = TODAY_REACH): LampGeometry {
  const px = Math.max(reach.x[0], Math.min(reach.x[1], reach.rest.x + (t.x - reach.origin.x) * reach.lean));
  const py = Math.max(reach.y[0], Math.min(reach.y[1], reach.rest.y + (t.y - reach.origin.y) * reach.leanY));
  const ang = Math.atan2(t.y - py, t.x - px);
  const mx = px + Math.cos(ang) * 66, my = py + Math.sin(ang) * 66;
  const r = Math.max(90, Math.hypot(t.x - mx, t.y - my) * 0.55);
  return { px, py, ang, mx, my, r };
}

export interface Rect { left: number; top: number; right: number; bottom: number }

/** True when `lamp` lies inside the view and overlaps none of the `avoid` rects (touching counts as overlapping). */
export function bookLampFits(lamp: Rect, avoid: Rect[], view: { w: number; h: number }): boolean {
  if (lamp.left < 0 || lamp.top < 0 || lamp.right > view.w || lamp.bottom > view.h) return false;
  return !avoid.some((a) => lamp.left <= a.right && lamp.right >= a.left && lamp.top <= a.bottom && lamp.bottom >= a.top);
}

/**
 * The Book page's lamp, in spread units (the spread is 1120 × 640; the left page-turn arrow sits at x −52…−12,
 * y 288…352). The header ends 28 units above the spread and the left gutter is only about 133 units wide at
 * 1440 px, so the hinge sits in the gutter beside the spread's top-left corner: x −91…−89 keeps the 74-unit
 * shade (± 38 across) clear of the spread at every angle, and y 40…62 keeps it under the header even when it
 * points up at the spread's top-left corner. It leans a little toward the aim (lower for lower aims).
 */
export const BOOK_REACH: LampReach = { x: [-91, -89], y: [40, 62], rest: { x: -90, y: 50 }, origin: { x: 560, y: 320 }, lean: 0.004, leanY: 0.04 };

/** The shade's box for a target (the shade runs from just behind its hinge, `back` units, to 74 units along it, ± 38 across). */
export function shadeBox(t: Aim, reach: LampReach, back = 8): Rect {
  const g = lampGeometry(t, reach);
  const c = Math.cos(g.ang), s = Math.sin(g.ang);
  const xs: number[] = [], ys: number[] = [];
  for (const a of [-back, 74]) for (const k of [-38, 38]) { xs.push(g.px + a * c - k * s); ys.push(g.py + a * s + k * c); }
  return { left: Math.min(...xs), top: Math.min(...ys), right: Math.max(...xs), bottom: Math.max(...ys) };
}

/** Every place the shade can be over an area of targets (w × h from 0, 0): the union of its boxes, sampled on a grid. */
export function shadeReachBox(w: number, h: number, reach: LampReach, steps = 8): Rect {
  const out: Rect = { left: Infinity, top: Infinity, right: -Infinity, bottom: -Infinity };
  for (let i = 0; i <= steps; i++) for (let j = 0; j <= steps; j++) {
    const b = shadeBox({ x: (i / steps) * w, y: (j / steps) * h }, reach);
    out.left = Math.min(out.left, b.left); out.top = Math.min(out.top, b.top);
    out.right = Math.max(out.right, b.right); out.bottom = Math.max(out.bottom, b.bottom);
  }
  return out;
}
