// Usage counts, the pure parts: when counting runs, the reader's nickname, and the URL scrub that keeps every looked-up
// word on the device. No DOM and no PostHog here, so scripts/test-analytics.ts can check all of it in Node.
// The browser side (loading PostHog, the queue, the switch) is src/lib/analytics.ts.

/** The deploys counting runs on. 'test' is a local build with the browser tests' switch set (never a Vercel deploy). */
export type AnalyticsEnv = 'production' | 'preview' | 'test';

export interface AnalyticsBuild {
  /** VERCEL_ENV at build time: 'production', 'preview', 'development', or '' off Vercel. */
  deployEnv: string;
  /** NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN. */
  token: string;
  /** NEXT_PUBLIC_ANALYTICS_PREVIEW: '1' lets a preview deploy count, for testing on real PostHog. */
  previewFlag: string;
  /** The browser tests' switch (localStorage), honoured only off Vercel. */
  testSwitch: boolean;
}

/** The token a test run uses: the tests answer every /relay request themselves, so it never reaches PostHog. */
export const TEST_TOKEN = 'phc_panna_test';

/** Where counting runs, and with which token; null means nothing loads and nothing is sent. */
export function analyticsTarget(b: AnalyticsBuild): { env: AnalyticsEnv; token: string } | null {
  if (b.deployEnv === 'production') return b.token ? { env: 'production', token: b.token } : null;
  if (b.deployEnv === 'preview') return b.token && b.previewFlag === '1' ? { env: 'preview', token: b.token } : null;
  if (b.deployEnv === '' && b.testSwitch) return { env: 'test', token: TEST_TOKEN };
  return null;
}

/** Do Not Track or Global Privacy Control: the browser asks not to be tracked, so counting stays off. */
export function browserSaysNo(nav: { doNotTrack?: string | null; globalPrivacyControl?: boolean } | undefined, win?: { doNotTrack?: string | null }): boolean {
  if (!nav) return false;
  const dnt = nav.doNotTrack ?? win?.doNotTrack;
  return dnt === '1' || dnt === 'yes' || nav.globalPrivacyControl === true;
}

/** The reader's choice in panna_settings: on unless `analytics` is false (it is only ever written as false). */
export function usageCountsOn(settings: unknown): boolean {
  return !(settings && typeof settings === 'object' && (settings as { analytics?: unknown }).analytics === false);
}

// ── Nicknames ──
// A colour and an animal or object, from a hash of the device's random ID, plus the ID's last 3 characters:
// "Indigo Owl 3f2". 64 × 64 = 4,096 pairs; the tag keeps look-alikes apart, and PostHog tells readers apart by ID anyway.
export const NICK_COLOURS = [
  'Amber', 'Apricot', 'Aqua', 'Ash', 'Azure', 'Beige', 'Berry', 'Blush', 'Bronze', 'Cedar', 'Cherry', 'Cinnamon',
  'Citrus', 'Clay', 'Cobalt', 'Copper', 'Coral', 'Cream', 'Crimson', 'Cyan', 'Dusky', 'Ebony', 'Emerald', 'Fern',
  'Golden', 'Graphite', 'Hazel', 'Henna', 'Honey', 'Indigo', 'Ivory', 'Jade', 'Jasmine', 'Lavender', 'Lemon', 'Lilac',
  'Lime', 'Mango', 'Maroon', 'Mint', 'Misty', 'Mocha', 'Moss', 'Ochre', 'Olive', 'Opal', 'Peach', 'Pearl', 'Pine',
  'Plum', 'Rose', 'Ruby', 'Rust', 'Saffron', 'Sage', 'Sandal', 'Sapphire', 'Scarlet', 'Silver', 'Slate', 'Teal',
  'Topaz', 'Turmeric', 'Violet',
] as const;
export const NICK_THINGS = [
  'Owl', 'Kite', 'Peacock', 'Parrot', 'Myna', 'Sparrow', 'Heron', 'Crane', 'Swan', 'Koel', 'Hornbill', 'Kingfisher',
  'Tiger', 'Elephant', 'Deer', 'Fox', 'Otter', 'Panda', 'Squirrel', 'Rabbit', 'Tortoise', 'Dolphin', 'Whale', 'Gecko',
  'Firefly', 'Butterfly', 'Dragonfly', 'Bee', 'Lotus', 'Lamp', 'Lantern', 'Quill', 'Inkpot', 'Compass', 'Comet', 'Star',
  'Moon', 'Cloud', 'River', 'Pebble', 'Feather', 'Leaf', 'Banyan', 'Neem', 'Marigold', 'Kettle', 'Teacup', 'Bell',
  'Drum', 'Flute', 'Sitar', 'Veena', 'Anchor', 'Lighthouse', 'Harbour', 'Meadow', 'Mountain', 'Island', 'Monsoon',
  'Rainbow', 'Sunbird', 'Bulbul', 'Robin', 'Falcon',
] as const;

