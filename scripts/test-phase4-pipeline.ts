import assert from 'node:assert/strict';
import { generatedEntriesNeeded, LemmaCandidate, selectPhase4Candidates, toPhase4Entry } from './lib/phase4';

const candidates: LemmaCandidate[] = [
  { rank: 3, lemma: 'gamma', class: 'content', pos_label: 'n.', wn_pos: 'n', in_cmu: true },
  { rank: 1, lemma: 'the', class: 'function', pos_label: 'art.', wn_pos: null, in_cmu: true },
  { rank: 2, lemma: 'alpha', class: 'content', pos_label: 'n.', wn_pos: 'n', in_cmu: true },
  { rank: 4, lemma: 'editorial', class: 'content', pos_label: 'n.', wn_pos: 'n', in_cmu: true },
];
assert.deepEqual(selectPhase4Candidates(candidates, new Set(['editorial'])).map((x) => x.lemma), ['alpha', 'gamma']);
assert.equal(generatedEntriesNeeded(25000, 757), 24243);
assert.equal(generatedEntriesNeeded(25000, 25001), 0);
const entry = toPhase4Entry({ rank: 4200, headword: 'sample', normalized: 'sample', has_wordnet: true,
  is_valid_headword: true, ok: true, pos: 'n.', pronunciation_deva: 'सैम्पल', definition_en: 'an example.', meaning_hi: 'उदाहरण' });
assert.equal(entry?.reviewed, 0);
assert.match(entry?.license_attribution ?? '', /native review pending/);
assert.equal(toPhase4Entry({ rank: 1, headword: 'reject', normalized: 'reject', has_wordnet: true,
  is_valid_headword: false, ok: true }), null);
console.log('Phase 4 candidate selection checks passed.');
