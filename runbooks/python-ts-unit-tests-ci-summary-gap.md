# `python-unit-tests.yml` / `ts-unit-tests.yml` CI-Observability Summary Gap

**Repository:** `kubestellar/console-marketplace`
**Applies to:** `.github/workflows/python-unit-tests.yml`, `.github/workflows/ts-unit-tests.yml`

---

## Scope Note

Neither workflow writes anything to `$GITHUB_STEP_SUMMARY`, and neither has a
final `if: always()` step producing a single-line, machine-readable pass/fail
record. `python-unit-tests.yml`'s "Run tests with coverage" and "Check coverage
threshold" steps, and `ts-unit-tests.yml`'s "Run vitest with coverage gate"
step, only emit tool-native pytest/coverage/vitest console output — a failing
coverage gate today (see Current Status below) is visible only as raw log text,
with no structured record of test counts or coverage percentage. This is the
same gap class already tracked for `fuzz.yml`
([`fuzz-yml-ci-summary-gap.md`](./fuzz-yml-ci-summary-gap.md), issue #597) and
`validate-json.yml` (issue #621). See
[issue #636](https://github.com/kubestellar/console-marketplace/issues/636)
for the original finding.

## Current Status

> **No mechanism fix exists yet.** Validated, ready-to-apply diffs (below) add a
> final `if: always()` summary step to each job. Pushing either diff from this
> hive identity is rejected by GitHub with the same `workflows` App-permission
> error already documented for `fuzz.yml` (issue #597) and `validate-json.yml`
> (issue #621):
>
> ```
> ! [remote rejected] telemetry/... -> telemetry/...
>   (refusing to allow a GitHub App to create or update workflow
>   `.github/workflows/python-unit-tests.yml` without `workflows` permission)
> ```
>
> This runbook preserves both validated diffs so a maintainer with `workflows`
> permission can apply them directly, instead of the fix being re-derived (and
> re-blocked) on every future audit pass.
>
> **Confirmed independently while validating this diff:** `python-unit-tests.yml`
> has failed on every `main` run since at least 2026-09-09T05:45:11Z (coverage
> gate `--fail-under=100` against `scripts/validate-marketplace.py` currently
> measures 99%, per a local `coverage run`/`coverage report` reproduction against
> `HEAD` at commit `212a551`). That is a pre-existing coverage-gap issue, not a
> telemetry gap — this runbook does not attempt to fix the coverage shortfall,
> only to make the workflow's own pass/fail state and counts structured and
> visible in the Summary tab (so a run like this one is no longer only visible
> as raw pytest/coverage log text).

## When to Use This Runbook

- You want to confirm a past `python-unit-tests.yml` or `ts-unit-tests.yml` run's
  test counts and coverage percentage without opening the raw step log.
- You are a maintainer looking to close
  [issue #636](https://github.com/kubestellar/console-marketplace/issues/636)
  and want the exact diffs to apply, without waiting on another automated attempt.

## Ready-to-Apply Diff: `python-unit-tests.yml`

Validated against `.github/workflows/python-unit-tests.yml` at commit
`212a551`. Adds step `id`s, bounded outputs (pytest passed/failed/xfailed counts,
coverage percentage, each job's own status), and a final `if: always()` step
writing a markdown table to `$GITHUB_STEP_SUMMARY` plus a single-line
`PYTHON_UNIT_TESTS_SUMMARY: {...}` JSON record to stdout — mirroring the
`MARKETPLACE_QUALITY_SUMMARY:` pattern already used by
`scripts/validate-marketplace.py`. No exporter, metrics backend, or external
data flow: stdout/step-summary only, and every count is a small fixed field
(never populated from unbounded user input).

<details>
<summary>Diff</summary>

```diff
diff --git a/.github/workflows/python-unit-tests.yml b/.github/workflows/python-unit-tests.yml
index 0000000..1111111 100644
--- a/.github/workflows/python-unit-tests.yml
+++ b/.github/workflows/python-unit-tests.yml
@@ -25,9 +25,45 @@ jobs:
           pip install pytest==8.3.4 coverage==7.6.10 requests==2.32.3
 
       - name: Run tests with coverage
+        id: run-tests
         run: |
-          python -m coverage run --branch --source=scripts -m pytest tests/ -v
+          set +e
+          python -m coverage run --branch --source=scripts -m pytest tests/ -v 2>&1 | tee /tmp/pytest-output.txt
+          TEST_EXIT=${PIPESTATUS[0]}
+
+          # Parse the single pytest summary line, e.g.:
+          #   "427 passed, 1 xfailed, 9 subtests passed in 14.94s"
+          # Each field is a small bounded integer, never free text.
+          SUMMARY_LINE="$(grep -Eo '[0-9]+ (passed|failed|xfailed)' /tmp/pytest-output.txt | tail -3 || true)"
+          PASSED=$(echo "$SUMMARY_LINE" | grep -Eo '^[0-9]+ passed$' | grep -Eo '^[0-9]+' || echo 0)
+          FAILED=$(echo "$SUMMARY_LINE" | grep -Eo '^[0-9]+ failed$' | grep -Eo '^[0-9]+' || echo 0)
+          XFAILED=$(echo "$SUMMARY_LINE" | grep -Eo '^[0-9]+ xfailed$' | grep -Eo '^[0-9]+' || echo 0)
+
+          echo "test_exit=${TEST_EXIT}" >> "$GITHUB_OUTPUT"
+          echo "passed=${PASSED:-0}" >> "$GITHUB_OUTPUT"
+          echo "failed=${FAILED:-0}" >> "$GITHUB_OUTPUT"
+          echo "xfailed=${XFAILED:-0}" >> "$GITHUB_OUTPUT"
+          exit "$TEST_EXIT"
 
       - name: Check coverage threshold
+        id: check-coverage
+        if: always()
         run: |
-          python -m coverage report --fail-under=100 --include='scripts/validate-marketplace.py'
+          set +e
+          python -m coverage report --fail-under=100 --include='scripts/validate-marketplace.py' 2>&1 | tee /tmp/coverage-output.txt
+          COVERAGE_EXIT=${PIPESTATUS[0]}
+
+          # Last "TOTAL" line's final column, e.g. "TOTAL 765 0 410 1 99%".
+          COVERAGE_PCT=$(grep '^TOTAL' /tmp/coverage-output.txt | grep -Eo '[0-9]+%$' | grep -Eo '[0-9]+' || echo 0)
+
+          echo "coverage_exit=${COVERAGE_EXIT}" >> "$GITHUB_OUTPUT"
+          echo "coverage_pct=${COVERAGE_PCT:-0}" >> "$GITHUB_OUTPUT"
+          exit "$COVERAGE_EXIT"
+
+      - name: Python unit tests observability summary
+        if: always()
+        run: |
+          PASSED="${{ steps.run-tests.outputs.passed || 0 }}"
+          FAILED="${{ steps.run-tests.outputs.failed || 0 }}"
+          XFAILED="${{ steps.run-tests.outputs.xfailed || 0 }}"
+          TEST_EXIT="${{ steps.run-tests.outputs.test_exit || 1 }}"
+          COVERAGE_PCT="${{ steps.check-coverage.outputs.coverage_pct || 0 }}"
+          COVERAGE_EXIT="${{ steps.check-coverage.outputs.coverage_exit || 1 }}"
+
+          if [ "$TEST_EXIT" = "0" ] && [ "$COVERAGE_EXIT" = "0" ]; then
+            STATUS="pass"
+          else
+            STATUS="fail"
+          fi
+
+          {
+            echo "### Python Unit Tests Summary"
+            echo ""
+            echo "| Field | Value |"
+            echo "|---|---|"
+            echo "| Passed | ${PASSED} |"
+            echo "| Failed | ${FAILED} |"
+            echo "| XFailed | ${XFAILED} |"
+            echo "| Coverage % | ${COVERAGE_PCT} |"
+            echo "| Status | ${STATUS} |"
+          } >> "$GITHUB_STEP_SUMMARY"
+
+          echo "PYTHON_UNIT_TESTS_SUMMARY: {\"passed\":${PASSED},\"failed\":${FAILED},\"xfailed\":${XFAILED},\"coverage_pct\":${COVERAGE_PCT},\"status\":\"${STATUS}\"}"
+
+          if [ "$STATUS" != "pass" ]; then
+            exit 1
+          fi
```

</details>

## Ready-to-Apply Diff: `ts-unit-tests.yml`

Validated against `.github/workflows/ts-unit-tests.yml` at commit `212a551`.
Uses vitest's existing `json-summary` coverage reporter (already configured in
`vitest.marketplace.config.ts`), which writes a fixed-shape
`coverage/coverage-summary.json` with a `total` object — a small, bounded set of
percentage fields, not per-file data. Adds a final `if: always()` step emitting a
`TS_UNIT_TESTS_SUMMARY: {...}` JSON record and a step-summary table.

<details>
<summary>Diff</summary>

```diff
diff --git a/.github/workflows/ts-unit-tests.yml b/.github/workflows/ts-unit-tests.yml
index 0000000..2222222 100644
--- a/.github/workflows/ts-unit-tests.yml
+++ b/.github/workflows/ts-unit-tests.yml
@@ -30,5 +30,42 @@ jobs:
 
       - name: Run vitest with coverage gate
+        id: run-vitest
         working-directory: console-parent/web
-        run: npx vitest run --config "${GITHUB_WORKSPACE}/vitest.marketplace.config.ts" --dir "${GITHUB_WORKSPACE}/web" --coverage
+        run: |
+          set +e
+          npx vitest run --config "${GITHUB_WORKSPACE}/vitest.marketplace.config.ts" --dir "${GITHUB_WORKSPACE}/web" --coverage
+          echo "vitest_exit=$?" >> "$GITHUB_OUTPUT"
         env:
           NODE_OPTIONS: '--max_old_space_size=4096'
+
+      - name: TS unit tests observability summary
+        if: always()
+        working-directory: console-parent/web
+        run: |
+          VITEST_EXIT="${{ steps.run-vitest.outputs.vitest_exit || 1 }}"
+          SUMMARY_JSON="${GITHUB_WORKSPACE}/web/coverage/coverage-summary.json"
+
+          # coverage-summary.json's "total" object holds four fixed,
+          # bounded percentage fields regardless of how many source files
+          # exist -- never a per-file (unbounded) breakdown.
+          if [ -f "$SUMMARY_JSON" ]; then
+            LINES_PCT=$(node -e "console.log(JSON.parse(require('fs').readFileSync('$SUMMARY_JSON')).total.lines.pct)" 2>/dev/null || echo 0)
+            STATEMENTS_PCT=$(node -e "console.log(JSON.parse(require('fs').readFileSync('$SUMMARY_JSON')).total.statements.pct)" 2>/dev/null || echo 0)
+          else
+            LINES_PCT=0
+            STATEMENTS_PCT=0
+          fi
+
+          if [ "$VITEST_EXIT" = "0" ]; then
+            STATUS="pass"
+          else
+            STATUS="fail"
+          fi
+
+          {
+            echo "### TS Unit Tests Summary"
+            echo ""
+            echo "| Field | Value |"
+            echo "|---|---|"
+            echo "| Lines % | ${LINES_PCT} |"
+            echo "| Statements % | ${STATEMENTS_PCT} |"
+            echo "| Status | ${STATUS} |"
+          } >> "$GITHUB_STEP_SUMMARY"
+
+          echo "TS_UNIT_TESTS_SUMMARY: {\"lines_pct\":${LINES_PCT},\"statements_pct\":${STATEMENTS_PCT},\"status\":\"${STATUS}\"}"
+
+          if [ "$STATUS" != "pass" ]; then
+            exit 1
+          fi
```

</details>

## Applying the Fix

1. Apply both diffs above (a maintainer with the `workflows` GitHub App
   permission, or a local PAT-based push, can do this directly — automation
   cannot).
2. Trigger each workflow (a PR touching `scripts/**`/`tests/**` or
   `web/src/**`, or `workflow_dispatch` if enabled) and confirm the run's
   **Summary** tab shows a "Python Unit Tests Summary" / "TS Unit Tests
   Summary" table.
3. Confirm the final step's log contains a `PYTHON_UNIT_TESTS_SUMMARY: {...}` /
   `TS_UNIT_TESTS_SUMMARY: {...}` line.
4. Close [issue #636](https://github.com/kubestellar/console-marketplace/issues/636)
   once confirmed.

## Verifying Recovery

- The workflow's Summary tab for the applied run shows non-zero, plausible test
  counts / coverage percentages and an explicit `pass`/`fail` status — not just
  the job's own green/red indicator.
- A real test failure or coverage regression (e.g. the currently-failing
  `python-unit-tests.yml` coverage gate, see Current Status above) causes the
  final summary step to `exit 1` with `status: fail`, rather than the gap being
  visible only in raw pytest/coverage console text.
