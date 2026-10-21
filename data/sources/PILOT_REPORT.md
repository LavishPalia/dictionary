# पन्ना (Panna) — Phase 1 Pilot & Data Validation Report

**Updated:** 2026-10-20
**Status:** Phase 1 tooling and data complete. **Two gates still open:** (1) 143 of 200 pilot glosses are waiting for
Gemini quota, and (2) the native-Hindi-speaker review (≤ 2 errors / 200) has not been done yet.

This report replaces the 2026-10-17 version. That version's gloss pilot did not call Gemini or produce any Hindi, and it
selected senses with `wordpos.lookup(word)[0]` (first sense of any POS: *see* → bishop's seat, *oh* → Ohio). Its
"gate passed" claims were withdrawn.

---

## 1. Lemma list (`scripts/build-lemma-list.ts` → `lemmas.jsonl`)

Source: official SUBTLEX-US file **with CLAWS part-of-speech columns** (Ghent University, `subtlexus1.zip`). The
`subtlex-word-frequencies` npm package used before has no POS data and has been removed.

Method:
* A word form folds into its AGID lemma only when the inflection's POS matches the form's dominant SUBTLEX POS
  (*saw*[Verb] → see, *left*[Verb] → leave). The form's other uses stay separate: *left* (adj.), *saw* (n.).
* Participles WordNet lacks fold into the verb (*flattered*, *gotten*). Plurals fold into the singular unless the
  plural is the more common noun (*species*, *physics*, *news*, *clothes* stay; *things*, *ways* fold).
* Removed: proper nouns (dominant POS = Name: 5,839), clitic fragments (*s, t, ll, don, didn*), 33 blocklisted
  terms, 156 British spellings whose US form is at least as common (*emphasise*, *colour*), and 3,322 subtitle-noise
  words with no WordNet sense that are not SCOWL lemmas (*weli, youre, tellin*).
* The output is deterministic (identical SHA-256 across runs) and pinned in `checksums.json`.

| Band | Function words (→ closed-class layer) | Content words | Content words missing from CMUdict |
| --- | ---: | ---: | ---: |
| Top 1k | 148 | 852 | 0 |
| Top 5k | 265 | 4,735 | 2 |
| Top 10k | 331 | 9,669 | 87 |
| Top 15k | 395 | 14,605 | 403 |
| Top 25k | 462 | 24,538 | **2,384 (9.7%)** |

Findings that change the plan:
1. **About 2,400 of the top 25k need a generated pronunciation**, not the "~200–400 OOV" in the plan. The OOV
   pronunciation path (Gemini + review) must be sized for that.
2. **590 of the top-25k content words are not in WordNet** (*superhero, rehab, coworker, legit*). They are kept as
   SCOWL lemmas and defined without synsets. Some of them are names that slipped through (*shelly, buffy, zorro*);
   the generator's `is_valid_headword` check is there to drop those in Phase 4.
3. 1,814 headwords get a double POS label (`n. & v.`, `adv. & adj.`) because their second POS reaches ≥ 25% of the first.

## 2. Gloss pilot (`scripts/pilot-glosses.ts` → `pilot/`)

* **Sample:** 200 words, 50 per band (top 1k, 1k–5k, 5k–15k, 15k–25k), seeded and frozen in `pilot/pilot-sample.json`.
  It always includes the polysemy probes *bank, light, run, spring, match, tie, strike, plant, organ*. Closed-class
  words and the 453 hand-written entries are excluded, because they are overrides, not generated output.
* **Prompt:** dominant-POS top-3 WordNet senses (frequency-ordered) with synonyms, one example, and a
  transitivity hint from WordNet verb frames. The model picks the sense and writes a definition (≤ 140 chars) and
  Hindi (≤ 35 chars, everyday Hindi, loanwords allowed). Output is constrained by a JSON schema.
* **Gate enforcement:** POS must be one of the allowed labels, the chosen sense must be a real candidate id, and the
  Hindi must be Devanagari only. Over-length output is re-sent with feedback up to 3 times, then goes to
  `review-queue.jsonl`. Nothing is ever truncated.

### Result so far: 57 / 200 generated (gemini-3.6-flash)

| Check | Result |
| --- | --- |
| Passed validation on first attempt | 57 / 57 |
| Over-length / review queue | 0 |
| Longest definition / Hindi | 74 / 26 characters |
| Polysemy probes done (8 of 9) | bank → बैंक · light → रोशनी · run → दौड़ना · spring → बसंत · match → मैच · tie → बांधना · strike → मारना · plant → पौधा — **all everyday senses** |
| Non-first WordNet sense chosen | 13 (e.g. bank.n.02, officer.n.03, client.n.02: correct overrides of WordNet order) |

Preliminary check by Claude (not a substitute for the native-speaker gate) on the 57:
* **1 error:** *trust* is labelled `v. i.`; it should be `v. t.`
* **1 debatable:** *living* is glossed "the state of being alive / जीवन". "Earn a living / रोज़ी-रोटी" is arguably the everyday sense.

### Why only 57

The supplied key is on the Gemini **free tier: 20 requests per model per day**. `gemini-3.8-flash` and
`gemini-3.7-flash` were already exhausted. Repeated HTTP 503s ("model overloaded") then used up the
3.6/3.5-flash quota. The generator now sends 20 words per request and switches model on a daily-quota 429.

**To finish (after the quota resets, or with billing on):**
```bash
RESUME=1 GEMINI_MODEL=gemini-3.6-flash npm run data:pilot   # completes the remaining 143 on the same model
```
Or, to pilot the model you will actually use in Phase 4, regenerate all 200 on it (about 10 requests):
```bash
GEMINI_MODEL=gemini-3.8-flash npm run data:pilot
```

**Phase 4 cannot run on the free tier** (~25,000 words = ~1,250 batched requests). Billing must be enabled on the key.

### Native-speaker review (open gate)

`pilot/PILOT_REVIEW_SHEET.csv` opens in Excel or Google Sheets with Devanagari intact. The reviewer fills
`VERDICT (OK / ERROR)` and a correction for each row. **Pass = ≤ 2 ERROR rows out of 200.**

## 3. Closed-class layer (`closed-class-words.jsonl`)

**305 entries**: pronouns, determiners/quantifiers, prepositions, conjunctions, modals/auxiliaries, wh-words,
grammatical adverbs, interjections, cardinals 0–20 plus tens, hundred to billion, and ordinals 1st–10th. Every function
word in the top 1k is covered.
* All entries are `reviewed: 0`. They were hand-written by AI agents, not checked by a person yet. Earlier versions
  wrongly carried `reviewed: 1`.
* Fixes to the original 89: *of* pronunciation ऑफ़ → ऑव; clearer *under/whom/them* definitions; more natural
  Hindi for *before, through, will, shall, would, might, must, the*.
* *half, yet, yes, near* were dropped from this layer because the hand-written book already has them.

## 4. Re-labelled hand-written entries

All 453 original entries (485 printed rows) now carry `source: "Panna Vintage Editorial"`,
`license_attribution: "Project Panna / Original Editorial"`, `reviewed: 1`. The old "Open WordNet / CC BY-SA 3.0"
label was inaccurate. The catalog is otherwise unchanged, except for one fix: *Defeat* pronunciation "डि defeat" → डिफ़ीट.

Pre-existing issues found, **not fixed** (they belong to Phase 2, when entries move to SQLite):
* **32 headwords are printed twice** on different pages (*banner, beacon, damp, dance, danger, …*).
  This violates the "zero duplicate headwords" gate.
* `scripts/test-pagination.ts` fails Invariant 2: page 611 prints *Quote* before *Quota*. The committed catalog
  already does this.

## 5. Phase 1 checklist

| Plan item | Status |
| --- | --- |
| Lemmatize SUBTLEX-US top 25k with reverse AGID | ✅ |
| Measure WordNet / CMUdict overlap | ✅ |
| 200 Gemini glosses, dominant-POS top-3 prompt, polysemy probes | ⏳ 57/200 (quota) |
| Length budget 100% (≤ 140 / ≤ 35), no truncation | ✅ for the 57 generated; enforced in code |
| Native Hindi speaker review, ≤ 2 errors / 200 | ❌ needs a person |
| ~300 closed-class words | ✅ 305 (pending human review) |
| Re-label 453 hand-written entries | ✅ |
| Sources pinned (checksums) | ✅ infl.txt, SUBTLEX zip + TSV, lemmas.jsonl, closed-class, blocklist |
