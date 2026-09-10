#!/usr/bin/env bash
# Unit tests for scripts/check-card-test-coverage.sh
#
# The script scans a git diff (BASE...HEAD) for newly added
# web/src/components/cards/<name>/index.tsx files and reports which of them
# have no corresponding test file. It is informational — exit is always 0.
#
# These tests build a temporary git repo per case, stage/commit a "base" tree,
# then add card directories on a "head" commit, and invoke the script with the
# base ref. The script's output (report + gap_count + JSON summary) is asserted.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SCRIPT="${SCRIPT_DIR}/check-card-test-coverage.sh"

if [ ! -x "$SCRIPT" ]; then
  chmod +x "$SCRIPT" 2>/dev/null || true
fi
if [ ! -f "$SCRIPT" ]; then
  echo "FAIL: $SCRIPT not found" >&2
  exit 1
fi

PASS=0
FAIL=0
FAILURES=()

record_pass() { PASS=$((PASS + 1)); echo "  ✓ $1"; }
record_fail() { FAIL=$((FAIL + 1)); FAILURES+=("$1: $2"); echo "  ✗ $1 — $2" >&2; }

# make_case NAME creates a temp git repo, echoes its path.
make_case() {
  local dir
  dir="$(mktemp -d)"
  (
    cd "$dir"
    git init -q -b main
    git config user.email "quality@test.local"
    git config user.name "quality-test"
    mkdir -p web/src/components/cards
    echo "seed" > README.md
    git add README.md
    git commit -q -m "seed"
  )
  echo "$dir"
}

# add_card DIR NAME [WITH_TEST]
# adds a new card with index.tsx; WITH_TEST=tests -> __tests__ subdir test;
# WITH_TEST=colocated -> colocated *.test.tsx; WITH_TEST=none -> no test.
add_card() {
  local dir="$1" name="$2" mode="${3:-none}"
  local card="$dir/web/src/components/cards/$name"
  mkdir -p "$card"
  echo "export default function ${name}(){return null}" > "$card/index.tsx"
  case "$mode" in
    tests)
      mkdir -p "$card/__tests__"
      echo "// test" > "$card/__tests__/${name}.test.tsx"
      ;;
    colocated)
      echo "// test" > "$card/${name}.test.tsx"
      ;;
    none) : ;;
  esac
}

commit_head() {
  local dir="$1" msg="$2"
  (
    cd "$dir"
    # Detach head onto a "feature" branch so main stays at seed and
    # `git diff main...HEAD` actually shows the new files.
    if ! git rev-parse --verify feature >/dev/null 2>&1; then
      git checkout -q -b feature
    fi
    git add -A
    git commit -q -m "$msg"
  )
}

# run_script DIR BASE_REF -> stdout captured to $OUT, exit code to $RC
run_script() {
  local dir="$1" base="$2"
  OUT="$(cd "$dir" && bash "$SCRIPT" "$base" 2>&1)" && RC=0 || RC=$?
}

assert_contains() {
  local name="$1" needle="$2" hay="$3"
  if grep -qF -- "$needle" <<< "$hay"; then
    record_pass "$name"
  else
    record_fail "$name" "missing '$needle' in output: $hay"
  fi
}

assert_not_contains() {
  local name="$1" needle="$2" hay="$3"
  if ! grep -qF -- "$needle" <<< "$hay"; then
    record_pass "$name"
  else
    record_fail "$name" "unexpected '$needle' in output"
  fi
}

# ---- case 1: no changed cards → gap_count=0, ✅ message ----
echo "case 1: no card changes"
d="$(make_case)"
echo "unrelated" > "$d/README.md"
commit_head "$d" "unrelated"
run_script "$d" "main"
assert_contains "1a exit 0" "gap_count=0" "$OUT"
assert_contains "1b summary changed=0" '"changed_card_count":0' "$OUT"
assert_contains "1c summary gaps=0" '"gap_count":0' "$OUT"
assert_contains "1d ok banner" "✅ All new card components" "$OUT"
[ "$RC" -eq 0 ] && record_pass "1e rc=0" || record_fail "1e rc" "rc=$RC"
rm -rf "$d"

