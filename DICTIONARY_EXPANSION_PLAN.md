# पन्ना (Panna) — Comprehensive Dictionary Expansion Plan (Finalized Master Specification)
**Scaling to 25,000 Printed Lemmas + ~45,000–55,000 Searchable Inflections with Permissive Licensing & Zero Bundle Bloat**

**App:** `panna-3d-dictionary` — Vintage 1928 English ⇄ Hindi Pocket Dictionary  
**Tech Stack:** Next.js 14 App Router, React 18, TypeScript, CSS-3D Engine, Web Audio API, SQLite FTS5, CMUdict, Princeton WordNet 3.1, AGID/SCOWL  
**Document Status:** Finalized Master Implementation Architecture (All Review Items Addressed)  
**Target Reach:** 25,000 printed lemmas (~3,125 pages) + ~45,000–55,000 searchable inflection redirects (70,000–80,000 total lookups)  

---

## 1. Executive Summary & Final Architecture Synthesis

Scaling **पन्ना (Panna)** from 453 words to 25,000+ printed lemmas requires addressing subtle architectural, linguistic, typographic, and database constraints. Following rigorous peer review and verification against SQLite internals, Next.js 14 runtime behaviors, Unicode standards, and dataset licenses, this master architecture incorporates the following critical specifications:

### Core Pillars
1. **Zero Client-Bundle Bloat with Instant Server-Rendered Spreads**:
   * Decouple the synchronous `catalog.json` import from `DictionaryApp.tsx`.
   * Dictionary data lives in an embedded SQLite database (`data/dictionary.db`).
   * **Instant First Load (SSR)**: Next.js Server Components query SQLite directly on the server and pass `{ initialSpread, initialMeta }` as props to `DictionaryApp`. Zero blank flashes, zero initial client network roundtrips, and 100% SEO-ready deep links.
   * **Prefetched Flips**: Subsequent page turns load on demand via `/api/page/[n]` with an in-memory prefetching window of `currentPage ± 2` spreads, preserving silky 60fps 3D flips.
2. **Dominant-Sense Disambiguation & Typographic Height Budget**:
   * "WordNet Sense 1" orders senses by small legacy corpora (e.g. `bank.n.01` is "sloping riverbank", `light.n.01` is physics radiation, `run.n.01` is a baseball run).
   * **Solution**: Extract the dominant part of speech from SUBTLEX-US `DomPoS`. Supply Gemini Flash with the top 3 synsets for that POS to select the everyday modern sense.
   * **Typographic Budget**: WordNet definitions frequently run 200–300 characters, which overflows our fixed 4-entry column layout (`estimateEntryHeight()` in `scripts/paginate.ts`). Gemini simultaneously writes a concise English definition (`definition_en ≤ 140 chars`) and Hindi gloss (`meaning_hi ≤ 3 terms / 35 chars`).
   * **Failure Rule**: When Gemini output exceeds limits, retry up to 3 times with higher compression penalties; if still failing, queue the entry in `data/sources/review-queue.jsonl` for manual review. Never truncate text silently.
3. **Closed-Class Function Words Layer (The Missing 94%)**:
   * Princeton WordNet strictly covers open-class words (nouns, verbs, adjectives, adverbs) and contains **zero function words**.
   * The top 40 most common English words (*the, of, and, to, a, in, is, it, you, that, he, was, for, on, are, with, as, his, they, at, be, this, from...*) would fail without a dedicated layer.
   * **Solution**: A curated layer of ~300 closed-class words (pronouns, prepositions, articles, conjunctions, auxiliaries) + the existing 453 hand-written entries serve as high-priority overrides (`priority: 1`).
4. **Deterministic, Offline Build (No API Calls in Build)**:
   * Hindi glosses and shortened definitions are generated **offline once**, vetted, and committed as versioned source files (`data/sources/hindi-glosses.jsonl`).
   * Raw upstream datasets (CMUdict 0.7b, WordNet 3.1, AGID) are pinned with SHA-256 checksums in `data/sources/checksums.json`.
   * `data/dictionary.db` is a generated file tracked in `.gitignore`.
   * `package.json` configures `"prebuild": "npm run build:data"`, ensuring any deploy build (`npm run build`) automatically generates `dictionary.db` deterministically from local committed source files before `next build`.
   * Determinism is verified across platforms using a pure Node.js verification script (`scripts/verify-determinism.ts`) that streams sorted table rows into a SHA-256 digest.
