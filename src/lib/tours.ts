// Guided tours and one-time tips (docs/design/panna-tours-v1.html). Each tip has an English line and a short Hindi
// line. A step describes the scene it needs (which screen, whether the menu or a word card is open) rather than
// actions, so stepping back and forth just applies the scene again. Tours only point and explain: they never save
// words, add marks or change the review schedule.

export type TourId = 'start' | 'word' | 'review' | 'settings';
export type TipId = 'book' | 'word-card' | 'first-save' | 'review' | 'tours-here';
type Screen = 'today' | 'book' | 'saved' | 'review';

export interface TourText { title: string; en: string; hi: string }

export interface TourScene {
  /** Screen to show; omitted: wherever the reader is. */
  section?: Screen;
  menu?: boolean;
  /** Word card: the first word on the open page, the tour's demo word, or closed (default). */
  word?: 'first-on-page' | 'demo';
}

export interface TourStep extends TourText {
  /** What to light up: a selector, or a function for targets that depend on the page. */
  target: { desktop: string | (() => Element | null); phone: string | (() => Element | null) };
  scene: TourScene;
  /** Only shown when this is true (a feature this browser has); the step count leaves it out otherwise. */
  when?: () => boolean;
  /** Replaces `en` on one layout (the phone has no keyboard sentence, desktop has no swipe). */
  enPhone?: string;
  enDesktop?: string;
}

export interface Tour extends TourText {
  id: TourId;
  steps: TourStep[];
}

const both = (selector: string | (() => Element | null)) => ({ desktop: selector, phone: selector });
const reviewButton = { desktop: '#open-review-btn', phone: '#nav-review-btn' };
const savedButton = { desktop: '#open-bookmarks-btn', phone: '#nav-saved-btn' };

/** The first tappable word on the open page (the desktop spread also renders non-interactive copies for page turns). */
export function firstWordOnPage(): HTMLElement | null {
  return [...document.querySelectorAll<HTMLElement>('.entry-text')].find((el) => {
    const r = el.getBoundingClientRect();
    return el.style.cursor === 'pointer' && r.width > 0 && r.height > 0 && r.bottom > 0 && r.top < window.innerHeight;
  }) ?? null;
}
const menuRow = (label: string) => () => document.querySelector(`#reading-menu [aria-label="${label}"]`)?.closest('.menu-row') ?? null;

