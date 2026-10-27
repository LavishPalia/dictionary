// Similar and opposite words for the word sheet and Review, from Princeton WordNet 3.1. Deterministic.
//
// Similar: other words in the synset of the word's most common sense (plus, for adjectives, the synsets that sense is
// "similar to"). Opposite: WordNet's antonyms of the word itself in its three most common senses, and for a
// "satellite" adjective (huge, haughty) the antonyms of the head adjective its first sense hangs from.
// Only words that are in Panna, with a matching part of speech, are kept, so every chip opens an entry. A word is
// only offered if the shared meaning is one of its own three most common senses ("get" is not similar to "begin").
// "Similar to" clusters are broad, so a word from one must have the cluster as its main meaning. Similar words are
// ordered close synonyms first, then by how common they are; the rarest (archaic or jocular, like "brobdingnagian")
// are left out.
import { WnPos, WordNet } from './lexicon';

export const MAX_SIMILAR = 5;
export const MAX_OPPOSITE = 3;
const SIMILAR_SENSES = 1;
const OPPOSITE_SENSES = 3;
const SALIENT_SENSES = 3;
export const RARE_RANK = 25000;

export interface Related {
  similar: string[]; // normalized headwords, best first
  opposite: string[];
}

/** WordNet parts of speech in a Panna pos label such as "n.", "v. t.", "prep. & adv.". */
export function wnPosesOf(pos: string): WnPos[] {
  const out: WnPos[] = [];
  for (const part of pos.split('&').map((p) => p.trim())) {
    const p: WnPos | null = /^adj\./.test(part) ? 'a' : /^adv\./.test(part) ? 'r' : /^n\./.test(part) ? 'n'
      : /^(v\.|modal v\.|aux\. v\.)/.test(part) ? 'v' : null;
    if (p && !out.includes(p)) out.push(p);
  }
  return out;
}

/** posByWord: every Panna headword (normalized) and its pos label; rank: frequency rank (1 = most common). */
export function findRelated(wn: WordNet, posByWord: Map<string, string>, rank: Map<string, number>): Map<string, Related> {
  const posesOf = new Map([...posByWord].map(([w, pos]) => [w, wnPosesOf(pos)]));
  const out = new Map<string, Related>();

  for (const [word, poses] of posesOf) {
    const similar: { word: string; tier: number }[] = [];
    const opposite: string[] = [];
    const accept = (candidate: string, pos: WnPos, offset: string, taken: string[]) => {
      const c = candidate.toLowerCase();
      if (c === word || taken.includes(c) || /\s/.test(c)) return null;
      if (!posesOf.get(c)?.includes(pos)) return null; // not in Panna, or Panna has it as another part of speech
      const sense = wn.senseOffsets(c, pos).indexOf(offset);
      return sense >= 0 && sense < SALIENT_SENSES ? { c, sense } : null;
    };
    const addSimilar = (candidate: string, pos: WnPos, offset: string, tier: number) => {
      const found = accept(candidate, pos, offset, similar.map((s) => s.word));
      if (!found || (rank.get(found.c) ?? Infinity) > RARE_RANK || (tier === SIMILAR_SENSES && found.sense > 0)) return;
      similar.push({ word: found.c, tier });
    };
    const addOpposite = (candidate: string, pos: WnPos, offset: string) => {
      const found = opposite.length < MAX_OPPOSITE && accept(candidate, pos, offset, opposite);
      if (found) opposite.push(found.c);
    };

    for (const pos of poses) {
      const senses = wn.senseOffsets(word, pos);
      senses.forEach((offset, sense) => {
        const synset = wn.links(pos, offset);
        if (sense < SIMILAR_SENSES) {
          for (const w of synset.words) addSimilar(w, pos, offset, sense);
          if (pos === 'a' && sense === 0) {
            for (const p of synset.pointers) {
              if (p.symbol === '&') for (const w of wn.links(p.pos, p.offset).words) addSimilar(w, pos, p.offset, SIMILAR_SENSES);
            }
          }
        }
        if (sense < OPPOSITE_SENSES) {
          const self = synset.words.findIndex((w) => w.toLowerCase() === word) + 1;
          for (const p of synset.pointers) {
            if (p.symbol === '!' && p.source === self) addOpposite(wn.links(p.pos, p.offset).words[p.target - 1], pos, p.offset);
          }
        }
      });
      // Indirect antonyms: huge → (similar to) large → (antonym) small.
      const first = senses.length ? wn.links(pos, senses[0]) : null;
      if (pos === 'a' && first?.satellite) {
        for (const head of first.pointers.filter((p) => p.symbol === '&')) {
          const headSynset = wn.links(head.pos, head.offset);
          for (const p of headSynset.pointers) {
            if (p.symbol === '!') addOpposite(wn.links(p.pos, p.offset).words[p.target - 1], pos, p.offset);
          }
        }
      }
    }
    const best = similar
      .filter((s) => !opposite.includes(s.word)) // WordNet can list a word as both (damned / blessed): keep the opposite
      .map((s, i) => ({ ...s, i, rank: rank.get(s.word) ?? Infinity }))
      .sort((a, b) => a.tier - b.tier || a.rank - b.rank || a.i - b.i)
      .slice(0, MAX_SIMILAR).map((s) => s.word);
    if (best.length || opposite.length) out.set(word, { similar: best, opposite });
  }
  return out;
}