5. **Devanagari Context-Aware Phonetic Engine**:
   * CMUdict provides base ARPAbet phonemes (134,000 words, BSD license).
   * Positional rules handle initial independent vowels (any vowel phoneme at start or after another vowel uses the independent letter, e.g. *effort* `EH1` → ए, *abandon* `AH0` → independent vowel अ, post-consonant `AE1` → matra ै → अबैंडन), consonant clusters with halant (*S T R* → स्ट्र in *street*), nasalization (*NG* before *K* → थिंक), post-consonant *ER* (बर्ड), stressed schwa (*cut* `K AH1 T` → कट), and standard modern loanword conventions (`ZH` → ज़, as in *vision* → विज़न).
   * Heteronyms (*record, present, read, object, lead, tear, wind...*) resolved via a curated manual lookup table (`data/sources/heteronyms.json`).
   * Rare OOV words (~200–400 lemmas) generated and reviewed in the offline Gemini batch (no crude transliteration).
   * Automated regression test asserts against the 453 existing hand-written pronunciations.
6. **Inflection Search Redirects via AGID (`forms` Table)**:
   * Ingest **AGID (SCOWL project, MIT/BSD license)** to map inflected forms (*ceremonies, running, ran, better*) to their root lemmas in a dedicated `forms` table with compound primary key `(normalized_form, lemma_id)`.
   * Handles polysemous forms (*left* → *leave* / *left*; *saw* → *see* / *saw*; *found* → *find* / *found*) by returning all matching lemmas, prioritizing exact headword matches.
   * Adds ~45,000–55,000 searchable inflections without inflating physical book thickness.
7. **Corrected SQLite Schema & Two-Way Search**:
   * External content FTS5 table linked to `entries` via explicit integer `rowid` (`content='entries', content_rowid='rowid'`).
   * Configured with `tokenize = "unicode61 categories 'L* N* Co Mn Mc'"`.
   * **Bilingual Search Paths**:
     * **Devanagari Input** (`/[\u0900-\u097F]/`): Partial typing executes FTS5 prefix queries (`meaning_hi: "${cleanQuery}"* OR pronunciation_deva: "${cleanQuery}"*`), matching words like *समाज* as soon as `समा` is typed.
     * **Latin Input**: Searches prefix B-tree (`normalized < ? || char(0x10FFFF)`) and typo recovery (query length ±1/±2 sharing same initial letter over lemmas and `forms`).
8. **Permissive, Transparent Legal Attribution**:
   * Existing 453 entries re-labeled as original editorial (`source: "Panna Vintage Editorial"`, `license_attribution: "Project Panna / Original Editorial"`), removing incorrect Open WordNet/CC-BY-SA tags.
   * **Attribution Tiers**:
     * Top 5,000 words + 453 vintage entries undergo native Hindi speaker review: `license_attribution: "Definition: Princeton WordNet 3.1 · Hindi: Machine-assisted, human-reviewed"`, with `reviewed = 1`.
     * Entries 5,001–25,000: `license_attribution: "Definition: Princeton WordNet 3.1 · Hindi: Machine-generated, sample-audited"`, with `reviewed = 0`.
   * In-app Credits view details Princeton WordNet (BSD-style), CMUdict (BSD), AGID (MIT/BSD), and discloses that Hindi glosses for top 5,000 words are human-reviewed, while remaining entries are machine-generated and sample-audited.
   * `wordfreq` and SUBTLEX-US used strictly as offline statistical ranking inputs (never shipped raw).

---

## 2. Scale & The Physical Book Metaphor

### 2.1 The Geometry of a Vintage Pocket Dictionary
* In **पन्ना**, each page renders **8 entries** (4 entries per column × 2 columns).
* A spread displays **16 entries**.

| Layer | Type | Count | Physical Pages | Storage Location | User Experience |
| :--- | :--- | :---: | :---: | :--- | :--- |
| **Printed Lemmas** | Canonical dictionary entries | **25,000** | **3,125 pages** | `entries` table | Rendered in the 3D book pages |
| **Search Redirects** | Inflections (`form_of`) | **~45,000–55,000** | **0 pages** | `forms` table | Redirects to root lemma spread |
| **Closed-Class Words** | Everyday function words | **~300** | Included in 3,125 | `entries` table (override) | Covers *the, in, of, and, is, to...* |
| **Total Searchable Reach** | All word forms | **~70,000–80,000** | **3,125 pages** | Comprehensive | Sub-2ms instant lookup |

