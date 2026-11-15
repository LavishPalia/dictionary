// The one card the offer dock shows, if any: the first-visit hint, then the bookplate (after the first lookup), then
// installing Panna (after the second lookup, once the bookplate offer has its answer; once more a week after a
// "Not now", then never). Never two at once.

export type Offer = 'hint' | 'bookplate' | 'install';

export interface OfferState {
  /** The first-visit "tap any word" card is up. */
  hint: boolean;
  /** Lookups ever recorded on this device (src/lib/history.ts). */
  lookups: number;
  /** A bookplate is written. */
  plate: boolean;
  /** The bookplate offer has had its answer (written, or Not now). */
  bookplateDone: boolean;
  /** possible: the browser can install (a prompt is waiting, or iPhone Safari's steps apply). */
  install: { possible: boolean; times: number; lastAt: number | null };
  now: number;
}

export const INSTALL_AGAIN_AFTER = 7 * 24 * 60 * 60 * 1000;

export function nextOffer(s: OfferState): Offer | null {
  if (s.hint) return 'hint';
  if (s.lookups >= 1 && !s.plate && !s.bookplateDone) return 'bookplate';
  const { possible, times, lastAt } = s.install;
  const due = times === 0 || (times === 1 && lastAt !== null && s.now - lastAt >= INSTALL_AGAIN_AFTER);
  if (s.lookups >= 2 && possible && due) return 'install';
  return null;
}

// ── Storage (browser only): panna_settings.installOffer = { times, lastAt } ──

const SETTINGS_KEY = 'panna_settings';

function readSettings(): Record<string, unknown> {
  try {
    const parsed = JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}');
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

export function readInstallOffer(): { times: number; lastAt: number | null } {
  const raw = readSettings().installOffer as { times?: unknown; lastAt?: unknown } | undefined;
  const times = typeof raw?.times === 'number' && raw.times >= 0 ? raw.times : 0;
  const lastAt = typeof raw?.lastAt === 'number' ? raw.lastAt : null;
  return { times, lastAt };
}

/** Installed: never offered again. Dismissed: once more after a week, then never. */
export function noteInstallOffer(outcome: 'dismissed' | 'installed', now: number): void {
  try {
    const settings = readSettings();
    const { times } = readInstallOffer();
    settings.installOffer = outcome === 'installed' ? { times: 2, lastAt: now } : { times: times + 1, lastAt: now };
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  } catch {}
}
