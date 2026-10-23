# data/sources — committed inputs for the offline dictionary pipeline

Everything the build needs is committed here. Third-party raw downloads live in `raw/` (git-ignored) and are
only needed to regenerate `lemmas.jsonl`; re-fetch them with `bash scripts/fetch-sources.sh`.

| File | What it is | Produced by | Licence / attribution |
| --- | --- | --- | --- |
| `infl.txt` | AGID inflection database (SCOWL project), lemma → inflected forms | downloaded, pinned | AGID: free use with copyright notice (Kevin Atkinson) |
| `heteronyms.json` | POS-specific CMUdict phoneme overrides for common heteronyms | hand-curated | Project Panna; phoneme source CMUdict |
| `lemmas.jsonl` | Ranked headword candidates: lemma, rank, dominant POS, printed POS label, WordNet/CMUdict presence. No raw counts. | `npm run data:lemmas` | derived from SUBTLEX-US (Brysbaert & New 2009; PoS: Brysbaert, New & Keuleers 2012) |
| `lemma-rejects.jsonl` | High-frequency words dropped as noise (no WordNet sense, not a SCOWL lemma) — for audit | `npm run data:lemmas` | — |
| `coverage-stats.json` | Coverage of the lemma list by band (content vs function words, CMUdict gaps) | `npm run data:lemmas` | — |
| `blocklist.txt` | Slurs and explicit vulgarity excluded from headwords | hand-written | Project Panna |
| `closed-class-words.jsonl` | ~300 function words (pronouns, prepositions, determiners, conjunctions, modals, numbers, interjections) that override generated entries | hand-written | Project Panna / Original Editorial |
| `pilot/` | Phase 1 Gemini gloss pilot: 200 stratified entries, review sheet, summary | `npm run data:pilot` | machine-generated (Gemini) from WordNet 3.1 senses |
| `review-queue.jsonl` | Entries that failed the length/validation gate after 3 attempts — fix by hand, never truncate | gloss generator | — |
| `checksums.json` | SHA-256 of pinned inputs | — | — |

WordNet 3.1 (`wordnet-db` npm package) and CMUdict (`cmu-pronouncing-dictionary` npm package) are read from
`node_modules`, pinned by `package-lock.json`.

## Review status (`reviewed` flag)

* `1` — written or checked by a person. The 453 original book entries (`scripts/seed-entries.ts`,
  `scripts/expanded-entries.ts`, `scripts/paginate.ts`) are `1`.
* `0` — not yet checked by a native Hindi speaker. **All closed-class entries are `0`** until the
  native-speaker pass is done; flip each to `1` only after it is checked.

## Gemini key

Gloss generation reads `GEMINI_API_KEY` from the environment or from `.env.local` (git-ignored). Never commit it.

## Building the book database

`npm run build:data` (also run automatically by `predev` and `prebuild`) runs `scripts/init-db.ts`, which builds
`data/dictionary.db` (git-ignored) from the hand-written entries (`scripts/seed-entries.ts`,
`scripts/companion-entries.ts`, `scripts/expanded-entries.ts`) and `closed-class-words.jsonl`:

* One entry per headword. When the hand-written lists repeat a headword, the first one wins (seed, then
  companion, then expanded). When a closed-class word is also a hand-written headword (*mine*), the function-word
  sense wins.
* Entries are sorted alphabetically and laid out 8 per page (4 per column) from page 1. Page numbers are never
  hard-coded and change whenever entries are added.
* `meta.data_version` is a hash of the book contents. The client sends it with `/api/page/[n]?v=…`, so cached
  pages are discarded when the book changes.

Checks: `npm run test:pagination` (structure), `npm run verify:determinism` (two builds give identical tables),
`npm run test:api` (needs a running server).
On Windows the database can't be replaced while `npm run dev` has it open, so stop the server before rebuilding.

## Phase 3: pronunciation and inflection lookup

`scripts/phonetics.ts` converts CMUdict ARPAbet phonemes to a Devanagari pronunciation approximation. When a word is
listed in `heteronyms.json`, the POS-specific pronunciation takes precedence over CMUdict's default. Editorial
pronunciations remain the source of truth and are regression-checked without being rewritten.

During `build:data`, AGID inflected forms are linked to matching printed lemmas in `forms`. Exact headwords take
precedence; a matching inflection appears as a search result for its lemma, and `/word/<inflection>` redirects to
the canonical headword. Forms with no printed lemma are skipped, so adding the expanded lexicon later will grow
coverage automatically.

## Phase 4: full lexicon

`npm run data:phase4` calls Gemini only from this offline script. It walks the ranked content lemmas, skips the
curated editorial and closed-class overrides, and writes a pinned `hindi-glosses.jsonl` only when the target of
25,000 total printed entries is complete. Interrupted work is kept in `hindi-glosses-progress.jsonl` and resumes
automatically; set `PHASE4_MAX_REQUESTS=1` for a one-batch run. Batches default to 20 lemmas, configurable through
`GEMINI_BATCH_SIZE`. The generated review sheet `PHASE4_TOP5000_REVIEW.csv` is written after full generation.
Generated rows stay at `reviewed: 0` until a native Hindi speaker checks them. The generator never runs as part of
`build:data`, `dev`, or `build`.
