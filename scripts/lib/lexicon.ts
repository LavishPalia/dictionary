// Shared lexical-source readers for the offline data pipeline.
// Deterministic: reads only local files (AGID infl.txt, SUBTLEX-US PoS TSV, WordNet 3.1 dict files, CMUdict).
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

export const SOURCES_DIR = path.join(process.cwd(), 'data', 'sources');
export const RAW_DIR = path.join(SOURCES_DIR, 'raw');
export const WORDNET_DIR = path.join(process.cwd(), 'node_modules', 'wordnet-db', 'dict');

export type WnPos = 'n' | 'v' | 'a' | 'r';
export type AgidPos = 'N' | 'V' | 'A';

export function sha256File(file: string): string {
  return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}

/** Fails loudly if a pinned source no longer matches data/sources/checksums.json. */
export function verifyChecksums(relPaths: string[]): void {
  const pinned: Record<string, string> = JSON.parse(
    fs.readFileSync(path.join(SOURCES_DIR, 'checksums.json'), 'utf8'),
  );
  for (const rel of relPaths) {
    const expected = pinned[rel];
    if (!expected) throw new Error(`No pinned checksum for ${rel}`);
    const actual = sha256File(path.join(process.cwd(), rel));
    if (actual !== expected) throw new Error(`Checksum mismatch for ${rel}: ${actual} != ${expected}`);
  }
}

/** Records the current sha256 of a data/sources file (repo-relative, forward slashes) in checksums.json. */
export function pinChecksum(relPath: string): void {
  const checksumFile = path.join(SOURCES_DIR, 'checksums.json');
  const checksums: Record<string, string> = JSON.parse(fs.readFileSync(checksumFile, 'utf8'));
  checksums[relPath] = sha256File(path.join(process.cwd(), relPath));
  fs.writeFileSync(checksumFile, JSON.stringify(checksums, null, 2) + '\n');
}

// ---------------------------------------------------------------------------
// AGID (infl.txt)
// ---------------------------------------------------------------------------

export interface AgidData {
  /** inflected form -> parents (lemma + POS of the inflection line) */
  formToParents: Map<string, Array<{ lemma: string; pos: AgidPos }>>;
  /** lemma -> POS -> forms */
  lemmaForms: Map<string, Map<AgidPos, Set<string>>>;
}

export function loadAgid(file = path.join(SOURCES_DIR, 'infl.txt')): AgidData {
  const formToParents = new Map<string, Array<{ lemma: string; pos: AgidPos }>>();
  const lemmaForms = new Map<string, Map<AgidPos, Set<string>>>();

  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^(\S+) ([NVA])\??: (.*)$/);
    if (!m) continue;
    // Lower-case only: capitalised AGID lemmas are proper nouns (Cadillac, Ephesians).
    const lemma = m[1];
    const pos = m[2] as AgidPos;
    if (!/^[a-z]+(-[a-z]+)*$/.test(lemma)) continue;

    for (const slot of m[3].split('|')) {
      for (const rawVariant of slot.split(',')) {
        // Strip sense annotations like {be_able}; skip archaic (level 2+) and questionable (?) variants.
        const variant = rawVariant.replace(/\{[^}]*\}/g, '').trim();
        if (!variant || /\?/.test(variant) || /\s[2-9]\b/.test(variant)) continue;
        const form = variant.replace(/[~<!]/g, '').replace(/\s+\d+$/, '').trim().toLowerCase();
        if (!/^[a-z]+(-[a-z]+)*$/.test(form)) continue;

        if (!lemmaForms.has(lemma)) lemmaForms.set(lemma, new Map());
        const byPos = lemmaForms.get(lemma)!;
        if (!byPos.has(pos)) byPos.set(pos, new Set());
        byPos.get(pos)!.add(form);

        if (form === lemma) continue;
        const parents = formToParents.get(form) ?? [];
        if (!parents.some((p) => p.lemma === lemma && p.pos === pos)) parents.push({ lemma, pos });
        formToParents.set(form, parents);
      }
    }
  }
  return { formToParents, lemmaForms };
}

