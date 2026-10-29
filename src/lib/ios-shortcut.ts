// The "Look up in Panna" iPhone Shortcut. Until its iCloud link is pasted in below, the menu row and the study guide
// button stay hidden.

/** The Shortcut's iCloud link. Empty until it is built and shared. */
export const IOS_SHORTCUT_URL = '';

/** Same test as the install hint: Safari on iPhone, iPad and iPod. */
export const IOS_DEVICE = /iPhone|iPad|iPod/;

/** window.__pannaIosShortcutUrl (tests) ?? IOS_SHORTCUT_URL; '' when not an iPhone/iPad/iPod. */
export function iosShortcutLink(userAgent: string): string {
  if (!IOS_DEVICE.test(userAgent)) return '';
  const override = typeof window !== 'undefined' ? (window as Window & { __pannaIosShortcutUrl?: string }).__pannaIosShortcutUrl : undefined;
  return override ?? IOS_SHORTCUT_URL;
}
