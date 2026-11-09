// Usage counts, the pure parts (src/lib/analytics-core.ts): where counting runs, Do Not Track, the switch's setting,
// nicknames, and the URL scrub that keeps looked-up words on the device. The browser side is test-analytics-browser.mjs.
// Usage: npx tsx scripts/test-analytics.ts
import fs from 'node:fs';
import vm from 'node:vm';
import {
  analyticsTarget, browserSaysNo, launchedFrom, nicknameFor, NICK_COLOURS, NICK_THINGS, scrubEvent, scrubPath, scrubUrl,
  SCREEN_PATH, TEST_TOKEN, usageCountsOn,
} from '../src/lib/analytics-core';

let checks = 0, failures = 0;
function check(label: string, ok: boolean, detail?: unknown) {
  checks++;
  if (ok) console.log(`✓ ${label}`);
  else { failures++; console.error(`✗ ${label}${detail !== undefined ? ` — ${JSON.stringify(detail)}` : ''}`); }
}
const eq = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

// ── Where counting runs ──
const build = (o: Partial<Parameters<typeof analyticsTarget>[0]>) => analyticsTarget({ deployEnv: '', token: '', previewFlag: '', testSwitch: false, ...o });
check('production with the token counts', eq(build({ deployEnv: 'production', token: 'phc_x' }), { env: 'production', token: 'phc_x' }));
check('production without the token: nothing', build({ deployEnv: 'production' }) === null);
check('production ignores the test switch', eq(build({ deployEnv: 'production', token: 'phc_x', testSwitch: true }), { env: 'production', token: 'phc_x' }));
check('production without a token ignores the test switch too', build({ deployEnv: 'production', testSwitch: true }) === null);
check('a preview without the flag: nothing', build({ deployEnv: 'preview', token: 'phc_x' }) === null);
check('a preview with the flag but no token: nothing', build({ deployEnv: 'preview', previewFlag: '1' }) === null);
check('a preview with the flag and the token counts as preview', eq(build({ deployEnv: 'preview', token: 'phc_x', previewFlag: '1' }), { env: 'preview', token: 'phc_x' }));
check('a preview never takes the test switch', build({ deployEnv: 'preview', testSwitch: true }) === null);
check('a local build: nothing, even with a token', build({ token: 'phc_x', previewFlag: '1' }) === null);
check('a local build with the test switch counts as test, with the test token', eq(build({ testSwitch: true, token: 'phc_real' }), { env: 'test', token: TEST_TOKEN }));
check('Vercel development: nothing', build({ deployEnv: 'development', token: 'phc_x', testSwitch: true }) === null);

// ── Do Not Track and GPC ──
check('DNT 1 says no', browserSaysNo({ doNotTrack: '1' }));
check('DNT yes (old Firefox) says no', browserSaysNo({ doNotTrack: 'yes' }));
check('window.doNotTrack (old Edge/Safari) says no', browserSaysNo({ doNotTrack: null }, { doNotTrack: '1' }));
check('GPC says no', browserSaysNo({ globalPrivacyControl: true }));
check('DNT 0 or unset is fine', !browserSaysNo({ doNotTrack: '0' }) && !browserSaysNo({}) && !browserSaysNo(undefined));

// ── The switch's setting ──
check('no settings: on', usageCountsOn({}) && usageCountsOn(null) && usageCountsOn('junk'));
check('analytics: false is off', !usageCountsOn({ analytics: false, lighting: 'day' }));
check('anything but false is on', usageCountsOn({ analytics: true }) && usageCountsOn({ analytics: 'false' }));

// ── Nicknames ──
const word = /^[A-Z][a-z]+$/;
check('64 colours, all distinct single words', NICK_COLOURS.length === 64 && new Set(NICK_COLOURS).size === 64 && NICK_COLOURS.every((w) => word.test(w)));
check('64 animals or objects, all distinct single words', NICK_THINGS.length === 64 && new Set(NICK_THINGS).size === 64 && NICK_THINGS.every((w) => word.test(w)));
check('no word is in both lists', NICK_COLOURS.every((c) => !(NICK_THINGS as readonly string[]).includes(c)));
const id = '019a6f2e-4b1c-7d3e-9f80-2a1b3c4d53f2';
check('the same ID always gets the same nickname', nicknameFor(id) === nicknameFor(id) && nicknameFor(id) === nicknameFor(String(id)));
check('a nickname reads "Colour Thing tag", the tag being the ID\'s last 3 characters', /^[A-Z][a-z]+ [A-Z][a-z]+ 3f2$/.test(nicknameFor(id)), nicknameFor(id));
const ids = Array.from({ length: 3000 }, (_, i) => `019a6f2e-4b1c-7d3e-9f80-${(0x10000000 + i * 7919).toString(16)}`);
const pairs = new Set(ids.map((i) => nicknameFor(i).split(' ').slice(0, 2).join(' ')));
check('3,000 IDs spread over many name pairs (> 1,800 of 4,096)', pairs.size > 1800, pairs.size);
const colours = new Set(ids.map((i) => nicknameFor(i).split(' ')[0]));
const things = new Set(ids.map((i) => nicknameFor(i).split(' ')[1]));
check('every colour and every thing gets used', colours.size === 64 && things.size === 64, { colours: colours.size, things: things.size });
check('a short or odd ID still gets a readable name', /^[A-Z][a-z]+ [A-Z][a-z]+ ab$/.test(nicknameFor('ab')) && /^[A-Z][a-z]+ [A-Z][a-z]+$/.test(nicknameFor('')));
check('the nickname is stable across runs (pinned)', nicknameFor('0192f1d0-0000-7000-8000-000000000abc') === nicknameFor('0192f1d0-0000-7000-8000-000000000abc') && nicknameFor('x') === 'Blush Tiger x', nicknameFor('x'));