export const TOURS: Tour[] = [
  {
    id: 'start', title: 'Getting started', en: 'Find words, save them, and remember them.', hi: 'शब्द खोजें, सहेजें और याद रखें।',
    steps: [
      { target: both('.app-lookup'), scene: {}, title: 'Look up any word',
        en: 'Type an English word — or Hindi, in हिंदी or in English letters like chhodna.',
        hi: 'कोई भी शब्द खोजें — अंग्रेज़ी में, हिंदी में, या अंग्रेज़ी अक्षरों में।' },
      { target: { desktop: '[aria-label="Next spread"]', phone: '[aria-label="Next page"]' }, scene: { section: 'book' },
        title: 'Read like a real book',
        en: 'Turn pages with the arrows, by clicking a page corner, or with the ← → keys.',
        enPhone: 'Turn pages with the arrows, or swipe the page.',
        hi: 'तीरों से या उँगली से खिसकाकर पन्ने पलटें।' },
      { target: both(firstWordOnPage), scene: { section: 'book' }, title: 'Tap a word for its card',
        en: 'See its Hindi meaning, hear it spoken, and find similar and opposite words.',
        hi: 'किसी शब्द को छुएँ — हिंदी अर्थ देखें और उच्चारण सुनें।' },
      { target: both('#save-word-btn'), scene: { section: 'book', word: 'first-on-page' }, title: 'Save words to learn them',
        en: 'Saved words come back in Review at the right times, so they stick.',
        hi: 'सहेजे गए शब्द सही समय पर Review में लौटते हैं, ताकि याद रहें।' },
      { target: reviewButton, scene: { section: 'book' }, title: 'A few minutes a day',
        en: 'Review quizzes you on your saved words, just when you’re about to forget them. More tours are in the ⋯ menu.',
        enDesktop: 'Review quizzes you on your saved words, just when you’re about to forget them. More tours: ⋯ → Guided tours, or press ?.',
        hi: 'Review आपके सहेजे शब्दों पर सवाल पूछता है। बाकी टूर ⋯ में हैं।' },
    ],
  },
  {
    id: 'word', title: 'The word card', en: 'Meanings, sounds, similar and opposite words.', hi: 'अर्थ, उच्चारण, मिलते-जुलते और उल्टे शब्द।',
    steps: [
      { target: both('#word-sheet .word-hi'), scene: { word: 'demo' }, title: 'Hindi first',
        en: 'The large red line is the Hindi meaning; the English definition is under it.',
        hi: 'बड़ी लाल पंक्ति हिंदी अर्थ है; नीचे अंग्रेज़ी परिभाषा।' },
      { target: both(() => document.querySelector('#speak-en-btn')?.parentElement ?? null), scene: { word: 'demo' }, title: 'Hear it',
        en: 'Listen to the English word, or to its Hindi meaning.',
        hi: 'अंग्रेज़ी शब्द या उसका हिंदी अर्थ सुनें।' },
      { target: both('#word-related'), scene: { word: 'demo' }, title: 'Similar and opposite words',
        en: 'Tap one to open it right here — an easy way to grow your vocabulary.',
        hi: 'मिलते-जुलते और उल्टे शब्द — किसी को छूकर यहीं खोलें।' },
      { target: both('#save-word-btn'), scene: { word: 'demo' }, title: 'Save to learn',
        en: 'Saving adds the word to Review. Tap again to remove it.',
        hi: 'सहेजने से शब्द Review में जुड़ता है। हटाने के लिए फिर छुएँ।' },
      { target: both('#see-on-page-btn'), scene: { word: 'demo' }, title: 'Find it in the book',
        en: 'Shows the word on its page, underlined in pencil.',
        hi: 'शब्द को किताब में उसके पन्ने पर दिखाता है।' },
    ],
  },
  {
    id: 'review', title: 'Saving and Review', en: 'How saved words come back until you know them.', hi: 'सहेजे शब्द कैसे लौटते हैं, जब तक याद न हो जाएँ।',
    steps: [
      { target: savedButton, scene: { section: 'saved' }, title: 'Everything you keep',
        en: 'Saved has your words, the pages you marked, and your notes.',
        hi: 'Saved में आपके शब्द, निशान लगे पन्ने और नोट्स हैं।' },
      { target: both('#saved-screen [role="radiogroup"]'), scene: { section: 'saved' }, title: 'How well you know each word',
        en: 'Every saved word shows whether it’s new, being learned, or mastered.',
        hi: 'हर शब्द के साथ दिखता है: नया, सीख रहे हैं, या पक्का।' },
      { target: reviewButton, scene: { section: 'saved' }, title: 'How Review works',
        en: 'A word comes back after 1, 3, 7, 16 and 35 days. Right answers stretch the gap; a miss brings it back tomorrow.',
        hi: 'शब्द 1, 3, 7, 16 और 35 दिन बाद लौटता है। गलत जवाब पर कल फिर।' },
      { target: both('#today-review'), scene: { section: 'today' }, title: 'A little every day',
        en: 'No timer, no rush — keep your streak going. On a keyboard, answer with 1–4 and press Enter.',
        enPhone: 'No timer, no rush — keep your streak going.',
        hi: 'कोई टाइमर नहीं — रोज़ थोड़ा दोहराएँ और अपनी streak बनाए रखें।' },
    ],
  },
  {
    id: 'settings', title: 'Settings and backup', en: 'Evening light, page turns, and keeping your words safe.', hi: 'शाम की रोशनी, पन्ने पलटना, और शब्द सुरक्षित रखना।',
    steps: [
      { target: both('#menu-btn'), scene: {}, title: 'Make it yours',
        en: 'Settings and more live here.',
        hi: 'सेटिंग्स और बाकी विकल्प यहाँ हैं।' },
      { target: both(menuRow('Desk lighting')), scene: { menu: true }, title: 'Evening light',
        en: 'A warmer, dimmer desk for reading at night.',
        hi: 'रात में पढ़ने के लिए हल्की, गर्म रोशनी।' },
      // Offline saving exists only where the service worker runs (production builds, supporting browsers).
      { target: both('#offline-save-btn'), scene: { menu: true }, title: 'Read without a connection',
        when: () => typeof navigator !== 'undefined' && Boolean(navigator.serviceWorker?.controller),
        en: 'Save the whole book on this device to read and search it offline.',
        hi: 'बिना इंटरनेट के पढ़ने के लिए पूरी किताब इस डिवाइस पर सहेजें।' },
      { target: both('#backup-btn'), scene: { menu: true }, title: 'Keep your words safe',
        en: 'They live only in this browser. Back them up to a file, and restore it on any device.',
        hi: 'आपके शब्द सिर्फ़ इसी ब्राउज़र में हैं। फ़ाइल में सहेजें, किसी भी डिवाइस पर वापस लाएँ।' },
      { target: both('#guided-tours-btn'), scene: { menu: true }, title: 'Tours any time',
        en: 'Replay any tour from here, as often as you like.',
        hi: 'कोई भी टूर यहाँ से जितनी बार चाहें देखें।' },
    ],
  },
];

