# `python-unit-tests.yml` / `ts-unit-tests.yml` CI-Observability Summary Gap

**Repository:** `kubestellar/console-marketplace`
**Applies to:** `.github/workflows/python-unit-tests.yml`,
`.github/workflows/ts-unit-tests.yml`, `scripts/python_unit_tests_summary.py`,
`scripts/ts_unit_tests_summary.py`

---

## Scope Note

This runbook covers the same gap class as
[`fuzz-yml-ci-summary-gap.md`](./fuzz-yml-ci-summary-gap.md) (SLI/SLO 7) and
[`validate-json-ci-summary-gap.md`](./validate-json-ci-summary-gap.md) (SLI/SLO 8),
applied to two more workflows: `python-unit-tests.yml`'s "Run tests with coverage"
and "Check coverage threshold" steps, and `ts-unit-tests.yml`'s "Run vitest with
coverage gate" step, only emit tool-native pytest/coverage/vitest console output.
No step in either workflow writes to `$GITHUB_STEP_SUMMARY`, no step uses
`if: always()`, and there is no single-line, bounded, machine-readable summary
record of what was checked (test pass/fail counts, coverage percentage, overall
status) for either job. See
[issue #636](https://github.com/kubestellar/console-marketplace/issues/636) for
the original finding.

## Current Status

> **The parsing/rendering logic has been extracted and tested, but neither
> workflow is wired up.**
> [`scripts/python_unit_tests_summary.py`](../scripts/python_unit_tests_summary.py)
> wraps the same two commands `python-unit-tests.yml` already runs
> (`coverage run --branch --source=scripts -m pytest tests/ -v` and
> `coverage report --fail-under=100 --include=...`), parses their bounded output,
> and emits a markdown table plus a `PYTHON_UNIT_TESTS_SUMMARY: {...}` JSON record.
> [`scripts/ts_unit_tests_summary.py`](../scripts/ts_unit_tests_summary.py) parses
> vitest's bounded summary block and v8 coverage table (fed via stdin or
> `--input`, since `ts-unit-tests.yml`'s cross-repo checkout + `npm ci` install
> is not reproducible standalone) and emits the equivalent
> `TS_UNIT_TESTS_SUMMARY: {...}` record. Both are covered by unit tests
> (`tests/test_python_unit_tests_summary.py`,
> `tests/test_ts_unit_tests_summary.py`) that exercise the parsing/rendering
> functions directly against synthetic tool output.
>
> Running the Python script directly against this repo produces:
>
> ```
> $ python3 scripts/python_unit_tests_summary.py
> ### Python Unit Tests Summary
>
> | Field | Value |
> |---|---|
> | Passed | 454 |
> | Failed | 0 |
> | Xfailed | 1 |
> | Skipped | 0 |
> | Duration (s) | 10.07 |
> | Coverage % | 99 |
> | Status | fail |
>
> PYTHON_UNIT_TESTS_SUMMARY: {"passed": 454, "failed": 0, "xfailed": 1, "skipped": 0, "duration_seconds": 10.07, "coverage_percent": 99, "status": "fail"}
> ```
>
> (Status is `fail` here only because `--fail-under=100` is stricter than the
> current 99% branch coverage on `validate-marketplace.py` — a pre-existing,
> unrelated gap, not something this script introduces.)
>
> Wiring either script into its workflow (adding a final `if: always()` step
> that calls it) requires editing a file under `.github/workflows/`, which
> needs the `workflows` GitHub App permission this project's automated PRs do
> not carry — the same repo-wide token restriction already documented for
> [issue #545](https://github.com/kubestellar/console-marketplace/issues/545),
> [issue #597](https://github.com/kubestellar/console-marketplace/issues/597),
> and [issue #621](https://github.com/kubestellar/console-marketplace/issues/621).
> This runbook preserves the ready-to-apply wiring so it can be applied without
> re-deriving the logic.

## When to Use This Runbook

- You want to confirm what a past `python-unit-tests.yml` or `ts-unit-tests.yml`
  run actually checked (pass/fail counts, coverage percentage) without reading
  the raw step log.
- You are a maintainer looking to close
  [issue #636](https://github.com/kubestellar/console-marketplace/issues/636)
  and want the exact wiring to apply, without waiting on another automated
  attempt.

## Applying the Fix

A maintainer with the `workflows` GitHub App permission (or a local PAT-based
push) can add a final step to each job:

`.github/workflows/python-unit-tests.yml` (`pytest` job):

```yaml
      - name: Python unit tests observability summary
        if: always()
        run: python3 scripts/python_unit_tests_summary.py
```

`.github/workflows/ts-unit-tests.yml` (`vitest` job), replacing the existing
"Run vitest with coverage gate" step so the script both drives and parses the
run:

```yaml
      - name: Run vitest with coverage gate
        if: always()
        working-directory: console-parent/web
        run: |
          npx vitest run --config "${GITHUB_WORKSPACE}/vitest.marketplace.config.ts" \
            --dir "${GITHUB_WORKSPACE}/web" --coverage \
            | tee /tmp/vitest-output.txt
          python3 "${GITHUB_WORKSPACE}/scripts/ts_unit_tests_summary.py" --input /tmp/vitest-output.txt
        env:
          NODE_OPTIONS: '--max_old_space_size=4096'
```

No exporter, metrics backend, or external data flow is added: stdout /
`$GITHUB_STEP_SUMMARY` only, and every count is bounded by this repo's own
fixed test suite (never populated from unbounded user input).

## Verifying Recovery

1. Trigger each workflow on a PR touching its watched paths (`scripts/**` /
   `tests/**` for Python, `web/src/**` for TypeScript).
2. Confirm each run's **Summary** tab shows a "Python Unit Tests Summary" /
   "TypeScript Unit Tests Summary" table with non-zero passed counts.
3. Confirm each job's log contains a `PYTHON_UNIT_TESTS_SUMMARY: {...}` /
   `TS_UNIT_TESTS_SUMMARY: {...}` line.
4. Close [issue #636](https://github.com/kubestellar/console-marketplace/issues/636)
   once confirmed.
