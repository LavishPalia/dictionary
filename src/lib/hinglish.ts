// Hinglish search: Hindi typed in English letters ("chhod" → छोड़ना, "paani" → पानी).
//
// Hindi words are romanized, and both they and the typed query are folded to a loose key that ignores how people
// commonly vary Hinglish spelling: long vowels (aa/a, ee/i, oo/u, ai/e), the h of aspirates and sh (chh/ch/c, kh/k,
// dh/d), doubled letters, a nasal before a consonant (hansna/hasna), and the short "a" inside words (samajhna,
// samajhana). ड़/ढ़ are written both ways (chhodna, chhorna), so Hindi words with them get a key for each.
// Shared by the database build (scripts/init-db.ts) and the server search (src/lib/book-data.ts).

const CONSONANTS: Record<string, string> = {
  'क': 'k', 'ख': 'kh', 'ग': 'g', 'घ': 'gh', 'ङ': 'n', 'च': 'ch', 'छ': 'chh', 'ज': 'j', 'झ': 'jh', 'ञ': 'n',
  'ट': 't', 'ठ': 'th', 'ड': 'd', 'ढ': 'dh', 'ण': 'n', 'त': 't', 'थ': 'th', 'द': 'd', 'ध': 'dh', 'न': 'n',
  'प': 'p', 'फ': 'ph', 'ब': 'b', 'भ': 'bh', 'म': 'm', 'य': 'y', 'र': 'r', 'ल': 'l', 'व': 'v', 'श': 'sh',
  'ष': 'sh', 'स': 's', 'ह': 'h', 'ळ': 'l',
};
// With a nukta. ड़ and ढ़ are marked with R so romanize() can offer both spellings.
const NUKTA_CONSONANTS: Record<string, string> = {
  'क': 'q', 'ख': 'kh', 'ग': 'g', 'ज': 'z', 'फ': 'f', 'ड': 'R', 'ढ': 'Rh', 'य': 'y',
};
const VOWELS: Record<string, string> = {
  'अ': 'a', 'आ': 'aa', 'इ': 'i', 'ई': 'ee', 'उ': 'u', 'ऊ': 'oo', 'ऋ': 'ri', 'ए': 'e', 'ऐ': 'ai', 'ओ': 'o', 'औ': 'au',
  'ऑ': 'o', 'ऍ': 'e',
};
const MATRAS: Record<string, string> = {
  'ा': 'aa', 'ि': 'i', 'ी': 'ee', 'ु': 'u', 'ू': 'oo', 'ृ': 'ri', 'े': 'e', 'ै': 'ai', 'ो': 'o', 'ौ': 'au', 'ॉ': 'o', 'ॅ': 'e',
};
const VIRAMA = '्';
const NUKTA = '़';

/** Romanizations of one Devanagari word (two when it has ड़ or ढ़: with d and with r). Other characters are dropped. */
export function romanize(word: string): string[] {
  const chars = [...word.normalize('NFD')]; // क़ … य़ become a letter followed by the nukta sign
  let out = '';
  for (let i = 0; i < chars.length; i++) {
    const c = chars[i];
    if (CONSONANTS[c]) {
      const nukta = chars[i + 1] === NUKTA;
      out += nukta ? NUKTA_CONSONANTS[c] ?? CONSONANTS[c] : CONSONANTS[c];
      if (nukta) i++;
      const next = chars[i + 1];
      if (next === VIRAMA) i++;
      else if (MATRAS[next]) { out += MATRAS[next]; i++; }
      else out += 'a'; // the inherent vowel; the key ignores the ones people leave out
    } else if (VOWELS[c]) out += VOWELS[c];
    else if (c === 'ं' || c === 'ँ') out += 'n';
    else if (c === 'ः') out += 'h';
  }
  return out.includes('R') ? [out.replace(/R/g, 'd'), out.replace(/R/g, 'r')] : [out];
}

const CONSONANT_LETTERS = 'bcdfgjklmnpqrstvxyz';

/**
 * Latin text with spelling variants folded but every vowel kept: aspirate h (unless keepH), long vowels, doubled
 * letters.
 */