# ---- case 2: one new card with __tests__/ test → gap_count=0 ----
echo "case 2: new card with __tests__ dir test"
d="$(make_case)"
add_card "$d" "WithTests" tests
commit_head "$d" "add WithTests"
run_script "$d" "main"
assert_contains "2a gap=0" "gap_count=0" "$OUT"
assert_contains "2b changed=1" '"changed_card_count":1' "$OUT"
assert_contains "2c gaps=0" '"gap_count":0' "$OUT"
rm -rf "$d"

# ---- case 3: one new card with colocated *.test.tsx → gap_count=0 ----
echo "case 3: new card with colocated test"
d="$(make_case)"
add_card "$d" "Colo" colocated
commit_head "$d" "add Colo"
run_script "$d" "main"
assert_contains "3a gap=0" "gap_count=0" "$OUT"
assert_contains "3b changed=1" '"changed_card_count":1' "$OUT"
rm -rf "$d"

# ---- case 4: one new card WITHOUT test → gap_count=1, warning ----
echo "case 4: new card without test"
d="$(make_case)"
add_card "$d" "MissingCard" none
commit_head "$d" "add MissingCard"
run_script "$d" "main"
assert_contains "4a gap=1" "gap_count=1" "$OUT"
assert_contains "4b changed=1" '"changed_card_count":1' "$OUT"
assert_contains "4c gaps=1" '"gap_count":1' "$OUT"
assert_contains "4d warn banner" "1 new card component(s) added without a test file" "$OUT"
assert_contains "4e cites path" "web/src/components/cards/MissingCard/" "$OUT"
[ "$RC" -eq 0 ] && record_pass "4f rc=0 informational" || record_fail "4f rc" "rc=$RC (must be 0)"
rm -rf "$d"

# ---- case 5: mix of tested + untested + unrelated file ----
echo "case 5: mixed changes"
d="$(make_case)"
add_card "$d" "GoodOne" tests
add_card "$d" "BadOne" none
mkdir -p "$d/docs"
echo "doc" > "$d/docs/notes.md"
commit_head "$d" "mix"
run_script "$d" "main"
assert_contains "5a changed=2" '"changed_card_count":2' "$OUT"
assert_contains "5b gaps=1" '"gap_count":1' "$OUT"
assert_contains "5c warn 1 card" "1 new card component(s) added without a test file" "$OUT"
assert_contains "5d cites BadOne" "web/src/components/cards/BadOne/" "$OUT"
assert_not_contains "5e no GoodOne row" "web/src/components/cards/GoodOne/ |" "$OUT"
rm -rf "$d"

# ---- case 6: non-card index.tsx path is ignored ----
echo "case 6: non-card index.tsx ignored"
d="$(make_case)"
mkdir -p "$d/web/src/pages/other"
echo "x" > "$d/web/src/pages/other/index.tsx"
commit_head "$d" "unrelated tsx"
run_script "$d" "main"
assert_contains "6a changed=0" '"changed_card_count":0' "$OUT"
assert_contains "6b gaps=0" '"gap_count":0' "$OUT"
rm -rf "$d"

# ---- case 7: writes report to /tmp/card-test-coverage-gaps.md ----
echo "case 7: report artifact written"
d="$(make_case)"
add_card "$d" "ArtifactCard" none
commit_head "$d" "add"
run_script "$d" "main"
if [ -s /tmp/card-test-coverage-gaps.md ] && grep -qF "ArtifactCard" /tmp/card-test-coverage-gaps.md; then
  record_pass "7a report file has card"
else
  record_fail "7a report file" "missing or empty"
fi
rm -rf "$d"

echo
echo "==================================="
echo "PASS: $PASS   FAIL: $FAIL"
if [ "$FAIL" -gt 0 ]; then
  printf '  - %s\n' "${FAILURES[@]}" >&2
  exit 1
fi
