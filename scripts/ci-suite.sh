#!/usr/bin/env bash
# The full test suite against a fresh production build; exits non-zero if any test fails.
# Used by .github/workflows/ci.yml, and runs the same way locally: bash scripts/ci-suite.sh [part]
# CI runs the three parts (1, 2, 3) in parallel; with no part, everything runs.
# Browser tests drive Edge at its default Windows path, so this needs Windows (or Git Bash on it).
set -uo pipefail
cd "$(dirname "$0")/.."
mkdir -p scratch/ci-logs
LOGS=$PWD/scratch/ci-logs
# Test runs write problem reports to a scratch file, never to data/reports.
export REPORTS_FILE=$PWD/scratch/reports-test.jsonl
# The suite tests "Report a problem" too; a release build without this hides it.
export NEXT_PUBLIC_REPORTS=1

# Parts of about 6.5 minutes each on a GitHub runner (seconds in brackets, from a CI log, 2026-10-31).
PART_1="test:a11y test:evening-ui test:offline-ui test:today-ui test:saved test:word"  # 139 82 70 55 23 19
PART_2="test:learn-ui test:reach-ui test:history-ui test:goto-ui test:review-ui test:book-fit-ui test:backup-ui"  # 116 78 69 44 27 25 24
PART_3="test:tour-ui test:quiz test:search test:motion test:related-ui test:report-ui test:saved-search-ui
  test:progress-ui test:phase4 test:phase3 test:shell test:marks-ui test:phase5 verify:determinism
  test:learn test:highlight test:pos test:review test:related test:hinglish test:report test:progress
  test:marks test:backup test:pagination test:phonetics test:search-distance test:phase4-pipeline test:sentence test:quick
  test:history test:saved-search test:letters test:lighting test:related-gemini test:examples test:gemini-client
  test:corrections test:api"  # 112 61, the rest under 25 each

# Every test:* script in package.json must be in a part, so a new test can't be left out of CI by accident.
missing=$(node -e '
const parts = process.argv[1].split(/\s+/);
const tests = Object.keys(require("./package.json").scripts).filter((k) => k.startsWith("test:"));
console.log(tests.filter((t) => !parts.includes(t)).join(" "));' "$PART_1 $PART_2 $PART_3")
if [ -n "$missing" ]; then echo "Not in any part of scripts/ci-suite.sh: $missing"; exit 1; fi

case "${1:-all}" in
  1) TESTS=$PART_1 ;; 2) TESTS=$PART_2 ;; 3) TESTS=$PART_3 ;;
  all) TESTS="$PART_1 $PART_2 $PART_3" ;;
  *) echo "Unknown part: $1 (use 1, 2, 3 or nothing)"; exit 1 ;;
esac

free_port() {
  command -v taskkill >/dev/null || return 0
  for p in $(netstat -ano | grep ':3000 .*LISTENING' | awk '{print $5}' | sort -u); do taskkill //PID "$p" //T //F >/dev/null; done
}
free_port
trap free_port EXIT

# npm run build runs build:data first (prebuild), so the dictionary is rebuilt from data/sources too.
rm -f .next/BUILD_ID
npm run build > "$LOGS/build.log" 2>&1
if [ ! -f .next/BUILD_ID ]; then tail -40 "$LOGS/build.log"; echo "BUILD FAILED"; exit 1; fi

npx next start > "$LOGS/server.log" 2>&1 &
for i in $(seq 1 60); do sleep 1; curl -s -o /dev/null http://localhost:3000/api/meta && break; done
curl -s -o /dev/null http://localhost:3000/api/meta || { cat "$LOGS/server.log"; echo "SERVER DID NOT START"; exit 1; }

failed=()
flaky=()
for t in $TESTS; do
  log="$LOGS/${t//:/-}.log"
  printf '%-22s' "$t"
  if npm run -s "$t" > "$log" 2>&1; then
    echo "ok   $(grep -v '^\s*$' "$log" | tail -1)"
  else
    # Browser tests have a few known timing flakes (see the tour notes); one retry absorbs them,
    # and a test that only passes on retry is still listed below.
    if npm run -s "$t" > "$log.retry" 2>&1; then
      echo "ok on retry"; flaky+=("$t")
    else
      echo "FAIL"; grep -E "✗|❌|Error|assert" "$log.retry" | head -10 | sed 's/^/    /'; failed+=("$t")
    fi
  fi
done
rm -rf scratch/panna-*-edge-* 2>/dev/null

[ ${#flaky[@]} -gt 0 ] && echo "Passed only on retry: ${flaky[*]}"
if [ ${#failed[@]} -gt 0 ]; then echo "FAILED: ${failed[*]}"; exit 1; fi
echo "All tests passed."
