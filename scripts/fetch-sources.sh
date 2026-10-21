#!/usr/bin/env bash
# Re-downloads the third-party raw sources that are NOT committed (data/sources/raw/ is git-ignored)
# and checks them against data/sources/checksums.json.
#
# Only needed to regenerate data/sources/lemmas.jsonl (npm run data:lemmas). The committed derived
# files are enough for every other step.
set -euo pipefail
cd "$(dirname "$0")/.."
mkdir -p data/sources/raw

# SUBTLEX-US with CLAWS part-of-speech and Zipf columns (Brysbaert, New & Keuleers 2012), Ghent University.
curl -fsSL -o data/sources/raw/subtlexus1-pos-zipf.zip \
  "https://www.ugent.be/pp/experimentele-psychologie/en/research/documents/subtlexus/subtlexus1.zip"
unzip -o -q -d data/sources/raw data/sources/raw/subtlexus1-pos-zipf.zip
python -I scripts/xlsx2tsv.py "data/sources/raw/SUBTLEX-US frequency list with PoS and Zipf information.xlsx" \
  data/sources/raw/subtlex-us-pos.tsv

node -e '
const fs = require("fs"), crypto = require("crypto");
const pinned = JSON.parse(fs.readFileSync("data/sources/checksums.json", "utf8"));
let bad = 0;
for (const [file, hash] of Object.entries(pinned)) {
  if (!fs.existsSync(file)) { console.log("missing  " + file); bad++; continue; }
  const actual = crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
  console.log((actual === hash ? "ok       " : "MISMATCH ") + file);
  if (actual !== hash) bad++;
}
process.exit(bad ? 1 : 0);
'
