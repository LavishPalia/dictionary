// The bookplate: an optional "This book belongs to ___" plate with a name and a drawn emblem (never a photo).
// Stored as `bookplate: { name, emblem, share }` in panna_settings, so backups carry it. `share` is the reader's explicit,
// unticked-by-default choice to send the name to the makers' PostHog (India's DPDP Act: a name is personal data).
// The one-time Today offer is remembered as `bookplateOffer: 'done'` (after Not now, or once a plate is saved).
// The pure parts come first, so scripts/test-bookplate.ts can check them in Node.

export const EMBLEMS = ['lotus', 'peacock', 'diya', 'owl', 'banyan', 'kite', 'quill', 'moon'] as const;
export type Emblem = (typeof EMBLEMS)[number] | 'initial';
export const DEFAULT_EMBLEM: Emblem = 'lotus';

export interface Bookplate {
  name: string;
  emblem: Emblem;
  share: boolean;
}

/** The longest name, in characters as a reader counts them (code points, so Hindi names fit as well). */
export const NAME_MAX = 30;

const SETTINGS_KEY = 'panna_settings';

/** A name as typed, cut to NAME_MAX characters, with control characters dropped (spaces kept while typing). */
export function limitName(text: string): string {
  return Array.from(text.replace(/[\p{Cc}\p{Zl}\p{Zp}]/gu, '')).slice(0, NAME_MAX).join('');
}

/** A name as stored: limited, trimmed, and runs of spaces closed up. Empty means no name. */
export function cleanName(text: string): string {
  return limitName(text.replace(/\s+/g, ' ').trim()).trim();
}

/** How many characters a reader sees in the name (for the "24 of 30" counter). */
export function nameLength(text: string): number {
  return Array.from(text).length;
}

export function isEmblem(value: unknown): value is Emblem {
  return value === 'initial' || (EMBLEMS as readonly unknown[]).includes(value);
}

/** The plate in panna_settings, checked: null when there is none or it has no name. */
export function readBookplate(settings: unknown): Bookplate | null {
  if (!settings || typeof settings !== 'object') return null;
  const raw = (settings as { bookplate?: unknown }).bookplate;
  if (!raw || typeof raw !== 'object') return null;
  const { name, emblem, share } = raw as Record<string, unknown>;
  const clean = typeof name === 'string' ? cleanName(name) : '';
  if (!clean) return null;
  return { name: clean, emblem: isEmblem(emblem) ? emblem : DEFAULT_EMBLEM, share: share === true };
}

/** The monogram: the name's first letter, a capital for Latin names ("riya" → "R", "रिया" → "र"). */
export function initialOf(name: string): string {
  const first = Array.from(name.trim())[0] ?? '';
  return first.toLocaleUpperCase('en-IN');
}

/** Whether text is written in Devanagari (the monogram and the name then use the Hindi face). */
export function isDevanagari(text: string): boolean {
  return /\p{Script=Devanagari}/u.test(text);
}

/** The greeting on Today, by the clock (not by the lamp): morning until noon, afternoon until 5 pm, evening after. */
export function greetingFor(hour: number): 'Good morning' | 'Good afternoon' | 'Good evening' {
  if (hour >= 5 && hour < 12) return 'Good morning';
  if (hour >= 12 && hour < 17) return 'Good afternoon';
  return 'Good evening';
}

/** The name PostHog shows for this reader: the nickname, or "Riya · Indigo Owl 3f2" only with the share tick. */
export function personName(nickname: string, plate: Bookplate | null, countsOn: boolean): string {
  return plate && plate.share && countsOn ? `${plate.name} · ${nickname}` : nickname;
}

/** Whether Today offers the bookplate: after the first saved word, once, never beside the tour's welcome card. */
export function offerBookplate(s: { savedWords: number; plate: Bookplate | null; offerDone: boolean; welcomeShowing: boolean }): boolean {
  return s.savedWords > 0 && !s.plate && !s.offerDone && !s.welcomeShowing;
}

// ── Storage (browser only) ──

function readSettings(): Record<string, unknown> {
  try {
    const parsed = JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}');
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function writeSettings(change: (settings: Record<string, unknown>) => void): void {
  try {
    const settings = readSettings();
    change(settings);
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  } catch {}
}

export function loadBookplate(): Bookplate | null {
  return readBookplate(readSettings());
}

/** Saves the plate (and ends the offer), or removes it with null. */
export function storeBookplate(plate: Bookplate | null): void {
  writeSettings((s) => {
    if (plate) {
      const name = cleanName(plate.name);
      if (!name) return;
      s.bookplate = { name, emblem: isEmblem(plate.emblem) ? plate.emblem : DEFAULT_EMBLEM, share: plate.share === true };
      s.bookplateOffer = 'done';
    } else {
      delete s.bookplate;
    }
  });
}

/** Unticks the share box (Usage counts switched off): the name stays on the plate, but is no longer sent. */
export function unshareBookplate(): void {
  writeSettings((s) => {
    const plate = readBookplate(s);
    if (plate?.share) s.bookplate = { ...plate, share: false };
  });
}

export function bookplateOfferDone(): boolean {
  return readSettings().bookplateOffer === 'done';
}

export function endBookplateOffer(): void {
  writeSettings((s) => { s.bookplateOffer = 'done'; });
}
