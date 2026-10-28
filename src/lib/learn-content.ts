// Copy for "How to learn with Panna". Every heading and tip has one English line and one short Hindi line,
// as in the tours; "Review" and "Saved" stay in English inside the Hindi. One line per tip: no wall of text.
import { NEW_WORDS_PER_DAY, type StepId } from './learn';
import { INTERVAL_DAYS } from './review';

export type LearnAction = 'review' | 'book' | 'continue' | 'tour-word' | 'tour-review' | 'offline-save' | 'backup' | 'install' | 'tours';

export interface LearnText { en: string; hi: string }

type LearnItem = LearnText & { action?: LearnAction; actionLabel?: string };

// Button labels, from the Design's action table.
const OPEN_REVIEW = { action: 'review', actionLabel: 'Open Review' } as const;
const OPEN_BOOK = { action: 'book', actionLabel: 'Open the book' } as const;
const CONTINUE = { action: 'continue', actionLabel: 'Continue reading' } as const;
const WORD_TOUR = { action: 'tour-word', actionLabel: 'Take the word card tour' } as const;
const REVIEW_TOUR = { action: 'tour-review', actionLabel: 'Take the Saving and Review tour' } as const;
const OFFLINE = { action: 'offline-save', actionLabel: 'Save the book for offline' } as const;
const BACKUP = { action: 'backup', actionLabel: 'Back up my words' } as const;
const INSTALL = { action: 'install', actionLabel: 'Install Panna' } as const;
const ALL_TOURS = { action: 'tours', actionLabel: 'All guided tours' } as const;

const LAST_INTERVAL = INTERVAL_DAYS[INTERVAL_DAYS.length - 1];

export const LEARN_TITLE: LearnText = { en: 'How to learn with Panna', hi: 'पन्ना से कैसे सीखें' };
export const NEXT_STEP_TITLE: LearnText = { en: 'Your next step', hi: 'आपका अगला कदम' };

