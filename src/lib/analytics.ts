// Usage counts: the only module that talks to PostHog. Screens call track(), pageview() and the switch below; none
// imports PostHog itself. Counting runs only on the production deploy (or a preview with NEXT_PUBLIC_ANALYTICS_PREVIEW=1,
// or a local build under the browser tests' switch), only with a project token, never when the reader has switched
// "Usage counts" off or the browser sends Do Not Track / Global Privacy Control. PostHog is loaded late, after the
// first paint once the browser is idle; anything counted before that waits in a small in-memory queue.
// What is sent: counts of actions and a scrubbed screen address, never which words (src/lib/analytics-core.ts).

import {
  analyticsTarget, browserSaysNo, launchedFrom, nicknameFor, scrubEvent, SCREEN_PATH, usageCountsOn,
  type AnalyticsEnv, type Screen,
} from './analytics-core';
import { readLaunch } from './launch';
import { loadRecords, loadReviewDays, statusOf, streak } from './review';
import { readResults, RESULTS_KEY } from '@/duel/progress';

export type { Screen } from './analytics-core';

const SETTINGS_KEY = 'panna_settings';
/** Set by the browser tests (scripts/test-analytics-browser.mjs) to count on a local build against their fake PostHog. */
export const TEST_SWITCH_KEY = 'panna_analytics_test';
/** The same-origin path PostHog is reached through (next.config.mjs rewrites it to PostHog's EU servers). */
export const RELAY_PATH = '/relay';
const MAX_QUEUED = 100;

type PostHog = typeof import('posthog-js/dist/module.slim').default;

type Props = Record<string, string | number | boolean>;
type Queued = { kind: 'event'; name: string; props: Props; at: number } | { kind: 'person'; props: Props };

let target: { env: AnalyticsEnv; token: string } | null | undefined; // undefined: not worked out yet
let started = false;
let loading = false;
let posthog: PostHog | null = null;
let queue: Queued[] = [];