### 2.2 Realistic Dynamic Pagination
* In a 25,000-word lexicon, Letters A and B contain ~3,500 words (~437 pages).
* Dynamic data-driven pagination computes page numbers monotonically.
* **Test Decoupling**: E2E browser tests and unit scripts (`test-pagination.ts`) query `/api/word/[headword]` to dynamically obtain word pages, asserting structural invariants (8 entries/page, strict alphabetical order, monotonic sequence) rather than hardcoded page constants.

---

## 3. Lexical Curation & Data Sourcing Pipeline

```
┌────────────────────────────────────────────────────────────────────────┐
│                        OFFLINE DATA PREPARATION                        │
│                                                                        │
│  [SUBTLEX-US Corpus]         [Princeton WordNet 3.1]       [AGID SCOWL]│
│  Dominant POS + Frequency    Top 3 Synsets per POS         100k+ Word  │
│  (Filtered & Lemmatized)     (Nouns, Verbs, Adj, Adv)      Inflections │
│            │                             │                      │      │
│            └──────────────┬──────────────┘                      │      │
│                           ▼                                     │      │
│            [Priority Override Layer (~750 Words)]               │      │
│            • Existing 453 curated vintage entries               │      │
│            • ~300 closed-class words (the, of, in, is...)       │      │
│                           │                                     │      │
│                           ▼                                     │      │
│            [Sense Selection & Length-Bounded Generation]        │      │
│            Prompt Gemini Flash with top 3 synsets:              │      │
│            → Selects everyday sense                             │      │
│            → Concise def (≤ 140 chars) & Hindi (≤ 35 chars)    │      │
│            → Human review on top 5,000 words                    │      │
│            → Saved to data/sources/hindi-glosses.jsonl          │      │
│                           │                                     │      │
│                           ▼                                     │      │
│            [CMUdict Context-Aware Phonetic Engine]              │      │
│            134,000 words ARPAbet → Context-aware Devanagari     │      │
│            + Heteronym table + OOV Gemini batch generation      │      │
│            + Regression test against existing 453 words         │      │
└───────────────────────────┬─────────────────────────────────────┼──────┘
                            │                                     │
┌───────────────────────────┴─────────────────────────────────────┴──────┐
│                    DETERMINISTIC BUILD STEP (npm run build:data)       │
│                                                                        │
│  Reads committed local files:                                          │
│  • data/sources/lemmas.jsonl (lemma names & ranks only, no counts)     │
│  • data/sources/hindi-glosses.jsonl                                    │
│  • data/sources/cmudict.json                                           │
│  • data/sources/agid-inflections.jsonl                                 │
│  • data/sources/closed-class-words.jsonl                               │
│  • data/sources/heteronyms.json                                        │
│                                                                        │
│  → Validates SHA-256 against data/sources/checksums.json               │
│  → Builds data/dictionary.db (SQLite + FTS5 external content)          │
│  → Pre-computes 3,125 pages with guide words and footer hints          │
│  → Verifies determinism via scripts/verify-determinism.ts              │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │
┌───────────────────────────────────┴────────────────────────────────────┐
│                       NEXT.JS RUNTIME ARCHITECTURE                     │
│                                                                        │
│  • Server Components (SSR): Direct SQLite query for initial spread     │
│  • Client JS Bundle: 0 KB dictionary entries                           │
│  • /api/meta: returns { total_pages, thumb_index, data_version }       │
│  • /api/page/[n]?v=<dataVersion>: returns 8-entry page object          │
│  • /api/search?q=...: exact match + Devanagari FTS5 + Typo Recovery    │
│  • Client pre-fetches [currentPage - 2 ... currentPage + 2]            │
└────────────────────────────────────────────────────────────────────────┘
```

### 3.1 Headword Curation & Single-Lemma Policy
1. **Lemmatization & Filtering**:
   * SUBTLEX-US raw word forms are lemmatized using reverse AGID. Frequency counts of all inflections combine into the lemma root.
   * Filter out proper nouns (capitalized in SUBTLEX/WordNet, character names, places).
   * Filter offensive words/profanity using a standard lexical blocklist.
   * Intersect with Princeton WordNet lemmas to ensure authoritative grammatical definitions.
