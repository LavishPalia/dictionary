// A first visit: someone opening Panna's front page with nothing of Panna's on this device. They are shown the book,
// not Today (docs/superpowers/specs/2026-11-15-first-visit-design.md). Existing readers always have one of the reader
// keys below, so they are never treated as first-timers, even without the visited marker.

/** Written on the first visit, so the next open of the front page shows Today. */
export const VISITED_KEY = 'panna_visited';
/** What any reader who has used Panna on this device already has stored. */
export const READER_KEYS = ['panna_tours', 'panna_saved_words', 'panna_history', 'panna_recent_searches', 'panna_last_page', 'panna_settings'] as const;

/** The query parameters of a launch (src/lib/launch.ts): a share, voice or shortcut launch has its own flow. Any other
 * query (utm_source, fbclid from a shared link…) is still a first visit. */
export const LAUNCH_PARAMS = ['share_text', 'share_title', 'share_url', 'voice', 'open', 'missing'] as const;
/** Search engines and page testers render with empty storage: for them the front page stays Today. */
export const CRAWLER = /bot|crawler|spider|slurp|lighthouse/i;

const isLaunch = (search: string) => { const p = new URLSearchParams(search); return LAUNCH_PARAMS.some((k) => p.has(k)); };

/** A first visit: not a launch, and nothing stored. Blocked storage is never a first visit: Today shows, as before. */
export function isFirstVisit(get: (key: string) => string | null, search: string): boolean {
  if (isLaunch(search)) return false;
  try {
    if (get(VISITED_KEY) !== null) return false;
    return READER_KEYS.every((k) => {
      const v = get(k);
      return v === null || (k === 'panna_saved_words' && v === '[]');
    });
  } catch {
    return false;
  }
}

/** Run from the document head before first paint: marks a first visit to the front page, so CSS keeps Today hidden
 * until the app has swapped to the book. The same rule as isFirstVisit, and never for a crawler. */
export const FIRST_VISIT_PRE_PAINT = `(function(){try{
if(location.pathname!=='/'||${CRAWLER}.test(navigator.userAgent))return;
var q=new URLSearchParams(location.search),p=${JSON.stringify(LAUNCH_PARAMS)};
for(var j=0;j<p.length;j++)if(q.has(p[j]))return;
var s=localStorage;if(s.getItem(${JSON.stringify(VISITED_KEY)})!==null)return;
var k=${JSON.stringify(READER_KEYS)};
for(var i=0;i<k.length;i++){var v=s.getItem(k[i]);if(v!==null&&!(k[i]==='panna_saved_words'&&v==='[]'))return;}
document.documentElement.setAttribute('data-first-visit','1');
}catch(e){}})();`;
