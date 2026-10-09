#!/usr/bin/env bash
# Unit tests for scripts/apply-branch-protection.sh
#
# The script applies .github/branch-protection-policy.json to a branch via
# `gh api -X PUT`. It has two paths:
#   --dry-run : prints the target endpoint and policy file contents, exits 0,
#               and must NEVER invoke `gh`.
#   (default) : invokes `gh api -X PUT ... --input <policy>` then
#               `gh api ... required_status_checks --jq '.contexts[]'`.
#
# These tests run the script against a throwaway copy of the repo so a fake
# policy file can be substituted, and stub `gh` on PATH to record its
# invocations instead of calling the real GitHub API.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SCRIPT="${SCRIPT_DIR}/apply-branch-protection.sh"

if [ ! -f "$SCRIPT" ]; then
  echo "FAIL: $SCRIPT not found" >&2
  exit 1
fi

PASS=0
FAIL=0
FAILURES=()

record_pass() { PASS=$((PASS + 1)); echo "  ✓ $1"; }
record_fail() { FAIL=$((FAIL + 1)); FAILURES+=("$1: $2"); echo "  ✗ $1 — $2" >&2; }

# make_case creates a throwaway copy of the script plus a fake
# .github/branch-protection-policy.json one directory level up, mirroring the
# real repo layout the script expects (script resolves policy relative to its
# own location: "$(dirname "$0")/../.github/branch-protection-policy.json").
make_case() {
  local dir
  dir="$(mktemp -d)"
  mkdir -p "$dir/scripts" "$dir/.github"
  cp "$SCRIPT" "$dir/scripts/apply-branch-protection.sh"
  chmod +x "$dir/scripts/apply-branch-protection.sh"
  cat > "$dir/.github/branch-protection-policy.json" <<'EOF'
{
  "required_status_checks": {
    "strict": false,
    "contexts": ["static-validation"]
  },
  "enforce_admins": false
}
EOF
  echo "$dir"
}

# install_fake_gh DIR writes a stub `gh` on a prepended PATH that records
# every invocation (one line per call, args space-joined) to $dir/gh-calls.log
# and echoes deterministic output for the two subcommands the script uses.
install_fake_gh() {
  local dir="$1"
  mkdir -p "$dir/bin"
  cat > "$dir/bin/gh" <<'EOF'
#!/usr/bin/env bash
echo "$*" >> "$(dirname "$0")/../gh-calls.log"
if [[ "$1 $2" == "api -X" ]]; then
  : # PUT call: no stdout, matches real `gh api -X PUT ... >/dev/null` usage
elif [[ "$*" == *"required_status_checks"* ]]; then
  echo "static-validation"
  echo "card-quality-gate"
fi
exit 0
EOF
  chmod +x "$dir/bin/gh"
}

# --- Case 1: --dry-run prints the resolved policy path, file contents, and
#             never invokes gh. ---
case1() {
  local dir out
  dir="$(make_case)"
  install_fake_gh "$dir"
  out="$(cd "$dir" && PATH="$dir/bin:$PATH" bash scripts/apply-branch-protection.sh --dry-run)"

  if ! grep -q "Would PUT" <<<"$out"; then
    record_fail "dry-run: announces intent" "no 'Would PUT' line in output: $out"
    return
  fi
  if ! grep -q "branch-protection-policy.json" <<<"$out"; then
    record_fail "dry-run: names policy file" "policy path missing from output"
    return
  fi
  if ! grep -q '"static-validation"' <<<"$out"; then
    record_fail "dry-run: prints policy contents" "policy JSON not echoed: $out"
    return
  fi
  if [ -f "$dir/gh-calls.log" ]; then
    record_fail "dry-run: never calls gh" "gh was invoked: $(cat "$dir/gh-calls.log")"
    return
  fi
  record_pass "dry-run prints policy and skips gh"
}

# --- Case 2: --dry-run exits 0 even though the real `gh` auth/API path is
#             never reached (exercised via set -e in the caller). ---
case2() {
  local dir rc
  dir="$(make_case)"
  install_fake_gh "$dir"
  rc=0
  (cd "$dir" && PATH="$dir/bin:$PATH" bash scripts/apply-branch-protection.sh --dry-run >/dev/null) || rc=$?
  if [ "$rc" -ne 0 ]; then
    record_fail "dry-run: exits 0" "exit code was $rc"
    return
  fi
  record_pass "dry-run exits 0"
}

# --- Case 3: default (no args) invokes gh api -X PUT with the resolved
#             policy file as --input, then queries required_status_checks,
#             against REPO/BRANCH defaults. ---
case3() {
  local dir out
  dir="$(make_case)"
  install_fake_gh "$dir"
  out="$(cd "$dir" && PATH="$dir/bin:$PATH" bash scripts/apply-branch-protection.sh)"

  if [ ! -f "$dir/gh-calls.log" ]; then
    record_fail "default: calls gh" "gh-calls.log missing — gh was never invoked"
    return
  fi
  if ! grep -q "repos/kubestellar/console-marketplace/branches/main/protection" "$dir/gh-calls.log"; then
    record_fail "default: targets default REPO/BRANCH" "missing endpoint in: $(cat "$dir/gh-calls.log")"
    return
  fi
  if ! grep -q -- "--input .*branch-protection-policy.json" "$dir/gh-calls.log"; then
    record_fail "default: passes policy file as --input" "missing --input in: $(cat "$dir/gh-calls.log")"
    return
  fi
  if ! grep -q "static-validation" <<<"$out"; then
    record_fail "default: prints live required checks" "missing contexts in output: $out"
    return
  fi
  record_pass "default invokes gh PUT then reports live contexts"
}

# --- Case 4: REPO/BRANCH env overrides are honored. ---
case4() {
  local dir
  dir="$(make_case)"
  install_fake_gh "$dir"
  (cd "$dir" && PATH="$dir/bin:$PATH" REPO="acme/fork" BRANCH="release-1.0" \
    bash scripts/apply-branch-protection.sh >/dev/null)

  if ! grep -q "repos/acme/fork/branches/release-1.0/protection" "$dir/gh-calls.log"; then
    record_fail "env overrides: REPO/BRANCH honored" "missing overridden endpoint in: $(cat "$dir/gh-calls.log")"
    return
  fi
  record_pass "REPO/BRANCH env overrides are honored"
}

# --- Case 5: script fails closed (non-zero exit, no gh call) when the policy
#             file is missing — `cat`/`--input` under `set -euo pipefail`. ---
case5() {
  local dir rc
  dir="$(make_case)"
  install_fake_gh "$dir"
  rm -f "$dir/.github/branch-protection-policy.json"
  rc=0
  (cd "$dir" && PATH="$dir/bin:$PATH" bash scripts/apply-branch-protection.sh --dry-run >/dev/null 2>&1) || rc=$?
  if [ "$rc" -eq 0 ]; then
    record_fail "missing policy: dry-run fails closed" "exited 0 despite missing policy file"
    return
  fi
  record_pass "missing policy file fails closed under --dry-run"
}

echo "Running apply-branch-protection.sh unit tests..."
case1
case2
case3
case4
case5

echo ""
echo "Results: $PASS passed, $FAIL failed"
if [ "$FAIL" -ne 0 ]; then
  echo "Failures:" >&2
  for f in "${FAILURES[@]}"; do
    echo "  - $f" >&2
  done
  exit 1
fi
exit 0