// ── The URL scrub ──
check('/word/serendipity → /word/[word]', scrubPath('/word/serendipity') === '/word/[word]');
check('/word/a%20cappella → /word/[word]', scrubPath('/word/a%20cappella') === '/word/[word]');
check('/page/412 → /page/[n]', scrubPath('/page/412') === '/page/[n]');
check('/learn, / and /play unchanged', scrubPath('/learn') === '/learn' && scrubPath('/') === '/' && scrubPath('/play') === '/play');
check('a Duel date and puzzle become patterns', scrubPath('/play/2026-11-05') === '/play/[date]' && scrubPath('/duel/p/p0067.v1.json') === '/duel/p/[puzzle].json', [scrubPath('/play/2026-11-05'), scrubPath('/duel/p/p0067.v1.json')]);
check('a full URL keeps its origin, loses its query and hash', scrubUrl('https://panna-ashen.vercel.app/word/camel?x=1#top') === 'https://panna-ashen.vercel.app/word/[word]');
check('a share launch loses the shared text', scrubUrl('https://panna-ashen.vercel.app/?share_text=my%20secret%20camel') === 'https://panna-ashen.vercel.app/');
check('a bare path with a query is scrubbed', scrubUrl('/page/9?v=abc') === '/page/[n]');
check('an outside referrer keeps only its address, not its search', scrubUrl('https://www.google.com/search?q=camel+meaning+in+hindi') === 'https://www.google.com/search');
check('junk becomes empty, empty stays empty', scrubUrl('not a url') === '' && scrubUrl('') === '');
check('PostHog keeps $direct (no referrer) as it is', scrubUrl('$direct') === '$direct');

const event = scrubEvent({
  event: '$pageview',
  properties: {
    $current_url: 'https://x.app/word/camel?share_text=camel', $pathname: '/word/camel', $referrer: 'https://x.app/page/12?q=camel',
    $referring_domain: 'x.app', $session_entry_url: 'https://x.app/?share_text=hello', $prev_pageview_pathname: '/page/77',
    title: 'Camel — Panna', $title: 'Camel', screen: 'word', saved_words: 4,
    $set: { $current_url: 'https://x.app/word/camel' }, $set_once: { $initial_current_url: 'https://x.app/word/camel', $initial_pathname: '/word/camel', $initial_referrer: 'https://www.google.com/search?q=camel' },
  },
  $set: { $current_url: 'https://x.app/word/camel', name: 'Indigo Owl 3f2' },
  $set_once: { $initial_referrer: 'https://www.google.com/search?q=camel', $initial_current_url: 'https://x.app/page/5?share_text=camel' },
});
const text = JSON.stringify(event);
check('a scrubbed event holds no word, page number or query anywhere', !/camel|hello|\/page\/\d|\/page\/12|\/page\/77|share_text|\?q=/i.test(text), text);
check('the scrub keeps what it should', event?.properties?.$referring_domain === 'x.app' && event?.properties?.screen === 'word' && event?.properties?.saved_words === 4 && event?.$set?.name === 'Indigo Owl 3f2');
check('page titles are dropped', !('title' in (event?.properties ?? {})) && !('$title' in (event?.properties ?? {})));
check('a null event passes through', scrubEvent(null) === null);

// ── Screens and launches ──
check('every screen counts under a pattern with no word or number', Object.values(SCREEN_PATH).every((p) => p === scrubPath(p) && !/\d/.test(p)));
check('launches map to share / voice / shortcut / normal', launchedFrom('share') === 'share' && launchedFrom('voice') === 'voice' && launchedFrom('open') === 'shortcut' && launchedFrom('missing') === 'normal' && launchedFrom(undefined) === 'normal');

// ── The service worker never keeps /relay ──
// public/sw.js run in a sandbox with just enough of a worker's globals to reach cacheFor.
const swSource = fs.readFileSync('public/sw.js', 'utf8');
const sandbox: Record<string, unknown> = { self: { location: { origin: 'https://x.app' }, addEventListener: () => {} }, URL, Request: class {}, console };
vm.runInNewContext(`${swSource}\nthis.__cacheFor = cacheFor; this.__isRelay = isRelay;`, sandbox);
const cacheFor = sandbox.__cacheFor as (u: URL) => string | null;
const isRelay = sandbox.__isRelay as (u: URL) => boolean;
check('sw.js: cacheFor never caches /relay/', ['/relay/e/', '/relay/i/v0/e/?compression=gzip-js', '/relay/static/x.js', '/relay/array/phc/config.js', '/relay/decide/'].every((p) => cacheFor(new URL(`https://x.app${p}`)) === null));
check('sw.js: /relay is recognised (so warm and fetch skip it), /relayed is not', isRelay(new URL('https://x.app/relay/e/')) && isRelay(new URL('https://x.app/relay')) && !isRelay(new URL('https://x.app/relayed')));
check('sw.js: warm() and the fetch handler both skip /relay', /isRelay\(u\)\) return;/.test(swSource) && /url\.origin !== self\.location\.origin \|\| isRelay\(url\)\) return;/.test(swSource));
check('sw.js: other addresses still cache as before', cacheFor(new URL('https://x.app/api/page/3?v=1')) === 'panna-book-v1' && cacheFor(new URL('https://x.app/_next/static/a.js')) === 'panna-static-v1');

console.log(`\n${checks - failures}/${checks} checks passed`);
process.exit(failures ? 1 : 0);
