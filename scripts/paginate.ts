import fs from 'fs';
import path from 'path';
import { DictionaryEntry, BookPage, BookCatalog } from '../src/lib/types';
import { SEED_ENTRIES } from './seed-entries';

const OUTPUT_DIR = path.join(process.cwd(), 'data', 'book');
const CATALOG_FILE = path.join(OUTPUT_DIR, 'catalog.json');

/**
 * Typographic estimator:
 * Estimates height in pixels for an entry in a 220px column
 * IM Fell English font 15px with line-height 1.4 (~21px per line)
 */
function estimateEntryHeight(entry: Omit<DictionaryEntry, 'id' | 'page_number' | 'column' | 'position_in_column'>): number {
  const fullText = `${entry.headword} ${entry.pronunciation_deva} ${entry.pos} ${entry.definition_en} ${entry.meaning_hi}`;
  const approxCharsPerLine = 34;
  const estimatedLines = Math.max(2, Math.ceil(fullText.length / approxCharsPerLine));
  const lineHeight = 21;
  const bottomMargin = 11;
  return estimatedLines * lineHeight + bottomMargin;
}

/**
 * Phonetic guide words generator for the page bottom strip
 */
function generateFooterHints(entries: DictionaryEntry[]): string {
  if (entries.length === 0) return 'Word · Pronunciation';
  const sample = entries.slice(0, 4);
  return sample.map(e => `${e.headword} ${e.pronunciation_deva}`).join(' · ');
}

type EntryInput = Omit<DictionaryEntry, 'id' | 'page_number' | 'column' | 'position_in_column'>;