/** A tour with only the steps this browser can show. */
export function tourById(id: TourId): Tour {
  const tour = TOURS.find((t) => t.id === id)!;
  return { ...tour, steps: tour.steps.filter((s) => !s.when || s.when()) };
}

export interface Tip extends TourText {
  id: TipId;
  target: { desktop: string | (() => Element | null); phone: string | (() => Element | null) };
  /** Not shown to someone who has seen any of these tours: they already know. */
  coveredBy: TourId[];
}

export const TIPS: Record<TipId, Tip> = {
  'book': { id: 'book', target: both(firstWordOnPage), coveredBy: ['start'], title: 'Tap any word',
    en: 'Tap any word on the page to see its meaning.', hi: 'अर्थ देखने के लिए पन्ने पर किसी शब्द को छुएँ।' },
  'word-card': { id: 'word-card', target: both('#save-word-btn'), coveredBy: ['start', 'word'], title: 'Save the words you want to learn',
    en: 'Review brings them back.', hi: 'सीखने वाले शब्द सहेजें — Review उन्हें फिर लाएगा।' },
  'first-save': { id: 'first-save', target: both('#save-word-btn'), coveredBy: [], title: 'Saved!',
    en: 'It will come up in Review tomorrow.', hi: 'सहेज लिया! यह कल Review में आएगा।' },
  'review': { id: 'review', target: both('#review-screen .review-options'), coveredBy: ['review'], title: 'Pick the meaning you think is right',
    en: 'No timer — a miss just comes back later.', hi: 'जो अर्थ सही लगे, चुनें। कोई टाइमर नहीं।' },
  // After a tour ends (or the welcome card is put off): where to find the tours again.
  'tours-here': { id: 'tours-here', target: both('#menu-btn'), coveredBy: [], title: 'Tours are here any time',
    en: 'Open ⋯ → Guided tours to take or replay any tour.', hi: 'टूर कभी भी यहाँ मिलेंगे — ⋯ → Guided tours।' },
};

// ── What the reader has seen (localStorage panna_tours, included in backups) ──

export const TOURS_KEY = 'panna_tours';

export interface ToursState {
  /** Tours finished or skipped, with when. */
  seen: Partial<Record<TourId, number>>;
  /** Tips shown, with when. */
  tips: Partial<Record<TipId, number>>;
  /** The welcome card on Today was answered (tour taken, or "Not now"). */
  welcomeDone?: boolean;
  tipsOff?: boolean;
  /** The Guided tours list has been opened: the reader knows where tours are. */
  listOpened?: boolean;
}

export const emptyToursState = (): ToursState => ({ seen: {}, tips: {} });

export function loadToursState(): ToursState {
  try {
    const raw = JSON.parse(localStorage.getItem(TOURS_KEY) || 'null');
    if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
      return { seen: raw.seen && typeof raw.seen === 'object' ? raw.seen : {}, tips: raw.tips && typeof raw.tips === 'object' ? raw.tips : {},
        welcomeDone: raw.welcomeDone === true, tipsOff: raw.tipsOff === true, listOpened: raw.listOpened === true };
    }
  } catch {}
  return emptyToursState();
}

export function saveToursState(state: ToursState): void {
  try { localStorage.setItem(TOURS_KEY, JSON.stringify(state)); } catch {}
}

/** Whether a tip may show now: tips on, not shown before, and not covered by a tour already seen. */
export function tipAllowed(state: ToursState, id: TipId): boolean {
  if (id === 'tours-here' && state.listOpened) return false;
  return !state.tipsOff && !state.tips[id] && !TIPS[id].coveredBy.some((t) => state.seen[t]);
}

/** Resolves a step or tip target for the current layout. */
export function resolveTarget(target: Tour['steps'][number]['target'], phone: boolean): Element | null {
  const t = phone ? target.phone : target.desktop;
  return typeof t === 'function' ? t() : document.querySelector(t);
}

/** Tours not seen yet, for the menu row. */
export const unseenTours = (state: ToursState) => TOURS.filter((t) => !state.seen[t.id]).length;

export const stepText = (step: TourStep, phone: boolean) => (phone ? step.enPhone : step.enDesktop) ?? step.en;
