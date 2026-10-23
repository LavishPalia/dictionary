// Phase 1 — lemmatized, POS-tagged headword candidate list.
//
// SUBTLEX-US word forms are folded into AGID lemmas only when the inflection's POS matches the
// form's dominant CLAWS PoS (so "saw"[Verb] -> see, "left"[Verb] -> leave, "better"[Adjective] -> good,
// but "ground"[Noun] stays "ground"). Proper nouns (dominant PoS = Name), contraction fragments,
// non-words and blocklisted terms are removed.
//
// Output: data/sources/lemmas.jsonl  (rank + lemma + POS only — no raw SUBTLEX counts are redistributed)
//         data/sources/coverage-stats.json
// Usage:  npx tsx scripts/build-lemma-list.ts
import fs from 'fs';
import path from 'path';
import {
  SOURCES_DIR, loadAgid, loadSubtlexPos, loadCmu, verifyChecksums, WordNet,
  SUBTLEX_TO_AGID, SUBTLEX_TO_WN, WN_POS_LABEL, WnPos,
} from './lib/lexicon';

const OUTPUT_LIMIT = 30000;
const SECONDARY_POS_SHARE = 0.25; // a second POS is printed ("v. & n.") when it has >= 25% of the dominant POS's frequency

// Clitic halves left behind by SUBTLEX tokenisation ("don't" -> don + t) and non-English subtitle noise.
const FRAGMENTS = new Set([
  's', 't', 'd', 'm', 'll', 're', 've', 'didn', 'doesn', 'isn', 'wasn', 'aren', 'weren', 'couldn', 'wouldn',
  'shouldn', 'hasn', 'haven', 'hadn', 'mustn', 'needn', 'ain', 'don', 'y', 'o', 'em', 'il', 'la', 'er', 'da',
  'wha', 'si', 'es', 'que', 'du', 'ne', 'ai', 'por', 'te', 'pas', 'oui', 'non', 'elle',
]);

const FUNCTION_POS = new Set([
  'Preposition', 'Pronoun', 'Determiner', 'Conjunction', 'Article', 'To', 'Not', 'Ex', 'Interjection', 'Number',
]);
const CONTENT_POS = new Set(['Noun', 'Verb', 'Adjective', 'Adverb']);

const POS_LABEL_FALLBACK: Record<string, string> = { Noun: 'n.', Verb: 'v.', Adjective: 'adj.', Adverb: 'adv.' };

/** American spelling for a British variant (emphasise, epicentre, savour, analyse), else null. */
function britishToAmerican(w: string): string | null {
  const rules: Array<[RegExp, string]> = [
    [/isation$/, 'ization'], [/ise$/, 'ize'], [/yse$/, 'yze'], [/([^aeiou])tre$/, '$1ter'], [/our$/, 'or'],
    [/ogue$/, 'og'], [/ence$/, 'ense'],
  ];
  for (const [re, rep] of rules) {
    if (re.test(w)) {
      const am = w.replace(re, rep);
      if (am !== w) return am;
    }
  }
  if (/^(instal|enrol|fulfil|skilful|wilful)/.test(w)) return w.replace(/^(instal|enrol|fulfil|skilful|wilful)/, (m) => ({ instal: 'install', enrol: 'enroll', fulfil: 'fulfill', skilful: 'skillful', wilful: 'willful' } as Record<string, string>)[m]);
  return null;
}

function loadBlocklist(): Set<string> {
  return new Set(
    fs.readFileSync(path.join(SOURCES_DIR, 'blocklist.txt'), 'utf8')
      .split(/\r?\n/).map((l) => l.trim().toLowerCase()).filter((l) => l && !l.startsWith('#')),
  );
}

export interface LemmaRecord {
  rank: number;
  lemma: string;
  class: 'content' | 'function';
  dom_pos: string; // SUBTLEX CLAWS class of the aggregated lemma
  pos_label: string; // printed label hint, e.g. "n.", "v. & n."
  wn_pos: WnPos | null; // WordNet POS used for sense selection
  in_wordnet: boolean;
  in_cmu: boolean;
}