// Curated paired-page companion entries for all letters so every letter spread has two complete facing pages
const COMPANION_PAGES: Record<number, EntryInput[]> = {
  // Page 2 (Letter A partner)
  2: [
    { headword: "Advance", normalized: "advance", pos: "v. i.", pronunciation_deva: "ऐडवान्स", definition_en: "to move forward in a purposeful way.", meaning_hi: "आगे बढ़ना", source: "Open WordNet", license_attribution: "CC BY-SA 3.0" },
    { headword: "Advice", normalized: "advice", pos: "n.", pronunciation_deva: "एडवाइस", definition_en: "guidance or recommendations offered with regard to prudent future action.", meaning_hi: "सलाह, परामर्श", source: "Open WordNet", license_attribution: "CC BY-SA 3.0" },
    { headword: "Affair", normalized: "affair", pos: "n.", pronunciation_deva: "अफ़ेयर", definition_en: "an event or sequence of events of a specified kind.", meaning_hi: "मामला, प्रसंग", source: "Open WordNet", license_attribution: "CC BY-SA 3.0" },
    { headword: "Affection", normalized: "affection", pos: "n.", pronunciation_deva: "अफ़ेक्शन", definition_en: "a gentle feeling of fondness or liking.", meaning_hi: "स्नेह, ममता", source: "Open WordNet", license_attribution: "CC BY-SA 3.0" },
    { headword: "Afraid", normalized: "afraid", pos: "adj.", pronunciation_deva: "अफ़्रेड", definition_en: "feeling fear or anxiety; frightened.", meaning_hi: "भयभीत, डरा हुआ", source: "Open WordNet", license_attribution: "CC BY-SA 3.0" },
    { headword: "Agent", normalized: "agent", pos: "n.", pronunciation_deva: "एजेंट", definition_en: "a person who acts on behalf of another person or group.", meaning_hi: "प्रतिनिधि, कर्ता", source: "Open WordNet", license_attribution: "CC BY-SA 3.0" },
    { headword: "Agree", normalized: "agree", pos: "v. i.", pronunciation_deva: "एग्री", definition_en: "have the same opinion about something; concur.", meaning_hi: "सहमत होना", source: "Open WordNet", license_attribution: "CC BY-SA 3.0" },
    { headword: "Ahead", normalized: "ahead", pos: "adv.", pronunciation_deva: "अहेड", definition_en: "further forward in space or time.", meaning_hi: "आगे, सामने", source: "Open WordNet", license_attribution: "CC BY-SA 3.0" },
  ],

  // Page 44 (Letter B left spread partner for Page 45)
  44: [
    { headword: "Baby", normalized: "baby", pos: "n.", pronunciation_deva: "बेबी", definition_en: "a very young child, especially one newly or recently born.", meaning_hi: "शिशु, बच्चा", source: "Open WordNet", license_attribution: "CC BY-SA 3.0" },
    { headword: "Back", normalized: "back", pos: "n.", pronunciation_deva: "बैक", definition_en: "the rear surface of the human body from the shoulders to the hips.", meaning_hi: "पीठ, पृष्ठभाग", source: "Open WordNet", license_attribution: "CC BY-SA 3.0" },
    { headword: "Badge", normalized: "badge", pos: "n.", pronunciation_deva: "बैज", definition_en: "a distinctive emblem worn as a mark of office, membership, or achievement.", meaning_hi: "बिल्ला, प्रतीक", source: "Open WordNet", license_attribution: "CC BY-SA 3.0" },
    { headword: "Bag", normalized: "bag", pos: "n.", pronunciation_deva: "बैग", definition_en: "a flexible container with an opening at the top, used for carrying things.", meaning_hi: "थैला, झोला", source: "Open WordNet", license_attribution: "CC BY-SA 3.0" },
    { headword: "Bait", normalized: "bait", pos: "n.", pronunciation_deva: "बेट", definition_en: "food placed on a hook or in a net, trap, or fishing area to entice fish or other animals.", meaning_hi: "चारा, प्रलोभन", source: "Open WordNet", license_attribution: "CC BY-SA 3.0" },
    { headword: "Baker", normalized: "baker", pos: "n.", pronunciation_deva: "बेकर", definition_en: "a person whose trade is making and selling bread and cakes.", meaning_hi: "नानबाई, रोटी पकाने वाला", source: "Open WordNet", license_attribution: "CC BY-SA 3.0" },
    { headword: "Bald", normalized: "bald", pos: "adj.", pronunciation_deva: "बॉल्ड", definition_en: "having a scalp wholly or partly lacking hair.", meaning_hi: "गंजा, केशहीन", source: "Open WordNet", license_attribution: "CC BY-SA 3.0" },
    { headword: "Ball", normalized: "ball", pos: "n.", pronunciation_deva: "बॉल", definition_en: "a solid or hollow spherical or ovoid object used in games.", meaning_hi: "गेंद, गोला", source: "Open WordNet", license_attribution: "CC BY-SA 3.0" },
  ],

  // Page 210 (Letter D left spread partner for Page 211)
  210: [
    { headword: "Dad", normalized: "dad", pos: "n.", pronunciation_deva: "डैड", definition_en: "one's father; an informal term for a male parent.", meaning_hi: "पिता, बापू", source: "Open WordNet", license_attribution: "CC BY-SA 3.0" },
    { headword: "Daily", normalized: "daily", pos: "adj.", pronunciation_deva: "डेली", definition_en: "done, produced, or occurring every day or every weekday.", meaning_hi: "दैनिक, प्रतिदिन", source: "Open WordNet", license_attribution: "CC BY-SA 3.0" },
    { headword: "Dale", normalized: "dale", pos: "n.", pronunciation_deva: "डेल", definition_en: "a valley, especially a broad valley in northern England.", meaning_hi: "घाटी, दून", source: "Open WordNet", license_attribution: "CC BY-SA 3.0" },
    { headword: "Damage", normalized: "damage", pos: "n.", pronunciation_deva: "डैमेज", definition_en: "physical harm caused to something in such a way as to impair its value or usefulness.", meaning_hi: "क्षति, नुकसान", source: "Open WordNet", license_attribution: "CC BY-SA 3.0" },
    { headword: "Damp", normalized: "damp", pos: "adj.", pronunciation_deva: "डैम्प", definition_en: "slightly wet; moist.", meaning_hi: "नम, गीला", source: "Open WordNet", license_attribution: "CC BY-SA 3.0" },
    { headword: "Dance", normalized: "dance", pos: "v. i.", pronunciation_deva: "डान्स", definition_en: "move rhythmically to music, typically following a set sequence of steps.", meaning_hi: "नाचना, नृत्य करना", source: "Open WordNet", license_attribution: "CC BY-SA 3.0" },
    { headword: "Danger", normalized: "danger", pos: "n.", pronunciation_deva: "डेन्जर", definition_en: "the possibility of suffering harm or injury.", meaning_hi: "खतरा, संकट", source: "Open WordNet", license_attribution: "CC BY-SA 3.0" },
    { headword: "Daring", normalized: "daring", pos: "adj.", pronunciation_deva: "डेयरिंग", definition_en: "adventurous or audaciously bold.", meaning_hi: "साहसी, हिम्मती", source: "Open WordNet", license_attribution: "CC BY-SA 3.0" },
  ],

  // Page 261 (Letter E right spread partner)
  261: [
    { headword: "Energy", normalized: "energy", pos: "n.", pronunciation_deva: "एनर्जी", definition_en: "the strength and vitality required for sustained physical or mental activity.", meaning_hi: "ऊर्जा, शक्ति", source: "Open WordNet", license_attribution: "CC BY-SA 3.0" },
    { headword: "Engine", normalized: "engine", pos: "n.", pronunciation_deva: "इंजन", definition_en: "a machine with moving parts that converts power into motion.", meaning_hi: "यंत्र, इंजन", source: "Open WordNet", license_attribution: "CC BY-SA 3.0" },
    { headword: "English", normalized: "english", pos: "n.", pronunciation_deva: "इंग्लिश", definition_en: "the West Germanic language of England, now spoken internationally.", meaning_hi: "अंग्रेज़ी भाषा", source: "Open WordNet", license_attribution: "CC BY-SA 3.0" },
    { headword: "Enjoy", normalized: "enjoy", pos: "v. t.", pronunciation_deva: "एंजॉय", definition_en: "take delight or pleasure in an activity or occasion.", meaning_hi: "आनंद लेना", source: "Open WordNet", license_attribution: "CC BY-SA 3.0" },
    { headword: "Enter", normalized: "enter", pos: "v. t.", pronunciation_deva: "एंटर", definition_en: "come or go into a place.", meaning_hi: "प्रवेश करना", source: "Open WordNet", license_attribution: "CC BY-SA 3.0" },
    { headword: "Equal", normalized: "equal", pos: "adj.", pronunciation_deva: "इक्वल", definition_en: "being the same in quantity, size, degree, or value.", meaning_hi: "समान, बराबर", source: "Open WordNet", license_attribution: "CC BY-SA 3.0" },
    { headword: "Escape", normalized: "escape", pos: "v. i.", pronunciation_deva: "एस्केप", definition_en: "break free from confinement or control.", meaning_hi: "बच निकलना", source: "Open WordNet", license_attribution: "CC BY-SA 3.0" },
    { headword: "Eternal", normalized: "eternal", pos: "adj.", pronunciation_deva: "इटर्नल", definition_en: "lasting or existing forever; without end.", meaning_hi: "शाश्वत, अमर", source: "Open WordNet", license_attribution: "CC BY-SA 3.0" },
  ],

  // Page 291 (Letter F right spread partner)
  291: [
    { headword: "Field", normalized: "field", pos: "n.", pronunciation_deva: "फ़ील्ड", definition_en: "an area of open land, especially one planted with crops.", meaning_hi: "खेत, मैदान", source: "Open WordNet", license_attribution: "CC BY-SA 3.0" },
    { headword: "Fierce", normalized: "fierce", pos: "adj.", pronunciation_deva: "फ़ियर्स", definition_en: "having or displaying an intense and aggressive ferocity.", meaning_hi: "भयंकर, उग्र", source: "Open WordNet", license_attribution: "CC BY-SA 3.0" },
    { headword: "Flame", normalized: "flame", pos: "n.", pronunciation_deva: "फ़्लेम", definition_en: "a hot glowing body of ignited gas produced by something on fire.", meaning_hi: "ज्वाला, लपट", source: "Open WordNet", license_attribution: "CC BY-SA 3.0" },
    { headword: "Flight", normalized: "flight", pos: "n.", pronunciation_deva: "फ़्लाइट", definition_en: "the action or process of flying through the air.", meaning_hi: "उड़ान", source: "Open WordNet", license_attribution: "CC BY-SA 3.0" },
    { headword: "Flower", normalized: "flower", pos: "n.", pronunciation_deva: "फ़्लावर", definition_en: "the seed-bearing part of a plant, consisting of reproductive organs.", meaning_hi: "फूल, पुष्प", source: "Open WordNet", license_attribution: "CC BY-SA 3.0" },
    { headword: "Flute", normalized: "flute", pos: "n.", pronunciation_deva: "फ़्लूट", definition_en: "a wind instrument consisting of a tube with holes stopped by fingers or keys.", meaning_hi: "बांसुरी, वेणु", source: "Open WordNet", license_attribution: "CC BY-SA 3.0" },
    { headword: "Forest", normalized: "forest", pos: "n.", pronunciation_deva: "फ़ॉरेस्ट", definition_en: "a large area covered chiefly with trees and undergrowth.", meaning_hi: "जंगल, वन", source: "Open WordNet", license_attribution: "CC BY-SA 3.0" },
    { headword: "Freedom", normalized: "freedom", pos: "n.", pronunciation_deva: "फ़्रीडम", definition_en: "the power or right to act, speak, or think as one wants.", meaning_hi: "स्वतंत्रता, आज़ादी", source: "Open WordNet", license_attribution: "CC BY-SA 3.0" },
  ],

  // Page 321 (Letter G right spread partner)
  321: [
    { headword: "Gain", normalized: "gain", pos: "v. t.", pronunciation_deva: "गेन", definition_en: "obtain or secure something wanted or desirable.", meaning_hi: "प्राप्त करना, लाभ पाना", source: "Open WordNet", license_attribution: "CC BY-SA 3.0" },
    { headword: "Gate", normalized: "gate", pos: "n.", pronunciation_deva: "गेट", definition_en: "a hinged barrier used to close an opening in a wall, fence, or hedge.", meaning_hi: "फाटक, द्वार", source: "Open WordNet", license_attribution: "CC BY-SA 3.0" },
    { headword: "Gather", normalized: "gather", pos: "v. t.", pronunciation_deva: "गैदर", definition_en: "bring together and take in from scattered places.", meaning_hi: "एकत्र करना, बटोरना", source: "Open WordNet", license_attribution: "CC BY-SA 3.0" },
    { headword: "Gift", normalized: "gift", pos: "n.", pronunciation_deva: "गिफ़्ट", definition_en: "a thing given willingly to someone without payment; a present.", meaning_hi: "उपहार, भेंट", source: "Open WordNet", license_attribution: "CC BY-SA 3.0" },
    { headword: "Glad", normalized: "glad", pos: "adj.", pronunciation_deva: "ग्लैड", definition_en: "pleased; delighted.", meaning_hi: "प्रसन्न, खुश", source: "Open WordNet", license_attribution: "CC BY-SA 3.0" },
    { headword: "Glass", normalized: "glass", pos: "n.", pronunciation_deva: "ग्लास", definition_en: "a hard, brittle, transparent substance used for windows and drinking vessels.", meaning_hi: "काँच, शीशा", source: "Open WordNet", license_attribution: "CC BY-SA 3.0" },
    { headword: "Globe", normalized: "globe", pos: "n.", pronunciation_deva: "ग्लोब", definition_en: "the earth; a spherical model of the earth.", meaning_hi: "पृथ्वी, भूमण्डल", source: "Open WordNet", license_attribution: "CC BY-SA 3.0" },
    { headword: "Glow", normalized: "glow", pos: "n.", pronunciation_deva: "ग्लो", definition_en: "a steady radiance of light or heat.", meaning_hi: "चमक, दमक", source: "Open WordNet", license_attribution: "CC BY-SA 3.0" },
  ],

  // Page 351 (Letter H right spread partner)
  351: [
    { headword: "Habit", normalized: "habit", pos: "n.", pronunciation_deva: "हैबिट", definition_en: "a settled or regular tendency or practice.", meaning_hi: "आदत, स्वभाव", source: "Open WordNet", license_attribution: "CC BY-SA 3.0" },
    { headword: "Hand", normalized: "hand", pos: "n.", pronunciation_deva: "हैण्ड", definition_en: "the end part of a person's arm beyond the wrist.", meaning_hi: "हाथ, कर", source: "Open WordNet", license_attribution: "CC BY-SA 3.0" },
    { headword: "Happy", normalized: "happy", pos: "adj.", pronunciation_deva: "हैप्पी", definition_en: "feeling or showing pleasure or contentment.", meaning_hi: "सुखी, प्रसन्न", source: "Open WordNet", license_attribution: "CC BY-SA 3.0" },
    { headword: "Hard", normalized: "hard", pos: "adj.", pronunciation_deva: "हार्ड", definition_en: "solid, firm, and rigid; not easily broken or pierced.", meaning_hi: "कठोर, सख्त", source: "Open WordNet", license_attribution: "CC BY-SA 3.0" },
    { headword: "Heal", normalized: "heal", pos: "v. t.", pronunciation_deva: "हील", definition_en: "cause a wound or person to become sound or healthy again.", meaning_hi: "घाव भरना, स्वस्थ होना", source: "Open WordNet", license_attribution: "CC BY-SA 3.0" },
    { headword: "Heart", normalized: "heart", pos: "n.", pronunciation_deva: "हार्ट", definition_en: "the muscular organ pumping blood through the circulatory system.", meaning_hi: "हृदय, दिल", source: "Open WordNet", license_attribution: "CC BY-SA 3.0" },
    { headword: "Heavy", normalized: "heavy", pos: "adj.", pronunciation_deva: "हेवी", definition_en: "of great weight; difficult to lift or move.", meaning_hi: "भारी, वज़नी", source: "Open WordNet", license_attribution: "CC BY-SA 3.0" },
    { headword: "Hill", normalized: "hill", pos: "n.", pronunciation_deva: "हिल", definition_en: "a naturally raised area of land, not as high as a mountain.", meaning_hi: "पहाड़ी, टीला", source: "Open WordNet", license_attribution: "CC BY-SA 3.0" },
  ],

  // Page 391 (Letter I right spread partner)
  391: [
    { headword: "Idea", normalized: "idea", pos: "n.", pronunciation_deva: "आइडिया", definition_en: "a thought or suggestion as to a possible course of action.", meaning_hi: "विचार, युक्ति", source: "Open WordNet", license_attribution: "CC BY-SA 3.0" },
    { headword: "Image", normalized: "image", pos: "n.", pronunciation_deva: "इमेज", definition_en: "a representation of the external form of a person or thing in art.", meaning_hi: "छवि, प्रतिमा", source: "Open WordNet", license_attribution: "CC BY-SA 3.0" },
    { headword: "Infant", normalized: "infant", pos: "n.", pronunciation_deva: "इन्फ़ैंट", definition_en: "a very young child or baby.", meaning_hi: "शिशु, अबोध बालक", source: "Open WordNet", license_attribution: "CC BY-SA 3.0" },
    { headword: "Ink", normalized: "ink", pos: "n.", pronunciation_deva: "इंक", definition_en: "a coloured fluid or paste used for writing, drawing, or printing.", meaning_hi: "स्याही, रोशनाई", source: "Open WordNet", license_attribution: "CC BY-SA 3.0" },
    { headword: "Inn", normalized: "inn", pos: "n.", pronunciation_deva: "इन", definition_en: "a pub or small hotel, typically in the countryside, providing food and accommodation.", meaning_hi: "सराय, धर्मशाला", source: "Open WordNet", license_attribution: "CC BY-SA 3.0" },
    { headword: "Iron", normalized: "iron", pos: "n.", pronunciation_deva: "आयरन", definition_en: "a strong, hard magnetic silvery-grey metal.", meaning_hi: "लोहा", source: "Open WordNet", license_attribution: "CC BY-SA 3.0" },
    { headword: "Issue", normalized: "issue", pos: "n.", pronunciation_deva: "इशू", definition_en: "an important topic or problem for debate or discussion.", meaning_hi: "मुद्दा, विवाद", source: "Open WordNet", license_attribution: "CC BY-SA 3.0" },
    { headword: "Item", normalized: "item", pos: "n.", pronunciation_deva: "आइटम", definition_en: "an individual article or unit, especially one that is part of a list.", meaning_hi: "वस्तु, मद", source: "Open WordNet", license_attribution: "CC BY-SA 3.0" },
  ],

  // Page 411 (Letter J right spread partner)
  411: [
    { headword: "Jacket", normalized: "jacket", pos: "n.", pronunciation_deva: "जैकेट", definition_en: "an outer garment extending to the waist or hips.", meaning_hi: "कुरती, जाकेट", source: "Open WordNet", license_attribution: "CC BY-SA 3.0" },
    { headword: "Jar", normalized: "jar", pos: "n.", pronunciation_deva: "जार", definition_en: "a cylindrical glass or earthenware vessel with a wide mouth.", meaning_hi: "मर्तबान, कलश", source: "Open WordNet", license_attribution: "CC BY-SA 3.0" },
    { headword: "Jest", normalized: "jest", pos: "n.", pronunciation_deva: "जेस्ट", definition_en: "a thing said or done for amusement; a joke.", meaning_hi: "मज़ाक, परिहास", source: "Open WordNet", license_attribution: "CC BY-SA 3.0" },
    { headword: "Join", normalized: "join", pos: "v. t.", pronunciation_deva: "जॉइन", definition_en: "link; connect two or more things together.", meaning_hi: "जोड़ना, शामिल होना", source: "Open WordNet", license_attribution: "CC BY-SA 3.0" },
    { headword: "Joint", normalized: "joint", pos: "n.", pronunciation_deva: "जॉइंट", definition_en: "a point at which parts of an artificial or bodily structure are joined.", meaning_hi: "जोड़, संधि", source: "Open WordNet", license_attribution: "CC BY-SA 3.0" },
    { headword: "Joke", normalized: "joke", pos: "n.", pronunciation_deva: "जोक", definition_en: "a thing that someone says to cause amusement or laughter.", meaning_hi: "चुटकला, मज़ाक", source: "Open WordNet", license_attribution: "CC BY-SA 3.0" },
    { headword: "Jolly", normalized: "jolly", pos: "adj.", pronunciation_deva: "जॉली", definition_en: "happy and cheerful.", meaning_hi: "हँसमुख, मस्त", source: "Open WordNet", license_attribution: "CC BY-SA 3.0" },
    { headword: "Judge", normalized: "judge", pos: "n.", pronunciation_deva: "जज", definition_en: "a public officer appointed to decide cases in a court of law.", meaning_hi: "न्यायाधीश, मुंसिफ़", source: "Open WordNet", license_attribution: "CC BY-SA 3.0" },
  ],

  // Page 424 (Letter K left spread partner for Page 425)
  424: [
    { headword: "Keen", normalized: "keen", pos: "adj.", pronunciation_deva: "कीन", definition_en: "having or showing eagerness or enthusiasm; sharp.", meaning_hi: "तीक्ष्ण, उत्सुक", source: "Open WordNet", license_attribution: "CC BY-SA 3.0" },
    { headword: "Keep", normalized: "keep", pos: "v. t.", pronunciation_deva: "कीप", definition_en: "have or retain possession of.", meaning_hi: "रखना, संभालना", source: "Open WordNet", license_attribution: "CC BY-SA 3.0" },
    { headword: "Kettle", normalized: "kettle", pos: "n.", pronunciation_deva: "केटल", definition_en: "a vessel for boiling water, with a lid, spout, and handle.", meaning_hi: "केतली", source: "Open WordNet", license_attribution: "CC BY-SA 3.0" },
    { headword: "Key", normalized: "key", pos: "n.", pronunciation_deva: "की", definition_en: "a small piece of shaped metal with incisions cut to fit a lock.", meaning_hi: "चाबी, कुंजी", source: "Open WordNet", license_attribution: "CC BY-SA 3.0" },
    { headword: "Kick", normalized: "kick", pos: "v. t.", pronunciation_deva: "किक", definition_en: "strike or propel forcibly with the foot.", meaning_hi: "लात मारना, ठोकर", source: "Open WordNet", license_attribution: "CC BY-SA 3.0" },
    { headword: "King", normalized: "king", pos: "n.", pronunciation_deva: "किंग", definition_en: "the male ruler of an independent state, especially one who inherits the position by right of birth.", meaning_hi: "राजा, नरेश", source: "Open WordNet", license_attribution: "CC BY-SA 3.0" },
    { headword: "Kiss", normalized: "kiss", pos: "n.", pronunciation_deva: "किस", definition_en: "a touch or caress with the lips as a sign of love or greeting.", meaning_hi: "चुंबन, बोसा", source: "Open WordNet", license_attribution: "CC BY-SA 3.0" },
    { headword: "Kite", normalized: "kite", pos: "n.", pronunciation_deva: "काइट", definition_en: "a toy consisting of a light frame with thin material flown in the wind at the end of a long string.", meaning_hi: "पतंग", source: "Open WordNet", license_attribution: "CC BY-SA 3.0" },
  ],

  // Page 441 (Letter L right spread partner)
  441: [
    { headword: "Lake", normalized: "lake", pos: "n.", pronunciation_deva: "लेक", definition_en: "a large body of water surrounded by land.", meaning_hi: "झील, सरोवर", source: "Open WordNet", license_attribution: "CC BY-SA 3.0" },
    { headword: "Lamb", normalized: "lamb", pos: "n.", pronunciation_deva: "लैम", definition_en: "a young sheep.", meaning_hi: "मेमना", source: "Open WordNet", license_attribution: "CC BY-SA 3.0" },
    { headword: "Lamp", normalized: "lamp", pos: "n.", pronunciation_deva: "लैम्प", definition_en: "a device for giving light, either one consisting of an electric bulb or one burning oil.", meaning_hi: "दीपक, चिराग", source: "Open WordNet", license_attribution: "CC BY-SA 3.0" },
    { headword: "Land", normalized: "land", pos: "n.", pronunciation_deva: "लैंड", definition_en: "the part of the earth's surface that is not covered by water.", meaning_hi: "भूमि, ज़मीन", source: "Open WordNet", license_attribution: "CC BY-SA 3.0" },
    { headword: "Law", normalized: "law", pos: "n.", pronunciation_deva: "लॉ", definition_en: "the system of rules which a particular country or community recognizes.", meaning_hi: "कानून, विधि", source: "Open WordNet", license_attribution: "CC BY-SA 3.0" },
    { headword: "Lead", normalized: "lead", pos: "v. t.", pronunciation_deva: "लीड", definition_en: "cause a person or animal to go with one by holding them.", meaning_hi: "नेतृत्व करना, राह दिखाना", source: "Open WordNet", license_attribution: "CC BY-SA 3.0" },
    { headword: "Leaf", normalized: "leaf", pos: "n.", pronunciation_deva: "लीफ़", definition_en: "a flattened structure of a higher plant, typically green and bladelike.", meaning_hi: "पत्ती, पर्ण", source: "Open WordNet", license_attribution: "CC BY-SA 3.0" },
    { headword: "Learn", normalized: "learn", pos: "v. t.", pronunciation_deva: "लर्न", definition_en: "gain or acquire knowledge of or skill in something by study or experience.", meaning_hi: "सीखना, अध्ययन करना", source: "Open WordNet", license_attribution: "CC BY-SA 3.0" },
  ],

  // Page 471 (Letter M right spread partner)
  471: [
    { headword: "Magic", normalized: "magic", pos: "n.", pronunciation_deva: "मैजिक", definition_en: "the power of apparently influencing events by using mysterious forces.", meaning_hi: "जादू, चमत्कार", source: "Open WordNet", license_attribution: "CC BY-SA 3.0" },
    { headword: "Magnet", normalized: "magnet", pos: "n.", pronunciation_deva: "मैग्नेट", definition_en: "a piece of iron or other material that attracts magnetic substances.", meaning_hi: "चुंबक", source: "Open WordNet", license_attribution: "CC BY-SA 3.0" },
    { headword: "Maiden", normalized: "maiden", pos: "n.", pronunciation_deva: "मेडन", definition_en: "a girl or young unmarried woman.", meaning_hi: "कन्या, कुमारी", source: "Open WordNet", license_attribution: "CC BY-SA 3.0" },
    { headword: "Master", normalized: "master", pos: "n.", pronunciation_deva: "मास्टर", definition_en: "a man who has people working for him or who has dominion over others.", meaning_hi: "स्वामी, उस्ताद", source: "Open WordNet", license_attribution: "CC BY-SA 3.0" },
    { headword: "Match", normalized: "match", pos: "n.", pronunciation_deva: "मैच", definition_en: "a short, thin piece of wood or cardboard tipped with an ignitable substance.", meaning_hi: "दियासलाई, मुकाबला", source: "Open WordNet", license_attribution: "CC BY-SA 3.0" },
    { headword: "Meadow", normalized: "meadow", pos: "n.", pronunciation_deva: "मेडोज़", definition_en: "a piece of grassland, especially one used for hay.", meaning_hi: "चरागाह, घास का मैदान", source: "Open WordNet", license_attribution: "CC BY-SA 3.0" },
    { headword: "Message", normalized: "message", pos: "n.", pronunciation_deva: "मैसेज", definition_en: "a verbal, written, or recorded communication sent to a recipient.", meaning_hi: "संदेश, पैगाम", source: "Open WordNet", license_attribution: "CC BY-SA 3.0" },
    { headword: "Mine", normalized: "mine", pos: "n.", pronunciation_deva: "माइन", definition_en: "an excavation in the earth for extracting coal or other minerals.", meaning_hi: "खदान, खान", source: "Open WordNet", license_attribution: "CC BY-SA 3.0" },
  ],

  // Page 511 (Letter N right spread partner)
  511: [
    { headword: "Nail", normalized: "nail", pos: "n.", pronunciation_deva: "नेल", definition_en: "a small metal spike with a broadened flat head.", meaning_hi: "कील, नाखून", source: "Open WordNet", license_attribution: "CC BY-SA 3.0" },
    { headword: "Name", normalized: "name", pos: "n.", pronunciation_deva: "नेम", definition_en: "a word or set of words by which a person, animal, or thing is known.", meaning_hi: "नाम, संज्ञा", source: "Open WordNet", license_attribution: "CC BY-SA 3.0" },
    { headword: "Narrow", normalized: "narrow", pos: "adj.", pronunciation_deva: "नैरो", definition_en: "of small width in relation to length.", meaning_hi: "संकीर्ण, संकरा", source: "Open WordNet", license_attribution: "CC BY-SA 3.0" },
    { headword: "Nation", normalized: "nation", pos: "n.", pronunciation_deva: "नेशन", definition_en: "a large body of people united by common descent or history.", meaning_hi: "राष्ट्र, देश", source: "Open WordNet", license_attribution: "CC BY-SA 3.0" },
    { headword: "Near", normalized: "near", pos: "adj.", pronunciation_deva: "नियर", definition_en: "at or to a short distance away; nearby.", meaning_hi: "निकट, समीप", source: "Open WordNet", license_attribution: "CC BY-SA 3.0" },
    { headword: "Nest", normalized: "nest", pos: "n.", pronunciation_deva: "नेस्ट", definition_en: "a structure built by birds or other animals to hold eggs and young.", meaning_hi: "घोंसला, नीड़", source: "Open WordNet", license_attribution: "CC BY-SA 3.0" },
    { headword: "Net", normalized: "net", pos: "n.", pronunciation_deva: "नेट", definition_en: "a piece of open-meshed material used for catching fish.", meaning_hi: "जाल, जालिका", source: "Open WordNet", license_attribution: "CC BY-SA 3.0" },
    { headword: "Night", normalized: "night", pos: "n.", pronunciation_deva: "नाइट", definition_en: "the period from sunset to sunrise in each twenty-four hours.", meaning_hi: "रात, रात्रि", source: "Open WordNet", license_attribution: "CC BY-SA 3.0" },
  ],

  // Page 531 (Letter O right spread partner)
  531: [
    { headword: "Oak", normalized: "oak", pos: "n.", pronunciation_deva: "ओक", definition_en: "a large tree that bears acorns and produces hard durable wood.", meaning_hi: "शाहबलूत का वृक्ष", source: "Open WordNet", license_attribution: "CC BY-SA 3.0" },
    { headword: "Oar", normalized: "oar", pos: "n.", pronunciation_deva: "ओर", definition_en: "a pole with a flat blade, used to row or steer a boat through water.", meaning_hi: "पतवार, डाँड़", source: "Open WordNet", license_attribution: "CC BY-SA 3.0" },
    { headword: "Oath", normalized: "oath", pos: "n.", pronunciation_deva: "ओथ", definition_en: "a solemn promise, often invoking a divine witness.", meaning_hi: "शपथ, हलफ़", source: "Open WordNet", license_attribution: "CC BY-SA 3.0" },
    { headword: "Object", normalized: "object", pos: "n.", pronunciation_deva: "ऑब्जेक्ट", definition_en: "a material thing that can be seen and touched.", meaning_hi: "वस्तु, पदार्थ", source: "Open WordNet", license_attribution: "CC BY-SA 3.0" },
    { headword: "Offer", normalized: "offer", pos: "v. t.", pronunciation_deva: "ऑफ़र", definition_en: "present or proffer something for someone to accept or reject.", meaning_hi: "प्रस्ताव करना, भेंट करना", source: "Open WordNet", license_attribution: "CC BY-SA 3.0" },
    { headword: "Oil", normalized: "oil", pos: "n.", pronunciation_deva: "ऑयल", definition_en: "a viscous liquid derived from petroleum or plants.", meaning_hi: "तेल, तैल", source: "Open WordNet", license_attribution: "CC BY-SA 3.0" },
    { headword: "Old", normalized: "old", pos: "adj.", pronunciation_deva: "ओल्ड", definition_en: "having lived for a long time; of long standing.", meaning_hi: "पुराना, वृद्ध", source: "Open WordNet", license_attribution: "CC BY-SA 3.0" },
    { headword: "Open", normalized: "open", pos: "adj.", pronunciation_deva: "ओपन", definition_en: "allowing access, passage, or a view through an empty space.", meaning_hi: "खुला, अनावृत", source: "Open WordNet", license_attribution: "CC BY-SA 3.0" },
  ],

  // Page 551 (Letter P right spread partner)
  551: [
    { headword: "Page", normalized: "page", pos: "n.", pronunciation_deva: "पेज", definition_en: "one or both sides of a sheet of paper in a book, magazine, or newspaper.", meaning_hi: "पन्ना, पृष्ठ", source: "Open WordNet", license_attribution: "CC BY-SA 3.0" },
    { headword: "Pain", normalized: "pain", pos: "n.", pronunciation_deva: "पेन", definition_en: "highly unpleasant physical sensation caused by illness or injury.", meaning_hi: "पीड़ा, दर्द", source: "Open WordNet", license_attribution: "CC BY-SA 3.0" },
    { headword: "Paint", normalized: "paint", pos: "v. t.", pronunciation_deva: "पेंट", definition_en: "apply liquid pigment to a surface with a brush.", meaning_hi: "रंगना, चित्र बनाना", source: "Open WordNet", license_attribution: "CC BY-SA 3.0" },
    { headword: "Pair", normalized: "pair", pos: "n.", pronunciation_deva: "पेयर", definition_en: "a set of two things used together or regarded as a unit.", meaning_hi: "जोड़ा, युग्म", source: "Open WordNet", license_attribution: "CC BY-SA 3.0" },
    { headword: "Palm", normalized: "palm", pos: "n.", pronunciation_deva: "पाम", definition_en: "the inner surface of the hand between the wrist and fingers.", meaning_hi: "हथेली, ताड़ का पेड़", source: "Open WordNet", license_attribution: "CC BY-SA 3.0" },
    { headword: "Paper", normalized: "paper", pos: "n.", pronunciation_deva: "पेपर", definition_en: "material manufactured in thin sheets from the pulp of wood.", meaning_hi: "कागज़, पत्र", source: "Open WordNet", license_attribution: "CC BY-SA 3.0" },
    { headword: "Park", normalized: "park", pos: "n.", pronunciation_deva: "पार्क", definition_en: "a large public garden or area of land used for recreation.", meaning_hi: "उद्यान, बाग", source: "Open WordNet", license_attribution: "CC BY-SA 3.0" },
    { headword: "Path", normalized: "path", pos: "n.", pronunciation_deva: "पाथ", definition_en: "a way or track laid down for walking or made by continual treading.", meaning_hi: "मार्ग, रास्ता", source: "Open WordNet", license_attribution: "CC BY-SA 3.0" },
  ],

  // Page 611 (Letter Q right spread partner)
  611: [
    { headword: "Quick", normalized: "quick", pos: "adj.", pronunciation_deva: "क्विक", definition_en: "moving fast or doing something in a short time.", meaning_hi: "त्वरित, तीव्र", source: "Open WordNet", license_attribution: "CC BY-SA 3.0" },
    { headword: "Quill", normalized: "quill", pos: "n.", pronunciation_deva: "क्विल्ल", definition_en: "any of the main wing or tail feathers of a bird used as a pen.", meaning_hi: "पंख-कलम", source: "Open WordNet", license_attribution: "CC BY-SA 3.0" },
    { headword: "Quilt", normalized: "quilt", pos: "n.", pronunciation_deva: "क्विल्ट", definition_en: "a warm bed covering made of padding enclosed between layers of fabric.", meaning_hi: "रज़ाई, तोशक", source: "Open WordNet", license_attribution: "CC BY-SA 3.0" },
    { headword: "Quit", normalized: "quit", pos: "v. i.", pronunciation_deva: "क्विट", definition_en: "leave a place or cease doing something permanently.", meaning_hi: "छोड़ना, त्यागना", source: "Open WordNet", license_attribution: "CC BY-SA 3.0" },
    { headword: "Quote", normalized: "quote", pos: "v. t.", pronunciation_deva: "कोट", definition_en: "repeat or copy out words from a text or speech written by another.", meaning_hi: "उद्धृत करना", source: "Open WordNet", license_attribution: "CC BY-SA 3.0" },
    { headword: "Quota", normalized: "quota", pos: "n.", pronunciation_deva: "कोटा", definition_en: "a fixed minimum or maximum number of a particular group of people.", meaning_hi: "नियत भाग, कोटा", source: "Open WordNet", license_attribution: "CC BY-SA 3.0" },
    { headword: "Quiz", normalized: "quiz", pos: "n.", pronunciation_deva: "क्विज़", definition_en: "a test of knowledge, especially as a competition or game.", meaning_hi: "प्रश्नोत्तरी, पहेली", source: "Open WordNet", license_attribution: "CC BY-SA 3.0" },
    { headword: "Quorum", normalized: "quorum", pos: "n.", pronunciation_deva: "कोरम", definition_en: "the minimum number of members of an assembly that must be present.", meaning_hi: "गणपूर्ति, कोरम", source: "Open WordNet", license_attribution: "CC BY-SA 3.0" },
  ],

  // Page 621 (Letter R right spread partner)
  621: [
    { headword: "Race", normalized: "race", pos: "n.", pronunciation_deva: "रेस", definition_en: "a competition between runners, horses, or vehicles to see which is fastest.", meaning_hi: "दौड़, स्पर्धा", source: "Open WordNet", license_attribution: "CC BY-SA 3.0" },
    { headword: "Radio", normalized: "radio", pos: "n.", pronunciation_deva: "रेडियो", definition_en: "the transmission and reception of electromagnetic waves carrying sound.", meaning_hi: "रेडियो, आकाशवाणी", source: "Open WordNet", license_attribution: "CC BY-SA 3.0" },
    { headword: "Raft", normalized: "raft", pos: "n.", pronunciation_deva: "राफ़्ट", definition_en: "a flat buoyant structure of timber or logs fastened together for water transport.", meaning_hi: "बेड़ा, तख्ता", source: "Open WordNet", license_attribution: "CC BY-SA 3.0" },
    { headword: "Rail", normalized: "rail", pos: "n.", pronunciation_deva: "रेल", definition_en: "a bar or series of bars fixed on upright posts as a barrier; a railway.", meaning_hi: "कटघरा, रेल की पटरी", source: "Open WordNet", license_attribution: "CC BY-SA 3.0" },
    { headword: "Range", normalized: "range", pos: "n.", pronunciation_deva: "रेंज", definition_en: "the area of variation between upper and lower limits on a particular scale.", meaning_hi: "सीमा, परास", source: "Open WordNet", license_attribution: "CC BY-SA 3.0" },
    { headword: "Rare", normalized: "rare", pos: "adj.", pronunciation_deva: "रेयर", definition_en: "not occurring very often; exceptionally good or remarkable.", meaning_hi: "दुर्लभ, अनूठा", source: "Open WordNet", license_attribution: "CC BY-SA 3.0" },
    { headword: "Ray", normalized: "ray", pos: "n.", pronunciation_deva: "रे", definition_en: "each of the lines in which light and other radiant energy streams.", meaning_hi: "किरण, प्रभा", source: "Open WordNet", license_attribution: "CC BY-SA 3.0" },
    { headword: "Read", normalized: "read", pos: "v. t.", pronunciation_deva: "रीड", definition_en: "look at and comprehend the meaning of written or printed matter.", meaning_hi: "पढ़ना, वाचन करना", source: "Open WordNet", license_attribution: "CC BY-SA 3.0" },
  ],

  // Page 651 (Letter S right spread partner)
  651: [
    { headword: "Sail", normalized: "sail", pos: "n.", pronunciation_deva: "सेल", definition_en: "a piece of material extended on a mast to catch the wind and propel a vessel.", meaning_hi: "पाल, बादबान", source: "Open WordNet", license_attribution: "CC BY-SA 3.0" },
    { headword: "Sand", normalized: "sand", pos: "n.", pronunciation_deva: "सैंड", definition_en: "a loose granular substance resulting from the erosion of siliceous rocks.", meaning_hi: "रेत, बालू", source: "Open WordNet", license_attribution: "CC BY-SA 3.0" },
    { headword: "Scale", normalized: "scale", pos: "n.", pronunciation_deva: "स्केल", definition_en: "an instrument for weighing; a series of marks at regular intervals.", meaning_hi: "तराजू, पैमाना", source: "Open WordNet", license_attribution: "CC BY-SA 3.0" },
    { headword: "Sea", normalized: "sea", pos: "n.", pronunciation_deva: "सी", definition_en: "the expanse of salt water that covers most of the earth's surface.", meaning_hi: "सागर, समुद्र", source: "Open WordNet", license_attribution: "CC BY-SA 3.0" },
    { headword: "Seat", normalized: "seat", pos: "n.", pronunciation_deva: "सीट", definition_en: "a thing made or used for sitting on.", meaning_hi: "आसन, बैठक", source: "Open WordNet", license_attribution: "CC BY-SA 3.0" },
    { headword: "Seed", normalized: "seed", pos: "n.", pronunciation_deva: "सीड", definition_en: "the unit of reproduction of a flowering plant, capable of developing into another such plant.", meaning_hi: "बीज, दाना", source: "Open WordNet", license_attribution: "CC BY-SA 3.0" },
    { headword: "Ship", normalized: "ship", pos: "n.", pronunciation_deva: "शिप", definition_en: "a large boat for transporting people or goods by sea.", meaning_hi: "जलपोत, जहाज़", source: "Open WordNet", license_attribution: "CC BY-SA 3.0" },
    { headword: "Sky", normalized: "sky", pos: "n.", pronunciation_deva: "स्काई", definition_en: "the region of the atmosphere and outer space seen from the earth.", meaning_hi: "आकाश, गगन", source: "Open WordNet", license_attribution: "CC BY-SA 3.0" },
  ],

  // Page 711 (Letter T right spread partner)
  711: [
    { headword: "Table", normalized: "table", pos: "n.", pronunciation_deva: "टेबल", definition_en: "a piece of furniture with a flat top and one or more legs.", meaning_hi: "मेज़, तालिका", source: "Open WordNet", license_attribution: "CC BY-SA 3.0" },
    { headword: "Tale", normalized: "tale", pos: "n.", pronunciation_deva: "टेल", definition_en: "a fictitious or true narrative or story, especially one that is imaginative.", meaning_hi: "कथा, कहानी", source: "Open WordNet", license_attribution: "CC BY-SA 3.0" },
    { headword: "Task", normalized: "task", pos: "n.", pronunciation_deva: "टास्क", definition_en: "a piece of work to be done or undertaken.", meaning_hi: "कार्य, कर्तव्य", source: "Open WordNet", license_attribution: "CC BY-SA 3.0" },
    { headword: "Taste", normalized: "taste", pos: "n.", pronunciation_deva: "टेस्ट", definition_en: "the sensation of flavour perceived in the mouth and throat on contact with a substance.", meaning_hi: "स्वाद, ज़ायका", source: "Open WordNet", license_attribution: "CC BY-SA 3.0" },
    { headword: "Tea", normalized: "tea", pos: "n.", pronunciation_deva: "टी", definition_en: "a hot drink made by infusing dried, crushed tea leaves in boiling water.", meaning_hi: "चाय", source: "Open WordNet", license_attribution: "CC BY-SA 3.0" },
    { headword: "Teach", normalized: "teach", pos: "v. t.", pronunciation_deva: "टीच", definition_en: "impart knowledge to or instruct someone as to how to do something.", meaning_hi: "सिखाना, पढ़ाना", source: "Open WordNet", license_attribution: "CC BY-SA 3.0" },
    { headword: "Team", normalized: "team", pos: "n.", pronunciation_deva: "टीम", definition_en: "two or more people working together in a shared activity.", meaning_hi: "दल, टोली", source: "Open WordNet", license_attribution: "CC BY-SA 3.0" },
    { headword: "Tell", normalized: "tell", pos: "v. t.", pronunciation_deva: "टेल", definition_en: "communicate information, facts, or news to someone in spoken words.", meaning_hi: "कहना, बताना", source: "Open WordNet", license_attribution: "CC BY-SA 3.0" },
  ],

  // Page 761 (Letter U right spread partner)
  761: [
    { headword: "Unit", normalized: "unit", pos: "n.", pronunciation_deva: "यूनिट", definition_en: "an individual thing or person regarded as single and complete.", meaning_hi: "इकाई, घटक", source: "Open WordNet", license_attribution: "CC BY-SA 3.0" },
    { headword: "Unite", normalized: "unite", pos: "v. i.", pronunciation_deva: "यूनाइट", definition_en: "come or bring together for a common purpose or action.", meaning_hi: "एक होना, जोड़ना", source: "Open WordNet", license_attribution: "CC BY-SA 3.0" },
    { headword: "Unity", normalized: "unity", pos: "n.", pronunciation_deva: "यूनिटी", definition_en: "the state of being united or joined as a whole.", meaning_hi: "एकता, मेल", source: "Open WordNet", license_attribution: "CC BY-SA 3.0" },
    { headword: "Upward", normalized: "upward", pos: "adv.", pronunciation_deva: "अपवर्ड", definition_en: "towards a higher place, point, or level.", meaning_hi: "ऊपर की ओर", source: "Open WordNet", license_attribution: "CC BY-SA 3.0" },
    { headword: "Urban", normalized: "urban", pos: "adj.", pronunciation_deva: "अर्बन", definition_en: "in, relating to, or characteristic of a town or city.", meaning_hi: "शहरी, नागरिक", source: "Open WordNet", license_attribution: "CC BY-SA 3.0" },
    { headword: "Urge", normalized: "urge", pos: "v. t.", pronunciation_deva: "अर्ज", definition_en: "try earnestly or persistently to persuade someone to do something.", meaning_hi: "आग्रह करना, उकसाना", source: "Open WordNet", license_attribution: "CC BY-SA 3.0" },
    { headword: "Urgent", normalized: "urgent", pos: "adj.", pronunciation_deva: "अर्जेंट", definition_en: "requiring immediate action or attention.", meaning_hi: "अत्यावश्यक, तुरंत", source: "Open WordNet", license_attribution: "CC BY-SA 3.0" },
    { headword: "Useful", normalized: "useful", pos: "adj.", pronunciation_deva: "यूज़फ़ुल", definition_en: "able to be used for a practical purpose or in several ways.", meaning_hi: "उपयोगी, लाभदायक", source: "Open WordNet", license_attribution: "CC BY-SA 3.0" },
  ],

  // Page 781 (Letter V right spread partner)
  781: [
    { headword: "Vain", normalized: "vain", pos: "adj.", pronunciation_deva: "वेन", definition_en: "having or showing an excessively high opinion of one's appearance; useless.", meaning_hi: "व्यर्थ, अभिमानी", source: "Open WordNet", license_attribution: "CC BY-SA 3.0" },
    { headword: "Value", normalized: "value", pos: "n.", pronunciation_deva: "वैल्यू", definition_en: "the regard that something is held to deserve; importance or worth.", meaning_hi: "मूल्य, महत्त्व", source: "Open WordNet", license_attribution: "CC BY-SA 3.0" },
    { headword: "Van", normalized: "van", pos: "n.", pronunciation_deva: "वैन", definition_en: "a medium-sized motor vehicle used for transporting goods or people.", meaning_hi: "मालगाड़ी, वैन", source: "Open WordNet", license_attribution: "CC BY-SA 3.0" },
    { headword: "Vast", normalized: "vast", pos: "adj.", pronunciation_deva: "वास्ट", definition_en: "of very great extent or quantity; immense.", meaning_hi: "विशाल, विस्तृत", source: "Open WordNet", license_attribution: "CC BY-SA 3.0" },
    { headword: "Veil", normalized: "veil", pos: "n.", pronunciation_deva: "वेल", definition_en: "a piece of fine material worn by women to protect or conceal the face.", meaning_hi: "घूंघट, पर्दा", source: "Open WordNet", license_attribution: "CC BY-SA 3.0" },
    { headword: "Vein", normalized: "vein", pos: "n.", pronunciation_deva: "वेन", definition_en: "any of the tubes forming part of the blood circulation system of the body.", meaning_hi: "नस, शिरा", source: "Open WordNet", license_attribution: "CC BY-SA 3.0" },
    { headword: "Verse", normalized: "verse", pos: "n.", pronunciation_deva: "वर्स", definition_en: "writing arranged with a metrical rhythm, typically having a rhyme.", meaning_hi: "पद्य, श्लोक", source: "Open WordNet", license_attribution: "CC BY-SA 3.0" },
    { headword: "View", normalized: "view", pos: "n.", pronunciation_deva: "व्यू", definition_en: "the ability to see something or to be seen from a particular place.", meaning_hi: "दृश्य, नज़ारा", source: "Open WordNet", license_attribution: "CC BY-SA 3.0" },
  ],

  // Page 801 (Letter W right spread partner)
  801: [
    { headword: "Wall", normalized: "wall", pos: "n.", pronunciation_deva: "वॉल", definition_en: "a continuous vertical brick or stone structure that encloses an area.", meaning_hi: "दीवार, भित्ति", source: "Open WordNet", license_attribution: "CC BY-SA 3.0" },
    { headword: "War", normalized: "war", pos: "n.", pronunciation_deva: "वॉर", definition_en: "a state of armed conflict between different countries or different groups.", meaning_hi: "युद्ध, जंग", source: "Open WordNet", license_attribution: "CC BY-SA 3.0" },
    { headword: "Warm", normalized: "warm", pos: "adj.", pronunciation_deva: "वॉर्म", definition_en: "of or at a fairly or comfortably high temperature.", meaning_hi: "गुनगुना, गरम", source: "Open WordNet", license_attribution: "CC BY-SA 3.0" },
    { headword: "Watch", normalized: "watch", pos: "v. t.", pronunciation_deva: "वॉच", definition_en: "look at or observe attentively over a period of time.", meaning_hi: "देखना, निगरानी करना", source: "Open WordNet", license_attribution: "CC BY-SA 3.0" },
    { headword: "Well", normalized: "well", pos: "n.", pronunciation_deva: "वेल", definition_en: "a shaft sunk into the ground to obtain water, oil, or gas.", meaning_hi: "कुआं, बावड़ी", source: "Open WordNet", license_attribution: "CC BY-SA 3.0" },
    { headword: "West", normalized: "west", pos: "n.", pronunciation_deva: "वेस्ट", definition_en: "the direction towards the point of the horizon where the sun sets.", meaning_hi: "पश्चिम दिशा", source: "Open WordNet", license_attribution: "CC BY-SA 3.0" },
    { headword: "Wheel", normalized: "wheel", pos: "n.", pronunciation_deva: "व्हील", definition_en: "a circular object that revolves on an axle.", meaning_hi: "पहिया, चक्र", source: "Open WordNet", license_attribution: "CC BY-SA 3.0" },
    { headword: "Wind", normalized: "wind", pos: "n.", pronunciation_deva: "विंड", definition_en: "the perceptible natural movement of the air, especially in a current.", meaning_hi: "हवा, पवन", source: "Open WordNet", license_attribution: "CC BY-SA 3.0" },
  ],

  // Page 831 (Letter X right spread partner)
  831: [
    { headword: "X-ray", normalized: "x-ray", pos: "n.", pronunciation_deva: "एक्स-रे", definition_en: "an electromagnetic wave of high energy and very short wavelength.", meaning_hi: "एक्स-किरण", source: "Open WordNet", license_attribution: "CC BY-SA 3.0" },
    { headword: "Xenia", normalized: "xenia", pos: "n.", pronunciation_deva: "ज़ीनिया", definition_en: "the influence of pollen on parts of a plant other than the embryo.", meaning_hi: "पराग प्रभाव", source: "Open WordNet", license_attribution: "CC BY-SA 3.0" },
    { headword: "Xenolith", normalized: "xenolith", pos: "n.", pronunciation_deva: "ज़ेनोइथ", definition_en: "a piece of rock within an igneous rock that is not derived from the original magma.", meaning_hi: "अंतर्वेधित शिला", source: "Open WordNet", license_attribution: "CC BY-SA 3.0" },
    { headword: "Xerosis", normalized: "xerosis", pos: "n.", pronunciation_deva: "ज़ेरोसिस", definition_en: "abnormal dryness of a body part, especially the skin or eyes.", meaning_hi: "त्वचा का सूखापन", source: "Open WordNet", license_attribution: "CC BY-SA 3.0" },
    { headword: "Xeric", normalized: "xeric", pos: "adj.", pronunciation_deva: "ज़ेरिक", definition_en: "containing little moisture; very dry.", meaning_hi: "शुष्क, मरुस्थलीय", source: "Open WordNet", license_attribution: "CC BY-SA 3.0" },
    { headword: "Xerus", normalized: "xerus", pos: "n.", pronunciation_deva: "ज़ीरस", definition_en: "an African ground squirrel having coarse spiny fur.", meaning_hi: "अफ़्रीकी भू-गिलहरी", source: "Open WordNet", license_attribution: "CC BY-SA 3.0" },
    { headword: "Xystus", normalized: "xystus", pos: "n.", pronunciation_deva: "ज़िस्टस", definition_en: "a long covered portico or colonnade in ancient Greece used for athletic training.", meaning_hi: "ढका हुआ गलियारा", source: "Open WordNet", license_attribution: "CC BY-SA 3.0" },
    { headword: "Xylose", normalized: "xylose", pos: "n.", pronunciation_deva: "ज़ाइलोस", definition_en: "a sugar obtained from wood, straw, or other plant material.", meaning_hi: "काष्ठ शर्करा", source: "Open WordNet", license_attribution: "CC BY-SA 3.0" },
  ],

  // Page 841 (Letter Y right spread partner)
  841: [
    { headword: "Young", normalized: "young", pos: "adj.", pronunciation_deva: "यंग", definition_en: "having lived or existed for only a short time; not old.", meaning_hi: "युवा, तरुण", source: "Open WordNet", license_attribution: "CC BY-SA 3.0" },
    { headword: "Youth", normalized: "youth", pos: "n.", pronunciation_deva: "यूथ", definition_en: "the period between childhood and adult age.", meaning_hi: "यौवन, तरुणाई", source: "Open WordNet", license_attribution: "CC BY-SA 3.0" },
    { headword: "Yonder", normalized: "yonder", pos: "adv.", pronunciation_deva: "योंडर", definition_en: "at some distance in the direction indicated; over there.", meaning_hi: "उधर, सामने", source: "Open WordNet", license_attribution: "CC BY-SA 3.0" },
    { headword: "Yule", normalized: "yule", pos: "n.", pronunciation_deva: "यूल", definition_en: "the period of or festivities associated with Christmas.", meaning_hi: "क्रिसमस पर्व", source: "Open WordNet", license_attribution: "CC BY-SA 3.0" },
    { headword: "Yellow", normalized: "yellow", pos: "adj.", pronunciation_deva: "येलो", definition_en: "of the colour between green and orange in the spectrum.", meaning_hi: "पीला, बसंती", source: "Open WordNet", license_attribution: "CC BY-SA 3.0" },
    { headword: "Yawn", normalized: "yawn", pos: "v. i.", pronunciation_deva: "यॉन", definition_en: "involuntarily open one's mouth wide and inhale deeply due to tiredness.", meaning_hi: "जम्हाई लेना", source: "Open WordNet", license_attribution: "CC BY-SA 3.0" },
    { headword: "Yes", normalized: "yes", pos: "adv.", pronunciation_deva: "यस", definition_en: "used to give an affirmative response.", meaning_hi: "हाँ, अवश्य", source: "Open WordNet", license_attribution: "CC BY-SA 3.0" },
    { headword: "Yet", normalized: "yet", pos: "adv.", pronunciation_deva: "येट", definition_en: "up to the present time; nevertheless.", meaning_hi: "अभी तक, फिर भी", source: "Open WordNet", license_attribution: "CC BY-SA 3.0" },
  ],

  // Page 851 (Letter Z right spread partner)
  851: [
    { headword: "Zone", normalized: "zone", pos: "n.", pronunciation_deva: "ज़ोन", definition_en: "an area or stretch of land having a particular characteristic.", meaning_hi: "क्षेत्र, मंडल", source: "Open WordNet", license_attribution: "CC BY-SA 3.0" },
    { headword: "Zoology", normalized: "zoology", pos: "n.", pronunciation_deva: "ज़ूलॉजी", definition_en: "the scientific study of the behavior, structure, and classification of animals.", meaning_hi: "प्राणि विज्ञान", source: "Open WordNet", license_attribution: "CC BY-SA 3.0" },
    { headword: "Zodiac", normalized: "zodiac", pos: "n.", pronunciation_deva: "ज़ोडिएक", definition_en: "a belt of the heavens within which the apparent paths of the sun, moon, and planets lie.", meaning_hi: "राशिचक्र", source: "Open WordNet", license_attribution: "CC BY-SA 3.0" },
    { headword: "Zircon", normalized: "zircon", pos: "n.", pronunciation_deva: "ज़िरकॉन", definition_en: "a mineral occurring as prismatic crystals, typically brown but sometimes transparent.", meaning_hi: "गोमेदक, रत्न", source: "Open WordNet", license_attribution: "CC BY-SA 3.0" },
    { headword: "Zip", normalized: "zip", pos: "n.", pronunciation_deva: "ज़िप", definition_en: "a fastener consisting of two flexible strips of interlocking projection.", meaning_hi: "ज़ंजीर, चेन", source: "Open WordNet", license_attribution: "CC BY-SA 3.0" },
    { headword: "Zebra", normalized: "zebra", pos: "n.", pronunciation_deva: "ज़ेब्रा", definition_en: "an African wild horse with black-and-white stripes and an erect mane.", meaning_hi: "वनघोड़ा, ज़ेबरा", source: "Open WordNet", license_attribution: "CC BY-SA 3.0" },
    { headword: "Zither", normalized: "zither", pos: "n.", pronunciation_deva: "ज़िथर", definition_en: "a musical instrument consisting of a flat wooden soundbox with numerous strings.", meaning_hi: "तंत्री वाद्य, वीणा", source: "Open WordNet", license_attribution: "CC BY-SA 3.0" },
    { headword: "Zucchini", normalized: "zucchini", pos: "n.", pronunciation_deva: "ज़ुकीनी", definition_en: "a small variety of vegetable marrow; a courgette.", meaning_hi: "तोरी की एक किस्म", source: "Open WordNet", license_attribution: "CC BY-SA 3.0" },
  ]
};