2. **Canonical Single-Headword Policy**:
   * Exactly **one canonical printed entry per unique headword lemma** (`normalized TEXT UNIQUE NOT NULL`).
   * Dominant POS taken from SUBTLEX-US `DomPoS`.
   * For lemmas with multiple common parts of speech (e.g. *run* as verb and noun), `pos` records both concisely (e.g. `v. & n.`), while definition and Hindi translation focus on the dominant everyday sense.

### 3.2 Sense Disambiguation, Typographic Budget & Pilot Gate
To resolve the polysemy trap (`bank` riverbank vs financial; `light` radiation vs not heavy) and prevent page overflow:
* **Prompt Schema**:
  ```json
  {
    "headword": "bank",
    "dominant_pos": "n.",
    "synsets": [
      { "id": "bank.n.01", "def": "sloping land (especially the slope beside a body of water)" },
      { "id": "bank.n.02", "def": "a financial institution that accepts deposits and channels money into lending activities" },
      { "id": "bank.n.03", "def": "a long ridge or pile" }
    ],
    "task": "1. Identify the everyday common sense. 2. Write a concise English definition (MAX 140 chars). 3. Provide 1-3 concise Hindi glosses in Devanagari (MAX 35 chars total)."
  }
  ```
* **Typographic Enforcement**:
  * `definition_en`: Strict length gate `≤ 140 characters`.
  * `meaning_hi`: Strict length gate `≤ 35 characters` (1–3 terms).
  * Guarantees `estimateEntryHeight()` fits 4 entries per column without layout breakage.
  * **Failure Rule**: When Gemini output exceeds limits, retry up to 3 times with higher compression penalties; if still failing, queue the entry in `data/sources/review-queue.jsonl` for manual review. Never truncate text silently.
* **Pilot Verification Gate**:
  * Generate 200 samples stratified across frequency bands (top 1k, 1k–5k, 5k–15k, 15k–25k).
  * Deliberately include known polysemous words (*bank, light, run, spring, match, tie, strike, plant, organ*).
  * Native Hindi speaker reviews English definition ⇄ Hindi gloss pairs.
  * Acceptance threshold: **≤ 2 errors in 200 samples** (`≤ 1%`). Top 5,000 words receive full human review before final commit.

---

## 4. Context-Aware Devanagari Phonetic Engine (`scripts/phonetics.ts`)

CMUdict (134,000 entries with ARPAbet phonemes) is mapped deterministically with positional context:

### 4.1 Positional & Contextual Rules
1. **Initial Vowels**: Any vowel phoneme at the start of a word or immediately following another vowel uses the **independent Devanagari vowel character**:
   * `EH1` → ए (*effort* `EH1 F ER0 T` → एफर्ट)
   * `AA1` → आ (*arch* `AA1 R CH` → आर्च)
   * `IH1` → इ (*image* `IH1 M AH0 JH` → इमेज)
   * `AE1` → ऐ (*abandon* `AH0 B AE1 N D AH0 N` → initial schwa `AH0` is independent vowel अ)
2. **Post-Consonant Dependent Vowels (Matras)**: When a vowel follows a consonant, use the **dependent vowel sign**:
   * `B` + `AE1` → बै (*bat* `B AE1 T` → बैट)
   * `S` + `EH1` → से (*cellar* `S EH1 L ER0` → सेलर)
   * `K` + `AA1` → का (*calm* `K AA1 M` → काम)
3. **Consonant Clusters & Halant**: Adjacent consonants are joined with virama/halant `्`:
   * `S` + `T` + `R` → स्ट्र (*street* `S T R IY1 T` → स्ट्रीट)
   * `K` + `S` → क्स (*box* `B AA1 K S` → बॉक्स)
4. **Nasalization & Anusvara**:
   * `NG` before `K` or `G` → ंग / ं (*think* `TH IH1 NG K` → थिंक; *sing* `S IH1 NG` → सिंग).
5. **Vocalic & Post-Vocalic R**:
   * `ER` after a consonant resolves to reph or vocalic representation (*bird* `B ER1 D` → बर्ड).
6. **Schwa Handling (`AH`)**:
   * Initial unstressed `AH0` → independent vowel अ (*abandon* `AH0 B AE1 N D AH0 N` → अबैंडन; *about* `AH0 B AW1 T` → अबाउट).
   * Stressed `AH1` between consonants → inherent vowel with no matra (*cut* `K AH1 T` → कट).
