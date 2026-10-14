import { DictionaryEntry } from '../src/lib/types';

type EntryInput = Omit<DictionaryEntry, 'id' | 'page_number' | 'column' | 'position_in_column'>;

export const EXPANDED_PAGES: Record<number, EntryInput[]> = {
  // Page 4 & 5 (Letter A spread 4-5)
  4: [
    { headword: "Alarm", normalized: "alarm", pos: "n.", pronunciation_deva: "अलार्म", definition_en: "an anxious awareness of danger; a warning signal.", meaning_hi: "खतरे की सूचना, चेतावनी", source: "Open WordNet", license_attribution: "CC BY-SA 3.0" },
    { headword: "Alloy", normalized: "alloy", pos: "n.", pronunciation_deva: "अलॉय", definition_en: "a metal made by combining two or more metallic elements.", meaning_hi: "मिश्र धातु", source: "Open WordNet", license_attribution: "CC BY-SA 3.0" },
    { headword: "Always", normalized: "always", pos: "adv.", pronunciation_deva: "ऑल्वेज़", definition_en: "at all times; on all occasions; forever.", meaning_hi: "हमेशा, सदा", source: "Open WordNet", license_attribution: "CC BY-SA 3.0" },
    { headword: "Amber", normalized: "amber", pos: "n.", pronunciation_deva: "एम्बर", definition_en: "hard translucent fossilized resin, yellowish in color.", meaning_hi: "कहरुवा, पीला रत्न", source: "Open WordNet", license_attribution: "CC BY-SA 3.0" },
    { headword: "Angel", normalized: "angel", pos: "n.", pronunciation_deva: "एंजेल", definition_en: "a spiritual being believed to act as an attendant or messenger of God.", meaning_hi: "देवदूत, फ़रिश्ता", source: "Open WordNet", license_attribution: "CC BY-SA 3.0" },
    { headword: "Annual", normalized: "annual", pos: "adj.", pronunciation_deva: "एन्युअल", definition_en: "occurring once every year; yearly.", meaning_hi: "वार्षिक, सालाना", source: "Open WordNet", license_attribution: "CC BY-SA 3.0" },
    { headword: "Answer", normalized: "answer", pos: "n.", pronunciation_deva: "आन्सर", definition_en: "a thing said, written, or done to deal with a question.", meaning_hi: "उत्तर, जवाब", source: "Open WordNet", license_attribution: "CC BY-SA 3.0" },
    { headword: "Anxious", normalized: "anxious", pos: "adj.", pronunciation_deva: "एंक्शस", definition_en: "experiencing worry, unease, or nervousness.", meaning_hi: "चिंतित, व्याकुल", source: "Open WordNet", license_attribution: "CC BY-SA 3.0" },
  ],
  5: [
    { headword: "Appeal", normalized: "appeal", pos: "n.", pronunciation_deva: "अपील", definition_en: "a serious or urgent request, typically to the public.", meaning_hi: "प्रार्थना, याचना", source: "Open WordNet", license_attribution: "CC BY-SA 3.0" },
    { headword: "Apple", normalized: "apple", pos: "n.", pronunciation_deva: "एपल", definition_en: "the round fruit of a tree of the rose family, typically red or green.", meaning_hi: "सेब", source: "Open WordNet", license_attribution: "CC BY-SA 3.0" },
    { headword: "Archer", normalized: "archer", pos: "n.", pronunciation_deva: "आर्चर", definition_en: "a person who shoots with a bow and arrows.", meaning_hi: "धनुर्धर, तीरंदाज़", source: "Open WordNet", license_attribution: "CC BY-SA 3.0" },
    { headword: "Army", normalized: "army", pos: "n.", pronunciation_deva: "आर्मी", definition_en: "an organized military force equipped for fighting on land.", meaning_hi: "सेना, फ़ौज", source: "Open WordNet", license_attribution: "CC BY-SA 3.0" },
    { headword: "Arrow", normalized: "arrow", pos: "n.", pronunciation_deva: "एरो", definition_en: "a weapon consisting of a thin, straight stick with a sharp point.", meaning_hi: "तीर, बाण", source: "Open WordNet", license_attribution: "CC BY-SA 3.0" },
    { headword: "Artist", normalized: "artist", pos: "n.", pronunciation_deva: "आर्टिस्ट", definition_en: "a person who produces paintings or drawings as a profession or hobby.", meaning_hi: "कलाकार, चित्रकार", source: "Open WordNet", license_attribution: "CC BY-SA 3.0" },
    { headword: "Ascent", normalized: "ascent", pos: "n.", pronunciation_deva: "असेंट", definition_en: "a climb or walk to the summit of a mountain or hill.", meaning_hi: "चढ़ाई, आरोहण", source: "Open WordNet", license_attribution: "CC BY-SA 3.0" },
    { headword: "Asset", normalized: "asset", pos: "n.", pronunciation_deva: "एसेट", definition_en: "a useful or valuable quality, person, or thing.", meaning_hi: "संपत्ति, धरोहर", source: "Open WordNet", license_attribution: "CC BY-SA 3.0" },
  ],

  // Page 46 & 47 (Letter B spread 46-47)
  46: [
    { headword: "Banana", normalized: "banana", pos: "n.", pronunciation_deva: "बनाना", definition_en: "a long curved fruit which grows in clusters and has soft pulpy flesh.", meaning_hi: "केला", source: "Open WordNet", license_attribution: "CC BY-SA 3.0" },
    { headword: "Band", normalized: "band", pos: "n.", pronunciation_deva: "बैंड", definition_en: "a group of instrumentalists playing music together.", meaning_hi: "दल, बाजा बजाने वालों का समूह", source: "Open WordNet", license_attribution: "CC BY-SA 3.0" },
    { headword: "Banker", normalized: "banker", pos: "n.", pronunciation_deva: "बैंकर", definition_en: "an officer or owner of a bank.", meaning_hi: "महाजन, साहुकार, बैंक अधिकारी", source: "Open WordNet", license_attribution: "CC BY-SA 3.0" },
    { headword: "Banner", normalized: "banner", pos: "n.", pronunciation_deva: "बैनर", definition_en: "a long strip of cloth bearing a slogan or design carried in a demonstration.", meaning_hi: "ध्वज, पताका", source: "Open WordNet", license_attribution: "CC BY-SA 3.0" },
    { headword: "Barber", normalized: "barber", pos: "n.", pronunciation_deva: "बार्बर", definition_en: "a person whose business is cutting and dressing hair.", meaning_hi: "नाई, हज्जाम", source: "Open WordNet", license_attribution: "CC BY-SA 3.0" },
    { headword: "Bark", normalized: "bark", pos: "n.", pronunciation_deva: "बार्क", definition_en: "the tough protective outer sheath of the trunk and branches of a tree.", meaning_hi: "पेड़ की छाल", source: "Open WordNet", license_attribution: "CC BY-SA 3.0" },
    { headword: "Barrel", normalized: "barrel", pos: "n.", pronunciation_deva: "बैरल", definition_en: "a cylindrical container bulging out in the middle.", meaning_hi: "पीपा, ढोलक", source: "Open WordNet", license_attribution: "CC BY-SA 3.0" },
    { headword: "Basin", normalized: "basin", pos: "n.", pronunciation_deva: "बेसिन", definition_en: "a wide, open bowl for holding liquids.", meaning_hi: "कुण्ड, तगाड़ी", source: "Open WordNet", license_attribution: "CC BY-SA 3.0" },
  ],
  47: [
    { headword: "Basket", normalized: "basket", pos: "n.", pronunciation_deva: "बास्केट", definition_en: "a container made of interwoven strips of cane or wire.", meaning_hi: "टोकरी, डलिया", source: "Open WordNet", license_attribution: "CC BY-SA 3.0" },
    { headword: "Battle", normalized: "battle", pos: "n.", pronunciation_deva: "बैटल", definition_en: "a sustained fight between large organized armed forces.", meaning_hi: "युद्ध, लड़ाई", source: "Open WordNet", license_attribution: "CC BY-SA 3.0" },
    { headword: "Beach", normalized: "beach", pos: "n.", pronunciation_deva: "बीच", definition_en: "a pebbly or sandy shore, especially by the ocean.", meaning_hi: "समुद्र तट", source: "Open WordNet", license_attribution: "CC BY-SA 3.0" },
    { headword: "Beacon", normalized: "beacon", pos: "n.", pronunciation_deva: "बीकन", definition_en: "a fire or light set up in a high or prominent position as a warning or signal.", meaning_hi: "आकाशदीप, संकेत दीप", source: "Open WordNet", license_attribution: "CC BY-SA 3.0" },
    { headword: "Beast", normalized: "beast", pos: "n.", pronunciation_deva: "बीस्ट", definition_en: "an animal, especially a large or dangerous four-footed one.", meaning_hi: "पशु, जानवर", source: "Open WordNet", license_attribution: "CC BY-SA 3.0" },
    { headword: "Beauty", normalized: "beauty", pos: "n.", pronunciation_deva: "ब्यूटी", definition_en: "a combination of qualities that pleases the aesthetic senses.", meaning_hi: "सुंदरता, सौंदर्य", source: "Open WordNet", license_attribution: "CC BY-SA 3.0" },
    { headword: "Berry", normalized: "berry", pos: "n.", pronunciation_deva: "बेरी", definition_en: "a small round juicy fruit without a stone.", meaning_hi: "बेर, छोटा फल", source: "Open WordNet", license_attribution: "CC BY-SA 3.0" },
    { headword: "Birch", normalized: "birch", pos: "n.", pronunciation_deva: "बर्च", definition_en: "a slender hardy tree with thin peeling bark.", meaning_hi: "भोजपत्र का पेड़", source: "Open WordNet", license_attribution: "CC BY-SA 3.0" },
  ],

  // Page 212 & 213 (Letter D spread 212-213)
  212: [
    { headword: "Deck", normalized: "deck", pos: "n.", pronunciation_deva: "डेक", definition_en: "a floor of a ship, especially the upper level.", meaning_hi: "जहाज़ का तख्ता", source: "Open WordNet", license_attribution: "CC BY-SA 3.0" },
    { headword: "Declare", normalized: "declare", pos: "v. t.", pronunciation_deva: "डिक्लेयर", definition_en: "say something in a solemn and emphatic manner.", meaning_hi: "घोषणा करना", source: "Open WordNet", license_attribution: "CC BY-SA 3.0" },
    { headword: "Deed", normalized: "deed", pos: "n.", pronunciation_deva: "डीड", definition_en: "an action that is performed intentionally or consciously.", meaning_hi: "कर्म, कार्य", source: "Open WordNet", license_attribution: "CC BY-SA 3.0" },
    { headword: "Defeat", normalized: "defeat", pos: "v. t.", pronunciation_deva: "डि defeat", definition_en: "win a victory over someone in a battle or contest.", meaning_hi: "हराना, पराजित करना", source: "Open WordNet", license_attribution: "CC BY-SA 3.0" },
    { headword: "Defend", normalized: "defend", pos: "v. t.", pronunciation_deva: "डिफ़ेंड", definition_en: "resist an attack made on someone or something; protect.", meaning_hi: "रक्षा करना, बचाना", source: "Open WordNet", license_attribution: "CC BY-SA 3.0" },
    { headword: "Degree", normalized: "degree", pos: "n.", pronunciation_deva: "डिग्री", definition_en: "the amount, level, or extent to which something happens or is present.", meaning_hi: "मात्रा, उपाधि", source: "Open WordNet", license_attribution: "CC BY-SA 3.0" },
    { headword: "Delicate", normalized: "delicate", pos: "adj.", pronunciation_deva: "डेलिकेट", definition_en: "very fine in texture or structure; easily broken or damaged.", meaning_hi: "नाजुक, कोमल", source: "Open WordNet", license_attribution: "CC BY-SA 3.0" },
    { headword: "Delight", normalized: "delight", pos: "n.", pronunciation_deva: "डिलाइट", definition_en: "great pleasure or intense satisfaction.", meaning_hi: "आनंद, हर्ष", source: "Open WordNet", license_attribution: "CC BY-SA 3.0" },
  ],
  213: [
    { headword: "Demand", normalized: "demand", pos: "v. t.", pronunciation_deva: "डिमांड", definition_en: "an insistent and peremptory request, made as of right.", meaning_hi: "मांग करना, तकाज़ा करना", source: "Open WordNet", license_attribution: "CC BY-SA 3.0" },
    { headword: "Dense", normalized: "dense", pos: "adj.", pronunciation_deva: "डेन्स", definition_en: "closely compacted in substance; thick.", meaning_hi: "घना, सघन", source: "Open WordNet", license_attribution: "CC BY-SA 3.0" },
    { headword: "Depart", normalized: "depart", pos: "v. i.", pronunciation_deva: "डिपार्ट", definition_en: "leave, especially in order to start a journey.", meaning_hi: "प्रस्थान करना, रवाना होना", source: "Open WordNet", license_attribution: "CC BY-SA 3.0" },
    { headword: "Depend", normalized: "depend", pos: "v. i.", pronunciation_deva: "डिपेंड", definition_en: "be controlled or determined by; rely on.", meaning_hi: "निर्भर होना", source: "Open WordNet", license_attribution: "CC BY-SA 3.0" },
    { headword: "Deposit", normalized: "deposit", pos: "n.", pronunciation_deva: "डिपॉज़िट", definition_en: "a sum of money placed or kept in a bank account.", meaning_hi: "जमा राशि, धरोहर", source: "Open WordNet", license_attribution: "CC BY-SA 3.0" },
    { headword: "Desert", normalized: "desert", pos: "n.", pronunciation_deva: "डेज़र्ट", definition_en: "a dry, barren area of land, especially one covered with sand.", meaning_hi: "रेगिस्तान, मरुस्थल", source: "Open WordNet", license_attribution: "CC BY-SA 3.0" },
    { headword: "Desire", normalized: "desire", pos: "n.", pronunciation_deva: "डिज़ायर", definition_en: "a strong feeling of wanting to have something or wishing for something.", meaning_hi: "इच्छा, अभिलाषा", source: "Open WordNet", license_attribution: "CC BY-SA 3.0" },
    { headword: "Despair", normalized: "despair", pos: "n.", pronunciation_deva: "डिस्पेयर", definition_en: "the complete loss or absence of hope.", meaning_hi: "निराशा, मायूसी", source: "Open WordNet", license_attribution: "CC BY-SA 3.0" },
  ],

  // Page 262 & 263 (Letter E spread 262-263)
  262: [
    { headword: "Eager", normalized: "eager", pos: "adj.", pronunciation_deva: "ईगर", definition_en: "strongly wanting to do or have something.", meaning_hi: "उत्सुक, अधीर", source: "Open WordNet", license_attribution: "CC BY-SA 3.0" },
    { headword: "Early", normalized: "early", pos: "adv.", pronunciation_deva: "अर्ली", definition_en: "happening or done before the usual or expected time.", meaning_hi: "जल्दी, सवेरे", source: "Open WordNet", license_attribution: "CC BY-SA 3.0" },
    { headword: "Earth", normalized: "earth", pos: "n.", pronunciation_deva: "अर्थ", definition_en: "the planet on which we live; the world.", meaning_hi: "पृथ्वी, धरती", source: "Open WordNet", license_attribution: "CC BY-SA 3.0" },
    { headword: "Ease", normalized: "ease", pos: "n.", pronunciation_deva: "ईज़", definition_en: "absence of difficulty or effort.", meaning_hi: "आराम, सुगमता", source: "Open WordNet", license_attribution: "CC BY-SA 3.0" },
    { headword: "Echo", normalized: "echo", pos: "n.", pronunciation_deva: "एको", definition_en: "a sound caused by the reflection of sound waves from a surface.", meaning_hi: "प्रतिध्वनि, गूँज", source: "Open WordNet", license_attribution: "CC BY-SA 3.0" },
    { headword: "Eclipse", normalized: "eclipse", pos: "n.", pronunciation_deva: "इक्लिप्स", definition_en: "an obscuring of the light from one celestial body by the passage of another.", meaning_hi: "ग्रहण", source: "Open WordNet", license_attribution: "CC BY-SA 3.0" },
    { headword: "Economy", normalized: "economy", pos: "n.", pronunciation_deva: "इकोनॉमी", definition_en: "the wealth and resources of a country or region.", meaning_hi: "अर्थव्यवस्था, बचत", source: "Open WordNet", license_attribution: "CC BY-SA 3.0" },
    { headword: "Edge", normalized: "edge", pos: "n.", pronunciation_deva: "एज", definition_en: "the outside limit of an object, area, or surface.", meaning_hi: "किनारा, धार", source: "Open WordNet", license_attribution: "CC BY-SA 3.0" },
  ],
  263: [
    { headword: "Edit", normalized: "edit", pos: "v. t.", pronunciation_deva: "एडिट", definition_en: "prepare written material for publication by correcting or condensing.", meaning_hi: "संपादन करना", source: "Open WordNet", license_attribution: "CC BY-SA 3.0" },
    { headword: "Effect", normalized: "effect", pos: "n.", pronunciation_deva: "इफ़ेक्ट", definition_en: "a change which is a result or consequence of an action or other cause.", meaning_hi: "प्रभाव, असर", source: "Open WordNet", license_attribution: "CC BY-SA 3.0" },
    { headword: "Effort", normalized: "effort", pos: "n.", pronunciation_deva: "एफ़र्ट", definition_en: "a vigorous or determined attempt.", meaning_hi: "प्रयास, यत्न", source: "Open WordNet", license_attribution: "CC BY-SA 3.0" },
    { headword: "Elastic", normalized: "elastic", pos: "adj.", pronunciation_deva: "इलास्टिक", definition_en: "able to resume its normal shape spontaneously after being stretched.", meaning_hi: "लचीला, लोचदार", source: "Open WordNet", license_attribution: "CC BY-SA 3.0" },
    { headword: "Elder", normalized: "elder", pos: "adj.", pronunciation_deva: "एल्डर", definition_en: "of greater age; older.", meaning_hi: "बड़ा, वरिष्ठ", source: "Open WordNet", license_attribution: "CC BY-SA 3.0" },
    { headword: "Elect", normalized: "elect", pos: "v. t.", pronunciation_deva: "इलेक्ट", definition_en: "choose someone to hold public office or some other position by voting.", meaning_hi: "चुनना, निर्वाचित करना", source: "Open WordNet", license_attribution: "CC BY-SA 3.0" },
    { headword: "Element", normalized: "element", pos: "n.", pronunciation_deva: "एलिमेंट", definition_en: "an essential or characteristic part of something abstract.", meaning_hi: "तत्व, मूल अंग", source: "Open WordNet", license_attribution: "CC BY-SA 3.0" },
    { headword: "Elephant", normalized: "elephant", pos: "n.", pronunciation_deva: "एलिफ़ेंट", definition_en: "a very large plant-eating mammal with a trunk and long curved ivory tusks.", meaning_hi: "हाथी, गज", source: "Open WordNet", license_attribution: "CC BY-SA 3.0" },
  ],

  // Page 352 & 353 (Letter H spread 352-353)
  352: [
    { headword: "Habit", normalized: "habit", pos: "n.", pronunciation_deva: "हैबिट", definition_en: "a settled or regular tendency or practice, especially one that is hard to give up.", meaning_hi: "आदत, स्वभाव", source: "Open WordNet", license_attribution: "CC BY-SA 3.0" },
    { headword: "Half", normalized: "half", pos: "n.", pronunciation_deva: "हाफ़", definition_en: "either of two equal or corresponding parts into which something is or can be divided.", meaning_hi: "आधा, अर्ध", source: "Open WordNet", license_attribution: "CC BY-SA 3.0" },
    { headword: "Hammer", normalized: "hammer", pos: "n.", pronunciation_deva: "हैमर", definition_en: "a tool with a heavy metal head mounted at right angles at the end of a handle.", meaning_hi: "हथौड़ा", source: "Open WordNet", license_attribution: "CC BY-SA 3.0" },
    { headword: "Harbor", normalized: "harbor", pos: "n.", pronunciation_deva: "हार्बर", definition_en: "a place on the coast where vessels may find shelter, especially one protected from rough water.", meaning_hi: "बंदरगाह", source: "Open WordNet", license_attribution: "CC BY-SA 3.0" },
    { headword: "Hard", normalized: "hard", pos: "adj.", pronunciation_deva: "हार्ड", definition_en: "solid, firm, and rigid; not easily broken, bent, or pierced.", meaning_hi: "कठोर, सख्त", source: "Open WordNet", license_attribution: "CC BY-SA 3.0" },
    { headword: "Harm", normalized: "harm", pos: "n.", pronunciation_deva: "हार्म", definition_en: "physical injury, especially that which is deliberately inflicted.", meaning_hi: "हानि, नुकसान", source: "Open WordNet", license_attribution: "CC BY-SA 3.0" },
    { headword: "Harvest", normalized: "harvest", pos: "n.", pronunciation_deva: "हार्वेस्ट", definition_en: "the season when crops are gathered.", meaning_hi: "फसल कटाई", source: "Open WordNet", license_attribution: "CC BY-SA 3.0" },
    { headword: "Hawk", normalized: "hawk", pos: "n.", pronunciation_deva: "हॉक", definition_en: "a diurnal bird of prey with broad rounded wings and a long tail.", meaning_hi: "बाज़", source: "Open WordNet", license_attribution: "CC BY-SA 3.0" },
  ],
  353: [
    { headword: "Health", normalized: "health", pos: "n.", pronunciation_deva: "हेल्थ", definition_en: "the state of being free from illness or injury.", meaning_hi: "स्वास्थ्य, तंदुरुस्ती", source: "Open WordNet", license_attribution: "CC BY-SA 3.0" },
    { headword: "Heart", normalized: "heart", pos: "n.", pronunciation_deva: "हार्ट", definition_en: "a hollow muscular organ that pumps the blood through the circulatory system.", meaning_hi: "हृदय, दिल", source: "Open WordNet", license_attribution: "CC BY-SA 3.0" },
    { headword: "Heaven", normalized: "heaven", pos: "n.", pronunciation_deva: "हेवन", definition_en: "a place regarded in various religions as the abode of God and the angels.", meaning_hi: "स्वर्ग, जन्नत", source: "Open WordNet", license_attribution: "CC BY-SA 3.0" },
    { headword: "Heavy", normalized: "heavy", pos: "adj.", pronunciation_deva: "हेवी", definition_en: "of great weight; difficult to lift or move.", meaning_hi: "भारी, वज़नदार", source: "Open WordNet", license_attribution: "CC BY-SA 3.0" },
    { headword: "Height", normalized: "height", pos: "n.", pronunciation_deva: "हाइट", definition_en: "the measurement from base to top or of a standing person from head to foot.", meaning_hi: "ऊंचाई, कद", source: "Open WordNet", license_attribution: "CC BY-SA 3.0" },
    { headword: "Helmet", normalized: "helmet", pos: "n.", pronunciation_deva: "हेलमेट", definition_en: "a hard or padded protective hat, various types of which are worn by soldiers or riders.", meaning_hi: "शिरस्त्राण, टोप", source: "Open WordNet", license_attribution: "CC BY-SA 3.0" },
    { headword: "Hero", normalized: "hero", pos: "n.", pronunciation_deva: "हीरो", definition_en: "a person admired or idealized for courage, outstanding achievements, or noble qualities.", meaning_hi: "नायक, वीर पुरुष", source: "Open WordNet", license_attribution: "CC BY-SA 3.0" },
    { headword: "Hill", normalized: "hill", pos: "n.", pronunciation_deva: "हिल", definition_en: "a naturally raised area of land, not as high or craggy as a mountain.", meaning_hi: "पहाड़ी, टीला", source: "Open WordNet", license_attribution: "CC BY-SA 3.0" },
  ],

  // Page 482 & 483 (Letter M spread 482-483)
  482: [
    { headword: "Magnet", normalized: "magnet", pos: "n.", pronunciation_deva: "मैग्नेट", definition_en: "a piece of iron that exhibits properties of magnetism.", meaning_hi: "चुंबक", source: "Open WordNet", license_attribution: "CC BY-SA 3.0" },
    { headword: "Maiden", normalized: "maiden", pos: "n.", pronunciation_deva: "मेडन", definition_en: "an unmarried girl or young woman.", meaning_hi: "कुमारी, कन्या", source: "Open WordNet", license_attribution: "CC BY-SA 3.0" },
    { headword: "Major", normalized: "major", pos: "adj.", pronunciation_deva: "मेजर", definition_en: "important, serious, or significant.", meaning_hi: "प्रमुख, बड़ा", source: "Open WordNet", license_attribution: "CC BY-SA 3.0" },
    { headword: "Maker", normalized: "maker", pos: "n.", pronunciation_deva: "मेकर", definition_en: "a person or thing that makes or produces something.", meaning_hi: "निर्माता, रचयिता", source: "Open WordNet", license_attribution: "CC BY-SA 3.0" },
    { headword: "Mango", normalized: "mango", pos: "n.", pronunciation_deva: "मैंगो", definition_en: "a fleshy yellowish-red tropical fruit that is eaten ripe or used for pickles.", meaning_hi: "आम", source: "Open WordNet", license_attribution: "CC BY-SA 3.0" },
    { headword: "Manner", normalized: "manner", pos: "n.", pronunciation_deva: "मैनर", definition_en: "a way in which a thing is done or happens.", meaning_hi: "ढंग, तरीका", source: "Open WordNet", license_attribution: "CC BY-SA 3.0" },
    { headword: "Maple", normalized: "maple", pos: "n.", pronunciation_deva: "मेपल", definition_en: "a tree or shrub with lobed leaves and winged seeds.", meaning_hi: "मेपल का वृक्ष", source: "Open WordNet", license_attribution: "CC BY-SA 3.0" },
    { headword: "Marble", normalized: "marble", pos: "n.", pronunciation_deva: "मार्बल", definition_en: "a hard crystalline metamorphic form of limestone.", meaning_hi: "संगमरमर", source: "Open WordNet", license_attribution: "CC BY-SA 3.0" },
  ],
  483: [
    { headword: "March", normalized: "march", pos: "v. i.", pronunciation_deva: "मार्च", definition_en: "walk in a military manner with a regular measured tread.", meaning_hi: "कदमताल करना, आगे बढ़ना", source: "Open WordNet", license_attribution: "CC BY-SA 3.0" },
    { headword: "Market", normalized: "market", pos: "n.", pronunciation_deva: "मार्केट", definition_en: "a regular gathering of people for the purchase and sale of commodities.", meaning_hi: "बाज़ार, मंडी", source: "Open WordNet", license_attribution: "CC BY-SA 3.0" },
    { headword: "Master", normalized: "master", pos: "n.", pronunciation_deva: "मास्टर", definition_en: "a person who has dominance over or control of another person or a thing.", meaning_hi: "मालिक, स्वामी", source: "Open WordNet", license_attribution: "CC BY-SA 3.0" },
    { headword: "Meadow", normalized: "meadow", pos: "n.", pronunciation_deva: "मेडोज़", definition_en: "a piece of grassland, especially one used for hay.", meaning_hi: "घास का मैदान", source: "Open WordNet", license_attribution: "CC BY-SA 3.0" },
    { headword: "Medal", normalized: "medal", pos: "n.", pronunciation_deva: "मेडल", definition_en: "a metal disc with an inscription or design, made to commemorate an event.", meaning_hi: "पदक, तमगा", source: "Open WordNet", license_attribution: "CC BY-SA 3.0" },
    { headword: "Melody", normalized: "melody", pos: "n.", pronunciation_deva: "मेलोडी", definition_en: "a sequence of single notes that is musically satisfying; a tune.", meaning_hi: "सुर, मधुर गान", source: "Open WordNet", license_attribution: "CC BY-SA 3.0" },
    { headword: "Memory", normalized: "memory", pos: "n.", pronunciation_deva: "मेमोरी", definition_en: "the faculty by which the mind stores and remembers information.", meaning_hi: "स्मृति, याददाश्त", source: "Open WordNet", license_attribution: "CC BY-SA 3.0" },
    { headword: "Merchant", normalized: "merchant", pos: "n.", pronunciation_deva: "मर्चेंट", definition_en: "a person or company involved in wholesale trade.", meaning_hi: "व्यापारी, सौदागर", source: "Open WordNet", license_attribution: "CC BY-SA 3.0" },
  ],

  // Page 582 & 583 (Letter P spread 582-583)
  582: [
    { headword: "Pace", normalized: "pace", pos: "n.", pronunciation_deva: "पेस", definition_en: "a single step taken when walking or running; speed in walking or running.", meaning_hi: "कदम, गति", source: "Open WordNet", license_attribution: "CC BY-SA 3.0" },
    { headword: "Palace", normalized: "palace", pos: "n.", pronunciation_deva: "पैलेस", definition_en: "a large and impressive building forming the official residence of a ruler.", meaning_hi: "महल, राजप्रासाद", source: "Open WordNet", license_attribution: "CC BY-SA 3.0" },
    { headword: "Palm", normalized: "palm", pos: "n.", pronunciation_deva: "पाम", definition_en: "the inner surface of the hand between the wrist and the fingers.", meaning_hi: "हथेली", source: "Open WordNet", license_attribution: "CC BY-SA 3.0" },
    { headword: "Panel", normalized: "panel", pos: "n.", pronunciation_deva: "पैनल", definition_en: "a flat or curved component, typically rectangular, that forms a part of a surface.", meaning_hi: "तख्ता, चौखट", source: "Open WordNet", license_attribution: "CC BY-SA 3.0" },
    { headword: "Paper", normalized: "paper", pos: "n.", pronunciation_deva: "पेपर", definition_en: "material manufactured in thin sheets from the pulp of wood.", meaning_hi: "कागज़", source: "Open WordNet", license_attribution: "CC BY-SA 3.0" },
    { headword: "Parade", normalized: "parade", pos: "n.", pronunciation_deva: "परेड", definition_en: "a public procession, especially one celebrating a special day or event.", meaning_hi: "जुलूस, शोभायात्रा", source: "Open WordNet", license_attribution: "CC BY-SA 3.0" },
    { headword: "Pardon", normalized: "pardon", pos: "v. t.", pronunciation_deva: "पार्डन", definition_en: "forgive or excuse a person, error, or offense.", meaning_hi: "क्षमा करना, माफ़ करना", source: "Open WordNet", license_attribution: "CC BY-SA 3.0" },
    { headword: "Parish", normalized: "parish", pos: "n.", pronunciation_deva: "पैरिश", definition_en: "a small administrative district typically having its own church and a priest.", meaning_hi: "धर्मप्रांत", source: "Open WordNet", license_attribution: "CC BY-SA 3.0" },
  ],
  583: [
    { headword: "Park", normalized: "park", pos: "n.", pronunciation_deva: "पार्क", definition_en: "a large public garden or area of land used for recreation.", meaning_hi: "उद्यान, बाग़", source: "Open WordNet", license_attribution: "CC BY-SA 3.0" },
    { headword: "Parrot", normalized: "parrot", pos: "n.", pronunciation_deva: "पैरट", definition_en: "a mainly tropical bird with brightly colored plumage and a curved hooked bill.", meaning_hi: "तोता, शुक", source: "Open WordNet", license_attribution: "CC BY-SA 3.0" },
    { headword: "Partner", normalized: "partner", pos: "n.", pronunciation_deva: "पार्टनर", definition_en: "a person who takes part in an undertaking with another or others.", meaning_hi: "साझेदार, साथी", source: "Open WordNet", license_attribution: "CC BY-SA 3.0" },
    { headword: "Passion", normalized: "passion", pos: "n.", pronunciation_deva: "पैशन", definition_en: "strong and barely controllable emotion.", meaning_hi: "तीव्र इच्छा, जुनून", source: "Open WordNet", license_attribution: "CC BY-SA 3.0" },
    { headword: "Pastel", normalized: "pastel", pos: "n.", pronunciation_deva: "पेस्टल", definition_en: "a crayon made of powdered pigments bound with a gum or resin.", meaning_hi: "हल्के रंग की खड़िया", source: "Open WordNet", license_attribution: "CC BY-SA 3.0" },
    { headword: "Patch", normalized: "patch", pos: "n.", pronunciation_deva: "पैच", definition_en: "a piece of cloth or other material used to mend or strengthen a torn or weak point.", meaning_hi: "पैबंद, जोड़", source: "Open WordNet", license_attribution: "CC BY-SA 3.0" },
    { headword: "Path", normalized: "path", pos: "n.", pronunciation_deva: "पाथ", definition_en: "a way or track laid down for walking or made by continual treading.", meaning_hi: "रास्ता, पथ", source: "Open WordNet", license_attribution: "CC BY-SA 3.0" },
    { headword: "Patience", normalized: "patience", pos: "n.", pronunciation_deva: "पेशन्स", definition_en: "the capacity to accept or tolerate delay, trouble, or suffering without getting angry.", meaning_hi: "धैर्य, सब्र", source: "Open WordNet", license_attribution: "CC BY-SA 3.0" },
  ],

  // Page 692 & 693 (Letter S spread 692-693)
  692: [
    { headword: "Sailor", normalized: "sailor", pos: "n.", pronunciation_deva: "सेलर", definition_en: "a person whose job it is to work as a member of the crew of a commercial or naval ship.", meaning_hi: "नाविक, मल्लाह", source: "Open WordNet", license_attribution: "CC BY-SA 3.0" },
    { headword: "Salary", normalized: "salary", pos: "n.", pronunciation_deva: "सैलरी", definition_en: "a fixed regular payment, typically paid on a monthly basis.", meaning_hi: "वेतन, तनख्वाह", source: "Open WordNet", license_attribution: "CC BY-SA 3.0" },
    { headword: "Sample", normalized: "sample", pos: "n.", pronunciation_deva: "सैंपल", definition_en: "a small part or quantity intended to show what the whole is like.", meaning_hi: "नमूना, बानगी", source: "Open WordNet", license_attribution: "CC BY-SA 3.0" },
    { headword: "Sand", normalized: "sand", pos: "n.", pronunciation_deva: "सैंड", definition_en: "a loose granular substance, typically pale yellowish brown.", meaning_hi: "रेत, बालू", source: "Open WordNet", license_attribution: "CC BY-SA 3.0" },
    { headword: "Satin", normalized: "satin", pos: "n.", pronunciation_deva: "सैटिन", definition_en: "a smooth, glossy fabric, typically of silk, produced by a weave in which the threads of the warp are caught and looped by the weft only at certain intervals.", meaning_hi: "साटन का रेशमी वस्त्र", source: "Open WordNet", license_attribution: "CC BY-SA 3.0" },
    { headword: "Sauce", normalized: "sauce", pos: "n.", pronunciation_deva: "सॉस", definition_en: "a liquid or semi-liquid substance served with food to add moistness and flavor.", meaning_hi: "चटनी, रस", source: "Open WordNet", license_attribution: "CC BY-SA 3.0" },
    { headword: "Scale", normalized: "scale", pos: "n.", pronunciation_deva: "स्केल", definition_en: "an instrument for weighing.", meaning_hi: "तराजू, माप", source: "Open WordNet", license_attribution: "CC BY-SA 3.0" },
    { headword: "Scene", normalized: "scene", pos: "n.", pronunciation_deva: "सीन", definition_en: "the place where an incident in real life or fiction occurs or occurred.", meaning_hi: "दृश्य, नज़ारा", source: "Open WordNet", license_attribution: "CC BY-SA 3.0" },
  ],
  693: [
    { headword: "Scent", normalized: "scent", pos: "n.", pronunciation_deva: "सेंट", definition_en: "a distinctive smell, especially one that is pleasant.", meaning_hi: "सुगंध, इत्र", source: "Open WordNet", license_attribution: "CC BY-SA 3.0" },
    { headword: "School", normalized: "school", pos: "n.", pronunciation_deva: "स्कूल", definition_en: "an institution for educating children.", meaning_hi: "विद्यालय, पाठशाला", source: "Open WordNet", license_attribution: "CC BY-SA 3.0" },
    { headword: "Science", normalized: "science", pos: "n.", pronunciation_deva: "साइंस", definition_en: "the systematic study of the structure and behavior of the physical and natural world.", meaning_hi: "विज्ञान", source: "Open WordNet", license_attribution: "CC BY-SA 3.0" },
    { headword: "Screen", normalized: "screen", pos: "n.", pronunciation_deva: "स्क्रीन", definition_en: "a fixed or movable upright partition used to divide a room or to conceal.", meaning_hi: "पर्दा, ओट", source: "Open WordNet", license_attribution: "CC BY-SA 3.0" },
    { headword: "Secret", normalized: "secret", pos: "adj.", pronunciation_deva: "सीक्रेट", definition_en: "not known or seen or not meant to be known or seen by others.", meaning_hi: "गुप्त, रहस्य", source: "Open WordNet", license_attribution: "CC BY-SA 3.0" },
    { headword: "Seed", normalized: "seed", pos: "n.", pronunciation_deva: "सीड", definition_en: "a flowering plant's unit of reproduction, capable of developing into another such plant.", meaning_hi: "बीज, दाना", source: "Open WordNet", license_attribution: "CC BY-SA 3.0" },
    { headword: "Shadow", normalized: "shadow", pos: "n.", pronunciation_deva: "शैडो", definition_en: "a dark area or shape produced by a body coming between rays of light and a surface.", meaning_hi: "छाया, परछाईं", source: "Open WordNet", license_attribution: "CC BY-SA 3.0" },
    { headword: "Silence", normalized: "silence", pos: "n.", pronunciation_deva: "साइलेंस", definition_en: "complete absence of sound.", meaning_hi: "मौन, शांति", source: "Open WordNet", license_attribution: "CC BY-SA 3.0" },
  ],
};