async function main() {
  verifyChecksums(['data/sources/infl.txt', 'data/sources/raw/subtlex-us-pos.tsv']);
  const agid = loadAgid();
  const subtlex = loadSubtlexPos();
  const wn = new WordNet();
  const cmu = await loadCmu();
  const blocklist = loadBlocklist();

  const isWord = (w: string) => /^[a-z]+(-[a-z]+)*$/.test(w) && (w.length > 1 || w === 'a' || w === 'i');
  const countOf = (w: string) => subtlex.get(w)?.count ?? 0;
  const formsFreq = (lemma: string, pos: string, exclude: string) => {
    let total = 0;
    for (const f of agid.lemmaForms.get(lemma)?.get(pos as never) ?? []) if (f !== exclude) total += countOf(f);
    return total;
  };

  const agg = new Map<string, { total: number; posCounts: Map<string, number> }>();
  const credit = (lemma: string, pos: string, n: number) => {
    const rec = agg.get(lemma) ?? { total: 0, posCounts: new Map<string, number>() };
    rec.total += n;
    rec.posCounts.set(pos, (rec.posCounts.get(pos) ?? 0) + n);
    agg.set(lemma, rec);
  };

  const words = [...subtlex.values()].sort((a, b) => b.count - a.count || a.word.localeCompare(b.word));
  for (const row of words) {
    const w = row.word;
    if (!isWord(w) || FRAGMENTS.has(w) || blocklist.has(w)) continue;

    const agidPos = SUBTLEX_TO_AGID[row.domPos];
    let parents = agidPos ? (agid.formToParents.get(w) ?? []).filter((p) => p.pos === agidPos) : [];
    // Participles tagged as adjectives that WordNet doesn't list (flattered, iced, gotten) fold into the verb.
    const domWn = SUBTLEX_TO_WN[row.domPos];
    if (parents.length === 0 && domWn && !wn.has(w, domWn)) parents = agid.formToParents.get(w) ?? [];
    // Plural-only / lexicalised nouns WordNet lists in their own right (species, physics, news, means).
    // Only when the plural outweighs its singular as a noun, so "things/times/ways" still fold into their singular.
    const nounParentCount = parents.length ? (subtlex.get(parents[0].lemma)?.posCounts.get('Noun') ?? 0) : 0;
    const lexicalisedNoun = row.domPos === 'Noun' && wn.has(w, 'n') && nounParentCount < row.count;
    if (parents.length === 0 || lexicalisedNoun) {
      for (const [pos, n] of row.posCounts) credit(w, pos, n);
      continue;
    }

    // Prefer the parent whose paradigm is most used; keep the word as its own lemma only if its own
    // paradigm (e.g. found/founded/founding) outweighs the parent's (find/finding/finds).
    const best = [...parents].sort((a, b) => formsFreq(b.lemma, b.pos, w) + countOf(b.lemma) -
      (formsFreq(a.lemma, a.pos, w) + countOf(a.lemma)) || a.lemma.localeCompare(b.lemma))[0];
    const ownParadigm = agid.lemmaForms.get(w)?.has(agidPos!) ? formsFreq(w, agidPos!, w) : -1;
    const parentParadigm = formsFreq(best.lemma, best.pos, w) + countOf(best.lemma);
    if (ownParadigm > parentParadigm) {
      for (const [pos, n] of row.posCounts) credit(w, pos, n);
    } else {
      const domCount = row.posCounts.get(row.domPos) ?? row.count;
      credit(best.lemma, row.domPos, domCount);
      // Minor uses go to their own AGID parent ("lives" n. -> life) or stay with the word itself
      // ("left" adj./n. after "left" v. -> leave).
      for (const [pos, n] of row.posCounts) {
        if (pos === row.domPos) continue;
        const ap = SUBTLEX_TO_AGID[pos];
        const alt = ap ? (agid.formToParents.get(w) ?? []).filter((p) => p.pos === ap)
          .sort((a, b) => countOf(b.lemma) - countOf(a.lemma) || a.lemma.localeCompare(b.lemma))[0] : undefined;
        const wp = SUBTLEX_TO_WN[pos];
        const fallback = !alt && wp && !wn.has(w, wp) ? (agid.formToParents.get(w) ?? [])[0] : undefined;
        credit(alt?.lemma ?? fallback?.lemma ?? w, pos, n);
      }
    }
  }

  const records: LemmaRecord[] = [];
  const rejects: Array<{ lemma: string; dom_pos: string; in_cmu: boolean; reason: string }> = [];
  const excluded = { name: 0, other: 0, blocked: 0, no_wordnet: 0, british_variant: 0 };
  const ranked = [...agg.entries()].sort((a, b) => b[1].total - a[1].total || a[0].localeCompare(b[0]));
  for (const [lemma, { posCounts }] of ranked) {
    if (blocklist.has(lemma)) { excluded.blocked++; continue; }
    const byFreq = [...posCounts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
    const [domPos, domCount] = byFreq[0];
    if (domPos === 'Name') { excluded.name++; continue; }
    const cls = CONTENT_POS.has(domPos) ? 'content' : FUNCTION_POS.has(domPos) ? 'function' : null;
    if (!cls) { excluded.other++; continue; }

    let wnPos = SUBTLEX_TO_WN[domPos] ?? null;
    if (wnPos && !wn.has(lemma, wnPos)) {
      // Dominant POS missing from WordNet: fall back to the most frequent POS WordNet does have.
      wnPos = byFreq.map(([p]) => SUBTLEX_TO_WN[p]).find((p): p is WnPos => !!p && wn.has(lemma, p)) ?? null;
    }

    // Not a WordNet lemma. Real modern words (superhero, rehab, coworker) are AGID/SCOWL lemmas with a
    // CMUdict pronunciation and are kept for synset-free gloss generation; everything else is subtitle
    // noise (weli, youre, tellin) or a function-like word (how, shall, whenever) that belongs in the
    // hand-curated closed-class layer. Rejects are logged for review, not printed.
    const scowlWord = agid.lemmaForms.has(lemma) && !!cmu[lemma];
    if (cls === 'content' && !wnPos && !scowlWord) {
      excluded.no_wordnet++;
      if (rejects.length < 3000) rejects.push({ lemma, dom_pos: domPos, in_cmu: !!cmu[lemma], reason: 'no_wordnet_sense' });
      continue;
    }

    const american = britishToAmerican(lemma);
    // Only when the American spelling is at least as frequent, so tour/tor and dialogue/dialog survive.
    if (american && wn.has(american) && (agg.get(american)?.total ?? 0) >= agg.get(lemma)!.total) {
      excluded.british_variant++;
      continue;
    }

    let posLabel = wnPos ? WN_POS_LABEL[wnPos] : (POS_LABEL_FALLBACK[domPos] ?? '');
    const secondary = byFreq.find(([p, n]) => {
      const sp = SUBTLEX_TO_WN[p];
      return sp && sp !== wnPos && n >= domCount * SECONDARY_POS_SHARE && wn.has(lemma, sp);
    });
    if (posLabel && secondary) posLabel = `${posLabel} & ${WN_POS_LABEL[SUBTLEX_TO_WN[secondary[0]]!]}`;

    records.push({
      rank: records.length + 1,
      lemma,
      class: cls,
      dom_pos: domPos,
      pos_label: posLabel,
      wn_pos: wnPos,
      in_wordnet: wn.has(lemma),
      in_cmu: !!cmu[lemma],
    });
    if (records.length >= OUTPUT_LIMIT) break;
  }

  fs.writeFileSync(path.join(SOURCES_DIR, 'lemmas.jsonl'), records.map((r) => JSON.stringify(r)).join('\n') + '\n');
  fs.writeFileSync(path.join(SOURCES_DIR, 'lemma-rejects.jsonl'), rejects.map((r) => JSON.stringify(r)).join('\n') + '\n');

  const stats: Record<string, unknown> = { excluded_before_limit: excluded };
  for (const tier of [1000, 5000, 10000, 15000, 25000]) {
    const slice = records.slice(0, tier);
    const content = slice.filter((r) => r.class === 'content');
    stats[`top_${tier}`] = {
      function_words: slice.length - content.length,
      content_words: content.length,
      content_in_cmu: content.filter((r) => r.in_cmu).length,
      content_missing_cmu_count: content.filter((r) => !r.in_cmu).length,
      content_missing_cmu_sample: content.filter((r) => !r.in_cmu).slice(0, 40).map((r) => r.lemma),
    };
  }
  fs.writeFileSync(path.join(SOURCES_DIR, 'coverage-stats.json'), JSON.stringify(stats, null, 2) + '\n');
  console.log(JSON.stringify(stats, null, 2));
}

main().catch((err) => { console.error(err); process.exit(1); });