7. **Modern Loanword Phoneme Alignment**:
   * `ZH` → ज़ (*vision* `V IH1 ZH AH0 N` → विज़न, *measure* `M EH1 ZH ER0` → मेज़र).
8. **Heteronyms & Out-of-Vocabulary (OOV) Handling**:
   * **Heteronyms Table (`data/sources/heteronyms.json`)**: Curated manual lookup for ~50 common heteronyms (*record, present, read, object, lead, tear, wind, live, close, produce, desert...*), selecting the pronunciation matching the dominant POS.
   * **OOV Ingestion**: Any words in the 25k lemma list missing from CMUdict (~200–400 words) are generated alongside Hindi glosses in the offline Gemini batch and human-reviewed.
   * **Regression Test**: Automated test compares phonetic engine output against the existing 453 hand-written pronunciations, asserting `> 95%` exact match or acceptable standard phonetic variants.

---

## 5. Storage Schema & SQLite Architecture

### 5.1 Corrected Database Schema (`data/dictionary.db`)
```sql
-- 1. Main Printed Lexical Entries (Lemmas only)
CREATE TABLE entries (
    rowid INTEGER PRIMARY KEY,
    id TEXT UNIQUE NOT NULL,
    headword TEXT NOT NULL,
    normalized TEXT UNIQUE NOT NULL,     -- Automatically indexed by UNIQUE constraint
    pos TEXT NOT NULL,                   -- e.g. 'n.', 'v. t.', 'adj.', 'prep.', 'v. & n.'
    pronunciation_deva TEXT NOT NULL,
    definition_en TEXT NOT NULL,
    meaning_hi TEXT NOT NULL,
    source TEXT NOT NULL,
    license_attribution TEXT NOT NULL,
    reviewed INTEGER NOT NULL DEFAULT 0, -- 1 for human-reviewed (top 5k + 453), 0 for sample-audited
    page_number INTEGER NOT NULL,
    col_idx INTEGER NOT NULL,            -- 1 or 2 (avoid SQL keyword 'column')
    position_in_col INTEGER NOT NULL     -- 0 to 3
);

CREATE INDEX idx_entries_page ON entries(page_number);

-- 2. Inflections & Search Redirects (Decoupled from printed pagination)
CREATE TABLE forms (
    normalized_form TEXT NOT NULL,
    form TEXT NOT NULL,
    lemma_id TEXT NOT NULL REFERENCES entries(id),
    lemma_headword TEXT NOT NULL,
    page_number INTEGER NOT NULL,
    PRIMARY KEY (normalized_form, lemma_id) -- Automatically indexed by PRIMARY KEY
);

-- 3. Pre-computed Book Pages Table
CREATE TABLE pages (
    page_number INTEGER PRIMARY KEY,
    guide_left TEXT NOT NULL,
    guide_right TEXT NOT NULL,
    first_headword TEXT NOT NULL,
    last_headword TEXT NOT NULL,
    footer_hints TEXT NOT NULL,
    entry_ids TEXT NOT NULL              -- JSON array of entry IDs on this page
);

-- 4. Full-Text Search Virtual Table (External Content Table linked to entries)
CREATE VIRTUAL TABLE entries_fts USING fts5(
    headword,
    normalized,
    meaning_hi,
    pronunciation_deva,
    content='entries',
    content_rowid='rowid',
    tokenize = "unicode61 categories 'L* N* Co Mn Mc'"
);

-- Build step executes:
-- INSERT INTO entries_fts(entries_fts) VALUES('rebuild');
```

### 5.2 Next.js 14 App Router Integration
1. **Next.js Native Module Config (`next.config.mjs`)**:
   ```javascript
   /** @type {import('next').NextConfig} */
   const nextConfig = {
     reactStrictMode: true,
     experimental: {
       serverComponentsExternalPackages: ['better-sqlite3'],
       outputFileTracingIncludes: {
         '/**': ['./data/dictionary.db'],
       },
     },
   };
   export default nextConfig;
   ```
   *(Note: The recursive glob `'/**'` is required in Next 14.2 because `'/*'` misses the root home page `/`).*
2. **Server-Side Rendering (SSR) & Direct SQLite Access**:
   * Server components (`src/app/page.tsx`, `src/app/page/[pageNumber]/page.tsx`, `src/app/word/[headword]/page.tsx`) query SQLite directly on the server.
   * `DictionaryApp` receives `{ initialSpread, initialMeta }` as server props.
   * Instant first-page render with 0 client network roundtrips.