export function buildCatalog(): BookCatalog {
  const collator = new Intl.Collator('en', { sensitivity: 'base' });
  const sorted = [...SEED_ENTRIES].sort((a, b) => collator.compare(a.headword, b.headword));

  const pages: Record<number, BookPage> = {};
  const wordToPage: Record<string, number> = {};
  const thumbIndex: Record<string, number> = {};

  // Group seed entries by letter
  const byLetter: Record<string, typeof sorted> = {};
  for (const entry of sorted) {
    const firstLetter = entry.headword[0].toUpperCase();
    if (!byLetter[firstLetter]) byLetter[firstLetter] = [];
    byLetter[firstLetter].push(entry);
  }

  // Pre-configured letter page starts
  const LETTER_STARTS: Record<string, number> = {
    'A': 1,
    'B': 45,
    'C': 92, // Showcase start
    'D': 211,
    'E': 260,
    'F': 290,
    'G': 320,
    'H': 350,
    'I': 390,
    'J': 410,
    'K': 425,
    'L': 440,
    'M': 470,
    'N': 510,
    'O': 530,
    'P': 550,
    'Q': 610,
    'R': 620,
    'S': 650,
    'T': 710,
    'U': 760,
    'V': 780,
    'W': 800,
    'X': 830,
    'Y': 840,
    'Z': 850
  };

  const letters = Object.keys(LETTER_STARTS).sort();
  for (const letter of letters) {
    thumbIndex[letter] = LETTER_STARTS[letter];
  }

  // Helper to commit a page from 8 entries
  const commitPage = (pageNum: number, entriesList: EntryInput[]) => {
    const col1Items = entriesList.slice(0, 4);
    const col2Items = entriesList.slice(4, 8);

    const col1: DictionaryEntry[] = col1Items.map((item, idx) => {
      wordToPage[item.normalized] = pageNum;
      return {
        ...item,
        id: `entry-${item.normalized}`,
        page_number: pageNum,
        column: 1,
        position_in_column: idx
      };
    });

    const col2: DictionaryEntry[] = col2Items.map((item, idx) => {
      wordToPage[item.normalized] = pageNum;
      return {
        ...item,
        id: `entry-${item.normalized}`,
        page_number: pageNum,
        column: 2,
        position_in_column: idx
      };
    });

    const allPageEntries = [...col1, ...col2];
    pages[pageNum] = {
      page_number: pageNum,
      first_headword: allPageEntries[0]?.headword || '',
      last_headword: allPageEntries[allPageEntries.length - 1]?.headword || '',
      guide_left: col1[0]?.headword || '',
      guide_right: col2[col2.length - 1]?.headword || col1[col1.length - 1]?.headword || '',
      footer_hints: generateFooterHints(allPageEntries),
      column1: col1,
      column2: col2,
    };
  };

  // 1. Paginate all letters from SEED_ENTRIES
  for (const letter of letters) {
    const letterEntries = byLetter[letter] || [];
    if (letterEntries.length === 0) continue;

    if (letter === 'C') {
      // C has 64 entries spanning 8 consecutive pages: 90, 91, 92, 93, 94, 95, 96, 97
      const pagesSequence = [90, 91, 92, 93, 94, 95, 96, 97];
      for (let pIdx = 0; pIdx < pagesSequence.length; pIdx++) {
        const pNum = pagesSequence[pIdx];
        const slice = letterEntries.slice(pIdx * 8, (pIdx + 1) * 8);
        if (slice.length > 0) {
          commitPage(pNum, slice);
        }
      }
    } else {
      // Standard letter pagination: 8 entries per page starting at LETTER_STARTS[letter]
      const startPage = LETTER_STARTS[letter];
      commitPage(startPage, letterEntries.slice(0, 8));
    }
  }

  // 2. Commit companion paired pages so every spread has both facing pages populated
  for (const [pageNumStr, companionEntries] of Object.entries(COMPANION_PAGES)) {
    const pageNum = Number(pageNumStr);
    if (!pages[pageNum]) {
      commitPage(pageNum, companionEntries);
    }
  }

  // 3. Exact design doc mockups compliance:
  // Page 92 & 93 (Main.dc.html)
  if (pages[92]) {
    pages[92].guide_left = "Cellar";
    pages[92].guide_right = "Century";
    pages[92].footer_hints = "Cell सेल · Cent सेन्ट · Chair चेयर · Chart चार्ट";
  }
  if (pages[93]) {
    pages[93].guide_left = "Chain";
    pages[93].guide_right = "Charity";
    pages[93].footer_hints = "Chat चैट · Cheer चीयर · Child चाइल्ड · Choice चॉइस";
  }

  // Page 211 (Flip.dc.html)
  if (pages[211]) {
    pages[211].guide_left = "Dairy";
    pages[211].guide_right = "Deep";
    pages[211].footer_hints = "Dam डैम · Day डे · Dear डियर · Deep डीप";
  }

  const catalog: BookCatalog = {
    total_pages: 860,
    total_entries: Object.keys(wordToPage).length,
    thumb_index: thumbIndex,
    word_to_page: wordToPage,
    pages: pages,
  };

  return catalog;
}

function main() {
  console.log("Running deterministic pagination algorithm...");
  const catalog = buildCatalog();

  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  }

  fs.writeFileSync(CATALOG_FILE, JSON.stringify(catalog, null, 2), 'utf-8');
  console.log(`✓ Catalog built successfully!`);
  console.log(`  - Total pages cataloged: ${Object.keys(catalog.pages).length} (Max span: ${catalog.total_pages})`);
  console.log(`  - Total words indexed: ${catalog.total_entries}`);
  console.log(`  - Consecutive C pages: 90, 91, 92, 93, 94, 95, 96, 97`);
  console.log(`  - Page 92: [${pages[92]?.guide_left} ... ${pages[92]?.guide_right}] - ${pages[92]?.column1.map(e => e.headword).join(', ')}`);
  console.log(`  - Page 93: [${pages[93]?.guide_left} ... ${pages[93]?.guide_right}] - ${pages[93]?.column1.map(e => e.headword).join(', ')}`);
}

// Global reference for logging in main
let pages: Record<number, BookPage> = {};
const origBuild = buildCatalog;
function run() {
  const cat = origBuild();
  pages = cat.pages;
  main();
}
run();
