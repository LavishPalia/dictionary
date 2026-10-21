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
    source: "Panna Vintage Editorial",
    license_attribution: "Project Panna / Original Editorial"
  },
  {
    headword: "Abate",
    normalized: "abate",
    pos: "v. i.",
    pronunciation_deva: "अबेट",
    definition_en: "to become less intense, severe, or widespread.",
    meaning_hi: "कम होना, घटना",
    source: "Panna Vintage Editorial",
    license_attribution: "Project Panna / Original Editorial"
  },
  {
    headword: "Abide",
    normalized: "abide",
    pos: "v. i.",
    pronunciation_deva: "अबाइड",
    definition_en: "to remain stable or fixed in some state; endure.",
    meaning_hi: "रहना, टिकना, पालन करना",
    source: "Panna Vintage Editorial",
    license_attribution: "Project Panna / Original Editorial"
  },
  {
    headword: "Ability",
    normalized: "ability",
    pos: "n.",
    pronunciation_deva: "अबिलिटी",
    definition_en: "possession of the means or skill to do something.",
    meaning_hi: "योग्यता, क्षमता",
    source: "Panna Vintage Editorial",
    license_attribution: "Project Panna / Original Editorial"
  },
  {
    headword: "Abridge",
    normalized: "abridge",
    pos: "v. t.",
    pronunciation_deva: "अब्रिज",
    definition_en: "to shorten a book, speech, or text without losing the sense.",
    meaning_hi: "संक्षिप्त करना",
    source: "Panna Vintage Editorial",
    license_attribution: "Project Panna / Original Editorial"
  },
  {
    headword: "Abundant",
    normalized: "abundant",
    pos: "adj.",
    pronunciation_deva: "अबन्डन्ट",
    definition_en: "existing or available in large quantities; overflowing.",
    meaning_hi: "प्रचुर, बहुत अधिक",
    source: "Panna Vintage Editorial",
    license_attribution: "Project Panna / Original Editorial"
  },
  {
    headword: "Acquire",
    normalized: "acquire",
    pos: "v. t.",
    pronunciation_deva: "अक्वायर",
    definition_en: "to buy, obtain, or develop for oneself.",
    meaning_hi: "प्राप्त करना, अर्जित करना",
    source: "Panna Vintage Editorial",
    license_attribution: "Project Panna / Original Editorial"
  },
  {
    headword: "Adore",
    normalized: "adore",
    pos: "v. t.",
    pronunciation_deva: "अडोर",
    definition_en: "to love deeply and respect with great reverence.",
    meaning_hi: "अत्यधिक प्रेम करना, पूजना",
    source: "Panna Vintage Editorial",
    license_attribution: "Project Panna / Original Editorial"
  },

  // --- B ---
  {
    headword: "Bake",
    normalized: "bake",
    pos: "v. t.",
    pronunciation_deva: "बेक",
    definition_en: "to cook food by dry heat without direct exposure to a flame.",
    meaning_hi: "सेंकना, पकाना",
    source: "Panna Vintage Editorial",
    license_attribution: "Project Panna / Original Editorial"
  },
  {
    headword: "Balance",
    normalized: "balance",
    pos: "n.",
    pronunciation_deva: "बैलन्स",
    definition_en: "an even distribution of weight enabling someone or something to remain upright.",
    meaning_hi: "संतुलन, तराजू",
    source: "Panna Vintage Editorial",
    license_attribution: "Project Panna / Original Editorial"
  },
  {
    headword: "Banner",
    normalized: "banner",
    pos: "n.",
    pronunciation_deva: "बैनर",
    definition_en: "a long strip of cloth bearing a slogan or design carried in a demonstration.",
    meaning_hi: "ध्वज, पताका",
    source: "Panna Vintage Editorial",
    license_attribution: "Project Panna / Original Editorial"
  },
  {
    headword: "Beacon",
    normalized: "beacon",
    pos: "n.",
    pronunciation_deva: "बीकन",
    definition_en: "a fire or light set up in a high position as a signal or warning.",
    meaning_hi: "आकाशदीप, चेतावनी प्रकाश",
    source: "Panna Vintage Editorial",
    license_attribution: "Project Panna / Original Editorial"
  },
  {
    headword: "Benevolent",
    normalized: "benevolent",
    pos: "adj.",
    pronunciation_deva: "बेनेवोलन्ट",
    definition_en: "well meaning and kindly; serving a charitable purpose.",
    meaning_hi: "परोपकारी, दयालु",
    source: "Panna Vintage Editorial",
    license_attribution: "Project Panna / Original Editorial"
  },
  {
    headword: "Blossom",
    normalized: "blossom",
    pos: "n.",
    pronunciation_deva: "ब्लॉसम",
    definition_en: "a flower or a mass of flowers on a tree or bush.",
    meaning_hi: "फूल, मंज़री, खिलना",
    source: "Panna Vintage Editorial",
    license_attribution: "Project Panna / Original Editorial"
  },
  {
    headword: "Book",
    normalized: "book",
    pos: "n.",
    pronunciation_deva: "बुक",
    definition_en: "a written or printed work consisting of pages glued or sewn together.",
    meaning_hi: "पुस्तक, किताब",
    source: "Panna Vintage Editorial",
    license_attribution: "Project Panna / Original Editorial"
  },
  {
    headword: "Breeze",
    normalized: "breeze",
    pos: "n.",
    pronunciation_deva: "ब्रीज़",
    definition_en: "a gentle, pleasant wind.",
    meaning_hi: "मंद समीर, हवा का झोंका",
    source: "Panna Vintage Editorial",
    license_attribution: "Project Panna / Original Editorial"
  },

  // --- C (CONSECUTIVE PAGES 90 to 97: SPREADS 90/91, 92/93, 94/95, 96/97) ---
  // Page 90 (left page)
  {
    headword: "Cabin",
    normalized: "cabin",
    pos: "n.",
    pronunciation_deva: "कैबिन",
    definition_en: "a small wooden shelter or house in a wild area.",
    meaning_hi: "झोपड़ी, कुटिया",
    source: "Panna Vintage Editorial",
    license_attribution: "Project Panna / Original Editorial"
  },
  {
    headword: "Cable",
    normalized: "cable",
    pos: "n.",
    pronunciation_deva: "केबल",
    definition_en: "a thick rope of wire or hemp used for construction.",
    meaning_hi: "मोटा तार, रस्सा",
    source: "Panna Vintage Editorial",
    license_attribution: "Project Panna / Original Editorial"
  },
  {
    headword: "Cage",
    normalized: "cage",
    pos: "n.",
    pronunciation_deva: "केज",
    definition_en: "a structure of bars or wires in which animals are kept.",
    meaning_hi: "पिंजरा",
    source: "Panna Vintage Editorial",
    license_attribution: "Project Panna / Original Editorial"
  },
  {
    headword: "Calculate",
    normalized: "calculate",
    pos: "v. t.",
    pronunciation_deva: "कैलकुलेट",
    definition_en: "to determine mathematically the amount or number.",
    meaning_hi: "गणना करना",
    source: "Panna Vintage Editorial",
    license_attribution: "Project Panna / Original Editorial"
  },
  {
    headword: "Calendar",
    normalized: "calendar",
    pos: "n.",
    pronunciation_deva: "कैलन्डर",
    definition_en: "a chart showing days, weeks, and months of a year.",
    meaning_hi: "पंचांग, कैलेंडर",
    source: "Panna Vintage Editorial",
    license_attribution: "Project Panna / Original Editorial"
  },
  {
    headword: "Calm",
    normalized: "calm",
    pos: "adj.",
    pronunciation_deva: "काम",
    definition_en: "not showing or feeling nervousness, anger, or excitement.",
    meaning_hi: "शांत, स्थिर",
    source: "Panna Vintage Editorial",
    license_attribution: "Project Panna / Original Editorial"
  },
  {
    headword: "Camel",
    normalized: "camel",
    pos: "n.",
    pronunciation_deva: "कैमल",
    definition_en: "a large long-necked mammal with one or two humps.",
    meaning_hi: "ऊँट",
    source: "Panna Vintage Editorial",
    license_attribution: "Project Panna / Original Editorial"
  },
  {
    headword: "Camera",
    normalized: "camera",
    pos: "n.",
    pronunciation_deva: "कैमरा",
    definition_en: "a device for recording visual images in photographs.",
    meaning_hi: "कैमरा",
    source: "Panna Vintage Editorial",
    license_attribution: "Project Panna / Original Editorial"
  },

  // Page 91 (right page)
  {
    headword: "Camp",
    normalized: "camp",
    pos: "n.",
    pronunciation_deva: "कैम्प",
    definition_en: "a place with temporary accommodation of huts or tents.",
    meaning_hi: "शिविर, पड़ाव",
    source: "Panna Vintage Editorial",
    license_attribution: "Project Panna / Original Editorial"
  },
  {
    headword: "Canal",
    normalized: "canal",
    pos: "n.",
    pronunciation_deva: "कनाल",
    definition_en: "an artificial waterway constructed to allow passage of boats.",
    meaning_hi: "नहर",
    source: "Panna Vintage Editorial",
    license_attribution: "Project Panna / Original Editorial"
  },
  {
    headword: "Cancel",
    normalized: "cancel",
    pos: "v. t.",
    pronunciation_deva: "कैन्सल",
    definition_en: "to decide that an agreed event will not take place.",
    meaning_hi: "रद्द करना",
    source: "Panna Vintage Editorial",
    license_attribution: "Project Panna / Original Editorial"
  },
  {
    headword: "Candle",
    normalized: "candle",
    pos: "n.",
    pronunciation_deva: "कैंडल",
    definition_en: "a cylinder of wax with a central wick that gives light.",
    meaning_hi: "मोमबत्ती",
    source: "Panna Vintage Editorial",
    license_attribution: "Project Panna / Original Editorial"
  },
  {
    headword: "Canvas",
    normalized: "canvas",
    pos: "n.",
    pronunciation_deva: "कैनवस",
    definition_en: "a strong, unbleached cloth used for making sails or paintings.",
    meaning_hi: "किरमिच, कैनवास",
    source: "Panna Vintage Editorial",
    license_attribution: "Project Panna / Original Editorial"
  },
  {
    headword: "Captain",
    normalized: "captain",
    pos: "n.",
    pronunciation_deva: "कैप्टन",
    definition_en: "the person in command of a ship or team.",
    meaning_hi: "कप्तान, सेनानायक",
    source: "Panna Vintage Editorial",
    license_attribution: "Project Panna / Original Editorial"
  },
  {
    headword: "Card",
    normalized: "card",
    pos: "n.",
    pronunciation_deva: "कार्ड",
    definition_en: "a piece of thick, stiff paper or thin pasteboard.",
    meaning_hi: "ताश का पत्ता, पत्रक",
    source: "Panna Vintage Editorial",
    license_attribution: "Project Panna / Original Editorial"
  },
  {
    headword: "Care",
    normalized: "care",
    pos: "n.",
    pronunciation_deva: "केयर",
    definition_en: "the provision of what is necessary for the health and welfare.",
    meaning_hi: "देखभाल, चिंता",
    source: "Panna Vintage Editorial",
    license_attribution: "Project Panna / Original Editorial"
  },

  // Page 92 (left page) [from Main.dc.html]
  {
    headword: "Cellar",
    normalized: "cellar",
    pos: "n.",
    pronunciation_deva: "सेलर",
    definition_en: "an underground room for storing goods.",
    meaning_hi: "तहखाना",
    source: "Panna Vintage Editorial",
    license_attribution: "Project Panna / Original Editorial"
  },
  {
    headword: "Cement",
    normalized: "cement",
    pos: "n.",
    pronunciation_deva: "सिमेंट",
    definition_en: "a grey powder that sets hard when mixed with water.",
    meaning_hi: "सीमेंट",
    source: "Panna Vintage Editorial",
    license_attribution: "Project Panna / Original Editorial"
  },
  {
    headword: "Census",
    normalized: "census",
    pos: "n.",
    pronunciation_deva: "सेन्सस",
    definition_en: "an official count of a country's people.",
    meaning_hi: "जनगणना",
    source: "Panna Vintage Editorial",
    license_attribution: "Project Panna / Original Editorial"
  },
  {
    headword: "Centre",
    normalized: "centre",
    pos: "n.",
    pronunciation_deva: "सेन्टर",
    definition_en: "the middle point of anything.",
    meaning_hi: "केन्द्र",
    source: "Panna Vintage Editorial",
    license_attribution: "Project Panna / Original Editorial"
  },
  {
    headword: "Century",
    normalized: "century",
    pos: "n.",
    pronunciation_deva: "सेन्चुरी",
    definition_en: "a period of one hundred years.",
    meaning_hi: "शताब्दी",
    source: "Panna Vintage Editorial",
    license_attribution: "Project Panna / Original Editorial"
  },
  {
    headword: "Ceramic",
    normalized: "ceramic",
    pos: "adj.",
    pronunciation_deva: "सिरैमिक",
    definition_en: "made of baked clay.",
    meaning_hi: "मिट्टी का",
    source: "Panna Vintage Editorial",
    license_attribution: "Project Panna / Original Editorial"
  },
  {
    headword: "Ceremony",
    normalized: "ceremony",
    pos: "n.",
    pronunciation_deva: "सेरिमनी",
    definition_en: "a formal act performed on a special occasion.",
    meaning_hi: "समारोह",
    source: "Panna Vintage Editorial",
    license_attribution: "Project Panna / Original Editorial"
  },
  {
    headword: "Certain",
    normalized: "certain",
    pos: "adj.",
    pronunciation_deva: "सर्टन",
    definition_en: "sure; beyond doubt.",
    meaning_hi: "निश्चित",
    source: "Panna Vintage Editorial",
    license_attribution: "Project Panna / Original Editorial"
  },

  // Page 93 (right page) [from Main.dc.html]
  {
    headword: "Chain",
    normalized: "chain",
    pos: "n.",
    pronunciation_deva: "चेन",
    definition_en: "a line of linked metal rings.",
    meaning_hi: "ज़ंजीर",
    source: "Panna Vintage Editorial",
    license_attribution: "Project Panna / Original Editorial"
  },
  {
    headword: "Chair",
    normalized: "chair",
    pos: "n.",
    pronunciation_deva: "चेयर",
    definition_en: "a seat with a back, for one person.",
    meaning_hi: "कुर्सी",
    source: "Panna Vintage Editorial",
    license_attribution: "Project Panna / Original Editorial"
  },
  {
    headword: "Chalk",
    normalized: "chalk",
    pos: "n.",
    pronunciation_deva: "चॉक",
    definition_en: "soft white stone used for writing on a slate.",
    meaning_hi: "खड़िया",
    source: "Panna Vintage Editorial",
    license_attribution: "Project Panna / Original Editorial"
  },
  {
    headword: "Chamber",
    normalized: "chamber",
    pos: "n.",
    pronunciation_deva: "चेम्बर",
    definition_en: "a room, especially a private one.",
    meaning_hi: "कक्ष",
    source: "Panna Vintage Editorial",
    license_attribution: "Project Panna / Original Editorial"
  },
  {
    headword: "Chance",
    normalized: "chance",
    pos: "n.",
    pronunciation_deva: "चांस",
    definition_en: "the happening of things without plan.",
    meaning_hi: "संयोग",
    source: "Panna Vintage Editorial",
    license_attribution: "Project Panna / Original Editorial"
  },
  {
    headword: "Change",
    normalized: "change",
    pos: "v. t.",
    pronunciation_deva: "चेंज",
    definition_en: "to make or become different.",
    meaning_hi: "बदलना",
    source: "Panna Vintage Editorial",
    license_attribution: "Project Panna / Original Editorial"
  },
  {
    headword: "Chapter",
    normalized: "chapter",
    pos: "n.",
    pronunciation_deva: "चैप्टर",
    definition_en: "a main division of a book.",
    meaning_hi: "अध्याय",
    source: "Panna Vintage Editorial",
    license_attribution: "Project Panna / Original Editorial"
  },
  {
    headword: "Charity",
    normalized: "charity",
    pos: "n.",
    pronunciation_deva: "चैरिटी",
    definition_en: "kindness in giving to the poor.",
    meaning_hi: "दान",
    source: "Panna Vintage Editorial",
    license_attribution: "Project Panna / Original Editorial"
  },

  // Page 94 (left page)
  {
    headword: "Charm",
    normalized: "charm",
    pos: "n.",
    pronunciation_deva: "चार्म",
    definition_en: "the power or quality of giving delight or arousing admiration.",
    meaning_hi: "आकर्षण, जादू",
    source: "Panna Vintage Editorial",
    license_attribution: "Project Panna / Original Editorial"
  },
  {
    headword: "Chase",
    normalized: "chase",
    pos: "v. t.",
    pronunciation_deva: "चेस",
    definition_en: "to pursue in order to catch or catch up with.",
    meaning_hi: "पीछा करना, खदेड़ना",
    source: "Panna Vintage Editorial",
    license_attribution: "Project Panna / Original Editorial"
  },
  {
    headword: "Cheap",
    normalized: "cheap",
    pos: "adj.",
    pronunciation_deva: "चीप",
    definition_en: "low in price, especially in relation to value.",
    meaning_hi: "सस्ता, किफ़ायती",
    source: "Panna Vintage Editorial",
    license_attribution: "Project Panna / Original Editorial"
  },
  {
    headword: "Check",
    normalized: "check",
    pos: "v. t.",
    pronunciation_deva: "चेक",
    definition_en: "to examine something in order to determine accuracy.",
    meaning_hi: "जांचना, परखना",
    source: "Panna Vintage Editorial",
    license_attribution: "Project Panna / Original Editorial"
  },
  {
    headword: "Cheer",
    normalized: "cheer",
    pos: "n.",
    pronunciation_deva: "चीयर",
    definition_en: "a shout of encouragement, praise, or joy.",
    meaning_hi: "जयकार, ढाढ़स",
    source: "Panna Vintage Editorial",
    license_attribution: "Project Panna / Original Editorial"
  },
  {
    headword: "Cheese",
    normalized: "cheese",
    pos: "n.",
    pronunciation_deva: "चीज़",
    definition_en: "a food made from the pressed curds of milk.",
    meaning_hi: "पनीर",
    source: "Panna Vintage Editorial",
    license_attribution: "Project Panna / Original Editorial"
  },
  {
    headword: "Cherry",
    normalized: "cherry",
    pos: "n.",
    pronunciation_deva: "चेरी",
    definition_en: "a small, round stone fruit that is typically bright red.",
    meaning_hi: "चेरी का फल",
    source: "Panna Vintage Editorial",
    license_attribution: "Project Panna / Original Editorial"
  },
  {
    headword: "Chest",
    normalized: "chest",
    pos: "n.",
    pronunciation_deva: "चेस्ट",
    definition_en: "the front surface of a person's body between neck and abdomen; a large box.",
    meaning_hi: "छाती, संदूक",
    source: "Panna Vintage Editorial",
    license_attribution: "Project Panna / Original Editorial"
  },

  // Page 95 (right page)
  {
    headword: "Chief",
    normalized: "chief",
    pos: "n.",
    pronunciation_deva: "चीफ़",
    definition_en: "a leader or ruler of a people, group, or organization.",
    meaning_hi: "मुखिया, प्रधान",
    source: "Panna Vintage Editorial",
    license_attribution: "Project Panna / Original Editorial"
  },
  {
    headword: "Child",
    normalized: "child",
    pos: "n.",
    pronunciation_deva: "चाइल्ड",
    definition_en: "a young human being below the age of puberty.",
    meaning_hi: "बालक, बच्चा",
    source: "Panna Vintage Editorial",
    license_attribution: "Project Panna / Original Editorial"
  },
  {
    headword: "Chimney",
    normalized: "chimney",
    pos: "n.",
    pronunciation_deva: "चिम्नी",
    definition_en: "a vertical pipe through which smoke and gases are carried off.",
    meaning_hi: "चिमनी",
    source: "Panna Vintage Editorial",
    license_attribution: "Project Panna / Original Editorial"
  },
  {
    headword: "Choice",
    normalized: "choice",
    pos: "n.",
    pronunciation_deva: "चॉइस",
    definition_en: "an act of selecting or making a decision when faced with options.",
    meaning_hi: "पसंद, विकल्प",
    source: "Panna Vintage Editorial",
    license_attribution: "Project Panna / Original Editorial"
  },
  {
    headword: "Choose",
    normalized: "choose",
    pos: "v. t.",
    pronunciation_deva: "चूज़",
    definition_en: "to pick out or select as being the best or most appropriate.",
    meaning_hi: "चुनना, छांटना",
    source: "Panna Vintage Editorial",
    license_attribution: "Project Panna / Original Editorial"
  },
  {
    headword: "Church",
    normalized: "church",
    pos: "n.",
    pronunciation_deva: "चर्च",
    definition_en: "a building used for public Christian worship.",
    meaning_hi: "गिरजाघर",
    source: "Panna Vintage Editorial",
    license_attribution: "Project Panna / Original Editorial"
  },
  {
    headword: "Circle",
    normalized: "circle",
    pos: "n.",
    pronunciation_deva: "सर्कल",
    definition_en: "a round plane figure whose boundary consists of points equidistant from centre.",
    meaning_hi: "वृत्त, घेरा",
    source: "Panna Vintage Editorial",
    license_attribution: "Project Panna / Original Editorial"
  },
  {
    headword: "Circus",
    normalized: "circus",
    pos: "n.",
    pronunciation_deva: "सर्कस",
    definition_en: "a travelling company of acrobats, clowns, and trained animals.",
    meaning_hi: "सर्कस, तमाशा",
    source: "Panna Vintage Editorial",
    license_attribution: "Project Panna / Original Editorial"
  },

  // Page 96 (left page)
  {
    headword: "Citizen",
    normalized: "citizen",
    pos: "n.",
    pronunciation_deva: "सिटिज़न",
    definition_en: "a legally recognized subject or national of a state.",
    meaning_hi: "नागरिक",
    source: "Panna Vintage Editorial",
    license_attribution: "Project Panna / Original Editorial"
  },
  {
    headword: "City",
    normalized: "city",
    pos: "n.",
    pronunciation_deva: "सिटी",
    definition_en: "a large town of significant size and population.",
    meaning_hi: "शहर, नगर",
    source: "Panna Vintage Editorial",
    license_attribution: "Project Panna / Original Editorial"
  },
  {
    headword: "Civil",
    normalized: "civil",
    pos: "adj.",
    pronunciation_deva: "सिविल",
    definition_en: "relating to ordinary citizens and their concerns.",
    meaning_hi: "नागरिक, असैन्य",
    source: "Panna Vintage Editorial",
    license_attribution: "Project Panna / Original Editorial"
  },
  {
    headword: "Claim",
    normalized: "claim",
    pos: "v. t.",
    pronunciation_deva: "क्लेम",
    definition_en: "to state or assert that something is the case.",
    meaning_hi: "दावा करना",
    source: "Panna Vintage Editorial",
    license_attribution: "Project Panna / Original Editorial"
  },
  {
    headword: "Clam",
    normalized: "clam",
    pos: "n.",
    pronunciation_deva: "क्लैम",
    definition_en: "a marine bivalve mollusc with shells of equal size.",
    meaning_hi: "सीप, घोंघा",
    source: "Panna Vintage Editorial",
    license_attribution: "Project Panna / Original Editorial"
  },
  {
    headword: "Clap",
    normalized: "clap",
    pos: "v. t.",
    pronunciation_deva: "क्लैप",
    definition_en: "to strike the palms of the hands together with a sharp sound.",
    meaning_hi: "ताली बजाना",
    source: "Panna Vintage Editorial",
    license_attribution: "Project Panna / Original Editorial"
  },
  {
    headword: "Clarify",
    normalized: "clarify",
    pos: "v. t.",
    pronunciation_deva: "क्लैरिफ़ाई",
    definition_en: "to make a statement or situation less confused and more comprehensible.",
    meaning_hi: "स्पष्ट करना",
    source: "Panna Vintage Editorial",
    license_attribution: "Project Panna / Original Editorial"
  },
  {
    headword: "Clarity",
    normalized: "clarity",
    pos: "n.",
    pronunciation_deva: "क्लैरिटी",
    definition_en: "the quality of being clear, transparent, or easily understood.",
    meaning_hi: "स्पष्टता, स्वच्छता",
    source: "Panna Vintage Editorial",
    license_attribution: "Project Panna / Original Editorial"
  },

  // Page 97 (right page)
  {
    headword: "Clash",
    normalized: "clash",
    pos: "n.",
    pronunciation_deva: "क्लैश",
    definition_en: "a violent confrontation or disagreement between parties.",
    meaning_hi: "टकराव, भिड़ंत",
    source: "Panna Vintage Editorial",
    license_attribution: "Project Panna / Original Editorial"
  },
  {
    headword: "Clasp",
    normalized: "clasp",
    pos: "n.",
    pronunciation_deva: "क्लैस्प",
    definition_en: "a device with interlocking parts used for fastening things.",
    meaning_hi: "बकल, कुंडी, पकड़",
    source: "Panna Vintage Editorial",
    license_attribution: "Project Panna / Original Editorial"
  },
  {
    headword: "Class",
    normalized: "class",
    pos: "n.",
    pronunciation_deva: "क्लास",
    definition_en: "a set or category of things having some property in common.",
    meaning_hi: "श्रेणी, कक्षा, वर्ग",
    source: "Panna Vintage Editorial",
    license_attribution: "Project Panna / Original Editorial"
  },
  {
    headword: "Classic",
    normalized: "classic",
    pos: "adj.",
    pronunciation_deva: "क्लासिक",
    definition_en: "judged over a period of time to be of the highest quality.",
    meaning_hi: "उत्कृष्ट, कालजयी",
    source: "Panna Vintage Editorial",
    license_attribution: "Project Panna / Original Editorial"
  },
  {
    headword: "Clean",
    normalized: "clean",
    pos: "adj.",
    pronunciation_deva: "क्लीन",
    definition_en: "free from dirt, marks, or unwanted matter.",
    meaning_hi: "साफ़, स्वच्छ",
    source: "Panna Vintage Editorial",
    license_attribution: "Project Panna / Original Editorial"
  },
  {
    headword: "Clear",
    normalized: "clear",
    pos: "adj.",
    pronunciation_deva: "क्लियर",
    definition_en: "easy to perceive, understand, or interpret; transparent.",
    meaning_hi: "स्पष्ट, साफ़",
    source: "Panna Vintage Editorial",
    license_attribution: "Project Panna / Original Editorial"
  },
  {
    headword: "Clerk",
    normalized: "clerk",
    pos: "n.",
    pronunciation_deva: "क्लर्क",
    definition_en: "a person employed in an office or bank to keep records.",
    meaning_hi: "मुंशी, लिपिक",
    source: "Panna Vintage Editorial",
    license_attribution: "Project Panna / Original Editorial"
  },
  {
    headword: "Clever",
    normalized: "clever",
    pos: "adj.",
    pronunciation_deva: "क्लेवर",
    definition_en: "quick to understand, learn, and devise or apply ideas.",
    meaning_hi: "चतुर, होशियार",
    source: "Panna Vintage Editorial",
    license_attribution: "Project Panna / Original Editorial"
  },

  // --- D (EXACT SPREAD FROM DESIGN DOC Flip.dc.html) ---
  {
    headword: "Dairy",
    normalized: "dairy",
    pos: "n.",
    pronunciation_deva: "डेयरी",
    definition_en: "a place where milk is kept and made into butter.",
    meaning_hi: "दुग्धशाला",
    source: "Panna Vintage Editorial",
    license_attribution: "Project Panna / Original Editorial"
  },
  {
    headword: "Daisy",
    normalized: "daisy",
    pos: "n.",
    pronunciation_deva: "डेज़ी",
    definition_en: "a small flower with white petals.",
    meaning_hi: "गुलबहार",
    source: "Panna Vintage Editorial",
    license_attribution: "Project Panna / Original Editorial"
  },
  {
    headword: "Damp",
    normalized: "damp",
    pos: "adj.",
    pronunciation_deva: "डैम्प",
    definition_en: "slightly wet.",
    meaning_hi: "नम",
    source: "Panna Vintage Editorial",
    license_attribution: "Project Panna / Original Editorial"
  },
  {
    headword: "Dance",
    normalized: "dance",
    pos: "v. i.",
    pronunciation_deva: "डान्स",
    definition_en: "to move the body in time to music.",
    meaning_hi: "नाचना",
    source: "Panna Vintage Editorial",
    license_attribution: "Project Panna / Original Editorial"
  },
  {
    headword: "Danger",
    normalized: "danger",
    pos: "n.",
    pronunciation_deva: "डेन्जर",
    definition_en: "a chance of harm.",
    meaning_hi: "खतरा",
    source: "Panna Vintage Editorial",
    license_attribution: "Project Panna / Original Editorial"
  },
  {
    headword: "Dark",
    normalized: "dark",
    pos: "adj.",
    pronunciation_deva: "डार्क",
    definition_en: "without light.",
    meaning_hi: "अँधेरा",
    source: "Panna Vintage Editorial",
    license_attribution: "Project Panna / Original Editorial"
  },
  {
    headword: "Dawn",
    normalized: "dawn",
    pos: "n.",
    pronunciation_deva: "डॉन",
    definition_en: "the first appearance of light in the sky before sunrise.",
    meaning_hi: "भोर, उषाकाल",
    source: "Panna Vintage Editorial",
    license_attribution: "Project Panna / Original Editorial"
  },
  {
    headword: "Decide",
    normalized: "decide",
    pos: "v. t.",
    pronunciation_deva: "डिसाइड",
    definition_en: "to make a final choice or judgment about something.",
    meaning_hi: "निर्णय करना, तय करना",
    source: "Panna Vintage Editorial",
    license_attribution: "Project Panna / Original Editorial"
  },

  // --- E ---
  {
    headword: "Eager",
    normalized: "eager",
    pos: "adj.",
    pronunciation_deva: "ईगर",
    definition_en: "strongly wanting to do or have something.",
    meaning_hi: "उत्सुक, लालायित",
    source: "Panna Vintage Editorial",
    license_attribution: "Project Panna / Original Editorial"
  },
  {
    headword: "Earth",
    normalized: "earth",
    pos: "n.",
    pronunciation_deva: "अर्थ",
    definition_en: "the planet on which we live; the soil or ground.",
    meaning_hi: "पृथ्वी, भूमि, मिट्टी",
    source: "Panna Vintage Editorial",
    license_attribution: "Project Panna / Original Editorial"
  },
  {
    headword: "Echo",
    normalized: "echo",
    pos: "n.",
    pronunciation_deva: "इको",
    definition_en: "a sound caused by the reflection of sound waves.",
    meaning_hi: "गूंज, प्रतिध्वनि",
    source: "Panna Vintage Editorial",
    license_attribution: "Project Panna / Original Editorial"
  },
  {
    headword: "Elegance",
    normalized: "elegance",
    pos: "n.",
    pronunciation_deva: "एलिगन्स",
    definition_en: "the quality of being graceful and stylish in appearance.",
    meaning_hi: "सुरुचि, शिष्टता, लालित्य",
    source: "Panna Vintage Editorial",
    license_attribution: "Project Panna / Original Editorial"
  },

  // --- F ---
  {
    headword: "Fabric",
    normalized: "fabric",
    pos: "n.",
    pronunciation_deva: "फैब्रिक",
    definition_en: "cloth produced by weaving or knitting textile fibers.",
    meaning_hi: "कपड़ा, वस्त्र",
    source: "Panna Vintage Editorial",
    license_attribution: "Project Panna / Original Editorial"
  },
  {
    headword: "Faith",
    normalized: "faith",
    pos: "n.",
    pronunciation_deva: "फेथ",
    definition_en: "complete trust or confidence in someone or something.",
    meaning_hi: "विश्वास, आस्था",
    source: "Panna Vintage Editorial",
    license_attribution: "Project Panna / Original Editorial"
  },
  {
    headword: "Feather",
    normalized: "feather",
    pos: "n.",
    pronunciation_deva: "फेदर",
    definition_en: "one of the flat, light structures growing from a bird's skin.",
    meaning_hi: "पंख, पर",
    source: "Panna Vintage Editorial",
    license_attribution: "Project Panna / Original Editorial"
  },
  {
    headword: "Foliage",
    normalized: "foliage",
    pos: "n.",
    pronunciation_deva: "फोलिएज",
    definition_en: "the leaves of a plant or tree collectively.",
    meaning_hi: "पत्ते, पर्णसमूह",
    source: "Panna Vintage Editorial",
    license_attribution: "Project Panna / Original Editorial"
  },

  // --- G ---
  {
    headword: "Garden",
    normalized: "garden",
    pos: "n.",
    pronunciation_deva: "गार्डन",
    definition_en: "a piece of ground used for growing flowers, fruit, or vegetables.",
    meaning_hi: "बगीचा, वाटिका",
    source: "Panna Vintage Editorial",
    license_attribution: "Project Panna / Original Editorial"
  },
  {
    headword: "Gentle",
    normalized: "gentle",
    pos: "adj.",
    pronunciation_deva: "जेन्टल",
    definition_en: "having or showing a mild, kind, or tender temperament.",
    meaning_hi: "सज्जन, कोमल, नम्र",
    source: "Panna Vintage Editorial",
    license_attribution: "Project Panna / Original Editorial"
  },
  {
    headword: "Glimpse",
    normalized: "glimpse",
    pos: "n.",
    pronunciation_deva: "ग्लिम्प्स",
    definition_en: "a momentary or partial view.",
    meaning_hi: "झलक, सरसरी नज़र",
    source: "Panna Vintage Editorial",
    license_attribution: "Project Panna / Original Editorial"
  },
  {
    headword: "Grain",
    normalized: "grain",
    pos: "n.",
    pronunciation_deva: "ग्रेन",
    definition_en: "wheat or other cultivated cereal; the longitudinal arrangement of fibers.",
    meaning_hi: "अनाज, दाना, रेशे",
    source: "Panna Vintage Editorial",
    license_attribution: "Project Panna / Original Editorial"
  },

  // --- H ---
  {
    headword: "Harbor",
    normalized: "harbor",
    pos: "n.",
    pronunciation_deva: "हार्बर",
    definition_en: "a place on the coast where vessels may find shelter.",
    meaning_hi: "बंदरगाह, आश्रय",
    source: "Panna Vintage Editorial",
    license_attribution: "Project Panna / Original Editorial"
  },
  {
    headword: "Harmony",
    normalized: "harmony",
    pos: "n.",
    pronunciation_deva: "हार्मनी",
    definition_en: "agreement or concord; melodious musical combination.",
    meaning_hi: "सद्भाव, तालमेल, सामंजस्य",
    source: "Panna Vintage Editorial",
    license_attribution: "Project Panna / Original Editorial"
  },
  {
    headword: "Heritage",
    normalized: "heritage",
    pos: "n.",
    pronunciation_deva: "हेरिटेज",
    definition_en: "property or culture that is or may be inherited.",
    meaning_hi: "विरासत, धरोहर",
    source: "Panna Vintage Editorial",
    license_attribution: "Project Panna / Original Editorial"
  },
  {
    headword: "Honor",
    normalized: "honor",
    pos: "n.",
    pronunciation_deva: "ऑनर",
    definition_en: "high respect; great esteem or an ethical standard.",
    meaning_hi: "सम्मान, गौरव, मान",
    source: "Panna Vintage Editorial",
    license_attribution: "Project Panna / Original Editorial"
  },

  // --- I ---
  {
    headword: "Illuminate",
    normalized: "illuminate",
    pos: "v. t.",
    pronunciation_deva: "इल्युमिनेट",
    definition_en: "to make light or shine upon; clarify or explain.",
    meaning_hi: "प्रकाशित करना, स्पष्ट करना",
    source: "Panna Vintage Editorial",
    license_attribution: "Project Panna / Original Editorial"
  },
  {
    headword: "Ink",
    normalized: "ink",
    pos: "n.",
    pronunciation_deva: "इंक",
    definition_en: "a coloured fluid or paste used for writing, drawing, or printing.",
    meaning_hi: "स्याही, रोशनाई",
    source: "Panna Vintage Editorial",
    license_attribution: "Project Panna / Original Editorial"
  },
  {
    headword: "Insight",
    normalized: "insight",
    pos: "n.",
    pronunciation_deva: "इनसाइट",
    definition_en: "the capacity to gain an accurate and deep intuitive understanding.",
    meaning_hi: "अंतर्दृष्टि, गहरी समझ",
    source: "Panna Vintage Editorial",
    license_attribution: "Project Panna / Original Editorial"
  },

  // --- J ---
  {
    headword: "Journey",
    normalized: "journey",
    pos: "n.",
    pronunciation_deva: "जर्नी",
    definition_en: "an act of traveling from one place to another.",
    meaning_hi: "यात्रा, सफर",
    source: "Panna Vintage Editorial",
    license_attribution: "Project Panna / Original Editorial"
  },
  {
    headword: "Jubilant",
    normalized: "jubilant",
    pos: "adj.",
    pronunciation_deva: "जुबिलन्ट",
    definition_en: "feeling or expressing great happiness and triumph.",
    meaning_hi: "उल्लासित, प्रफुल्लित",
    source: "Panna Vintage Editorial",
    license_attribution: "Project Panna / Original Editorial"
  },

  // --- K ---
  {
    headword: "Keepsake",
    normalized: "keepsake",
    pos: "n.",
    pronunciation_deva: "कीपसेक",
    definition_en: "a small item kept in memory of the person who gave it.",
    meaning_hi: "निशानी, यादगार",
    source: "Panna Vintage Editorial",
    license_attribution: "Project Panna / Original Editorial"
  },
  {
    headword: "Kindness",
    normalized: "kindness",
    pos: "n.",
    pronunciation_deva: "काइन्डनेस",
    definition_en: "the quality of being friendly, generous, and considerate.",
    meaning_hi: "दयालुता, कृपा, भलाई",
    source: "Panna Vintage Editorial",
    license_attribution: "Project Panna / Original Editorial"
  },

  // --- L ---
  {
    headword: "Lantern",
    normalized: "lantern",
    pos: "n.",
    pronunciation_deva: "लालटेन",
    definition_en: "a lamp with a transparent case protecting the flame or bulb.",
    meaning_hi: "लालटेन, दीप",
    source: "Panna Vintage Editorial",
    license_attribution: "Project Panna / Original Editorial"
  },
  {
    headword: "Leaf",
    normalized: "leaf",
    pos: "n.",
    pronunciation_deva: "लीफ",
    definition_en: "a flattened structure of a higher plant; a single sheet of paper in a book.",
    meaning_hi: "पत्ता, पन्ना (किताब का)",
    source: "Panna Vintage Editorial",
    license_attribution: "Project Panna / Original Editorial"
  },
  {
    headword: "Legend",
    normalized: "legend",
    pos: "n.",
    pronunciation_deva: "लेजन्ड",
    definition_en: "a traditional story sometimes regarded as historical but unauthenticated.",
    meaning_hi: "दंतकथा, आख्यान",
    source: "Panna Vintage Editorial",
    license_attribution: "Project Panna / Original Editorial"
  },
  {
    headword: "Loom",
    normalized: "loom",
    pos: "n.",
    pronunciation_deva: "लूम",
    definition_en: "an apparatus for making fabric by weaving yarn or thread.",
    meaning_hi: "करघा",
    source: "Panna Vintage Editorial",
    license_attribution: "Project Panna / Original Editorial"
  },

  // --- M ---
  {
    headword: "Manuscript",
    normalized: "manuscript",
    pos: "n.",
    pronunciation_deva: "मैन्युस्क्रिप्ट",
    definition_en: "a book, document, or piece of music written by hand.",
    meaning_hi: "पांडुलिपि, हस्तलिपि",
    source: "Panna Vintage Editorial",
    license_attribution: "Project Panna / Original Editorial"
  },
  {
    headword: "Margin",
    normalized: "margin",
    pos: "n.",
    pronunciation_deva: "मार्जिन",
    definition_en: "the edge or border of something, especially the unprinted edge of a page.",
    meaning_hi: "हाशिया, किनारा",
    source: "Panna Vintage Editorial",
    license_attribution: "Project Panna / Original Editorial"
  },
  {
    headword: "Measure",
    normalized: "measure",
    pos: "v. t.",
    pronunciation_deva: "मेज़र",
    definition_en: "to ascertain the size, amount, or degree of something by using an instrument.",
    meaning_hi: "मापना, नापना",
    source: "Panna Vintage Editorial",
    license_attribution: "Project Panna / Original Editorial"
  },
  {
    headword: "Melody",
    normalized: "melody",
    pos: "n.",
    pronunciation_deva: "मेलोडी",
    definition_en: "a sequence of single notes that is musically satisfying; a tune.",
    meaning_hi: "मधुर स्वर, राग, तराना",
    source: "Panna Vintage Editorial",
    license_attribution: "Project Panna / Original Editorial"
  },

  // --- N ---
  {
    headword: "Narrative",
    normalized: "narrative",
    pos: "n.",
    pronunciation_deva: "नैरेटिव",
    definition_en: "a spoken or written account of connected events; a story.",
    meaning_hi: "वृत्तांत, कथा, आख्यान",
    source: "Panna Vintage Editorial",
    license_attribution: "Project Panna / Original Editorial"
  },
  {
    headword: "Needle",
    normalized: "needle",
    pos: "n.",
    pronunciation_deva: "नीडल",
    definition_en: "a very slender pointed piece of steel used in sewing.",
    meaning_hi: "सुई",
    source: "Panna Vintage Editorial",
    license_attribution: "Project Panna / Original Editorial"
  },
  {
    headword: "Neighbor",
    normalized: "neighbor",
    pos: "n.",
    pronunciation_deva: "नेबर",
    definition_en: "a person living near or next door to another.",
    meaning_hi: "पड़ोसी",
    source: "Panna Vintage Editorial",
    license_attribution: "Project Panna / Original Editorial"
  },

  // --- O ---
  {
    headword: "Oasis",
    normalized: "oasis",
    pos: "n.",
    pronunciation_deva: "ओएसिस",
    definition_en: "a fertile spot in a desert, where water is found.",
    meaning_hi: "मरूद्यान",
    source: "Panna Vintage Editorial",
    license_attribution: "Project Panna / Original Editorial"
  },
  {
    headword: "Observe",
    normalized: "observe",
    pos: "v. t.",
    pronunciation_deva: "ऑब्ज़र्व",
    definition_en: "to notice or perceive something and register it as significant.",
    meaning_hi: "निरीक्षण करना, देखना",
    source: "Panna Vintage Editorial",
    license_attribution: "Project Panna / Original Editorial"
  },
  {
    headword: "Origin",
    normalized: "origin",
    pos: "n.",
    pronunciation_deva: "ओरिजिन",
    definition_en: "the point or place where something begins, arises, or is derived.",
    meaning_hi: "मूल, उत्पत्ति, स्रोत",
    source: "Panna Vintage Editorial",
    license_attribution: "Project Panna / Original Editorial"
  },

  // --- P ---
  {
    headword: "Page",
    normalized: "page",
    pos: "n.",
    pronunciation_deva: "पेज",
    definition_en: "one or both sides of a sheet of paper in a book or magazine.",
    meaning_hi: "पृष्ठ, पन्ना",
    source: "Panna Vintage Editorial",
    license_attribution: "Project Panna / Original Editorial"
  },
  {
    headword: "Parchment",
    normalized: "parchment",
    pos: "n.",
    pronunciation_deva: "पार्चमेन्ट",
    definition_en: "a stiff, flat, thin material made from the prepared skin of an animal.",
    meaning_hi: "चर्मपत्र, कागज़",
    source: "Panna Vintage Editorial",
    license_attribution: "Project Panna / Original Editorial"
  },
  {
    headword: "Pencil",
    normalized: "pencil",
    pos: "n.",
    pronunciation_deva: "पेंसिल",
    definition_en: "an instrument for writing or drawing, consisting of a thin stick of graphite.",
    meaning_hi: "पेंसिल, तूलिका",
    source: "Panna Vintage Editorial",
    license_attribution: "Project Panna / Original Editorial"
  },
  {
    headword: "Pocket",
    normalized: "pocket",
    pos: "n.",
    pronunciation_deva: "पॉकेट",
    definition_en: "a small bag formed by sewing a patch to a garment.",
    meaning_hi: "जेब, थैली",
    source: "Panna Vintage Editorial",
    license_attribution: "Project Panna / Original Editorial"
  },

  // --- Q ---
  {
    headword: "Quaint",
    normalized: "quaint",
    pos: "adj.",
    pronunciation_deva: "क्वेन्ट",
    definition_en: "attractively unusual or old-fashioned.",
    meaning_hi: "विचित्र परंतु आकर्षक, पुरातन",
    source: "Panna Vintage Editorial",
    license_attribution: "Project Panna / Original Editorial"
  },
  {
    headword: "Quiet",
    normalized: "quiet",
    pos: "adj.",
    pronunciation_deva: "क्वाइट",
    definition_en: "making little or no noise; calm and undisturbed.",
    meaning_hi: "शांत, खामोश",
    source: "Panna Vintage Editorial",
    license_attribution: "Project Panna / Original Editorial"
  },
  {
    headword: "Quill",
    normalized: "quill",
    pos: "n.",
    pronunciation_deva: "क्विल",
    definition_en: "a large feather used as a pen in past centuries.",
    meaning_hi: "पंख की कलम",
    source: "Panna Vintage Editorial",
    license_attribution: "Project Panna / Original Editorial"
  },

  // --- R ---
  {
    headword: "Radiant",
    normalized: "radiant",
    pos: "adj.",
    pronunciation_deva: "रेडियन्ट",
    definition_en: "shining or glowing brightly; emitting light.",
    meaning_hi: "चमकीला, प्रदीप्त, देदीप्यमान",
    source: "Panna Vintage Editorial",
    license_attribution: "Project Panna / Original Editorial"
  },
  {
    headword: "Rare",
    normalized: "rare",
    pos: "adj.",
    pronunciation_deva: "रेयर",
    definition_en: "not occurring very often; seldom found or uncommon.",
    meaning_hi: "दुर्लभ, अनूठा",
    source: "Panna Vintage Editorial",
    license_attribution: "Project Panna / Original Editorial"
  },
  {
    headword: "Ribbon",
    normalized: "ribbon",
    pos: "n.",
    pronunciation_deva: "रिबन",
    definition_en: "a narrow strip of silk or other material used for tying or marking pages.",
    meaning_hi: "फीता, रेशमी पट्टी",
    source: "Panna Vintage Editorial",
    license_attribution: "Project Panna / Original Editorial"
  },
  {
    headword: "Riffle",
    normalized: "riffle",
    pos: "v. t.",
    pronunciation_deva: "रिफ़ल",
    definition_en: "to turn over the pages of a book quickly and lightly.",
    meaning_hi: "पन्ने फड़फड़ाना, तेज़ी से पलटना",
    source: "Panna Vintage Editorial",
    license_attribution: "Project Panna / Original Editorial"
  },

  // --- S ---
  {
    headword: "Sacred",
    normalized: "sacred",
    pos: "adj.",
    pronunciation_deva: "सेक्रेड",
    definition_en: "connected with religion or dedicated to a deity; regarded with reverence.",
    meaning_hi: "पवित्र, पावन",
    source: "Panna Vintage Editorial",
    license_attribution: "Project Panna / Original Editorial"
  },
  {
    headword: "Scholar",
    normalized: "scholar",
    pos: "n.",
    pronunciation_deva: "स्कॉलर",
    definition_en: "a learned person who has acquired profound knowledge in an academic subject.",
    meaning_hi: "विद्वान, पंडित",
    source: "Panna Vintage Editorial",
    license_attribution: "Project Panna / Original Editorial"
  },
  {
    headword: "Scroll",
    normalized: "scroll",
    pos: "n.",
    pronunciation_deva: "स्क्रोल",
    definition_en: "a roll of parchment or paper for writing or painting on.",
    meaning_hi: "कुंडलित पत्र, ताम्रपत्र",
    source: "Panna Vintage Editorial",
    license_attribution: "Project Panna / Original Editorial"
  },
  {
    headword: "Spine",
    normalized: "spine",
    pos: "n.",
    pronunciation_deva: "स्पाइन",
    definition_en: "the back of a book cover connecting the two sides.",
    meaning_hi: "किताब की पीठ, मेरुदंड",
    source: "Panna Vintage Editorial",
    license_attribution: "Project Panna / Original Editorial"
  },

  // --- T ---
  {
    headword: "Tale",
    normalized: "tale",
    pos: "n.",
    pronunciation_deva: "टेल",
    definition_en: "a fictitious or true narrative or story.",
    meaning_hi: "कथा, किस्सा",
    source: "Panna Vintage Editorial",
    license_attribution: "Project Panna / Original Editorial"
  },
  {
    headword: "Texture",
    normalized: "texture",
    pos: "n.",
    pronunciation_deva: "टेक्सचर",
    definition_en: "the feel, appearance, or consistency of a surface or substance.",
    meaning_hi: "बनावट, स्पर्श-गुण",
    source: "Panna Vintage Editorial",
    license_attribution: "Project Panna / Original Editorial"
  },
  {
    headword: "Tome",
    normalized: "tome",
    pos: "n.",
    pronunciation_deva: "टोम",
    definition_en: "a book, especially a large, heavy, scholarly one.",
    meaning_hi: "विशाल ग्रंथ, भारी पोथी",
    source: "Panna Vintage Editorial",
    license_attribution: "Project Panna / Original Editorial"
  },
  {
    headword: "Twilight",
    normalized: "twilight",
    pos: "n.",
    pronunciation_deva: "ट्वाइलाइट",
    definition_en: "the soft glowing light from the sky when the sun is below the horizon.",
    meaning_hi: "गोधूलि वेला, सांझ",
    source: "Panna Vintage Editorial",
    license_attribution: "Project Panna / Original Editorial"
  },

  // --- U ---
  {
    headword: "Unique",
    normalized: "unique",
    pos: "adj.",
    pronunciation_deva: "यूनिक",
    definition_en: "being the only one of its kind; unlike anything else.",
    meaning_hi: "अनोखा, अद्वितीय",
    source: "Panna Vintage Editorial",
    license_attribution: "Project Panna / Original Editorial"
  },
  {
    headword: "Universal",
    normalized: "universal",
    pos: "adj.",
    pronunciation_deva: "यूनिवर्सल",
    definition_en: "of, affecting, or done by all people or things in the world.",
    meaning_hi: "सार्वभौमिक, सर्वव्यापी",
    source: "Panna Vintage Editorial",
    license_attribution: "Project Panna / Original Editorial"
  },

  // --- V ---
  {
    headword: "Valiant",
    normalized: "valiant",
    pos: "adj.",
    pronunciation_deva: "वैलियन्ट",
    definition_en: "possessing or showing courage or determination.",
    meaning_hi: "वीर, साहसी, पराक्रमी",
    source: "Panna Vintage Editorial",
    license_attribution: "Project Panna / Original Editorial"
  },
  {
    headword: "Vintage",
    normalized: "vintage",
    pos: "adj.",
    pronunciation_deva: "विन्टेज",
    definition_en: "denoting something from the past of high quality and classic character.",
    meaning_hi: "पुरातन, विंटेज, उत्कृष्ट कालखंड का",
    source: "Panna Vintage Editorial",
    license_attribution: "Project Panna / Original Editorial"
  },
  {
    headword: "Volume",
    normalized: "volume",
    pos: "n.",
    pronunciation_deva: "वॉल्यूम",
    definition_en: "a book forming part of a work or series.",
    meaning_hi: "खंड, भाग, जिल्द",
    source: "Panna Vintage Editorial",
    license_attribution: "Project Panna / Original Editorial"
  },

  // --- W ---
  {
    headword: "Weave",
    normalized: "weave",
    pos: "v. t.",
    pronunciation_deva: "वीव",
    definition_en: "to form fabric by interlacing long threads passing in one direction with others.",
    meaning_hi: "बुनना, ताना-बाना जोड़ना",
    source: "Panna Vintage Editorial",
    license_attribution: "Project Panna / Original Editorial"
  },
  {
    headword: "Wisdom",
    normalized: "wisdom",
    pos: "n.",
    pronunciation_deva: "विज़्डम",
    definition_en: "the quality of having experience, knowledge, and good judgment.",
    meaning_hi: "बुद्धिमानी, प्रज्ञा, ज्ञान",
    source: "Panna Vintage Editorial",
    license_attribution: "Project Panna / Original Editorial"
  },
  {
    headword: "Word",
    normalized: "word",
    pos: "n.",
    pronunciation_deva: "वर्ड",
    definition_en: "a single distinct meaningful element of speech or writing.",
    meaning_hi: "शब्द, वचन",
    source: "Panna Vintage Editorial",
    license_attribution: "Project Panna / Original Editorial"
  },

  // --- X ---
  {
    headword: "Xenon",
    normalized: "xenon",
    pos: "n.",
    pronunciation_deva: "ज़ेनॉन",
    definition_en: "the chemical element of atomic number 54, a noble gas.",
    meaning_hi: "ज़ीनॉन गैस",
    source: "Panna Vintage Editorial",
    license_attribution: "Project Panna / Original Editorial"
  },

  // --- Y ---
  {
    headword: "Yearn",
    normalized: "yearn",
    pos: "v. i.",
    pronunciation_deva: "यर्न",
    definition_en: "to have an intense feeling of longing for something.",
    meaning_hi: "तड़पना, लालायित होना",
    source: "Panna Vintage Editorial",
    license_attribution: "Project Panna / Original Editorial"
  },
  {
    headword: "Yield",
    normalized: "yield",
    pos: "v. t.",
    pronunciation_deva: "यील्ड",
    definition_en: "to produce or provide; surrender or give way to argument.",
    meaning_hi: "पैदावार देना, झुकना, मान लेना",
    source: "Panna Vintage Editorial",
    license_attribution: "Project Panna / Original Editorial"
  },

  // --- Z ---
  {
    headword: "Zeal",
    normalized: "zeal",
    pos: "n.",
    pronunciation_deva: "ज़ील",
    definition_en: "great energy or enthusiasm in pursuit of a cause or an objective.",
    meaning_hi: "उत्साह, लगन, जोश",
    source: "Panna Vintage Editorial",
    license_attribution: "Project Panna / Original Editorial"
  },
  {
    headword: "Zenith",
    normalized: "zenith",
    pos: "n.",
    pronunciation_deva: "ज़ेनिथ",
    definition_en: "the time at which something is most powerful or successful; highest celestial point.",
    meaning_hi: "शीर्षबिंदु, पराकाष्ठा",
    source: "Panna Vintage Editorial",
    license_attribution: "Project Panna / Original Editorial"
  }
];