export function hinglishFold(text: string, keepH = false, keepChh = false): string {
  const s = text.toLowerCase().replace(/[^a-z]/g, '')
    .replace(/ph/g, 'f').replace(/w/g, 'v').replace(/z/g, 'j').replace(/q/g, 'k').replace(/x/g, 'ks')
    .replace(/ee|ii/g, 'i').replace(/oo|uu/g, 'u').replace(/ai/g, 'e');
  // The h of an aspirate or of sh/ch: kh → k, chh → c, sh → s.
  let folded = '';
  for (const ch of s) {
    if (!keepH && ch === 'h' && folded && CONSONANT_LETTERS.includes(folded[folded.length - 1])) continue;
    folded += ch;
  }
  // With keepChh, chh (छ) does not collapse into ch (च) as a doubled h.
  return (keepChh ? folded.replace(/chh/g, 'cH') : folded).replace(/(.)\1+/g, '$1');
}

/** The loose key for Latin text (a query, or a romanized Hindi word); the search index. Spaces are ignored. */
export function hinglishKey(text: string): string {
  // A nasal before a consonant (हँसना: hansna / hasna, अंदर: andar / adar).
  let s = hinglishFold(text).replace(/n(?=[bcdfgjklmpqrstvxyz])/g, '');
  // The short a inside words, then doubled letters (pakka / paka, samajhna / samajhana).
  if (!s) return '';
  s = s[0] + s.slice(1).replace(/a/g, '');
  return s.replace(/(.)\1+/g, '$1');
}

const NASAL_BEFORE = /[bcdfgjklmpqrstvxyz]/;

/**
 * How closely a query spells the start of a Hindi word or phrase, once the key has matched: the number of letters
 * one side has and the other leaves out (an unwritten a, a nasal before a consonant), or null if a vowel differs.
 * A final a typed by the reader is a real vowel (khana is खाना, not the start of कानून). With keepH, the h of
 * aspirates must agree too, which tells बात (baat) from भात (bhaat) when both match.
 */
export function spellingDistance(query: string, hindi: string, keepH = false): number | null {
  // Readers often type ch for छ (chota, acha), but a typed chh means छ: chhor is छोर, not चोर.
  const keepChh = keepH && /chh/i.test(query);
  const q = hinglishFold(query, keepH, keepChh);
  let best: number | null = null;
  const forms = hindi.split(/\s+/).map(romanize).reduce<string[]>((acc, f) => acc.flatMap((a) => f.map((x) => a + x)), ['']);
  for (const form of forms) {
    const h = hinglishFold(form, keepH, keepChh);
    // Fewest skips aligning all of q with a prefix of h.
    const memo = new Map<string, number | null>();
    const align = (i: number, j: number): number | null => {
      if (i === q.length) return 0;
      const id = `${i},${j}`;
      if (memo.has(id)) return memo.get(id)!;
      let res: number | null = null;
      const consider = (r: number | null, cost: number) => { if (r !== null && (res === null || r + cost < res)) res = r + cost; };
      if (j < h.length && q[i] === h[j]) consider(align(i + 1, j + 1), 0);
      if (q[i] === 'a' && i < q.length - 1) consider(align(i + 1, j), 1);
      if (j < h.length && h[j] === 'a') consider(align(i, j + 1), 1);
      if (q[i] === 'n' && NASAL_BEFORE.test(q[i + 1] ?? '')) consider(align(i + 1, j), 1);
      if (j < h.length && h[j] === 'n' && NASAL_BEFORE.test(h[j + 1] ?? '')) consider(align(i, j + 1), 1);
      memo.set(id, res);
      return res;
    };
    const d = align(0, 0);
    if (d !== null && (best === null || d < best)) best = d;
  }
  return best;
}

/**
 * Whether the query spells the whole Hindi word, not just its start: pyaar is प्यार but only begins प्यारा. The loose
 * key must agree, and so must the ending: a word ending in a consonant (its silent final a dropped) or in a vowel.
 */
export function spellsWhole(query: string, hindi: string): boolean {
  const key = hinglishKey(query);
  const q = hinglishFold(query);
  // A final consonant's inherent a is silent in Hindi (प्यार is pyaar, not pyaara).
  const silentA = /[क-ह]़?$/.test(hindi.normalize('NFD'));
  return romanize(hindi).some((r) => {
    const h = hinglishFold(silentA ? r.replace(/a$/, '') : r);
    return hinglishKey(h) === key && h.endsWith('a') === q.endsWith('a');
  });
}

/** Little words inside Hindi meanings that are not worth matching on their own. */
export const HINDI_STOPWORDS = new Set(['के', 'की', 'का', 'को', 'में', 'से', 'पर', 'है', 'और', 'या', 'एक', 'कि', 'ना', 'न']);
