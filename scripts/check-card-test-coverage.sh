#!/bin/bash
# scripts/check-card-test-coverage.sh
#
# Detects newly added card component directories in web/src/components/cards/
# that have no corresponding test file.
#
# Usage:
#   ./scripts/check-card-test-coverage.sh            # uses origin/main as base
#   ./scripts/check-card-test-coverage.sh <BASE>     # custom base ref / SHA
#
# Output:
#   /tmp/card-test-coverage-gaps.md — markdown report
#   stdout                          — gap_count=N
#                                     CARD_TEST_COVERAGE_SUMMARY: {...} (bounded,
#                                     grep-able JSON record: changed_card_count,
#                                     gap_count, exit_code — fixed counts only,
#                                     no free text, safe to grep regardless of
#                                     registry size)
#   Exit code: 0 always — informational only, never blocks CI.

set -euo pipefail

BASE_REF="${1:-origin/main}"
REPORT="/tmp/card-test-coverage-gaps.md"
REPO_ROOT="$(git rev-parse --show-toplevel)"

cd "$REPO_ROOT"

# Collect newly added index.tsx files in card directories
CHANGED=$(git diff --name-only --diff-filter=AR "${BASE_REF}...HEAD" 2>/dev/null \
  || git diff --name-only --diff-filter=AR "${BASE_REF}..HEAD" 2>/dev/null \
  || true)

# Helper: check if a test file exists for a card directory
has_test() {
  local card_dir="$1"
  # Check __tests__/ subdirectory
  [ -n "$(find "${card_dir}/__tests__" -maxdepth 1 -name "*.test.*" 2>/dev/null | head -1)" ] && return 0
  # Check co-located test files
  [ -n "$(find "${card_dir}" -maxdepth 1 -name "*.test.*" 2>/dev/null | head -1)" ] && return 0
  return 1
}

GAP_COUNT=0
CHANGED_CARD_COUNT=0
GAPS=""

# Find new index.tsx files in cards subdirectories
while IFS= read -r f; do
  # Match: web/src/components/cards/<card-dir>/index.tsx
  if [[ "$f" =~ ^web/src/components/cards/([^/]+)/index\.tsx$ ]]; then
    card_name="${BASH_REMATCH[1]}"
    card_dir="web/src/components/cards/${card_name}"
    CHANGED_CARD_COUNT=$((CHANGED_CARD_COUNT + 1))
    if ! has_test "$card_dir"; then
      GAP_COUNT=$((GAP_COUNT + 1))
      GAPS="${GAPS}\n| \`${card_dir}/\` | Missing test file |"
    fi
  fi
done <<< "$CHANGED"

# Write report
{
  echo "## 🧪 Card Test Coverage Gate"
  echo ""
  if [ "$GAP_COUNT" -eq 0 ]; then
    echo "✅ All new card components have at least one test file."
  else
    echo "⚠️ **${GAP_COUNT} new card component(s) added without a test file:**"
    echo ""
    echo "| Card Directory | Issue |"
    echo "|---|---|"
    printf "%b\n" "$GAPS"
    echo ""
    echo "**Please add a test file** (e.g. \`<CardName>.test.tsx\` or \`__tests__/<CardName>.test.tsx\`) before merging."
    echo ""
    echo "_This check is informational — it does not block merge._"
  fi
} > "$REPORT"

cat "$REPORT"
echo "gap_count=${GAP_COUNT}"
echo "CARD_TEST_COVERAGE_SUMMARY: {\"changed_card_count\":${CHANGED_CARD_COUNT},\"gap_count\":${GAP_COUNT},\"exit_code\":0}"
exit 0