// ---------------------------------------------------------------------------
// SUBTLEX-US with CLAWS PoS (Brysbaert & New 2009; PoS columns 2012)
// ---------------------------------------------------------------------------

export interface SubtlexRow {
  word: string;
  count: number;
  domPos: string;
  posCounts: Map<string, number>;
}

export function loadSubtlexPos(file = path.join(RAW_DIR, 'subtlex-us-pos.tsv')): Map<string, SubtlexRow> {
  const rows = new Map<string, SubtlexRow>();
  const lines = fs.readFileSync(file, 'utf8').split(/\r?\n/);
  const header = lines[0].split('\t');
  const col = (name: string) => header.indexOf(name);
  const iWord = col('Word'), iCount = col('FREQcount'), iDom = col('Dom_PoS_SUBTLEX');
  const iAllPos = col('All_PoS_SUBTLEX'), iAllFreq = col('All_freqs_SUBTLEX');

  for (const line of lines.slice(1)) {
    if (!line) continue;
    const f = line.split('\t');
    const word = f[iWord].toLowerCase();
    const posNames = (f[iAllPos] || '').split('.');
    const posFreqs = (f[iAllFreq] || '').split('.').map(Number);
    const posCounts = new Map<string, number>();
    posNames.forEach((p, i) => {
      if (p && Number.isFinite(posFreqs[i])) posCounts.set(p, posFreqs[i]);
    });
    const existing = rows.get(word);
    const count = Number(f[iCount]) || 0;
    if (existing && existing.count >= count) continue;
    rows.set(word, { word, count, domPos: f[iDom], posCounts });
  }
  return rows;
}

export const SUBTLEX_TO_WN: Record<string, WnPos | undefined> = {
  Noun: 'n', Verb: 'v', Adjective: 'a', Adverb: 'r',
};
export const SUBTLEX_TO_AGID: Record<string, AgidPos | undefined> = {
  Noun: 'N', Verb: 'V', Adjective: 'A', Adverb: 'A',
};
export const WN_POS_LABEL: Record<WnPos, string> = { n: 'n.', v: 'v.', a: 'adj.', r: 'adv.' };

// ---------------------------------------------------------------------------
// Princeton WordNet 3.1 (wordnet-db dict files)
// ---------------------------------------------------------------------------

const WN_FILE: Record<WnPos, string> = { n: 'noun', v: 'verb', a: 'adj', r: 'adv' };

export interface Synset {
  id: string; // e.g. bank.n.02 (sense number within the lemma, frequency-ordered)
  offset: string;
  pos: WnPos;
  words: string[];
  gloss: string; // definition only
  examples: string[];
  verbFrames: number[];
}

export interface WnPointer {
  symbol: string; // '!' antonym, '&' similar to, '@' hypernym, …
  offset: string;
  pos: WnPos;
  source: number;
  target: number;
}

export class WordNet {
  private index: Record<WnPos, Map<string, string[]>> = { n: new Map(), v: new Map(), a: new Map(), r: new Map() };
  private data: Record<WnPos, Buffer> = {} as Record<WnPos, Buffer>;

  constructor(dir = WORDNET_DIR) {
    for (const pos of Object.keys(WN_FILE) as WnPos[]) {
      for (const line of fs.readFileSync(path.join(dir, `index.${WN_FILE[pos]}`), 'utf8').split('\n')) {
        if (!line || line.startsWith(' ')) continue;
        const f = line.trim().split(' ');
        const synsetCnt = Number(f[2]);
        this.index[pos].set(f[0], f.slice(f.length - synsetCnt));
      }
      this.data[pos] = fs.readFileSync(path.join(dir, `data.${WN_FILE[pos]}`));
    }
  }

  has(lemma: string, pos?: WnPos): boolean {
    const key = lemma.toLowerCase().replace(/ /g, '_');
    if (pos) return this.index[pos].has(key);
    return (Object.keys(this.index) as WnPos[]).some((p) => this.index[p].has(key));
  }

