# `python-unit-tests.yml` / `ts-unit-tests.yml` CI-Observability Summary Gap

**Repository:** `kubestellar/console-marketplace`
**Applies to:** `.github/workflows/python-unit-tests.yml`,
`.github/workflows/ts-unit-tests.yml`

---

## Scope Note

This runbook covers the **missing structured pass/fail summary** in both unit-test
workflows — the same gap class already documented for `fuzz.yml`
([`fuzz-yml-ci-summary-gap.md`](./fuzz-yml-ci-summary-gap.md)) and `validate-json.yml`
([`validate-json-ci-summary-gap.md`](./validate-json-ci-summary-gap.md)).
`python-unit-tests.yml`'s "Run tests with coverage" and "Check coverage threshold"
steps, and `ts-unit-tests.yml`'s "Run vitest with coverage gate" step, only emit raw
pytest/coverage/vitest tool output. No step in either workflow writes to
`$GITHUB_STEP_SUMMARY`, no step uses `if: always()`, and there is no single-line
machine-readable summary record for either job. See
[issue #636](https://github.com/kubestellar/console-marketplace/issues/636) for the
original finding.

## Current Status

> **Python side: fixed, no workflow edit needed.** A root-level `conftest.py` now
> hooks `pytest_terminal_summary`/`pytest_sessionfinish` to emit a
> `PYTHON_UNIT_TESTS_SUMMARY: {...}` JSON line and a `$GITHUB_STEP_SUMMARY` Markdown
> table for every `pytest tests/` run — including the exact
> `python -m coverage run --branch --source=scripts -m pytest tests/ -v` invocation
> `python-unit-tests.yml`'s "Run tests with coverage" step already uses. This
> sidesteps the `workflows` permission blocker entirely: `$GITHUB_STEP_SUMMARY` is a
> runner-provided env var present in every Actions job step regardless of workflow
> wiring, and pytest auto-loads a root `conftest.py` with no workflow change
> required. See `conftest.py` and `tests/test_conftest_summary.py` (unit tests for
> the bounded record/markdown builders) and verification notes in
> [issue #636](https://github.com/kubestellar/console-marketplace/issues/636).
>
> Bounded, stdout/step-summary-only output: fixed integer fields (passed/failed/
> skipped/errors/xfailed/xpassed/total, exit_status, overall_status) — no per-test
> names, no exporter, no external data flow. The separate "Check coverage
> threshold" step (a plain `coverage report` invocation, not itself a pytest run)
> is unaffected and out of scope here; its own gate is tracked by
> [issue #620](https://github.com/kubestellar/console-marketplace/issues/620) /
> [issue #631](https://github.com/kubestellar/console-marketplace/issues/631).
>
> **TypeScript side (`ts-unit-tests.yml`): still blocked.** Unlike the Python fix,
> a no-workflow-edit path for vitest wasn't pursued this round because
> `ts-unit-tests.yml` sparse-checks out `web/src/test/setup.ts` from
> `kubestellar/console` at run time and links that repo's `node_modules` — wiring a
> custom vitest reporter through that cross-repo setup safely needs local
> validation against the real linked `node_modules` this environment doesn't have,
> and it isn't worth risking on an unverified guess. The ready-to-apply
> `ts-unit-tests.yml` diff below is preserved for a maintainer with `workflows`
> permission, or for a future session that can validate a reporter-based fix
> end-to-end. This half of the same blocker is already documented for
> [issue #545](https://github.com/kubestellar/console-marketplace/issues/545),
> [issue #573](https://github.com/kubestellar/console-marketplace/issues/573),
> [issue #597](https://github.com/kubestellar/console-marketplace/issues/597), and
> [issue #621](https://github.com/kubestellar/console-marketplace/issues/621).

## When to Use This Runbook

- You want to confirm what a past `python-unit-tests.yml` or `ts-unit-tests.yml` run
  actually tested (pass/fail counts, coverage percentage) without opening the raw
  pytest/vitest log and reading tool-native output line by line.
- You are a maintainer looking to close
  [issue #636](https://github.com/kubestellar/console-marketplace/issues/636) and
  want the exact diffs to apply, without waiting on another automated attempt.

## Ready-to-Apply Diff: `python-unit-tests.yml` (optional — superseded by `conftest.py`)

**Superseded.** The `conftest.py` fix above already gives this workflow a
structured summary without any workflow edit. This diff is kept only in case a
maintainer later prefers a workflow-level implementation instead (e.g. to also
cover the separate coverage-threshold step's outcome in the same JSON record).
Validated against `.github/workflows/python-unit-tests.yml` at commit `212a551`.

<details>
<summary>Diff</summary>

```diff
diff --git a/.github/workflows/python-unit-tests.yml b/.github/workflows/python-unit-tests.yml
index 450a41d..140d716 100644
--- a/.github/workflows/python-unit-tests.yml
+++ b/.github/workflows/python-unit-tests.yml
@@ -39,9 +39,65 @@ jobs:
           pip install pytest==8.3.4 coverage==7.6.10 requests==2.32.3
 
       - name: Run tests with coverage
+        id: pytest-run
         run: |
-          python -m coverage run --branch --source=scripts -m pytest tests/ -v
+          set +e
+          python -m coverage run --branch --source=scripts -m pytest tests/ -v 2>&1 | tee /tmp/pytest-output.log
+          PYTEST_EXIT=${PIPESTATUS[0]}
+          set -e
+          # Parse pytest's own bounded final summary line (e.g. "427 passed, 1
+          # xfailed, 9 subtests passed in 6.22s", optionally "="-padded to
+          # terminal width). Strip the padding/timing suffix, then match each
+          # comma-separated field exactly against "<N> passed"/"<N> failed" so
+          # an unrelated "N subtests passed" fragment can't be picked up.
+          SUMMARY_LINE=$(grep -E 'passed|failed' /tmp/pytest-output.log | tail -1)
+          CLEAN_LINE=$(echo "$SUMMARY_LINE" | sed -E 's/^=+ *//; s/ *=+$//; s/ in [0-9.]+s.*$//')
+          PASSED=$(echo "$CLEAN_LINE" | grep -oE '(^|, )[0-9]+ passed(,|$)' | grep -oE '[0-9]+' | head -1)
+          FAILED=$(echo "$CLEAN_LINE" | grep -oE '(^|, )[0-9]+ failed(,|$)' | grep -oE '[0-9]+' | head -1)
+          echo "passed=${PASSED:-0}" >> "$GITHUB_OUTPUT"
+          echo "failed=${FAILED:-0}" >> "$GITHUB_OUTPUT"
+          exit "$PYTEST_EXIT"
 
       - name: Check coverage threshold
+        id: coverage-check
+        if: always()
         run: |
-          python -m coverage report --fail-under=100 --include='scripts/validate-marketplace.py'
+          set +e
+          python -m coverage report --fail-under=100 --include='scripts/validate-marketplace.py' | tee /tmp/coverage-output.log
+          COVERAGE_EXIT=${PIPESTATUS[0]}
+          set -e
+          COVERAGE_PCT=$(grep TOTAL /tmp/coverage-output.log | awk '{print $NF}' | tr -d '%')
+          echo "coverage_pct=${COVERAGE_PCT:-N/A}" >> "$GITHUB_OUTPUT"
+          exit "$COVERAGE_EXIT"
+
+      - name: Python unit test observability summary
+        if: always()
+        run: |
+          PYTEST_OUTCOME="${{ steps.pytest-run.outcome }}"
+          COVERAGE_OUTCOME="${{ steps.coverage-check.outcome }}"
+          PASSED="${{ steps.pytest-run.outputs.passed || 0 }}"
+          FAILED="${{ steps.pytest-run.outputs.failed || 0 }}"
+          COVERAGE_PCT="${{ steps.coverage-check.outputs.coverage_pct || 'N/A' }}"
+
+          if [ "$PYTEST_OUTCOME" = "success" ] && [ "$COVERAGE_OUTCOME" = "success" ]; then
+            OVERALL_STATUS="pass"
+          else
+            OVERALL_STATUS="fail"
+          fi
+
+          {
+            echo "### Python Unit Test Summary"
+            echo ""
+            echo "| Field | Value |"
+            echo "|---|---|"
+            echo "| Tests passed | ${PASSED} |"
+            echo "| Tests failed | ${FAILED} |"
+            echo "| Coverage % (validate-marketplace.py) | ${COVERAGE_PCT} |"
+            echo "| Overall status | ${OVERALL_STATUS} |"
+          } >> "$GITHUB_STEP_SUMMARY"
+
+          echo "PYTHON_UNIT_TESTS_SUMMARY: {\"tests_passed\":${PASSED},\"tests_failed\":${FAILED},\"coverage_pct\":\"${COVERAGE_PCT}\",\"overall_status\":\"${OVERALL_STATUS}\"}"
+
+          if [ "$OVERALL_STATUS" != "pass" ]; then
+            exit 1
+          fi
```

</details>

## Ready-to-Apply Diff: `ts-unit-tests.yml`

Validated against `.github/workflows/ts-unit-tests.yml` at commit `212a551`.

<details>
<summary>Diff</summary>

```diff
diff --git a/.github/workflows/ts-unit-tests.yml b/.github/workflows/ts-unit-tests.yml
index e54d6b4..c93fb6e 100644
--- a/.github/workflows/ts-unit-tests.yml
+++ b/.github/workflows/ts-unit-tests.yml
@@ -49,7 +49,53 @@ jobs:
         run: ln -s "${GITHUB_WORKSPACE}/console-parent/web/node_modules" "${GITHUB_WORKSPACE}/web/node_modules"
 
       - name: Run vitest with coverage gate
+        id: vitest-run
         working-directory: console-parent/web
-        run: npx vitest run --config "${GITHUB_WORKSPACE}/vitest.marketplace.config.ts" --dir "${GITHUB_WORKSPACE}/web" --coverage
+        run: |
+          set +e
+          npx vitest run --config "${GITHUB_WORKSPACE}/vitest.marketplace.config.ts" --dir "${GITHUB_WORKSPACE}/web" --coverage 2>&1 | tee /tmp/vitest-output.log
+          VITEST_EXIT=${PIPESTATUS[0]}
+          set -e
+          # Parse vitest's own bounded "Test Files"/"Tests" summary lines, e.g.
+          # "Tests  42 passed (42)" -- first number is the bounded passed count.
+          TEST_FILES_LINE=$(grep -E '^ *Test Files' /tmp/vitest-output.log | tail -1)
+          TESTS_LINE=$(grep -E '^ *Tests' /tmp/vitest-output.log | tail -1)
+          TESTS_PASSED=$(echo "$TESTS_LINE" | grep -oE '[0-9]+ passed' | grep -oE '[0-9]+' || echo 0)
+          TESTS_FAILED=$(echo "$TESTS_LINE" | grep -oE '[0-9]+ failed' | grep -oE '[0-9]+' || echo 0)
+          echo "test_files_summary=${TEST_FILES_LINE:-N/A}" >> "$GITHUB_OUTPUT"
+          echo "tests_passed=${TESTS_PASSED:-0}" >> "$GITHUB_OUTPUT"
+          echo "tests_failed=${TESTS_FAILED:-0}" >> "$GITHUB_OUTPUT"
+          exit "$VITEST_EXIT"
         env:
           NODE_OPTIONS: '--max_old_space_size=4096'
+
+      - name: TypeScript unit test observability summary
+        if: always()
+        run: |
+          VITEST_OUTCOME="${{ steps.vitest-run.outcome }}"
+          TESTS_PASSED="${{ steps.vitest-run.outputs.tests_passed || 0 }}"
+          TESTS_FAILED="${{ steps.vitest-run.outputs.tests_failed || 0 }}"
+          TEST_FILES_SUMMARY="${{ steps.vitest-run.outputs.test_files_summary || 'N/A' }}"
+
+          if [ "$VITEST_OUTCOME" = "success" ]; then
+            OVERALL_STATUS="pass"
+          else
+            OVERALL_STATUS="fail"
+          fi
+
+          {
+            echo "### TypeScript Unit Test Summary"
+            echo ""
+            echo "| Field | Value |"
+            echo "|---|---|"
+            echo "| Test files | ${TEST_FILES_SUMMARY} |"
+            echo "| Tests passed | ${TESTS_PASSED} |"
+            echo "| Tests failed | ${TESTS_FAILED} |"
+            echo "| Overall status | ${OVERALL_STATUS} |"
+          } >> "$GITHUB_STEP_SUMMARY"
+
+          echo "TS_UNIT_TESTS_SUMMARY: {\"tests_passed\":${TESTS_PASSED},\"tests_failed\":${TESTS_FAILED},\"overall_status\":\"${OVERALL_STATUS}\"}"
+
+          if [ "$OVERALL_STATUS" != "pass" ]; then
+            exit 1
+          fi
```

</details>

## Applying the Fix

- **Python side:** already applied via `conftest.py` — no further action needed.
  Confirm on the next `python-unit-tests.yml` run that the "Run tests with
  coverage" step's log contains a `PYTHON_UNIT_TESTS_SUMMARY: {...}` line and the
  job's **Summary** tab shows the "Python Unit Tests Summary" table.
- **TypeScript side:** still requires the diff below.
  1. Apply the `ts-unit-tests.yml` diff (a maintainer with the `workflows` GitHub
     App permission, or a local PAT-based push, can do this directly —
     automation cannot).
  2. Trigger the workflow via a PR that touches its watched paths.
  3. Confirm the run's **Summary** tab shows the "TypeScript Unit Test Summary"
     table, and the final step's log contains a `TS_UNIT_TESTS_SUMMARY: {...}`
     line.
  4. Close [issue #636](https://github.com/kubestellar/console-marketplace/issues/636)
     once the TypeScript side is confirmed (Python side already closes its half).

## Verifying Recovery

- Each workflow's Summary tab for the applied run shows non-zero passed/failed
  counts (and, for the Python workflow, a coverage percentage) plus an explicit
  `pass`/`fail` overall status — not just the job's own green/red indicator.
- Temporarily reintroducing a failing test causes the final summary step to
  `exit 1` with `overall_status: fail` and a non-zero failed count, rather than the
  job failing silently with only raw pytest/vitest output to inspect.
