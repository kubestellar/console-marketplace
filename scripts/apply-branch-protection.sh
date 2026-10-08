#!/usr/bin/env bash
# Apply .github/branch-protection-policy.json to main. Requires repo admin.
# Usage: scripts/apply-branch-protection.sh [--dry-run]
set -euo pipefail

REPO="${REPO:-kubestellar/console-marketplace}"
BRANCH="${BRANCH:-main}"
POLICY="$(dirname "$0")/../.github/branch-protection-policy.json"

if [[ "${1:-}" == "--dry-run" ]]; then
  echo "Would PUT $POLICY to repos/$REPO/branches/$BRANCH/protection:"
  cat "$POLICY"
  exit 0
fi

gh api -X PUT "repos/$REPO/branches/$BRANCH/protection" --input "$POLICY" >/dev/null
echo "Applied. Live required checks:"
gh api "repos/$REPO/branches/$BRANCH/protection/required_status_checks" --jq '.contexts[]'
