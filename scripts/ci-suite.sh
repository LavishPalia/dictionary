#!/usr/bin/env bash
# The full test suite against a fresh production build; exits non-zero if any test fails.
# Used by .github/workflows/ci.yml, and runs the same way locally: bash scripts/ci-suite.sh
# Browser tests drive Edge at its default Windows path, so this needs Windows (or Git Bash on it).
set -uo pipefail
cd "$(dirname "$0")/.."
mkdir -p scratch/ci-logs
LOGS=$PWD/scratch/ci-logs
# Test runs write problem reports to a scratch file, never to data/reports.
export REPORTS_FILE=$PWD/scratch/reports-test.jsonl
# The suite tests "Report a problem" too; a release build without this hides it.
export NEXT_PUBLIC_REPORTS=1

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

TESTS="test:learn test:highlight test:pos test:review test:quiz test:related test:hinglish test:report test:progress
  test:marks test:backup test:pagination test:phonetics test:search-distance test:phase4-pipeline test:sentence test:quick
  test:history test:saved-search test:letters test:lighting test:related-gemini test:examples test:gemini-client
  test:corrections test:api
  test:learn-ui test:phase3 test:phase4 test:phase5 test:shell test:search test:word test:motion test:saved
  test:review-ui test:marks-ui test:backup-ui test:today-ui test:related-ui test:tour-ui test:offline-ui test:report-ui
  test:reach-ui test:history-ui test:saved-search-ui test:goto-ui test:evening-ui test:a11y test:progress-ui
  test:book-fit-ui verify:determinism"

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
