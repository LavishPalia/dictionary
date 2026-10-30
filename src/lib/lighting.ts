// Desk lighting: Day or Evening ("a book under a lamp"), chosen by the reader or by the clock (Auto).
// The mode lives in one attribute, html[data-light="day" | "evening"]; CSS does the rest. A small inline
// script (PRE_PAINT_SCRIPT, run from the document head) sets it before first paint; applyLight keeps it up
// to date afterwards.

export type Lighting = 'auto' | 'day' | 'evening';
export type Light = 'day' | 'evening';

/** Auto means Evening from 19:00 (inclusive) until 06:00 (exclusive), local device clock. */
export const EVENING_FROM = 19, EVENING_UNTIL = 6;

/** The browser's theme-color (a phone's status bar) in each mode. */
export const THEME_COLOR: Record<Light, string> = { day: '#2b1d14', evening: '#120a06' };

const SETTINGS_KEY = 'panna_settings';
const LIGHTINGS: readonly Lighting[] = ['auto', 'day', 'evening'];

/**
 * The lighting preference from a parsed panna_settings value. `lighting` wins when valid; otherwise the old
 * `evening: true` reads as Evening; anything else (evening:false, missing, junk) is Auto.
 */
export function readLighting(settings: unknown): Lighting {
  if (!settings || typeof settings !== 'object') return 'auto';
  const { lighting, evening } = settings as { lighting?: unknown; evening?: unknown };
  if (LIGHTINGS.includes(lighting as Lighting)) return lighting as Lighting;
  return evening === true ? 'evening' : 'auto';
}

export function isEveningAt(date: Date): boolean {
  const hour = date.getHours();
  return hour >= EVENING_FROM || hour < EVENING_UNTIL;
}

export function resolveLight(pref: Lighting, date: Date): Light {
  if (pref === 'auto') return isEveningAt(date) ? 'evening' : 'day';
  return pref;
}

/** Sets html[data-light] and the theme-color meta (creating it if missing). */
export function applyLight(light: Light): void {
  if (typeof document === 'undefined') return;
  document.documentElement.setAttribute('data-light', light);
  let meta = document.querySelector('meta[name="theme-color"]');
  if (!meta) {
    meta = document.createElement('meta');
    meta.setAttribute('name', 'theme-color');
    document.head.appendChild(meta);
  }
  meta.setAttribute('content', THEME_COLOR[light]);
}

/**
 * The same rules as readLighting + resolveLight + applyLight, as a self-contained script for the document head
 * (no imports at runtime; ES5 so any browser can run it). Storage blocked or settings broken: Auto.
 * scripts/test-lighting.ts checks that it agrees with resolveLight.
 */
export const PRE_PAINT_SCRIPT = `(function(){
var p='auto';
try{var s=JSON.parse(localStorage.getItem(${JSON.stringify(SETTINGS_KEY)})||'null');
if(s&&typeof s==='object'){if(${JSON.stringify(LIGHTINGS)}.indexOf(s.lighting)>=0)p=s.lighting;else if(s.evening===true)p='evening';}}catch(e){p='auto';}
var h=new Date().getHours();
var l=p==='auto'?((h>=${EVENING_FROM}||h<${EVENING_UNTIL})?'evening':'day'):p;
try{var d=document;d.documentElement.setAttribute('data-light',l);
var m=d.querySelector('meta[name="theme-color"]');
if(!m){m=d.createElement('meta');m.setAttribute('name','theme-color');d.head.appendChild(m);}
m.setAttribute('content',l==='evening'?${JSON.stringify(THEME_COLOR.evening)}:${JSON.stringify(THEME_COLOR.day)});}catch(e){}
})();`;