  senseCount(lemma: string, pos: WnPos): number {
    return this.index[pos].get(lemma.toLowerCase())?.length ?? 0;
  }

  synsets(lemma: string, pos: WnPos, limit = 3): Synset[] {
    const offsets = this.index[pos].get(lemma.toLowerCase()) ?? [];
    return offsets.slice(0, limit).map((offset, i) => this.readSynset(lemma, pos, offset, i + 1));
  }

  /** The lemma's synset offsets for pos, most frequent sense first. */
  senseOffsets(lemma: string, pos: WnPos): string[] {
    return this.index[pos].get(lemma.toLowerCase().replace(/ /g, '_')) ?? [];
  }

  /**
   * A synset's words and its pointers (kept apart from Synset, whose shape feeds the Phase 4 prompts).
   * `source`/`target` are 1-based word numbers for lexical pointers such as antonyms, and 0 for semantic ones.
   */
  links(pos: WnPos, offset: string): { satellite: boolean; words: string[]; pointers: WnPointer[] } {
    const f = this.line(pos, offset).split(' | ')[0].split(' ');
    const wCnt = parseInt(f[3], 16);
    const words: string[] = [];
    for (let i = 0; i < wCnt; i++) words.push(f[4 + i * 2].replace(/\(.*\)$/, '').replace(/_/g, ' '));
    const pCntIdx = 4 + wCnt * 2;
    const pointers: WnPointer[] = [];
    for (let k = 0, i = pCntIdx + 1; k < Number(f[pCntIdx]); k++, i += 4) {
      const st = f[i + 3];
      pointers.push({
        symbol: f[i], offset: f[i + 1], pos: f[i + 2] === 's' ? 'a' : f[i + 2] as WnPos,
        source: parseInt(st.slice(0, 2), 16), target: parseInt(st.slice(2), 16),
      });
    }
    return { satellite: f[2] === 's', words, pointers };
  }

  private line(pos: WnPos, offset: string): string {
    const buf = this.data[pos];
    const start = Number(offset);
    return buf.subarray(start, buf.indexOf(0x0a, start)).toString('utf8');
  }

  private readSynset(lemma: string, pos: WnPos, offset: string, senseNo: number): Synset {
    const line = this.line(pos, offset);
    const [head, glossPart = ''] = line.split(' | ');
    const f = head.split(' ');
    const wCnt = parseInt(f[3], 16);
    const words: string[] = [];
    for (let i = 0; i < wCnt; i++) words.push(f[4 + i * 2].replace(/\(.*\)$/, '').replace(/_/g, ' '));

    const verbFrames: number[] = [];
    if (pos === 'v') {
      const pCntIdx = 4 + wCnt * 2;
      const pCnt = Number(f[pCntIdx]);
      let i = pCntIdx + 1 + pCnt * 4;
      const fCnt = Number(f[i]);
      i++;
      for (let k = 0; k < fCnt; k++, i += 3) verbFrames.push(Number(f[i + 1]));
    }

    const pieces = glossPart.trim().split(/;\s*/);
    const gloss = pieces.filter((p) => !p.startsWith('"')).join('; ').trim();
    const examples = pieces.filter((p) => p.startsWith('"')).map((p) => p.replace(/^"|"$/g, ''));
    return { id: `${lemma}.${pos}.${String(senseNo).padStart(2, '0')}`, offset, pos, words, gloss, examples, verbFrames };
  }
}

/** WordNet verb frames that take a direct object ("Somebody ----s something", etc.). */
export const TRANSITIVE_FRAMES = new Set([8, 9, 10, 11, 14, 15, 16, 17, 18, 19, 20, 21, 24, 25, 26, 28, 29, 30, 31, 32, 33, 34, 35]);

// ---------------------------------------------------------------------------
// CMUdict
// ---------------------------------------------------------------------------

export async function loadCmu(): Promise<Record<string, string>> {
  const mod = await import('cmu-pronouncing-dictionary');
  return mod.dictionary as Record<string, string>;
}