/** FNV-1a, 32 bits: a fixed, well-spread hash, the same in every browser. */
function fnv1a(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

/** The made-up name for a device ID: always the same for the same ID. */
export function nicknameFor(id: string): string {
  const h = fnv1a(id);
  const colour = NICK_COLOURS[h % NICK_COLOURS.length];
  const thing = NICK_THINGS[(h >>> 16) % NICK_THINGS.length];
  const tag = id.replace(/[^0-9a-z]/gi, '').slice(-3).toLowerCase();
  return tag ? `${colour} ${thing} ${tag}` : `${colour} ${thing}`;
}

// ── The URL scrub ──
// Every address that leaves the device is a pattern: /word/serendipity → /word/[word], /page/412 → /page/[n], a Duel
// date → [date], and no query string or hash (a share launch carries the shared text in its query).

/** One path, as a pattern. */
export function scrubPath(path: string): string {
  if (/^\/word(\/|$)/.test(path)) return path === '/word' ? path : '/word/[word]';
  if (/^\/page\/[^/]+/.test(path)) return '/page/[n]';
  return path.replace(/\d{4}-\d{2}-\d{2}/g, '[date]').replace(/\/p\d{4,}(\.v\d+)?/g, '/[puzzle]');
}

/** A full URL or a bare path, as a pattern: origin kept, path scrubbed, query and hash dropped. Junk becomes ''. */
export function scrubUrl(value: string): string {
  if (!value || value === '$direct') return value; // PostHog's marker for no referrer
  if (value.startsWith('/')) return scrubPath(value.split(/[?#]/)[0]);
  try {
    const u = new URL(value);
    return `${u.origin}${scrubPath(u.pathname)}`;
  } catch {
    return '';
  }
}

/** Property names that hold an address: PostHog's own ($current_url, $pathname, $referrer, $initial_referrer,
 * $session_entry_url, $prev_pageview_pathname…) and any of ours. $referring_domain is a bare host and is kept. */
const ADDRESS_KEY = /(url|pathname|referrer|href)$/i;
/** Properties dropped outright: the page title can name the word on screen. */
const DROPPED = new Set(['title', '$title']);

function scrubProps(props: Record<string, unknown> | undefined): void {
  if (!props) return;
  for (const key of Object.keys(props)) {
    if (DROPPED.has(key)) { delete props[key]; continue; }
    const value = props[key];
    if (typeof value === 'string' && ADDRESS_KEY.test(key)) props[key] = scrubUrl(value);
  }
}

/** PostHog's before_send: the event with every address scrubbed, in its properties, $set and $set_once. */
export function scrubEvent<T extends { properties?: Record<string, unknown>; $set?: Record<string, unknown>; $set_once?: Record<string, unknown> }>(event: T | null): T | null {
  if (!event) return event;
  scrubProps(event.properties);
  scrubProps(event.$set);
  scrubProps(event.$set_once);
  const nested = event.properties as { $set?: Record<string, unknown>; $set_once?: Record<string, unknown> } | undefined;
  scrubProps(nested?.$set);
  scrubProps(nested?.$set_once);
  return event;
}

// ── Screens ──
/** The screens a page view is counted for, and the address pattern each is counted under. */
export type Screen = 'today' | 'book' | 'saved' | 'review' | 'learn' | 'word' | 'play';
export const SCREEN_PATH: Record<Screen, string> = {
  today: '/', book: '/page/[n]', saved: '/saved', review: '/review', learn: '/learn', word: '/word/[word]', play: '/play',
};

/** How the app was opened, from src/lib/launch.ts's kind: sent with every event. */
export type LaunchedFrom = 'share' | 'voice' | 'shortcut' | 'normal';
export function launchedFrom(kind: string | undefined): LaunchedFrom {
  return kind === 'share' ? 'share' : kind === 'voice' ? 'voice' : kind === 'open' ? 'shortcut' : 'normal';
}