3. **Versioned Route Caching for Client Turns**:
   * Subsequent page flips fetch `/api/page/[n]?v=<DATA_VERSION>`.
   * Headers: `Cache-Control: public, max-age=31536000, immutable`.
   * When data is rebuilt, `DATA_VERSION` increments, invalidating stale browser caches immediately.

---

## 6. Client Migration: Async Spreads & Prefetching Window

Migrating `DictionaryApp.tsx` from synchronous `catalog.json` import to async data is a major architectural phase:

### 6.1 State Management & Prefetching Window
* **Hydration**: Initialize state directly from server-rendered props (`initialSpread`, `initialMeta`).
* **Default Page**: Route `/` defaults to Page 1 (opening the dictionary at Letter A: *Abandon*).
* **In-Memory Spread Cache**: `DictionaryApp` maintains an LRU cache holding up to 10 spreads.
* **Prefetching Window**:
  * When viewing Spread `92–93`, the client background-fetches Spreads `90–91` and `94–95`.
  * Target spread is **already in memory** when flipping — 60fps 3D leaf flip animation runs smoothly with zero network jitter.
* **Loading State**: Subtle parchment-skeleton placeholder if the reader riffs far across the book (e.g. jumping from Page 1 to Page 2,500).
* **Navigation UI**: In addition to the A–Z thumb index, provide a "Go to Page" jump input in the footer bar so users can navigate across 3,125 pages effortlessly.

---

## 7. Search Engine & "No Entry Found" Recovery UI

### 7.1 Two-Way Bilingual Query Execution
1. **Devanagari Hindi Search Path (Instant Partial Matching & Quote Sanitization)**:
   * If query contains Devanagari script (`/[\u0900-\u097F]/`), sanitize input to prevent FTS5 syntax errors (`const cleanQuery = query.replace(/"/g, '""').trim()`) and query `entries_fts` using prefix matching:
     ```sql
     SELECT rowid, headword, meaning_hi, pronunciation_deva 
     FROM entries_fts 
     WHERE entries_fts MATCH 'meaning_hi: "' || ? || '"* OR pronunciation_deva: "' || ? || '"*'
     LIMIT 8;
     ```
   * Enables instant sub-millisecond prefix matching as readers type partial Hindi roots (e.g. `समा` matches *समाज, समाप्त, समानता*), with `cleanQuery` escaping double quotes to prevent SQLite query parser crashes.
2. **Exact Headword & Inflection Hit (Latin)**:
   * Query `entries` where `normalized = ?`.
   * Query `forms` where `normalized_form = ?`. If hit, redirect to lemma with note: *“Showing entry for ceremony (redirected from ceremonies)”*.
   * If a form belongs to multiple lemmas (*found* → *find* / *found*), prioritize the exact headword match (*found*), followed by redirect options.
3. **Prefix Search (Latin)**:
   * Query `entries` where `normalized >= ? AND normalized < ? || char(0x10FFFF) LIMIT 8`.
4. **Typo Recovery (Expanded Damerau-Levenshtein)**:
   * If exact and prefix queries return 0 results:
     * Pull candidate pool from `entries` and `forms` where word length is `query.length ± 1` (or `± 2` for words > 6 chars) sharing the same initial letter.
     * Calculate Damerau-Levenshtein distance in JavaScript.
     * Return up to 3 suggestions in the Parchment Recovery Card (e.g. `ceremonis` → `ceremonies` → *ceremony*).

---

## 8. Detailed Execution Roadmap

### Phase 1: Pilot & Data Validation
1. **Pilot Script (`scripts/pilot-coverage.ts`)**:
   * Lemmatize SUBTLEX-US top 25k words using reverse AGID.
   * Measure overlap with Princeton WordNet 3.1 and CMUdict.
   * Generate 200 sample Hindi glosses + shortened English definitions via Gemini Flash using the dominant-POS top-3 synset prompt.
   * Include deliberate polysemy test cases (*bank, light, run, spring, match, tie, strike, plant, organ*).
   * Native Hindi speaker reviews sample; verify threshold: **≤ 2 errors in 200 samples**.
   * Verify length budget: 100% of definitions `≤ 140 chars`, Hindi glosses `≤ 35 chars`.