function readSettings(): Record<string, unknown> {
  try {
    const parsed = JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}');
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function getTarget() {
  if (target !== undefined) return target;
  if (typeof window === 'undefined') return null;
  let testSwitch = false;
  try { testSwitch = localStorage.getItem(TEST_SWITCH_KEY) === '1'; } catch {}
  target = analyticsTarget({
    deployEnv: process.env.NEXT_PUBLIC_DEPLOY_ENV ?? '',
    token: process.env.NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN ?? '',
    previewFlag: process.env.NEXT_PUBLIC_ANALYTICS_PREVIEW ?? '',
    testSwitch,
  });
  return target;
}

/** The browser asks not to be tracked (Do Not Track or Global Privacy Control). */
export function browserBlocksCounting(): boolean {
  if (typeof navigator === 'undefined') return false;
  return browserSaysNo(navigator as Navigator & { globalPrivacyControl?: boolean }, window as unknown as { doNotTrack?: string | null });
}

/** The reader's "Usage counts" choice (true unless switched off). */
export function usageCountsChosen(): boolean {
  return usageCountsOn(readSettings());
}

/** Counting may run on this device right now. */
function allowed(): boolean {
  return getTarget() !== null && usageCountsChosen() && !browserBlocksCounting();
}

function displayMode(): 'standalone' | 'browser' {
  const standalone = window.matchMedia?.('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
  return standalone ? 'standalone' : 'browser';
}

function readJson(key: string): unknown {
  try { return JSON.parse(localStorage.getItem(key) || 'null'); } catch { return null; }
}

/** The reading profile, from counts on this device: never which words. */
function readingProfile(): Props {
  const saved = readJson('panna_saved_words');
  const keys = Array.isArray(saved) ? saved.map((w) => (w && typeof w === 'object' ? (w as { normalized?: unknown }).normalized : null)).filter((k): k is string => typeof k === 'string') : [];
  const records = loadRecords();
  return {
    installed: displayMode() === 'standalone',
    saved_words: keys.length,
    mastered_words: keys.filter((k) => statusOf(records[k]) === 'mastered').length,
    review_streak: streak(loadReviewDays(), Date.now()),
    duel_games: readResults(readJson(RESULTS_KEY)).length,
    bookplate: Boolean(readSettings().bookplate),
  };
}

function send(item: Queued) {
  if (!posthog) return;
  if (item.kind === 'event') posthog.capture(item.name, item.props, { timestamp: new Date(item.at) });
  else posthog.setPersonProperties(item.props);
}

function enqueue(item: Queued) {
  if (!allowed()) return;
  if (posthog) { send(item); return; }
  if (queue.length < MAX_QUEUED) queue.push(item);
}

/** After the first paint, once the browser is idle. */
function whenIdle(run: () => void) {
  const idle = () => {
    const w = window as Window & { requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number };
    if (w.requestIdleCallback) w.requestIdleCallback(run, { timeout: 4000 });
    else window.setTimeout(run, 1500);
  };
  if (document.readyState === 'complete') idle();
  else window.addEventListener('load', idle, { once: true });
}

async function load() {
  const t = getTarget();
  if (!t || loading || posthog) return;
  loading = true;
  try {
    // The slim build: capture and persistence only (no recording, surveys, toolbar or autocapture code).
    const { default: ph } = await import('posthog-js/dist/module.slim');
    if (!allowed()) { queue = []; return; } // switched off while it loaded: nothing is sent
    ph.init(t.token, {
      api_host: RELAY_PATH,
      ui_host: 'https://eu.posthog.com',
      person_profiles: 'always', // anonymous readers get profiles; identify() is never called
      autocapture: false,
      capture_pageview: false,
      capture_pageleave: false,
      rageclick: false,
      capture_dead_clicks: false,
      capture_heatmaps: false,
      capture_exceptions: false,
      capture_performance: false,
      disable_session_recording: true,
      disable_surveys: true,
      disable_product_tours: true,
      disable_conversations: true,
      disable_web_experiments: true,
      disable_external_dependency_loading: true,
      advanced_disable_flags: true,
      save_campaign_params: false,
      persistence: 'localStorage', // no cookies
      respect_dnt: true,
      // Headless browsers look like bots, which PostHog drops: only the local browser tests turn that filter off.
      opt_out_useragent_filter: t.env === 'test',
      before_send: (event) => scrubEvent(event),
    });
    // A device switched off earlier, now on again: the reader's choice in panna_settings is what counts.
    if (ph.has_opted_out_capturing()) ph.opt_in_capturing({ captureEventName: false });
    const launch = readLaunch(launchSearch);
    ph.register({ env: t.env, display_mode: displayMode(), launched_from: launchedFrom(launch?.kind) });
    // The nickname and the reading profile ride on this open's first event as its $set: the person is named from their
    // very first event (a separate $set is batched and lands seconds later), and no extra "Set person properties"
    // events are spent. With no event waiting, they go as one $set.
    const nickname = nicknameFor(ph.get_distinct_id());
    let person: Props = {};
    const events: Extract<Queued, { kind: 'event' }>[] = [];
    for (const item of queue) {
      if (item.kind === 'person') person = { ...person, ...item.props };
      else events.push(item);
    }
    person = { ...person, name: nickname, nickname };
    posthog = ph;
    queue = [];
    const [first, ...rest] = events;
    if (first) ph.capture(first.name, first.props, { timestamp: new Date(first.at), $set: person });
    else ph.setPersonProperties(person);
    rest.forEach(send);
  } catch {
    // Offline or blocked: counting simply doesn't happen. Nothing is retried later.
    queue = [];
  } finally {
    loading = false;
  }
}

/** The launch address, read once at start: the app strips its query soon after (src/lib/launch.ts). */
let launchSearch = '';

/**
 * Starts counting for this app open: called once by the app shell (and by /play). Sets the reading profile and loads
 * PostHog when idle. Does nothing where counting doesn't run.
 */
export function startAnalytics(): void {
  if (started || typeof window === 'undefined') return;
  started = true;
  launchSearch = window.location.search;
  if (!allowed()) return;
  enqueue({ kind: 'person', props: readingProfile() });
  whenIdle(() => { void load(); });
}

/** One action, with counts or a type only: never a word, a search or anything typed. */
export function track(name: string, props: Props = {}): void {
  if (typeof window === 'undefined') return;
  enqueue({ kind: 'event', name, props, at: Date.now() });
}

/** One screen opened. Page turns are not screens. */
export function pageview(screen: Screen): void {
  if (typeof window === 'undefined') return;
  const path = SCREEN_PATH[screen];
  track('$pageview', { screen, $current_url: `${window.location.origin}${path}`, $pathname: path });
}

/** The ⋯ menu's "Usage counts" switch: saved in panna_settings (only as false), and applied to PostHog at once. */
export function setUsageCounts(on: boolean): void {
  try {
    const settings = readSettings();
    if (on) delete settings.analytics;
    else settings.analytics = false;
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  } catch {}
  if (!on) {
    queue = [];
    posthog?.opt_out_capturing();
    return;
  }
  if (!allowed()) return;
  if (posthog) { posthog.opt_in_capturing({ captureEventName: false }); return; }
  if (started) {
    enqueue({ kind: 'person', props: readingProfile() });
    void load();
  }
}