export const LEARN_SECTIONS: Array<{ id: 'method' | 'day' | 'tips' | 'mistakes' | 'last'; title: LearnText; items: LearnItem[] }> = [
  {
    id: 'method',
    title: { en: 'The Panna method', hi: 'पन्ना का तरीका' },
    items: [
      { en: 'Read a page of the book, or your own exam material.', hi: 'किताब का एक पन्ना, या अपनी परीक्षा की सामग्री पढ़ें।', ...CONTINUE },
      { en: 'Look up any word you don’t know: tap it or search for it.', hi: 'जो शब्द न आए, उसे छुएँ या खोजें।', ...WORD_TOUR },
      { en: 'Save the words you want to remember.', hi: 'जो शब्द याद रखने हैं, उन्हें सहेजें।', ...REVIEW_TOUR },
      { en: 'Review for a few minutes each day: Panna asks about your saved words.', hi: 'रोज़ कुछ मिनट Review करें — पन्ना आपके सहेजे शब्दों पर सवाल पूछता है।', ...OPEN_REVIEW },
    ],
  },
  {
    id: 'day',
    title: { en: 'A 15-minute day', hi: 'रोज़ के 15 मिनट' },
    items: [
      { en: 'Review what’s due first (about 5 minutes).', hi: 'पहले Review में आए शब्द दोहराएँ (लगभग 5 मिनट)।', ...OPEN_REVIEW },
      { en: `Read your own exam material, and save up to ${NEW_WORDS_PER_DAY} new words (about 8 minutes).`, hi: `अपनी परीक्षा की सामग्री पढ़ें, और ${NEW_WORDS_PER_DAY} तक नए शब्द सहेजें (लगभग 8 मिनट)।`, ...CONTINUE },
      { en: 'Look at the similar and opposite chips of today’s words (about 2 minutes).', hi: 'आज के शब्दों के मिलते-जुलते और उल्टे शब्द देखें (लगभग 2 मिनट)।', ...WORD_TOUR },
    ],
  },
  {
    id: 'tips',
    title: { en: 'Exam tips', hi: 'परीक्षा के लिए सुझाव' },
    items: [
      { en: 'Similar and opposite chips are the synonym and antonym questions.', hi: 'मिलते-जुलते और उल्टे शब्द ही पर्यायवाची और विलोम वाले प्रश्न हैं।', ...WORD_TOUR },
      // The search box sits above the book; there is no action of its own for it.
      { en: 'Search in Hindi or Hinglish to find the English word for an essay.', hi: 'निबंध के लिए अंग्रेज़ी शब्द चाहिए? हिंदी या Hinglish में खोजें।', ...OPEN_BOOK },
      { en: 'Press 🔊 to learn the pronunciation.', hi: 'सही उच्चारण सीखने के लिए 🔊 दबाएँ।', ...WORD_TOUR },
      // Folded corners and margin notes have their own tour ("Marking the book") in the tours list.
      { en: 'Fold a corner or write a margin note on a word you keep missing.', hi: 'जो शब्द बार-बार भूलते हैं, उस पर कोना मोड़ें या हाशिये में नोट लिखें।', ...ALL_TOURS },
      { en: `Trust the schedule: mastered words still come back after ${LAST_INTERVAL} days.`, hi: `Review के समय पर भरोसा रखें — याद हुए शब्द भी ${LAST_INTERVAL} दिन बाद लौटते हैं।`, ...REVIEW_TOUR },
    ],
  },
  {
    id: 'mistakes',
    title: { en: 'Avoid these mistakes', hi: 'इन गलतियों से बचें' },
    items: [
      { en: 'Looking words up without saving them, so nothing comes back in Review.', hi: 'शब्द देखकर सहेजना भूल जाना — तब Review में कुछ नहीं लौटता।' },
      { en: 'Saving 150 words on day one, then giving up by day four.', hi: 'पहले दिन 150 शब्द सहेजना, और चौथे दिन तक छोड़ देना।' },
      { en: 'Reviewing once a week in one long burst.', hi: 'हफ़्ते में एक बार, एक साथ ढेर सारा Review करना।' },
      { en: 'Reading the book from A to Z like a word list.', hi: 'किताब को शब्द-सूची की तरह A से Z तक पढ़ना।' },
      { en: 'Skipping the similar and opposite chips.', hi: 'मिलते-जुलते और उल्टे शब्दों को छोड़ देना।' },
      { en: 'Never saving the book for offline, and never backing up.', hi: 'किताब ऑफ़लाइन न सहेजना, और कभी बैकअप न लेना।' },
    ],
  },
  {
    id: 'last',
    title: { en: 'Make it last', hi: 'मेहनत सँभालकर रखें' },
    items: [
      { en: 'Install Panna, so it opens like any other app.', hi: 'पन्ना इंस्टॉल करें, ताकि यह बाकी ऐप की तरह खुले।', ...INSTALL },
      { en: 'Save the book for offline, to study without internet.', hi: 'किताब ऑफ़लाइन सहेजें, ताकि बिना इंटरनेट भी पढ़ सकें।', ...OFFLINE },
      { en: 'Back up your words once a month.', hi: 'महीने में एक बार अपने शब्दों का बैकअप लें।', ...BACKUP },
    ],
  },
];

const mins = (n: number) => (n === 1 ? '1 minute' : `${n} minutes`);

/** The "Your next step" card. count: total due for 'review', K for 'add-words'; minutes: the Review estimate. */
export const NEXT_STEP_TEXT: Record<StepId, (count?: number, minutes?: number) => LearnItem> = {
  // The word sheet's button reads "Save word".
  'first-save': () => ({ en: 'Save your first word: open any word and tap Save word.', hi: 'अपना पहला शब्द सहेजें: कोई भी शब्द खोलें और Save word छुएँ।', ...OPEN_BOOK }),
  review: (count = 0, minutes = 1) => ({
    en: `Review your ${count} due ${count === 1 ? 'word' : 'words'} (about ${mins(minutes)}).`,
    hi: count === 1 ? `Review में आपका 1 शब्द तैयार है (लगभग ${minutes} मिनट)।` : `Review में आपके ${count} शब्द तैयार हैं (लगभग ${minutes} मिनट)।`,
    ...OPEN_REVIEW,
  }),
  backup: () => ({ en: 'Back up your words: they live only on this device.', hi: 'अपने शब्दों का बैकअप लें — वे सिर्फ़ इसी डिवाइस पर हैं।', ...BACKUP }),
  // "Up to 1" reads oddly: one word left is "1 more".
  'add-words': (count = NEW_WORDS_PER_DAY) => ({
    en: count === 1 ? 'Add 1 more new word today.' : `Add up to ${count} new words today.`,
    hi: count === 1 ? 'आज 1 और नया शब्द जोड़ें।' : `आज ${count} तक नए शब्द जोड़ें।`,
    ...CONTINUE,
  }),
  'done-today': () => ({ en: 'Done for today: come back tomorrow for Review.', hi: 'आज का काम पूरा — कल Review के लिए लौटें।' }),
};