2. **Closed-Class Word Layer**:
   * Curate ~300 closed-class words (pronouns, prepositions, articles, conjunctions, auxiliaries) with concise definitions and Hindi meanings.
   * Re-label existing 453 hand-written entries as original editorial content (`source: "Panna Vintage Editorial"`, `reviewed: 1`).

### Phase 2: Client Async Decoupling & SQLite Setup
1. Install `better-sqlite3` and `@types/better-sqlite3`. Configure `next.config.mjs` with `experimental.outputFileTracingIncludes` (`'/**'`).
2. Create `scripts/init-db.ts` with the corrected schema (`entries`, `forms`, `pages`, `entries_fts` with `rowid` and `reviewed` flag).
3. Seed SQLite with the current 453 entries + closed-class words.
4. Implement direct SQLite helpers in `src/lib/book-data.ts` and API routes `/api/meta` and `/api/page/[n]`.
5. Update Server Components (`page.tsx`, `page/[pageNumber]/page.tsx`, `word/[headword]/page.tsx`) to pass SSR props.
6. Refactor `DictionaryApp.tsx`:
   * Remove `import catalogData from '../../data/book/catalog.json'`.
   * Implement prefetching cache window (`currentPage ± 2`).
   * Default initial page to Page 1.
   * Implement "Go to Page" navigation input.
7. Decouple E2E browser tests and unit scripts (`test-pagination.ts`) to resolve pages dynamically via API. Verify 100% test pass.

### Phase 3: CMUdict Context-Aware Phonetic Engine
1. Build `scripts/phonetics.ts` implementing the positional rules (independent vowels, matras, halant clusters, nasalization, loanword `ZH` → ज़).
2. Create `data/sources/heteronyms.json` covering ~50 common heteronyms.
3. Run regression test asserting against the 453 existing hand-written pronunciations.
4. Ingest AGID inflection database and populate the `forms` table with compound primary key `(normalized_form, lemma_id)`.

### Phase 4: Full Lexicon Ingestion (25,000 Lemmas)
1. Extract top 25,000 lemmas from SUBTLEX-US; filter proper nouns and offensive words.
2. Run offline batch script `scripts/generate-hindi-glosses.ts` to generate sense-specific Hindi glosses and shortened definitions, saving to `data/sources/hindi-glosses.jsonl`.
3. Complete native Hindi speaker review on the top 5,000 words; set `reviewed = 1` for top 5k entries.
4. Ingest committed sources into SQLite; compute `pages` with guide words and footer hints.
5. Verify build determinism via `scripts/verify-determinism.ts`.

### Phase 5: Search Recovery Card & Credits View
1. Update `/api/search/route.ts` with bilingual Devanagari prefix FTS5 (with `cleanQuery` quote-escaping) + Latin prefix + expanded Damerau-Levenshtein fallback.
2. Implement `<NoEntryCard>` inside `LookupBar.tsx`.
3. Add in-app Credits modal with required attribution notices for Princeton WordNet, CMUdict, AGID/SCOWL, and explicit editorial disclosures for reviewed and audited tiers.
4. Run full desktop and mobile in-browser verification suites.

---

## 9. Quality Gates & Acceptance Criteria
* **Build Determinism**: `scripts/verify-determinism.ts` produces identical checksummed table dumps from committed source files across all platforms.
* **Independent Coverage Gate**: `≥ 98%` of the independent `wordfreq` top 5,000 English words (lemmatized via reverse AGID or matched via `forms`) are present and searchable.
* **Typographic Budget Gate**: 100% of entries satisfy `definition_en ≤ 140 chars` and `meaning_hi ≤ 35 chars`. Entries exceeding limits are queued in `data/sources/review-queue.jsonl` (zero silent truncations).
* **Zero Missing Fields**: 100% of the 25,000 entries have valid `pos`, `definition_en`, `meaning_hi`, and `pronunciation_deva`.
* **Zero Duplicate Headwords**: Every headword in `entries` has a unique `normalized` string.
* **Zero Orphan Redirects**: Every row in `forms` references a valid `lemma_id`.
* **Search Performance**: `/api/search` queries return in `< 2ms`.
* **Bundle Budget**: Initial client JavaScript bundle remains `< 160 KB` gzip.
* **Test Suite Parity**: All checks across `test:phase3` and `test:phase4` pass with 0 errors.
