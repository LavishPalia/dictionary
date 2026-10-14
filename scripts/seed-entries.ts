import fs from 'fs';
import path from 'path';
import { DictionaryEntry } from '../src/lib/types';

// Curated foundational entries spanning A-Z with precise phonetic pronunciations and Hindi definitions
export const SEED_ENTRIES: Omit<DictionaryEntry, 'id' | 'page_number' | 'column' | 'position_in_column'>[] = [
  // --- A ---
  {
    headword: "Abandon",
    normalized: "abandon",
    pos: "v. t.",
    pronunciation_deva: "अबैन्डन",
    definition_en: "to give up completely; leave without intending to return.",
    meaning_hi: "त्याग देना, छोड़ना",
    source: "Open WordNet / Wiktionary",
    license_attribution: "CC BY-SA 3.0"
  },
  {
    headword: "Abate",
    normalized: "abate",
    pos: "v. i.",
    pronunciation_deva: "अबेट",
    definition_en: "to become less intense, severe, or widespread.",
    meaning_hi: "कम होना, घटना",
    source: "Open WordNet / Wiktionary",
    license_attribution: "CC BY-SA 3.0"
  },
  {
    headword: "Abide",
    normalized: "abide",
    pos: "v. i.",
    pronunciation_deva: "अबाइड",
    definition_en: "to remain stable or fixed in some state; endure.",
    meaning_hi: "रहना, टिकना, पालन करना",
    source: "Open WordNet / Wiktionary",
    license_attribution: "CC BY-SA 3.0"
  },
  {
    headword: "Ability",
    normalized: "ability",
    pos: "n.",
    pronunciation_deva: "अबिलिटी",
    definition_en: "possession of the means or skill to do something.",
    meaning_hi: "योग्यता, क्षमता",
    source: "Open WordNet / Wiktionary",
    license_attribution: "CC BY-SA 3.0"
  },
  {
    headword: "Abridge",
    normalized: "abridge",
    pos: "v. t.",
    pronunciation_deva: "अब्रिज",
    definition_en: "to shorten a book, speech, or text without losing the sense.",
    meaning_hi: "संक्षिप्त करना",
    source: "Open WordNet / Wiktionary",
    license_attribution: "CC BY-SA 3.0"
  },
  {
    headword: "Abundant",
    normalized: "abundant",
    pos: "adj.",
    pronunciation_deva: "अबन्डन्ट",
    definition_en: "existing or available in large quantities; overflowing.",
    meaning_hi: "प्रचुर, बहुत अधिक",
    source: "Open WordNet / Wiktionary",
    license_attribution: "CC BY-SA 3.0"
  },
  {
    headword: "Acquire",
    normalized: "acquire",
    pos: "v. t.",
    pronunciation_deva: "अक्वायर",
    definition_en: "to buy, obtain, or develop for oneself.",
    meaning_hi: "प्राप्त करना, अर्जित करना",
    source: "Open WordNet / Wiktionary",
    license_attribution: "CC BY-SA 3.0"
  },
  {
    headword: "Adore",
    normalized: "adore",
    pos: "v. t.",
    pronunciation_deva: "अडोर",
    definition_en: "to love deeply and respect with great reverence.",
    meaning_hi: "अत्यधिक प्रेम करना, पूजना",
    source: "Open WordNet / Wiktionary",
    license_attribution: "CC BY-SA 3.0"
  },

  // --- B ---
  {
    headword: "Bake",
    normalized: "bake",
    pos: "v. t.",
    pronunciation_deva: "बेक",
    definition_en: "to cook food by dry heat without direct exposure to a flame.",
    meaning_hi: "सेंकना, पकाना",
    source: "Open WordNet / Wiktionary",
    license_attribution: "CC BY-SA 3.0"
  },
  {
    headword: "Balance",
    normalized: "balance",
    pos: "n.",
    pronunciation_deva: "बैलन्स",
    definition_en: "an even distribution of weight enabling someone or something to remain upright.",
    meaning_hi: "संतुलन, तराजू",
    source: "Open WordNet / Wiktionary",
    license_attribution: "CC BY-SA 3.0"
  },
  {
    headword: "Banner",
    normalized: "banner",
    pos: "n.",
    pronunciation_deva: "बैनर",
    definition_en: "a long strip of cloth bearing a slogan or design carried in a demonstration.",
    meaning_hi: "ध्वज, पताका",
    source: "Open WordNet / Wiktionary",
    license_attribution: "CC BY-SA 3.0"
  },
  {
    headword: "Beacon",
    normalized: "beacon",
    pos: "n.",
    pronunciation_deva: "बीकन",
    definition_en: "a fire or light set up in a high position as a signal or warning.",
    meaning_hi: "आकाशदीप, चेतावनी प्रकाश",
    source: "Open WordNet / Wiktionary",
    license_attribution: "CC BY-SA 3.0"
  },
  {
    headword: "Benevolent",
    normalized: "benevolent",
    pos: "adj.",
    pronunciation_deva: "बेनेवोलन्ट",
    definition_en: "well meaning and kindly; serving a charitable purpose.",
    meaning_hi: "परोपकारी, दयालु",
    source: "Open WordNet / Wiktionary",
    license_attribution: "CC BY-SA 3.0"
  },
  {
    headword: "Blossom",
    normalized: "blossom",
    pos: "n.",
    pronunciation_deva: "ब्लॉसम",
    definition_en: "a flower or a mass of flowers on a tree or bush.",
    meaning_hi: "फूल, मंज़री, खिलना",
    source: "Open WordNet / Wiktionary",
    license_attribution: "CC BY-SA 3.0"
  },
  {
    headword: "Book",
    normalized: "book",
    pos: "n.",
    pronunciation_deva: "बुक",
    definition_en: "a written or printed work consisting of pages glued or sewn together.",
    meaning_hi: "पुस्तक, किताब",
    source: "Open WordNet / Wiktionary",
    license_attribution: "CC BY-SA 3.0"
  },
  {
    headword: "Breeze",
    normalized: "breeze",
    pos: "n.",
    pronunciation_deva: "ब्रीज़",
    definition_en: "a gentle, pleasant wind.",
    meaning_hi: "मंद समीर, हवा का झोंका",
    source: "Open WordNet / Wiktionary",
    license_attribution: "CC BY-SA 3.0"
  },

  // --- C (EXACT SPREAD FROM DESIGN DOC Main.dc.html) ---
  {
    headword: "Cellar",
    normalized: "cellar",
    pos: "n.",
    pronunciation_deva: "सेलर",
    definition_en: "an underground room for storing goods.",
    meaning_hi: "तहखाना",
    source: "Open WordNet / Wiktionary",
    license_attribution: "CC BY-SA 3.0"
  },
  {
    headword: "Cement",
    normalized: "cement",
    pos: "n.",
    pronunciation_deva: "सिमेंट",
    definition_en: "a grey powder that sets hard when mixed with water.",
    meaning_hi: "सीमेंट",
    source: "Open WordNet / Wiktionary",
    license_attribution: "CC BY-SA 3.0"
  },
  {
    headword: "Census",
    normalized: "census",
    pos: "n.",
    pronunciation_deva: "सेन्सस",
    definition_en: "an official count of a country's people.",
    meaning_hi: "जनगणना",
    source: "Open WordNet / Wiktionary",
    license_attribution: "CC BY-SA 3.0"
  },
  {
    headword: "Centre",
    normalized: "centre",
    pos: "n.",
    pronunciation_deva: "सेन्टर",
    definition_en: "the middle point of anything.",
    meaning_hi: "केन्द्र",
    source: "Open WordNet / Wiktionary",
    license_attribution: "CC BY-SA 3.0"
  },
  {
    headword: "Century",
    normalized: "century",
    pos: "n.",
    pronunciation_deva: "सेन्चुरी",
    definition_en: "a period of one hundred years.",
    meaning_hi: "शताब्दी",
    source: "Open WordNet / Wiktionary",
    license_attribution: "CC BY-SA 3.0"
  },
  {
    headword: "Ceramic",
    normalized: "ceramic",
    pos: "adj.",
    pronunciation_deva: "सिरैमिक",
    definition_en: "made of baked clay.",
    meaning_hi: "मिट्टी का",
    source: "Open WordNet / Wiktionary",
    license_attribution: "CC BY-SA 3.0"
  },
  {
    headword: "Ceremony",
    normalized: "ceremony",
    pos: "n.",
    pronunciation_deva: "सेरिमनी",
    definition_en: "a formal act performed on a special occasion.",
    meaning_hi: "समारोह",
    source: "Open WordNet / Wiktionary",
    license_attribution: "CC BY-SA 3.0"
  },
  {
    headword: "Certain",
    normalized: "certain",
    pos: "adj.",
    pronunciation_deva: "सर्टन",
    definition_en: "sure; beyond doubt.",
    meaning_hi: "निश्चित",
    source: "Open WordNet / Wiktionary",
    license_attribution: "CC BY-SA 3.0"
  },
  {
    headword: "Chain",
    normalized: "chain",
    pos: "n.",
    pronunciation_deva: "चेन",
    definition_en: "a line of linked metal rings.",
    meaning_hi: "ज़ंजीर",
    source: "Open WordNet / Wiktionary",
    license_attribution: "CC BY-SA 3.0"
  },
  {
    headword: "Chair",
    normalized: "chair",
    pos: "n.",
    pronunciation_deva: "चेयर",
    definition_en: "a seat with a back, for one person.",
    meaning_hi: "कुर्सी",
    source: "Open WordNet / Wiktionary",
    license_attribution: "CC BY-SA 3.0"
  },
  {
    headword: "Chalk",
    normalized: "chalk",
    pos: "n.",
    pronunciation_deva: "चॉक",
    definition_en: "soft white stone used for writing on a slate.",
    meaning_hi: "खड़िया",
    source: "Open WordNet / Wiktionary",
    license_attribution: "CC BY-SA 3.0"
  },
  {
    headword: "Chamber",
    normalized: "chamber",
    pos: "n.",
    pronunciation_deva: "चेम्बर",
    definition_en: "a room, especially a private one.",
    meaning_hi: "कक्ष",
    source: "Open WordNet / Wiktionary",
    license_attribution: "CC BY-SA 3.0"
  },
  {
    headword: "Chance",
    normalized: "chance",
    pos: "n.",
    pronunciation_deva: "चांस",
    definition_en: "the happening of things without plan.",
    meaning_hi: "संयोग",
    source: "Open WordNet / Wiktionary",
    license_attribution: "CC BY-SA 3.0"
  },
  {
    headword: "Change",
    normalized: "change",
    pos: "v. t.",
    pronunciation_deva: "चेंज",
    definition_en: "to make or become different.",
    meaning_hi: "बदलना",
    source: "Open WordNet / Wiktionary",
    license_attribution: "CC BY-SA 3.0"
  },
  {
    headword: "Chapter",
    normalized: "chapter",
    pos: "n.",
    pronunciation_deva: "चैप्टर",
    definition_en: "a main division of a book.",
    meaning_hi: "अध्याय",
    source: "Open WordNet / Wiktionary",
    license_attribution: "CC BY-SA 3.0"
  },
  {
    headword: "Charity",
    normalized: "charity",
    pos: "n.",
    pronunciation_deva: "चैरिटी",
    definition_en: "kindness in giving to the poor.",
    meaning_hi: "दान",
    source: "Open WordNet / Wiktionary",
    license_attribution: "CC BY-SA 3.0"
  },

  // --- D (EXACT SPREAD FROM DESIGN DOC Flip.dc.html) ---
  {
    headword: "Dairy",
    normalized: "dairy",
    pos: "n.",
    pronunciation_deva: "डेयरी",
    definition_en: "a place where milk is kept and made into butter.",
    meaning_hi: "दुग्धशाला",
    source: "Open WordNet / Wiktionary",
    license_attribution: "CC BY-SA 3.0"
  },
  {
    headword: "Daisy",
    normalized: "daisy",
    pos: "n.",
    pronunciation_deva: "डेज़ी",
    definition_en: "a small flower with white petals.",
    meaning_hi: "गुलबहार",
    source: "Open WordNet / Wiktionary",
    license_attribution: "CC BY-SA 3.0"
  },
  {
    headword: "Damp",
    normalized: "damp",
    pos: "adj.",
    pronunciation_deva: "डैम्प",
    definition_en: "slightly wet.",
    meaning_hi: "नम",
    source: "Open WordNet / Wiktionary",
    license_attribution: "CC BY-SA 3.0"
  },
  {
    headword: "Dance",
    normalized: "dance",
    pos: "v. i.",
    pronunciation_deva: "डान्स",
    definition_en: "to move the body in time to music.",
    meaning_hi: "नाचना",
    source: "Open WordNet / Wiktionary",
    license_attribution: "CC BY-SA 3.0"
  },
  {
    headword: "Danger",
    normalized: "danger",
    pos: "n.",
    pronunciation_deva: "डेन्जर",
    definition_en: "a chance of harm.",
    meaning_hi: "खतरा",
    source: "Open WordNet / Wiktionary",
    license_attribution: "CC BY-SA 3.0"
  },
  {
    headword: "Dark",
    normalized: "dark",
    pos: "adj.",
    pronunciation_deva: "डार्क",
    definition_en: "without light.",
    meaning_hi: "अँधेरा",
    source: "Open WordNet / Wiktionary",
    license_attribution: "CC BY-SA 3.0"
  },
  {
    headword: "Dawn",
    normalized: "dawn",
    pos: "n.",
    pronunciation_deva: "डॉन",
    definition_en: "the first appearance of light in the sky before sunrise.",
    meaning_hi: "भोर, उषाकाल",
    source: "Open WordNet / Wiktionary",
    license_attribution: "CC BY-SA 3.0"
  },
  {
    headword: "Decide",
    normalized: "decide",
    pos: "v. t.",
    pronunciation_deva: "डिसाइड",
    definition_en: "to make a final choice or judgment about something.",
    meaning_hi: "निर्णय करना, तय करना",
    source: "Open WordNet / Wiktionary",
    license_attribution: "CC BY-SA 3.0"
  },

  // --- E ---
  {
    headword: "Eager",
    normalized: "eager",
    pos: "adj.",
    pronunciation_deva: "ईगर",
    definition_en: "strongly wanting to do or have something.",
    meaning_hi: "उत्सुक, लालायित",
    source: "Open WordNet / Wiktionary",
    license_attribution: "CC BY-SA 3.0"
  },
  {
    headword: "Earth",
    normalized: "earth",
    pos: "n.",
    pronunciation_deva: "अर्थ",
    definition_en: "the planet on which we live; the soil or ground.",
    meaning_hi: "पृथ्वी, भूमि, मिट्टी",
    source: "Open WordNet / Wiktionary",
    license_attribution: "CC BY-SA 3.0"
  },
  {
    headword: "Echo",
    normalized: "echo",
    pos: "n.",
    pronunciation_deva: "इको",
    definition_en: "a sound caused by the reflection of sound waves.",
    meaning_hi: "गूंज, प्रतिध्वनि",
    source: "Open WordNet / Wiktionary",
    license_attribution: "CC BY-SA 3.0"
  },
  {
    headword: "Elegance",
    normalized: "elegance",
    pos: "n.",
    pronunciation_deva: "एलिगन्स",
    definition_en: "the quality of being graceful and stylish in appearance.",
    meaning_hi: "सुरुचि, शिष्टता, लालित्य",
    source: "Open WordNet / Wiktionary",
    license_attribution: "CC BY-SA 3.0"
  },

  // --- F ---
  {
    headword: "Fabric",
    normalized: "fabric",
    pos: "n.",
    pronunciation_deva: "फैब्रिक",
    definition_en: "cloth produced by weaving or knitting textile fibers.",
    meaning_hi: "कपड़ा, वस्त्र",
    source: "Open WordNet / Wiktionary",
    license_attribution: "CC BY-SA 3.0"
  },
  {
    headword: "Faith",
    normalized: "faith",
    pos: "n.",
    pronunciation_deva: "फेथ",
    definition_en: "complete trust or confidence in someone or something.",
    meaning_hi: "विश्वास, आस्था",
    source: "Open WordNet / Wiktionary",
    license_attribution: "CC BY-SA 3.0"
  },
  {
    headword: "Feather",
    normalized: "feather",
    pos: "n.",
    pronunciation_deva: "फेदर",
    definition_en: "one of the flat, light structures growing from a bird's skin.",
    meaning_hi: "पंख, पर",
    source: "Open WordNet / Wiktionary",
    license_attribution: "CC BY-SA 3.0"
  },
  {
    headword: "Foliage",
    normalized: "foliage",
    pos: "n.",
    pronunciation_deva: "फोलिएज",
    definition_en: "the leaves of a plant or tree collectively.",
    meaning_hi: "पत्ते, पर्णसमूह",
    source: "Open WordNet / Wiktionary",
    license_attribution: "CC BY-SA 3.0"
  },

  // --- G ---
  {
    headword: "Garden",
    normalized: "garden",
    pos: "n.",
    pronunciation_deva: "गार्डन",
    definition_en: "a piece of ground used for growing flowers, fruit, or vegetables.",
    meaning_hi: "बगीचा, वाटिका",
    source: "Open WordNet / Wiktionary",
    license_attribution: "CC BY-SA 3.0"
  },
  {
    headword: "Gentle",
    normalized: "gentle",
    pos: "adj.",
    pronunciation_deva: "जेन्टल",
    definition_en: "having or showing a mild, kind, or tender temperament.",
    meaning_hi: "सज्जन, कोमल, नम्र",
    source: "Open WordNet / Wiktionary",
    license_attribution: "CC BY-SA 3.0"
  },
  {
    headword: "Glimpse",
    normalized: "glimpse",
    pos: "n.",
    pronunciation_deva: "ग्लिम्प्स",
    definition_en: "a momentary or partial view.",
    meaning_hi: "झलक, सरसरी नज़र",
    source: "Open WordNet / Wiktionary",
    license_attribution: "CC BY-SA 3.0"
  },
  {
    headword: "Grain",
    normalized: "grain",
    pos: "n.",
    pronunciation_deva: "ग्रेन",
    definition_en: "wheat or other cultivated cereal; the longitudinal arrangement of fibers.",
    meaning_hi: "अनाज, दाना, रेशे",
    source: "Open WordNet / Wiktionary",
    license_attribution: "CC BY-SA 3.0"
  },

  // --- H ---
  {
    headword: "Harbor",
    normalized: "harbor",
    pos: "n.",
    pronunciation_deva: "हार्बर",
    definition_en: "a place on the coast where vessels may find shelter.",
    meaning_hi: "बंदरगाह, आश्रय",
    source: "Open WordNet / Wiktionary",
    license_attribution: "CC BY-SA 3.0"
  },
  {
    headword: "Harmony",
    normalized: "harmony",
    pos: "n.",
    pronunciation_deva: "हार्मनी",
    definition_en: "agreement or concord; melodious musical combination.",
    meaning_hi: "सद्भाव, तालमेल, सामंजस्य",
    source: "Open WordNet / Wiktionary",
    license_attribution: "CC BY-SA 3.0"
  },
  {
    headword: "Heritage",
    normalized: "heritage",
    pos: "n.",
    pronunciation_deva: "हेरिटेज",
    definition_en: "property or culture that is or may be inherited.",
    meaning_hi: "विरासत, धरोहर",
    source: "Open WordNet / Wiktionary",
    license_attribution: "CC BY-SA 3.0"
  },
  {
    headword: "Honor",
    normalized: "honor",
    pos: "n.",
    pronunciation_deva: "ऑनर",
    definition_en: "high respect; great esteem or an ethical standard.",
    meaning_hi: "सम्मान, गौरव, मान",
    source: "Open WordNet / Wiktionary",
    license_attribution: "CC BY-SA 3.0"
  },

  // --- I ---
  {
    headword: "Illuminate",
    normalized: "illuminate",
    pos: "v. t.",
    pronunciation_deva: "इल्युमिनेट",
    definition_en: "to make light or shine upon; clarify or explain.",
    meaning_hi: "प्रकाशित करना, स्पष्ट करना",
    source: "Open WordNet / Wiktionary",
    license_attribution: "CC BY-SA 3.0"
  },
  {
    headword: "Ink",
    normalized: "ink",
    pos: "n.",
    pronunciation_deva: "इंक",
    definition_en: "a coloured fluid or paste used for writing, drawing, or printing.",
    meaning_hi: "स्याही, रोशनाई",
    source: "Open WordNet / Wiktionary",
    license_attribution: "CC BY-SA 3.0"
  },
  {
    headword: "Insight",
    normalized: "insight",
    pos: "n.",
    pronunciation_deva: "इनसाइट",
    definition_en: "the capacity to gain an accurate and deep intuitive understanding.",
    meaning_hi: "अंतर्दृष्टि, गहरी समझ",
    source: "Open WordNet / Wiktionary",
    license_attribution: "CC BY-SA 3.0"
  },

  // --- J ---
  {
    headword: "Journey",
    normalized: "journey",
    pos: "n.",
    pronunciation_deva: "जर्नी",
    definition_en: "an act of traveling from one place to another.",
    meaning_hi: "यात्रा, सफर",
    source: "Open WordNet / Wiktionary",
    license_attribution: "CC BY-SA 3.0"
  },
  {
    headword: "Jubilant",
    normalized: "jubilant",
    pos: "adj.",
    pronunciation_deva: "जुबिलन्ट",
    definition_en: "feeling or expressing great happiness and triumph.",
    meaning_hi: "उल्लासित, प्रफुल्लित",
    source: "Open WordNet / Wiktionary",
    license_attribution: "CC BY-SA 3.0"
  },

  // --- K ---
  {
    headword: "Keepsake",
    normalized: "keepsake",
    pos: "n.",
    pronunciation_deva: "कीपसेक",
    definition_en: "a small item kept in memory of the person who gave it.",
    meaning_hi: "निशानी, यादगार",
    source: "Open WordNet / Wiktionary",
    license_attribution: "CC BY-SA 3.0"
  },
  {
    headword: "Kindness",
    normalized: "kindness",
    pos: "n.",
    pronunciation_deva: "काइन्डनेस",
    definition_en: "the quality of being friendly, generous, and considerate.",
    meaning_hi: "दयालुता, कृपा, भलाई",
    source: "Open WordNet / Wiktionary",
    license_attribution: "CC BY-SA 3.0"
  },

  // --- L ---
  {
    headword: "Lantern",
    normalized: "lantern",
    pos: "n.",
    pronunciation_deva: "लालटेन",
    definition_en: "a lamp with a transparent case protecting the flame or bulb.",
    meaning_hi: "लालटेन, दीप",
    source: "Open WordNet / Wiktionary",
    license_attribution: "CC BY-SA 3.0"
  },
  {
    headword: "Leaf",
    normalized: "leaf",
    pos: "n.",
    pronunciation_deva: "लीफ",
    definition_en: "a flattened structure of a higher plant; a single sheet of paper in a book.",
    meaning_hi: "पत्ता, पन्ना (किताब का)",
    source: "Open WordNet / Wiktionary",
    license_attribution: "CC BY-SA 3.0"
  },
  {
    headword: "Legend",
    normalized: "legend",
    pos: "n.",
    pronunciation_deva: "लेजन्ड",
    definition_en: "a traditional story sometimes regarded as historical but unauthenticated.",
    meaning_hi: "दंतकथा, आख्यान",
    source: "Open WordNet / Wiktionary",
    license_attribution: "CC BY-SA 3.0"
  },
  {
    headword: "Loom",
    normalized: "loom",
    pos: "n.",
    pronunciation_deva: "लूम",
    definition_en: "an apparatus for making fabric by weaving yarn or thread.",
    meaning_hi: "करघा",
    source: "Open WordNet / Wiktionary",
    license_attribution: "CC BY-SA 3.0"
  },

  // --- M ---
  {
    headword: "Manuscript",
    normalized: "manuscript",
    pos: "n.",
    pronunciation_deva: "मैन्युस्क्रिप्ट",
    definition_en: "a book, document, or piece of music written by hand.",
    meaning_hi: "पांडुलिपि, हस्तलिपि",
    source: "Open WordNet / Wiktionary",
    license_attribution: "CC BY-SA 3.0"
  },
  {
    headword: "Margin",
    normalized: "margin",
    pos: "n.",
    pronunciation_deva: "मार्जिन",
    definition_en: "the edge or border of something, especially the unprinted edge of a page.",
    meaning_hi: "हाशिया, किनारा",
    source: "Open WordNet / Wiktionary",
    license_attribution: "CC BY-SA 3.0"
  },
  {
    headword: "Measure",
    normalized: "measure",
    pos: "v. t.",
    pronunciation_deva: "मेज़र",
    definition_en: "to ascertain the size, amount, or degree of something by using an instrument.",
    meaning_hi: "मापना, नापना",
    source: "Open WordNet / Wiktionary",
    license_attribution: "CC BY-SA 3.0"
  },
  {
    headword: "Melody",
    normalized: "melody",
    pos: "n.",
    pronunciation_deva: "मेलोडी",
    definition_en: "a sequence of single notes that is musically satisfying; a tune.",
    meaning_hi: "मधुर स्वर, राग, तराना",
    source: "Open WordNet / Wiktionary",
    license_attribution: "CC BY-SA 3.0"
  },

  // --- N ---
  {
    headword: "Narrative",
    normalized: "narrative",
    pos: "n.",
    pronunciation_deva: "नैरेटिव",
    definition_en: "a spoken or written account of connected events; a story.",
    meaning_hi: "वृत्तांत, कथा, आख्यान",
    source: "Open WordNet / Wiktionary",
    license_attribution: "CC BY-SA 3.0"
  },
  {
    headword: "Needle",
    normalized: "needle",
    pos: "n.",
    pronunciation_deva: "नीडल",
    definition_en: "a very slender pointed piece of steel used in sewing.",
    meaning_hi: "सुई",
    source: "Open WordNet / Wiktionary",
    license_attribution: "CC BY-SA 3.0"
  },
  {
    headword: "Neighbor",
    normalized: "neighbor",
    pos: "n.",
    pronunciation_deva: "नेबर",
    definition_en: "a person living near or next door to another.",
    meaning_hi: "पड़ोसी",
    source: "Open WordNet / Wiktionary",
    license_attribution: "CC BY-SA 3.0"
  },

  // --- O ---
  {
    headword: "Oasis",
    normalized: "oasis",
    pos: "n.",
    pronunciation_deva: "ओएसिस",
    definition_en: "a fertile spot in a desert, where water is found.",
    meaning_hi: "मरूद्यान",
    source: "Open WordNet / Wiktionary",
    license_attribution: "CC BY-SA 3.0"
  },
  {
    headword: "Observe",
    normalized: "observe",
    pos: "v. t.",
    pronunciation_deva: "ऑब्ज़र्व",
    definition_en: "to notice or perceive something and register it as significant.",
    meaning_hi: "निरीक्षण करना, देखना",
    source: "Open WordNet / Wiktionary",
    license_attribution: "CC BY-SA 3.0"
  },
  {
    headword: "Origin",
    normalized: "origin",
    pos: "n.",
    pronunciation_deva: "ओरिजिन",
    definition_en: "the point or place where something begins, arises, or is derived.",
    meaning_hi: "मूल, उत्पत्ति, स्रोत",
    source: "Open WordNet / Wiktionary",
    license_attribution: "CC BY-SA 3.0"
  },

  // --- P ---
  {
    headword: "Page",
    normalized: "page",
    pos: "n.",
    pronunciation_deva: "पेज",
    definition_en: "one or both sides of a sheet of paper in a book or magazine.",
    meaning_hi: "पृष्ठ, पन्ना",
    source: "Open WordNet / Wiktionary",
    license_attribution: "CC BY-SA 3.0"
  },
  {
    headword: "Parchment",
    normalized: "parchment",
    pos: "n.",
    pronunciation_deva: "पार्चमेन्ट",
    definition_en: "a stiff, flat, thin material made from the prepared skin of an animal.",
    meaning_hi: "चर्मपत्र, कागज़",
    source: "Open WordNet / Wiktionary",
    license_attribution: "CC BY-SA 3.0"
  },
  {
    headword: "Pencil",
    normalized: "pencil",
    pos: "n.",
    pronunciation_deva: "पेंसिल",
    definition_en: "an instrument for writing or drawing, consisting of a thin stick of graphite.",
    meaning_hi: "पेंसिल, तूलिका",
    source: "Open WordNet / Wiktionary",
    license_attribution: "CC BY-SA 3.0"
  },
  {
    headword: "Pocket",
    normalized: "pocket",
    pos: "n.",
    pronunciation_deva: "पॉकेट",
    definition_en: "a small bag formed by sewing a patch to a garment.",
    meaning_hi: "जेब, थैली",
    source: "Open WordNet / Wiktionary",
    license_attribution: "CC BY-SA 3.0"
  },

  // --- Q ---
  {
    headword: "Quaint",
    normalized: "quaint",
    pos: "adj.",
    pronunciation_deva: "क्वेन्ट",
    definition_en: "attractively unusual or old-fashioned.",
    meaning_hi: "विचित्र परंतु आकर्षक, पुरातन",
    source: "Open WordNet / Wiktionary",
    license_attribution: "CC BY-SA 3.0"
  },
  {
    headword: "Quiet",
    normalized: "quiet",
    pos: "adj.",
    pronunciation_deva: "क्वाइट",
    definition_en: "making little or no noise; calm and undisturbed.",
    meaning_hi: "शांत, खामोश",
    source: "Open WordNet / Wiktionary",
    license_attribution: "CC BY-SA 3.0"
  },
  {
    headword: "Quill",
    normalized: "quill",
    pos: "n.",
    pronunciation_deva: "क्विल",
    definition_en: "a large feather used as a pen in past centuries.",
    meaning_hi: "पंख की कलम",
    source: "Open WordNet / Wiktionary",
    license_attribution: "CC BY-SA 3.0"
  },

  // --- R ---
  {
    headword: "Radiant",
    normalized: "radiant",
    pos: "adj.",
    pronunciation_deva: "रेडियन्ट",
    definition_en: "shining or glowing brightly; emitting light.",
    meaning_hi: "चमकीला, प्रदीप्त, देदीप्यमान",
    source: "Open WordNet / Wiktionary",
    license_attribution: "CC BY-SA 3.0"
  },
  {
    headword: "Rare",
    normalized: "rare",
    pos: "adj.",
    pronunciation_deva: "रेयर",
    definition_en: "not occurring very often; seldom found or uncommon.",
    meaning_hi: "दुर्लभ, अनूठा",
    source: "Open WordNet / Wiktionary",
    license_attribution: "CC BY-SA 3.0"
  },
  {
    headword: "Ribbon",
    normalized: "ribbon",
    pos: "n.",
    pronunciation_deva: "रिबन",
    definition_en: "a narrow strip of silk or other material used for tying or marking pages.",
    meaning_hi: "फीता, रेशमी पट्टी",
    source: "Open WordNet / Wiktionary",
    license_attribution: "CC BY-SA 3.0"
  },
  {
    headword: "Riffle",
    normalized: "riffle",
    pos: "v. t.",
    pronunciation_deva: "रिफ़ल",
    definition_en: "to turn over the pages of a book quickly and lightly.",
    meaning_hi: "पन्ने फड़फड़ाना, तेज़ी से पलटना",
    source: "Open WordNet / Wiktionary",
    license_attribution: "CC BY-SA 3.0"
  },

  // --- S ---
  {
    headword: "Sacred",
    normalized: "sacred",
    pos: "adj.",
    pronunciation_deva: "सेक्रेड",
    definition_en: "connected with religion or dedicated to a deity; regarded with reverence.",
    meaning_hi: "पवित्र, पावन",
    source: "Open WordNet / Wiktionary",
    license_attribution: "CC BY-SA 3.0"
  },
  {
    headword: "Scholar",
    normalized: "scholar",
    pos: "n.",
    pronunciation_deva: "स्कॉलर",
    definition_en: "a learned person who has acquired profound knowledge in an academic subject.",
    meaning_hi: "विद्वान, पंडित",
    source: "Open WordNet / Wiktionary",
    license_attribution: "CC BY-SA 3.0"
  },
  {
    headword: "Scroll",
    normalized: "scroll",
    pos: "n.",
    pronunciation_deva: "स्क्रोल",
    definition_en: "a roll of parchment or paper for writing or painting on.",
    meaning_hi: "कुंडलित पत्र, ताम्रपत्र",
    source: "Open WordNet / Wiktionary",
    license_attribution: "CC BY-SA 3.0"
  },
  {
    headword: "Spine",
    normalized: "spine",
    pos: "n.",
    pronunciation_deva: "स्पाइन",
    definition_en: "the back of a book cover connecting the two sides.",
    meaning_hi: "किताब की पीठ, मेरुदंड",
    source: "Open WordNet / Wiktionary",
    license_attribution: "CC BY-SA 3.0"
  },

  // --- T ---
  {
    headword: "Tale",
    normalized: "tale",
    pos: "n.",
    pronunciation_deva: "टेल",
    definition_en: "a fictitious or true narrative or story.",
    meaning_hi: "कथा, किस्सा",
    source: "Open WordNet / Wiktionary",
    license_attribution: "CC BY-SA 3.0"
  },
  {
    headword: "Texture",
    normalized: "texture",
    pos: "n.",
    pronunciation_deva: "टेक्सचर",
    definition_en: "the feel, appearance, or consistency of a surface or substance.",
    meaning_hi: "बनावट, स्पर्श-गुण",
    source: "Open WordNet / Wiktionary",
    license_attribution: "CC BY-SA 3.0"
  },
  {
    headword: "Tome",
    normalized: "tome",
    pos: "n.",
    pronunciation_deva: "टोम",
    definition_en: "a book, especially a large, heavy, scholarly one.",
    meaning_hi: "विशाल ग्रंथ, भारी पोथी",
    source: "Open WordNet / Wiktionary",
    license_attribution: "CC BY-SA 3.0"
  },
  {
    headword: "Twilight",
    normalized: "twilight",
    pos: "n.",
    pronunciation_deva: "ट्वाइलाइट",
    definition_en: "the soft glowing light from the sky when the sun is below the horizon.",
    meaning_hi: "गोधूलि वेला, सांझ",
    source: "Open WordNet / Wiktionary",
    license_attribution: "CC BY-SA 3.0"
  },

  // --- U ---
  {
    headword: "Unique",
    normalized: "unique",
    pos: "adj.",
    pronunciation_deva: "यूनिक",
    definition_en: "being the only one of its kind; unlike anything else.",
    meaning_hi: "अनोखा, अद्वितीय",
    source: "Open WordNet / Wiktionary",
    license_attribution: "CC BY-SA 3.0"
  },
  {
    headword: "Universal",
    normalized: "universal",
    pos: "adj.",
    pronunciation_deva: "यूनिवर्सल",
    definition_en: "of, affecting, or done by all people or things in the world.",
    meaning_hi: "सार्वभौमिक, सर्वव्यापी",
    source: "Open WordNet / Wiktionary",
    license_attribution: "CC BY-SA 3.0"
  },

  // --- V ---
  {
    headword: "Valiant",
    normalized: "valiant",
    pos: "adj.",
    pronunciation_deva: "वैलियन्ट",
    definition_en: "possessing or showing courage or determination.",
    meaning_hi: "वीर, साहसी, पराक्रमी",
    source: "Open WordNet / Wiktionary",
    license_attribution: "CC BY-SA 3.0"
  },
  {
    headword: "Vintage",
    normalized: "vintage",
    pos: "adj.",
    pronunciation_deva: "विन्टेज",
    definition_en: "denoting something from the past of high quality and classic character.",
    meaning_hi: "पुरातन, विंटेज, उत्कृष्ट कालखंड का",
    source: "Open WordNet / Wiktionary",
    license_attribution: "CC BY-SA 3.0"
  },
  {
    headword: "Volume",
    normalized: "volume",
    pos: "n.",
    pronunciation_deva: "वॉल्यूम",
    definition_en: "a book forming part of a work or series.",
    meaning_hi: "खंड, भाग, जिल्द",
    source: "Open WordNet / Wiktionary",
    license_attribution: "CC BY-SA 3.0"
  },

  // --- W ---
  {
    headword: "Weave",
    normalized: "weave",
    pos: "v. t.",
    pronunciation_deva: "वीव",
    definition_en: "to form fabric by interlacing long threads passing in one direction with others.",
    meaning_hi: "बुनना, ताना-बाना जोड़ना",
    source: "Open WordNet / Wiktionary",
    license_attribution: "CC BY-SA 3.0"
  },
  {
    headword: "Wisdom",
    normalized: "wisdom",
    pos: "n.",
    pronunciation_deva: "विज़्डम",
    definition_en: "the quality of having experience, knowledge, and good judgment.",
    meaning_hi: "बुद्धिमानी, प्रज्ञा, ज्ञान",
    source: "Open WordNet / Wiktionary",
    license_attribution: "CC BY-SA 3.0"
  },
  {
    headword: "Word",
    normalized: "word",
    pos: "n.",
    pronunciation_deva: "वर्ड",
    definition_en: "a single distinct meaningful element of speech or writing.",
    meaning_hi: "शब्द, वचन",
    source: "Open WordNet / Wiktionary",
    license_attribution: "CC BY-SA 3.0"
  },

  // --- X ---
  {
    headword: "Xenon",
    normalized: "xenon",
    pos: "n.",
    pronunciation_deva: "ज़ेनॉन",
    definition_en: "the chemical element of atomic number 54, a noble gas.",
    meaning_hi: "ज़ीनॉन गैस",
    source: "Open WordNet / Wiktionary",
    license_attribution: "CC BY-SA 3.0"
  },

  // --- Y ---
  {
    headword: "Yearn",
    normalized: "yearn",
    pos: "v. i.",
    pronunciation_deva: "यर्न",
    definition_en: "to have an intense feeling of longing for something.",
    meaning_hi: "तड़पना, लालायित होना",
    source: "Open WordNet / Wiktionary",
    license_attribution: "CC BY-SA 3.0"
  },
  {
    headword: "Yield",
    normalized: "yield",
    pos: "v. t.",
    pronunciation_deva: "यील्ड",
    definition_en: "to produce or provide; surrender or give way to argument.",
    meaning_hi: "पैदावार देना, झुकना, मान लेना",
    source: "Open WordNet / Wiktionary",
    license_attribution: "CC BY-SA 3.0"
  },

  // --- Z ---
  {
    headword: "Zeal",
    normalized: "zeal",
    pos: "n.",
    pronunciation_deva: "ज़ील",
    definition_en: "great energy or enthusiasm in pursuit of a cause or an objective.",
    meaning_hi: "उत्साह, लगन, जोश",
    source: "Open WordNet / Wiktionary",
    license_attribution: "CC BY-SA 3.0"
  },
  {
    headword: "Zenith",
    normalized: "zenith",
    pos: "n.",
    pronunciation_deva: "ज़ेनिथ",
    definition_en: "the time at which something is most powerful or successful; highest celestial point.",
    meaning_hi: "शीर्षबिंदु, पराकाष्ठा",
    source: "Open WordNet / Wiktionary",
    license_attribution: "CC BY-SA 3.0"
  }
];
