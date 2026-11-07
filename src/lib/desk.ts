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
  /** Set to 'A' once this device proved too slow for B. */
  light?: LightVersion;
  /** The one-time note after the first lamp switch has been shown. */
  noted?: boolean;
}

const KEY = 'panna_desk';
/** The middle of the open book. */
export const DEFAULT_AIM: Aim = { x: 0.53, y: 0.5 };

const fraction = (v: unknown) => typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= 1;

/** Keeps only the valid parts of a stored value. */
export function parseDesk(raw: unknown): DeskState {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const r = raw as Record<string, unknown>;
  const out: DeskState = {};
  const aim = r.aim as Record<string, unknown> | undefined;
  if (aim && typeof aim === 'object' && fraction(aim.x) && fraction(aim.y)) out.aim = { x: aim.x as number, y: aim.y as number };
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

/**
 * Where the lamp's head goes for a target point in scene units: the pivot leans a little toward the target, like a
 * real arm, but stays within x 130–205 and y 45–100, so the shade (74 units long) never covers the book's text
 * (its cloth starts at x 288).
 */
export function lampGeometry(t: Aim): LampGeometry {
  const px = Math.max(130, Math.min(205, 175 + (t.x - 430) * 0.12));
  const py = Math.max(45, Math.min(100, 72 + (t.y - 200) * 0.08));
  const ang = Math.atan2(t.y - py, t.x - px);
  const mx = px + Math.cos(ang) * 66, my = py + Math.sin(ang) * 66;
  const r = Math.max(90, Math.hypot(t.x - mx, t.y - my) * 0.55);
  return { px, py, ang, mx, my, r };
}
