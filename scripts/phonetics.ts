/** Convert a CMUdict pronunciation into a practical Hindi Devanagari approximation. */
const CONSONANTS: Record<string, string> = {
  B: 'ब', CH: 'च', D: 'ड', DH: 'द', F: 'फ़', G: 'ग', HH: 'ह', JH: 'ज', K: 'क', L: 'ल',
  M: 'म', N: 'न', NG: 'ङ', P: 'प', R: 'र', S: 'स', SH: 'श', T: 'ट', TH: 'थ', V: 'व',
  W: 'व', Y: 'य', Z: 'ज़', ZH: 'ज़',
};
const VOWELS: Record<string, [string, string]> = {
  AA: ['आ', 'ा'], AE: ['ऐ', 'ै'], AH: ['अ', ''], AO: ['ऑ', 'ॉ'], AW: ['आउ', 'ाउ'], AY: ['आइ', 'ाइ'],
  EH: ['ए', 'े'], ER: ['अर', 'र'], EY: ['ए', 'े'], IH: ['इ', 'ि'], IY: ['ई', 'ी'], OW: ['ओ', 'ो'],
  OY: ['ऑय', 'ॉय'], UH: ['उ', 'ु'], UW: ['ऊ', 'ू'],
};

export function cmuToDevanagari(pronunciation: string): string {
  const phones = pronunciation.trim().split(/\s+/).map((p) => p.replace(/[0-2]$/, '').toUpperCase()).filter(Boolean);
  let out = '';
  for (let i = 0; i < phones.length; i++) {
    const phone = phones[i];
    const next = phones[i + 1];
    if (VOWELS[phone]) {
      const [independent, matra] = VOWELS[phone];
      if (/[क-हक़-य़़]्?$/.test(out)) {
        out = out.replace(/्$/, '');
        out += matra;
      }
      else out += independent;
    } else if (CONSONANTS[phone]) {
      out += CONSONANTS[phone];
      if (next && !VOWELS[next] && CONSONANTS[next]) out += '्';
    }
  }
  return out;
}

/** Select a POS-specific pronunciation for common CMUdict heteronyms when supplied. */
export function pronunciationFor(word: string, pos: string, cmu: Record<string, string>, heteronyms: Record<string, Record<string, string>>): string | null {
  const key = word.toLowerCase();
  const normalizedPos = /\b(v|verb)\b/i.test(pos) ? 'verb'
    : /\b(adj|adjective)\b/i.test(pos) ? 'adjective'
      : /\b(adv|adverb)\b/i.test(pos) ? 'adverb' : 'noun';
  const phonemes = heteronyms[key]?.[normalizedPos] ?? cmu[key];
  return phonemes ? cmuToDevanagari(phonemes) : null;
}
